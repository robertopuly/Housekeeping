// orders.js - Module Ordres de Service & Planning Quotidien des Chambres
(function() {
  'use strict';

  let ordersList = [];
  let archivedList = [];
  let currentFilter = 'attivi';

  let selectedDate = getTodayStr();
  let dailyRooms = [];
  let currentDailyMeta = null;
  let saveNoteTimeouts = {};
  let lastHappySongTimestamp = 0;
  let lastLocalActionTimestamp = 0;

  function isTabletDevice() {
    const user = (window.App && typeof window.App.getCurrentUser === 'function')
      ? window.App.getCurrentUser()
      : (localStorage.getItem('hk_user') || 'Roberto');
    const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobileOrTablet || (user && user.toLowerCase().includes('adelcia'));
  }

  function showTabletAlertToast(message) {
    let toast = document.getElementById('tablet-alert-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tablet-alert-toast';
      toast.className = 'tablet-alert-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span class="tablet-alert-toast-icon">🔔</span><span>${escapeHtml(message)}</span>`;
    toast.classList.add('show');

    if (window._tabletToastTimeout) clearTimeout(window._tabletToastTimeout);
    window._tabletToastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 4500);
  }

  function onTabletAlertReceived(data = {}) {
    // Joue la chansonnette uniquement sur le Tablet (ou session Adélcia)
    if (!isTabletDevice()) return;

    if (data && data.id) {
      const lastId = localStorage.getItem('hk_last_played_alert_id');
      if (lastId && String(lastId) === String(data.id)) {
        return; // Déjà joué, évite le doublon
      }
      localStorage.setItem('hk_last_played_alert_id', String(data.id));
    }

    if (window.SoundEngine && typeof window.SoundEngine.playHappySongSound === 'function') {
      window.SoundEngine.playHappySongSound();
    }

    showTabletAlertToast("🔔 Roberto a mis à jour les chambres !");
  }

  async function checkMissedTabletNotification() {
    if (!isTabletDevice()) return;
    try {
      const res = await fetch('/api/daily-rooms/latest-tablet-notification');
      if (res.ok) {
        const json = await res.json();
        const notif = json && json.notification;
        if (notif && notif.timestamp) {
          const ageMs = Date.now() - notif.timestamp;
          // Si l'alerte a été envoyée il y a moins de 25 minutes et n'a pas encore été jouée sur cet appareil
          if (ageMs < 25 * 60 * 1000) {
            const lastId = localStorage.getItem('hk_last_played_alert_id');
            if (!lastId || String(lastId) !== String(notif.id)) {
              console.log('Alerte manquée détectée au réveil du tablet:', notif);
              onTabletAlertReceived(notif);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Erreur vérification alerte manquée tablet:', e);
    }
  }

  // Vérifier les alertes manquées dès que la tablette redevient active / visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkMissedTabletNotification();
    }
  });

  async function notifyTabletWithSong() {
    const currentUser = (window.App && typeof window.App.getCurrentUser === 'function')
      ? window.App.getCurrentUser()
      : (localStorage.getItem('hk_user') || 'Roberto');

    if (window.SoundEngine && typeof window.SoundEngine.playSentSound === 'function') {
      window.SoundEngine.playSentSound();
    }

    const btns = document.querySelectorAll('.btn-banner-notify-tablet, .btn-header-notify-tablet');
    btns.forEach(b => {
      b.disabled = true;
      b.innerHTML = '⏳ Envoi...';
    });

    try {
      const res = await fetch('/api/daily-rooms/notify-tablet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: currentUser, date: selectedDate })
      });

      if (res.ok) {
        btns.forEach(b => {
          b.innerHTML = '✅ Sonnerie envoyée !';
          b.classList.add('btn-sent-success');
        });
        setTimeout(() => {
          btns.forEach(b => {
            b.disabled = false;
            b.classList.remove('btn-sent-success');
            b.innerHTML = '🔔 Prévenir Adélcia (Sonnerie)';
          });
        }, 2500);
      } else {
        btns.forEach(b => {
          b.disabled = false;
          b.innerHTML = '🔔 Prévenir Adélcia (Sonnerie)';
        });
      }
    } catch (err) {
      console.error('Erreur envoi sonnerie:', err);
      btns.forEach(b => {
        b.disabled = false;
        b.innerHTML = '🔔 Prévenir Adélcia (Sonnerie)';
      });
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getZurichDateStr(dateObj = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat('fr-CA', {
        timeZone: 'Europe/Zurich',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(dateObj);
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const d = parts.find(p => p.type === 'day').value;
      return `${y}-${m}-${d}`;
    } catch (e) {
      return getTodayStr();
    }
  }

async function initOrders() {
  setupDailyBoardEvents();
  setupOrderEvents();
  await Promise.all([
    loadDailyRooms(selectedDate),
    loadOrders()
  ]);
}

function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  
  const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  const fullDate = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return { dayName: capitalizedDay, fullDate };
}

// ==========================================================================
// PLANNING QUOTIDIEN DES CHAMBRES (1..5)
// ==========================================================================
async function loadDailyRooms(dateStr) {
  try {
    const res = await fetch(`/api/daily-rooms?date=${dateStr}`);
    if (res.ok) {
      const data = await res.json();
      dailyRooms = data.rooms || [];
      currentDailyMeta = data.meta || null;
      renderDailyBoard();
    }
  } catch (err) {
    console.error('Erreur chargement planning quotidien des chambres:', err);
  }
}

function renderDailyBoard() {
  const dayNameEl = document.getElementById('daily-day-name');
  const dateSubEl = document.getElementById('daily-date-full');
  const dateInputEl = document.getElementById('daily-date-input');
  const btnTodayEl = document.getElementById('btn-daily-today');

  const { dayName, fullDate } = formatDateDisplay(selectedDate);
  if (dayNameEl) dayNameEl.textContent = dayName;
  if (dateSubEl) dateSubEl.textContent = fullDate;
  if (dateInputEl) dateInputEl.value = selectedDate;

  const isToday = selectedDate === getTodayStr();
  if (btnTodayEl) btnTodayEl.classList.toggle('active', isToday);

  // Rendu de la bannière bien mise en évidence pour Adélcia et Roberto
  renderDailyUpdateBanner();

  const grid = document.getElementById('daily-rooms-grid');
  if (!grid) return;

  const existingCards = grid.querySelectorAll('.daily-room-card');
  if (existingCards.length === dailyRooms.length && dailyRooms.length > 0) {
    dailyRooms.forEach(room => {
      const card = document.getElementById(`daily-room-card-${room.room_number}`);
      if (card) {
        updateRoomCardDOM(card, room);
      }
    });
  } else {
    grid.innerHTML = dailyRooms.map(room => createDailyRoomCardHtml(room)).join('');
    attachDailyRoomListeners();
  }
}

function renderDailyUpdateBanner() {
  const banner = document.getElementById('daily-planning-update-banner');
  if (!banner) return;

  const todayZurich = getZurichDateStr(new Date());
  const isViewingToday = (selectedDate === todayZurich);
  const currentUser = (window.App && typeof window.App.getCurrentUser === 'function')
    ? window.App.getCurrentUser()
    : (localStorage.getItem('hk_user') || 'Roberto');
  const isRoberto = currentUser && currentUser.toLowerCase() === 'roberto';

  const totalRooms = dailyRooms.length || 5;
  const actualizedCount = dailyRooms.filter(r => r.is_actualized === 1).length;
  const allActualized = (actualizedCount === totalRooms && totalRooms > 0);
  const isPartiallyActualized = (actualizedCount > 0 && actualizedCount < totalRooms);

  const hasMeta = currentDailyMeta && currentDailyMeta.updated_at;
  let updateDate = null;
  let timeStr = '';
  let dateStr = '';
  let author = 'Roberto';

  if (hasMeta) {
    updateDate = parseDateSafe(currentDailyMeta.updated_at);
    timeStr = updateDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
    dateStr = updateDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' });
    author = currentDailyMeta.updated_by || 'Roberto';
  }

  // CAS 1 : On consulte AUJOURD'HUI
  if (isViewingToday) {
    if (allActualized) {
      // PLANNING À JOUR POUR AUJOURD'HUI (VERT / ÉMERAUDE)
      banner.className = 'daily-update-banner is-updated';
      banner.innerHTML = `
        <div class="daily-banner-left">
          <div class="daily-banner-icon-box" title="Planning vérifié">✓</div>
          <div class="daily-banner-content">
            <div class="daily-banner-badge-row">
              <span class="daily-banner-badge">✓ PLANNING DU JOUR À JOUR (${actualizedCount}/${totalRooms} VÉRIFIÉES)</span>
            </div>
            <div class="daily-banner-title">
              Dernière mise à jour : <strong>Aujourd'hui à ${timeStr || 'ce matin'}</strong> <span class="daily-banner-author">par ${escapeHtml(author)}</span>
            </div>
            <div class="daily-banner-subtitle">
              Toutes les informations, statuts des 5 chambres, départs et arrivées sont vérifiés et actualisés pour aujourd'hui.
            </div>
          </div>
        </div>
        <div class="daily-banner-right">
          ${isRoberto ? `
            <button type="button" class="btn-banner-action btn-banner-notify-tablet" onclick="window.OrdersModule.notifyTabletWithSong()" title="Envoyer la sonnerie d'alerte musicale de 3 secondes à Adélcia pour la prévenir des modifications">
              🔔 Prévenir Adélcia (Sonnerie)
            </button>
            <button type="button" class="btn-banner-action btn-banner-revalidate" onclick="window.OrdersModule.validateTodayPlanning()" title="Réactualiser l'horodatage de vérification">
              🔄 Réactualiser
            </button>
          ` : ''}
        </div>
      `;
    } else if (isPartiallyActualized) {
      // PLANNING EN COURS D'ACTUALISATION (BLEU / PROGRESSION)
      banner.className = 'daily-update-banner is-in-progress';
      banner.innerHTML = `
        <div class="daily-banner-left">
          <div class="daily-banner-icon-box" title="Actualisation en cours">🔄</div>
          <div class="daily-banner-content">
            <div class="daily-banner-badge-row">
              <span class="daily-banner-badge">🔄 ACTUALISATION EN COURS : ${actualizedCount} / ${totalRooms} CHAMBRES VÉRIFIÉES</span>
            </div>
            <div class="daily-banner-title">
              Mise à jour partielle par ${escapeHtml(author)}
            </div>
            <div class="daily-banner-subtitle">
              ${actualizedCount} chambre(s) actualisée(s) en couleur. ${totalRooms - actualizedCount} chambre(s) encore en grisé (en attente de vérification).
            </div>
          </div>
        </div>
        <div class="daily-banner-right">
          ${isRoberto ? `
            <button type="button" class="btn-banner-action btn-banner-notify-tablet" onclick="window.OrdersModule.notifyTabletWithSong()" title="Envoyer la sonnerie d'alerte musicale de 3 secondes à Adélcia pour la prévenir des modifications">
              🔔 Prévenir Adélcia (Sonnerie)
            </button>
            <button type="button" class="btn-banner-action btn-banner-validate-now" onclick="window.OrdersModule.validateTodayPlanning()" title="Valider toutes les chambres restantes d'un coup">
              ✅ Tout valider (${actualizedCount}/${totalRooms})
            </button>
          ` : ''}
        </div>
      `;
    } else {
      // PLANNING NON ENCORE ACTUALISÉ (AMBRE / ATTENTION ADÉLCIA)
      banner.className = 'daily-update-banner is-pending';
      banner.innerHTML = `
        <div class="daily-banner-left">
          <div class="daily-banner-icon-box" title="Planning en attente de vérification">⚠️</div>
          <div class="daily-banner-content">
            <div class="daily-banner-badge-row">
              <span class="daily-banner-badge">⚠️ ATTENTION : PLANNING NON ENCORE ACTUALISÉ (0 / ${totalRooms} VÉRIFIÉES)</span>
            </div>
            <div class="daily-banner-title">
              Planning du jour en attente de vérification
            </div>
            <div class="daily-banner-subtitle">
              Toutes les chambres apparaissent en grisé. Roberto n'a pas encore vérifié les fiches des chambres pour aujourd'hui. <em>Adélcia : vérifiez auprès de Roberto avant de débuter le nettoyage des chambres.</em>
            </div>
          </div>
        </div>
        <div class="daily-banner-right">
          ${isRoberto ? `
            <button type="button" class="btn-banner-action btn-banner-notify-tablet" onclick="window.OrdersModule.notifyTabletWithSong()" title="Envoyer la sonnerie d'alerte musicale de 3 secondes à Adélcia pour la prévenir des modifications">
              🔔 Prévenir Adélcia (Sonnerie)
            </button>
            <button type="button" class="btn-banner-action btn-banner-validate-now" onclick="window.OrdersModule.validateTodayPlanning()" title="Marquer le planning d'aujourd'hui comme vérifié">
              ✅ Valider le planning d'aujourd'hui
            </button>
          ` : ''}
        </div>
      `;
    }
  } else {
    // CAS 2 : On consulte une AUTRE DATE (Hier, Demain, etc.)
    const { dayName, fullDate } = formatDateDisplay(selectedDate);
    const dateText = hasMeta
      ? `Dernière modification : le <strong>${dateStr} à ${timeStr}</strong> <span class="daily-banner-author">par ${escapeHtml(author)}</span>`
      : `Aucune modification enregistrée pour cette date.`;

    if (allActualized) {
      banner.className = 'daily-update-banner is-updated';
    } else if (isPartiallyActualized) {
      banner.className = 'daily-update-banner is-in-progress';
    } else {
      banner.className = 'daily-update-banner is-other-date';
    }

    const badgeLabel = allActualized 
      ? `✓ PLANNING DU ${escapeHtml(dayName.toUpperCase())} ${escapeHtml(fullDate.toUpperCase())} (${actualizedCount}/${totalRooms} ACTUALISÉES)`
      : (isPartiallyActualized 
          ? `🔄 PLANNING DU ${escapeHtml(dayName.toUpperCase())} ${escapeHtml(fullDate.toUpperCase())} (${actualizedCount}/${totalRooms} ACTUALISÉES)`
          : `⚪ PLANNING DU ${escapeHtml(dayName.toUpperCase())} ${escapeHtml(fullDate.toUpperCase())} (NON ACTUALISÉ)`);

    const subLabel = allActualized
      ? `Toutes les chambres sont actualisées pour cette date.`
      : (isPartiallyActualized
          ? `${actualizedCount} chambre(s) actualisée(s) en couleur, les autres restent en grisé.`
          : `Toutes les chambres de cette date sont en grisé (en attente de mise à jour).`);

    banner.innerHTML = `
      <div class="daily-banner-left">
        <div class="daily-banner-icon-box" title="Planning d'une autre date">🗓️</div>
        <div class="daily-banner-content">
          <div class="daily-banner-badge-row">
            <span class="daily-banner-badge">${badgeLabel}</span>
          </div>
          <div class="daily-banner-title">
            ${dateText}
          </div>
          <div class="daily-banner-subtitle">
            ${subLabel}
          </div>
        </div>
      </div>
      <div class="daily-banner-right">
        <button type="button" class="btn-banner-action btn-banner-return-today" onclick="window.OrdersModule.goToToday()" title="Revenir au planning du jour">
          📅 Revenir à Aujourd'hui
        </button>
        ${isRoberto ? `
          <button type="button" class="btn-banner-action btn-banner-notify-tablet" onclick="window.OrdersModule.notifyTabletWithSong()" title="Envoyer la sonnerie d'alerte musicale de 3 secondes à Adélcia pour la prévenir des modifications">
            🔔 Prévenir Adélcia (Sonnerie)
          </button>
          <button type="button" class="btn-banner-action btn-banner-revalidate" onclick="window.OrdersModule.validateTodayPlanning()" title="Valider le planning pour cette date">
            ✓ Valider cette date
          </button>
        ` : ''}
      </div>
    `;
  }
}

async function validateTodayPlanning(targetDate = selectedDate) {
  lastLocalActionTimestamp = Date.now();
  try {
    const user = (window.App && typeof window.App.getCurrentUser === 'function')
      ? window.App.getCurrentUser()
      : (localStorage.getItem('hk_user') || 'Roberto');

    const res = await fetch(`/api/daily-rooms/${targetDate}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.meta) {
        currentDailyMeta = data.meta;
        renderDailyUpdateBanner();
      }
    }
  } catch (err) {
    console.error('Erreur validation planning:', err);
  }
}

function goToToday() {
  selectedDate = getTodayStr();
  loadDailyRooms(selectedDate);
}

function onDailyPlanningValidated(data) {
  if (data && data.date === selectedDate) {
    if (data.meta) currentDailyMeta = data.meta;
    if (data.rooms && Array.isArray(data.rooms)) {
      dailyRooms = data.rooms;
    } else {
      dailyRooms.forEach(r => r.is_actualized = 1);
    }
    renderDailyBoard();
  }
}

function isTabletView() {
  const user = (window.App && typeof window.App.getCurrentUser === 'function')
    ? window.App.getCurrentUser()
    : (localStorage.getItem('hk_user') || 'Roberto');

  // Si l'utilisateur connecté est Roberto, il a TOUJOURS la vue complète avec toutes les options
  // (que ce soit sur PC, Tablette ou Mobile)
  if (user && user.toLowerCase() === 'roberto') {
    return false;
  }

  // Pour Adélcia (ou tout autre profil gouvernante), vue épurée et simplifiée
  return true;
}

function updateRoomCardDOM(card, room) {
  const isTablet = isTabletView();
  const status = room.status || 'libera';
  const cleanliness = room.cleanliness_status || 'a_faire';
  const isActualized = (room.is_actualized === 1);

  const noteInput = card.querySelector('.room-notes-input');
  const isTyping = noteInput && document.activeElement === noteInput;

  const actualizedClass = isActualized ? 'is-actualized' : 'is-not-actualized';
  if (isActualized) {
    card.className = `daily-room-card ${actualizedClass} status-card-${status} clean-${cleanliness}${isTablet ? ' is-tablet-card' : ''}`;
  } else {
    card.className = `daily-room-card ${actualizedClass}${isTablet ? ' is-tablet-card' : ''}`;
  }

  // SI L'UTILISATEUR EST EN TRAIN D'ÉCRIRE DANS LE CHAMP NOTE :
  // Ne JAMAIS détruire le DOM ni l'input ! Conserver la saisie et le focus intacts.
  if (isTyping) {
    room.notes = noteInput.value;
    if (isTablet) {
      const pillsContainer = card.querySelector('.tablet-room-pills');
      if (pillsContainer && isActualized) {
        const unact = pillsContainer.querySelector('.pill-unactualized');
        if (unact) unact.remove();
      }
    } else {
      const topBadges = card.querySelector('.daily-room-top-badges');
      if (topBadges) {
        if (isActualized) {
          const unact = topBadges.querySelector('.pill-unactualized');
          if (unact) unact.remove();
          const valBtn = topBadges.querySelector('.btn-actualize-room');
          if (valBtn) valBtn.remove();
          if (!topBadges.querySelector('.pill-actualized')) {
            const actPill = document.createElement('span');
            actPill.className = 'status-pill pill-actualized';
            actPill.textContent = '✓ Actualisé';
            topBadges.prepend(actPill);
          }
        }
      }
    }
    return;
  }

  card.innerHTML = getDailyRoomCardInnerHtml(room, isTablet);
  bindRoomCardEvents(card);
}

function createDailyRoomCardHtml(room) {
  const isTablet = isTabletView();
  const roomNum = room.room_number;
  const status = room.status || 'libera';
  const cleanliness = room.cleanliness_status || 'a_faire';
  const isActualized = (room.is_actualized === 1);
  const actualizedClass = isActualized ? 'is-actualized' : 'is-not-actualized';
  const cardStatusClass = isActualized
    ? `${actualizedClass} status-card-${status} clean-${cleanliness}${isTablet ? ' is-tablet-card' : ''}`
    : `${actualizedClass}${isTablet ? ' is-tablet-card' : ''}`;

  return `
    <div class="daily-room-card ${cardStatusClass}" id="daily-room-card-${roomNum}" data-room="${roomNum}">
      ${getDailyRoomCardInnerHtml(room, isTablet)}
    </div>
  `;
}

function getDailyRoomCardInnerHtml(room, isTablet) {
  const roomNum = room.room_number;
  const status = room.status || 'libera';
  const access = room.access_status || 'en_chambre';
  const cleanliness = room.cleanliness_status || 'a_faire';
  const guests = room.guests_count || 2;
  const isSeparati = room.beds_type === 'separati';
  const notes = room.notes || '';
  const isRoom5 = roomNum === 5;
  const needsExtraBed = isRoom5 && guests === 3;
  const isControlRequested = room.control_requested === 1;
  const isActualized = (room.is_actualized === 1);

  if (isTablet) {
    // ----------------------------------------------------
    // VUE ADÉLCIA / TABLET (3 LIGNES COMPACTES)
    // ----------------------------------------------------
    const isReadyOrTermine = (isControlRequested || cleanliness === 'termine');

    return `
      <!-- LIGNE 1 : Chambre + Mouvement + Éventuelles spécificités lits/personnes -->
      <div class="tablet-room-row tablet-room-row-1">
        <div class="tablet-room-title">
          <span>🚪 Chambre ${roomNum}</span>
        </div>
        <div class="tablet-room-pills">
          ${!isActualized ? `
            <span class="tablet-pill pill-unactualized" title="En attente de vérification par Roberto">⚪ Non actualisé</span>
          ` : `
            ${status === 'libera' ? '<span class="tablet-pill pill-libera">🟢 Libre</span>' : ''}
            ${status === 'partenza' ? '<span class="tablet-pill pill-partenza">🔴 Départ</span>' : ''}
            ${status === 'restante' ? '<span class="tablet-pill pill-restante">🟡 Recouche</span>' : ''}
          `}
          ${isSeparati ? '<span class="tablet-pill pill-beds" title="Lits séparés">🛏️ Séparés</span>' : ''}
          ${needsExtraBed ? '<span class="tablet-pill pill-extra-bed" title="Ajouter un lit d\'appoint (3 personnes)">⚠️ Lit suppl. (3p)</span>' : ''}
          ${guests !== 2 && !needsExtraBed ? `<span class="tablet-pill pill-guests">👥 ${guests}p</span>` : ''}
        </div>
      </div>

      <!-- LIGNE 2 : État des chambres (Accès + État du ménage SANS le bouton terminé) -->
      <div class="tablet-room-row tablet-room-row-2">
        <div class="tablet-status-item">
          <span class="tablet-status-label">🚪 Accès :</span>
          ${access === 'client_sorti'
            ? '<span class="tablet-badge badge-access-sorti">🟢 Client sorti</span>'
            : '<span class="tablet-badge badge-access-chambre">🔴 En chambre</span>'
          }
        </div>
        <div class="tablet-status-item">
          <span class="tablet-status-label">🧹 État :</span>
          ${cleanliness === 'deja_propre'
            ? '<span class="tablet-badge badge-clean-propre">✨ Déjà propre</span>'
            : (isReadyOrTermine
              ? '<span class="tablet-badge badge-clean-termine">✅ Fait</span>'
              : '<span class="tablet-badge badge-clean-afaire">⏳ À faire</span>'
            )
          }
        </div>
      </div>

      <!-- LIGNE 3 : Action gauche (Terminé ok x contrôle) + Commentaire droite -->
      <div class="tablet-room-row tablet-room-row-3">
        <button type="button" class="btn-room-ready btn-tablet-ready ${isReadyOrTermine ? 'btn-sent' : ''}" data-room="${roomNum}" title="${isReadyOrTermine ? 'Maintenir appuyé 2s pour annuler' : 'Marquer terminé et envoyer à Roberto'}">
          <span>✅ Terminé (ok x contrôle)</span>
        </button>
        <input type="text" class="room-notes-input tablet-notes-input" placeholder="Notes pour la Chambre ${roomNum}..." value="${escapeHtml(notes)}" data-room="${roomNum}" />
      </div>
    `;
  }

  // ----------------------------------------------------
  // VUE ROBERTO / PC (Complète avec tous les sélecteurs)
  // ----------------------------------------------------
  return `
    <div class="daily-room-top">
      <div class="daily-room-number-badge">
        <span>🚪 Chambre ${roomNum}</span>
      </div>
      <div class="daily-room-top-badges">
        ${!isActualized ? `
          <span class="status-pill pill-unactualized">⚪ Non actualisé</span>
          <button type="button" class="btn-actualize-room" onclick="window.OrdersModule.actualizeRoom(${roomNum}, true)" title="Confirmer et valider cette chambre pour cette date">✓ Valider</button>
        ` : `
          <span class="status-pill pill-actualized">✓ Actualisé</span>
        `}
        ${isActualized && cleanliness === 'deja_propre' ? '<span class="status-pill pill-propre">✨ Déjà Propre</span>' : ''}
        ${isActualized && cleanliness === 'a_faire' ? '<span class="status-pill pill-a-faire">⏳ À faire</span>' : ''}
        ${isActualized && cleanliness === 'termine' ? '<span class="status-pill pill-termine">✅ Terminé</span>' : ''}
        ${isActualized && access === 'client_sorti' ? '<span class="status-pill pill-accessible">🟢 Accès Libre</span>' : ''}
        <span class="bed-type-badge ${isSeparati ? 'separati' : 'matrimoniale'}">
          ${isSeparati ? '🛏️🛏️ Lits Séparés' : '🛏️ Grand Lit'}
        </span>
      </div>
    </div>

    <!-- 1. MOUVEMENT DU JOUR (3 FLAGS) -->
    <div class="room-status-flags">
      <button type="button" class="flag-btn flag-libera ${status === 'libera' ? 'active' : ''}" data-status="libera" title="Chambre libre / Arrivée">
        <span>🟢 Libre</span>
      </button>
      <button type="button" class="flag-btn flag-partenza ${status === 'partenza' ? 'active' : ''}" data-status="partenza" title="Départ / À blanc">
        <span>🔴 Départ</span>
      </button>
      <button type="button" class="flag-btn flag-restante ${status === 'restante' ? 'active' : ''}" data-status="restante" title="Recouche / Client reste">
        <span>🟡 Recouche</span>
      </button>
    </div>

    <!-- 2. ACCÈS EN TEMPS RÉEL (EN CHAMBRE / CLIENT SORTI) -->
    <div class="room-detail-row">
      <span class="detail-label">🚪 Accès :</span>
      <div class="segmented-group">
        <button type="button" class="segment-btn btn-access ${access === 'en_chambre' ? 'active access-en-chambre' : ''}" data-access="en_chambre" title="Client présent dans la chambre">
          🔴 En chambre
        </button>
        <button type="button" class="segment-btn btn-access ${access === 'client_sorti' ? 'active access-client-sorti' : ''}" data-access="client_sorti" title="Client sorti : accès libre pour le ménage">
          🟢 Client sorti / Libre
        </button>
      </div>
    </div>

    <!-- 3. ÉTAT DU MÉNAGE (À FAIRE / DÉJÀ PROPRE / FAIT) -->
    <div class="room-detail-row">
      <span class="detail-label">🧹 État :</span>
      <div class="segmented-group">
        <button type="button" class="segment-btn btn-clean ${cleanliness === 'a_faire' ? 'active clean-a-faire' : ''}" data-clean="a_faire">
          ⏳ À faire
        </button>
        <button type="button" class="segment-btn btn-clean ${cleanliness === 'deja_propre' ? 'active clean-deja-propre' : ''}" data-clean="deja_propre" title="Chambre déjà propre car non utilisée la nuit précédente">
          ✨ Déjà propre
        </button>
        <button type="button" class="segment-btn btn-clean ${cleanliness === 'termine' ? 'active clean-termine' : ''}" data-clean="termine">
          ✅ Terminé
        </button>
      </div>
    </div>

    <!-- 4. SÉLECTEUR D'OCCUPANTS -->
    <div class="room-detail-row">
      <span class="detail-label">👥 Clients :</span>
      <div class="segmented-group">
        <button type="button" class="segment-btn ${guests === 1 ? 'active' : ''}" data-guests="1">1 Personne</button>
        <button type="button" class="segment-btn ${guests === 2 ? 'active' : ''}" data-guests="2">2 Personnes</button>
        ${isRoom5 ? `<button type="button" class="segment-btn ${guests === 3 ? 'active' : ''}" data-guests="3">3 Personnes</button>` : ''}
      </div>
    </div>

    <!-- ALERTE LIT SUPPLÉMENTAIRE (POUR CHAMBRE 5 AVEC 3 OCCUPANTS) -->
    ${needsExtraBed ? `
      <div class="extra-bed-alert">
        <span>⚠️ 🛏️ <strong>AJOUTER UN LIT D'APPOINT !</strong> (3 Personnes)</span>
      </div>
    ` : ''}

    <!-- 5. CONFIGURATION DES LITS -->
    <div class="room-detail-row">
      <span class="detail-label">🛏️ Configuration :</span>
      <div class="segmented-group">
        <button type="button" class="segment-btn ${!isSeparati ? 'active' : ''}" data-bedstype="matrimoniale">Grand Lit</button>
        <button type="button" class="segment-btn ${isSeparati ? 'active' : ''}" data-bedstype="separati">Lits Séparés</button>
      </div>
    </div>

    <!-- 6. NOTES CHAMBRE -->
    <div>
      <input type="text" class="room-notes-input" placeholder="Notes pour la Chambre ${roomNum}..." value="${escapeHtml(notes)}" data-room="${roomNum}" />
    </div>

    <!-- 7. BOUTON PRÊTE POUR LE CONTRÔLE -->
    <div>
      <button type="button" class="btn-room-ready ${isControlRequested ? 'btn-sent' : ''}" data-room="${roomNum}" title="${isControlRequested ? 'Maintenir appuyé 2s pour annuler' : 'Notifier Roberto que la Chambre ' + roomNum + ' est prête pour le contrôle'}">
        <span>${isControlRequested ? '✅ Message envoyé à Roberto !' : `🔍 Chambre ${roomNum} prête pour le contrôle`}</span>
      </button>
    </div>
  `;
}

async function actualizeRoom(roomNum, actualized = true) {
  const currentUser = (window.App && typeof window.App.getCurrentUser === 'function')
    ? window.App.getCurrentUser()
    : (localStorage.getItem('hk_user') || 'Roberto');
  const room = dailyRooms.find(r => r.room_number === roomNum);
  if (room) {
    room.is_actualized = actualized ? 1 : 0;
    const card = document.getElementById(`daily-room-card-${roomNum}`);
    if (card) {
      updateRoomCardDOM(card, room);
    }
  }
  await saveRoomUpdate(roomNum, { is_actualized: actualized ? 1 : 0, updated_by: currentUser });
  renderDailyUpdateBanner();
}

function bindRoomCardEvents(card) {
  const roomNum = parseInt(card.getAttribute('data-room'), 10);
  const currentUser = window.App ? window.App.getCurrentUser() : 'Roberto';

  // 1. Boutons Statut (Libre / Départ / Recouche) - Uniquement si interactifs (PC)
  card.querySelectorAll('.flag-btn:not(.flag-readonly)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newStatus = btn.getAttribute('data-status');
      const room = dailyRooms.find(r => r.room_number === roomNum);
      if (room) {
        room.status = newStatus;
        room.is_actualized = 1;
        updateRoomCardDOM(card, room);
      }
      await saveRoomUpdate(roomNum, { status: newStatus, is_actualized: 1, updated_by: currentUser });
      renderDailyUpdateBanner();
    });
  });

  // 2. Boutons Accès (En chambre / Client sorti) - Uniquement si interactifs (PC)
  card.querySelectorAll('[data-access]:not(.flag-readonly)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newAccess = btn.getAttribute('data-access');
      const room = dailyRooms.find(r => r.room_number === roomNum);
      if (room) {
        room.access_status = newAccess;
        room.is_actualized = 1;
        updateRoomCardDOM(card, room);
      }
      await saveRoomUpdate(roomNum, { access_status: newAccess, is_actualized: 1, updated_by: currentUser });
      renderDailyUpdateBanner();
    });
  });

  // 3. Boutons État (À faire / Déjà propre / Terminé)
  card.querySelectorAll('[data-clean]:not(.flag-readonly)').forEach(btn => {
    btn.addEventListener('click', async () => {
      let newClean = btn.getAttribute('data-clean');
      const room = dailyRooms.find(r => r.room_number === roomNum);
      if (room) {
        if (isTabletView() && room.cleanliness_status === 'termine' && newClean === 'termine') {
          newClean = 'a_faire';
        }
        room.cleanliness_status = newClean;
        room.is_actualized = 1;
        updateRoomCardDOM(card, room);
      }
      await saveRoomUpdate(roomNum, { cleanliness_status: newClean, is_actualized: 1, updated_by: currentUser });
      renderDailyUpdateBanner();
    });
  });

  // 4. Boutons Occupants (PC)
  card.querySelectorAll('[data-guests]:not(.flag-readonly)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const guests = parseInt(btn.getAttribute('data-guests'), 10);
      const room = dailyRooms.find(r => r.room_number === roomNum);
      if (room) {
        room.guests_count = guests;
        room.is_actualized = 1;
        updateRoomCardDOM(card, room);
      }
      await saveRoomUpdate(roomNum, { guests_count: guests, is_actualized: 1, updated_by: currentUser });
      renderDailyUpdateBanner();
    });
  });

  // 5. Boutons Type de Lit (PC)
  card.querySelectorAll('[data-bedstype]:not(.flag-readonly)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bedsType = btn.getAttribute('data-bedstype');
      const room = dailyRooms.find(r => r.room_number === roomNum);
      if (room) {
        room.beds_type = bedsType;
        room.is_actualized = 1;
        updateRoomCardDOM(card, room);
      }
      await saveRoomUpdate(roomNum, { beds_type: bedsType, is_actualized: 1, updated_by: currentUser });
      renderDailyUpdateBanner();
    });
  });

  // 6. Notes
  const noteInput = card.querySelector('.room-notes-input');
  if (noteInput) {
    noteInput.addEventListener('input', () => {
      const text = noteInput.value;
      const room = dailyRooms.find(r => r.room_number === roomNum);
      if (room) {
        room.notes = text;
        if (!room.is_actualized) {
          room.is_actualized = 1;
          const status = room.status || 'libera';
          const cleanliness = room.cleanliness_status || 'a_faire';
          card.classList.remove('is-not-actualized');
          card.classList.add('is-actualized', `status-card-${status}`, `clean-${cleanliness}`);

          const topBadges = card.querySelector('.daily-room-top-badges');
          if (topBadges) {
            const unact = topBadges.querySelector('.pill-unactualized');
            if (unact) unact.remove();
            const valBtn = topBadges.querySelector('.btn-actualize-room');
            if (valBtn) valBtn.remove();
            if (!topBadges.querySelector('.pill-actualized')) {
              const actPill = document.createElement('span');
              actPill.className = 'status-pill pill-actualized';
              actPill.textContent = '✓ Actualisé';
              topBadges.prepend(actPill);
            }
          }
          renderDailyUpdateBanner();
        }
      }
      if (saveNoteTimeouts[roomNum]) clearTimeout(saveNoteTimeouts[roomNum]);
      saveNoteTimeouts[roomNum] = setTimeout(async () => {
        await saveRoomUpdate(roomNum, { notes: text, is_actualized: 1, updated_by: currentUser });
        renderDailyUpdateBanner();
      }, 1000);
    });

    noteInput.addEventListener('blur', async () => {
      const text = noteInput.value;
      if (saveNoteTimeouts[roomNum]) clearTimeout(saveNoteTimeouts[roomNum]);
      const room = dailyRooms.find(r => r.room_number === roomNum);
      if (room) room.notes = text;
      await saveRoomUpdate(roomNum, { notes: text, is_actualized: 1, updated_by: currentUser });
      renderDailyUpdateBanner();
    });

    noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        noteInput.blur();
      }
    });
  }

  // 7. Bouton Contrôle / Terminé (avec maintien 2s pour annuler)
  const readyBtn = card.querySelector('.btn-room-ready');
  if (readyBtn) {
    let holdTimer = null;
    let isLongPressTriggered = false;

    const getBtnNormalText = () => {
      if (isTabletView()) {
        return `<span>✅ Terminé (ok x contrôle)</span>`;
      }
      const currentRoom = dailyRooms.find(r => r.room_number === roomNum);
      const isSent = currentRoom && currentRoom.control_requested === 1;
      return isSent ? `<span>✅ Message envoyé à Roberto !</span>` : `<span>🔍 Chambre ${roomNum} prête pour le contrôle</span>`;
    };

    const startHold = (e) => {
      const currentRoom = dailyRooms.find(r => r.room_number === roomNum);
      const isTablet = isTabletView();
      const isSent = currentRoom && (currentRoom.control_requested === 1 || (isTablet && currentRoom.cleanliness_status === 'termine'));
      if (!isSent) return;

      isLongPressTriggered = false;
      readyBtn.classList.add('btn-holding');
      readyBtn.innerHTML = `<span>⏳ Maintenir 2s pour annuler...</span>`;

      holdTimer = setTimeout(async () => {
        isLongPressTriggered = true;
        readyBtn.classList.remove('btn-holding');

        if (navigator.vibrate) {
          try { navigator.vibrate([50, 50, 50]); } catch (err) {}
        }

        const user = window.App ? window.App.getCurrentUser() : 'Adélcia';
        const changes = { control_requested: 0, updated_by: user };
        if (isTablet) {
          changes.cleanliness_status = 'a_faire';
          changes.is_actualized = 1;
        }
        if (currentRoom) {
          currentRoom.control_requested = 0;
          if (isTablet) {
            currentRoom.cleanliness_status = 'a_faire';
            currentRoom.is_actualized = 1;
          }
        }
        await saveRoomUpdate(roomNum, changes);
        readyBtn.classList.remove('btn-sent');
        readyBtn.innerHTML = getBtnNormalText();
        updateRoomCardDOM(card, currentRoom);
        renderDailyUpdateBanner();

        if (user.toLowerCase() !== 'roberto') {
          const cancelMsg = `Désolé, la chambre ${roomNum} n’est pas encore prête`;
          if (window.ChatModule && typeof window.ChatModule.sendMessage === 'function') {
            await window.ChatModule.sendMessage(cancelMsg);
          } else {
            await fetch('/api/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sender: user, text: cancelMsg })
            });
          }
        }
      }, 2000);
    };

    const cancelHold = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      readyBtn.classList.remove('btn-holding');

      const currentRoom = dailyRooms.find(r => r.room_number === roomNum);
      const isTablet = isTabletView();
      const isSent = currentRoom && (currentRoom.control_requested === 1 || (isTablet && currentRoom.cleanliness_status === 'termine'));
      if (isSent && !isLongPressTriggered) {
        readyBtn.innerHTML = getBtnNormalText();
      }
    };

    readyBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    readyBtn.addEventListener('mousedown', startHold);
    readyBtn.addEventListener('mouseup', cancelHold);
    readyBtn.addEventListener('mouseleave', cancelHold);
    readyBtn.addEventListener('touchstart', startHold, { passive: true });
    readyBtn.addEventListener('touchend', cancelHold);
    readyBtn.addEventListener('touchcancel', cancelHold);

    readyBtn.addEventListener('click', async (e) => {
      if (isLongPressTriggered) {
        isLongPressTriggered = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const currentRoom = dailyRooms.find(r => r.room_number === roomNum);
      const isTablet = isTabletView();
      const isSent = currentRoom && (currentRoom.control_requested === 1 || (isTablet && currentRoom.cleanliness_status === 'termine'));
      const user = window.App ? window.App.getCurrentUser() : 'Roberto';

      if (!isSent) {
        readyBtn.classList.add('btn-sent');
        const changes = { control_requested: 1, updated_by: user };
        if (isTablet) {
          changes.cleanliness_status = 'termine';
          changes.is_actualized = 1;
        }
        if (currentRoom) {
          currentRoom.control_requested = 1;
          if (isTablet) {
            currentRoom.cleanliness_status = 'termine';
            currentRoom.is_actualized = 1;
          }
        }

        readyBtn.innerHTML = getBtnNormalText();
        await saveRoomUpdate(roomNum, changes);
        updateRoomCardDOM(card, currentRoom);
        renderDailyUpdateBanner();

        if (user.toLowerCase() !== 'roberto') {
          const msgText = `Chambre ${roomNum} prête pour le contrôle`;
          if (window.ChatModule && typeof window.ChatModule.sendMessage === 'function') {
            await window.ChatModule.sendMessage(msgText);
          } else {
            await fetch('/api/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sender: user, text: msgText })
            });
          }
        }
      } else {
        readyBtn.innerHTML = `<span>⏳ Maintenir 2s pour annuler</span>`;
        setTimeout(() => {
          const checkRoom = dailyRooms.find(r => r.room_number === roomNum);
          const stillSent = checkRoom && (checkRoom.control_requested === 1 || (isTabletView() && checkRoom.cleanliness_status === 'termine'));
          if (stillSent && !readyBtn.classList.contains('btn-holding')) {
            readyBtn.innerHTML = getBtnNormalText();
          }
        }, 1500);
      }
    });
  }
}

function attachDailyRoomListeners() {
  const grid = document.getElementById('daily-rooms-grid');
  if (!grid) return;
  grid.querySelectorAll('.daily-room-card').forEach(card => {
    bindRoomCardEvents(card);
  });
}

async function saveRoomUpdate(roomNum, changes) {
  lastLocalActionTimestamp = Date.now();
  try {
    const res = await fetch(`/api/daily-rooms/${selectedDate}/${roomNum}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes)
    });

    if (res.ok) {
      const updated = await res.json();
      const activeEl = document.activeElement;
      if (activeEl && activeEl.classList.contains('room-notes-input')) {
        const activeRoom = parseInt(activeEl.getAttribute('data-room'), 10);
        if (activeRoom === roomNum) {
          updated.notes = activeEl.value;
        }
      }
      onRoomStatusUpdated({ date: selectedDate, room: updated });
    }
  } catch (err) {
    console.error('Erreur enregistrement statut chambre:', err);
  }
}

function onRoomStatusUpdated({ date, room, meta, sender }) {
  if (date !== selectedDate) return;
  if (meta) {
    currentDailyMeta = meta;
  } else if (room && room.updated_at) {
    currentDailyMeta = {
      date,
      updated_at: room.updated_at,
      updated_by: room.updated_by || 'Roberto'
    };
  }
  const idx = dailyRooms.findIndex(r => r.room_number === room.room_number);
  if (idx !== -1) {
    // Si l'utilisateur est en train d'écrire dans la note de cette chambre, conserver sa saisie active
    const activeEl = document.activeElement;
    if (activeEl && activeEl.classList.contains('room-notes-input')) {
      const activeRoom = parseInt(activeEl.getAttribute('data-room'), 10);
      if (activeRoom === room.room_number) {
        room.notes = activeEl.value;
      }
    }
    dailyRooms[idx] = room;
  } else {
    dailyRooms.push(room);
  }
  renderDailyBoard();
}

function setupDailyBoardEvents() {
  const btnPrev = document.getElementById('btn-daily-prev');
  const btnToday = document.getElementById('btn-daily-today');
  const btnNext = document.getElementById('btn-daily-next');
  const dateInput = document.getElementById('daily-date-input');

  const shiftDate = (days) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + days);

    const newYear = dateObj.getFullYear();
    const newMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
    const newDay = String(dateObj.getDate()).padStart(2, '0');
    selectedDate = `${newYear}-${newMonth}-${newDay}`;
    loadDailyRooms(selectedDate);
  };

  if (btnPrev) btnPrev.addEventListener('click', () => shiftDate(-1));
  if (btnNext) btnNext.addEventListener('click', () => shiftDate(1));
  if (btnToday) {
    btnToday.addEventListener('click', () => {
      selectedDate = getTodayStr();
      loadDailyRooms(selectedDate);
    });
  }

  if (dateInput) {
    dateInput.addEventListener('change', () => {
      if (dateInput.value) {
        selectedDate = dateInput.value;
        loadDailyRooms(selectedDate);
      }
    });
  }
}

// ==========================================================================
// ORDRES DE SERVICE
// ==========================================================================
async function loadOrders() {
  try {
    const [resActive, resArchived] = await Promise.all([
      fetch('/api/orders'),
      fetch('/api/orders/archived')
    ]);

    if (resActive.ok) ordersList = await resActive.json();
    if (resArchived.ok) archivedList = await resArchived.json();

    renderOrders();
    updateOrdersBadge();
  } catch (err) {
    console.error('Erreur chargement ordres:', err);
  }
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('#orders-filter-bar .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
  });
  renderOrders();
}

window.setOrdersFilter = setFilter;

function renderOrders() {
  const container = document.getElementById('orders-list');
  if (!container) return;

  let displayItems = [];
  if (currentFilter === 'archivio') {
    displayItems = archivedList;
  } else if (currentFilter === 'attivi') {
    displayItems = ordersList.filter(o => o.status === 'in_attesa' || o.status === 'in_carico');
  } else if (currentFilter === 'in_attesa') {
    displayItems = ordersList.filter(o => o.status === 'in_attesa');
  } else if (currentFilter === 'in_carico') {
    displayItems = ordersList.filter(o => o.status === 'in_carico');
  } else if (currentFilter === 'ultimato') {
    displayItems = ordersList.filter(o => o.status === 'ultimato');
  } else {
    displayItems = ordersList;
  }

  if (displayItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">Aucun ordre trouvé</div>
        <div class="empty-desc">${currentFilter === 'archivio' ? 'Aucun ordre dans les archives.' : 'Toutes les tâches de cette section ont été traitées.'}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = displayItems.map(order => createOrderCardHtml(order)).join('');
  attachOrderCardListeners();
}

function parseDateSafe(raw) {
  if (!raw) return new Date();
  if (raw instanceof Date) return raw;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    return new Date(s.replace(' ', 'T') + 'Z');
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
    return new Date(s + 'Z');
  }
  return new Date(s);
}

function createOrderCardHtml(order) {
  const isArchived = order.is_archived === 1;
  const createdDate = parseDateSafe(order.created_at);
  const timeStr = createdDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
  const dateStr = createdDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Zurich' });

  let priorityClass = 'priority-normale';
  let priorityLabel = 'Normale';
  let priorityIcon = 'ℹ️';

  if (order.priority === 'emergenza') {
    priorityClass = 'priority-emergenza pulse-border';
    priorityLabel = 'URGENCE';
    priorityIcon = '🚨';
  } else if (order.priority === 'urgente') {
    priorityClass = 'priority-urgente';
    priorityLabel = 'Urgente';
    priorityIcon = '⚠️';
  } else if (order.priority === 'bassa') {
    priorityClass = 'priority-bassa';
    priorityLabel = 'Basse';
    priorityIcon = '◾';
  }

  let statusBadge = '';
  let statusActionButton = '';

  if (isArchived) {
    statusBadge = '<span class="status-chip chip-archived">📁 Archivé</span>';
    statusActionButton = `
      <button type="button" class="btn btn-secondary btn-unarchive" data-id="${order.id}">↩ Restaurer</button>
    `;
  } else if (order.status === 'in_attesa') {
    statusBadge = '<span class="status-chip chip-in-attesa">⏳ En Attente</span>';
    statusActionButton = `
      <button type="button" class="btn btn-primary btn-take-charge" data-id="${order.id}">
        🏃 Prendre en Charge
      </button>
    `;
  } else if (order.status === 'in_carico') {
    statusBadge = `<span class="status-chip chip-in-carico">🏃 En Cours (${escapeHtml(order.assigned_to || 'Opérateur')})</span>`;
    statusActionButton = `
      <button type="button" class="btn btn-success btn-complete" data-id="${order.id}">
        ✓ Marquer Terminé
      </button>
    `;
  } else if (order.status === 'ultimato') {
    const completedTime = order.completed_at ? parseDateSafe(order.completed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }) : '';
    statusBadge = `<span class="status-chip chip-ultimato">✅ Terminé par ${escapeHtml(order.completed_by || 'Opérateur')} ${completedTime ? 'à ' + completedTime : ''}</span>`;
    statusActionButton = `
      <button type="button" class="btn btn-secondary btn-archive" data-id="${order.id}">
        📁 Archiver
      </button>
    `;
  }

  return `
    <div class="card order-card ${priorityClass}" id="order-card-${order.id}">
      <div class="card-header">
        <div class="order-room">
          <span class="room-icon">🏷️</span>
          <span class="room-text">${escapeHtml(order.room_or_area)}</span>
        </div>
        <div class="priority-badge ${order.priority}">
          ${priorityIcon} ${priorityLabel}
        </div>
      </div>
      
      <div class="card-body">
        <h3 class="order-title">${escapeHtml(order.title)}</h3>
        ${order.description ? `<p class="order-description">${escapeHtml(order.description)}</p>` : ''}
        
        <div class="order-meta">
          <span class="meta-item">👤 Créé par : <strong>${escapeHtml(order.created_by)}</strong></span>
          <span class="meta-item">🕐 ${dateStr} à ${timeStr}</span>
        </div>

        <div class="order-status-row">
          ${statusBadge}
        </div>
      </div>

      <div class="card-footer">
        <div class="card-footer-actions-left">
          <button type="button" class="btn btn-secondary btn-edit-order" data-id="${order.id}" title="Modifier l'ordre ou ajouter des notes">
            ✏️ Modifier
          </button>
          <button type="button" class="btn btn-danger btn-delete-order" data-id="${order.id}" title="Supprimer cet ordre">
            🗑️ Supprimer
          </button>
        </div>
        <div class="card-footer-actions-right">
          ${statusActionButton}
        </div>
      </div>
    </div>
  `;
}

function attachOrderCardListeners() {
  const container = document.getElementById('orders-list');
  if (!container) return;

  const currentUser = window.App ? window.App.getCurrentUser() : 'Adélcia';

  // Modifier Ordre
  container.querySelectorAll('.btn-edit-order').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      openEditOrderModal(id);
    });
  });

  // Supprimer Ordre
  container.querySelectorAll('.btn-delete-order').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Êtes-vous sûr de vouloir supprimer définitivement cet ordre ?')) {
        const id = btn.getAttribute('data-id');
        await deleteOrder(id);
      }
    });
  });

  // Prendre en charge
  container.querySelectorAll('.btn-take-charge').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await updateOrderStatus(id, 'in_carico', currentUser);
    });
  });

  // Marquer terminé
  container.querySelectorAll('.btn-complete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await updateOrderStatus(id, 'ultimato', currentUser);
      if (window.SoundEngine) {
        window.SoundEngine.playSuccessSound();
      }
    });
  });

  // Archiver
  container.querySelectorAll('.btn-archive').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await toggleArchive(id, true);
    });
  });

  // Restaurer
  container.querySelectorAll('.btn-unarchive').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await toggleArchive(id, false);
    });
  });
}

function openEditOrderModal(orderId) {
  const order = ordersList.find(o => o.id === orderId) || archivedList.find(o => o.id === orderId);
  if (!order) return;

  const modal = document.getElementById('modal-edit-order');
  if (!modal) return;

  document.getElementById('edit-order-id').value = order.id;
  document.getElementById('edit-order-room').value = order.room_or_area;
  document.getElementById('edit-order-title').value = order.title;
  document.getElementById('edit-order-priority').value = order.priority || 'normale';
  document.getElementById('edit-order-desc').value = order.description || '';

  modal.style.setProperty('display', 'flex', 'important');
  modal.classList.add('modal-active');
  const titleInput = document.getElementById('edit-order-title');
  if (titleInput) setTimeout(() => titleInput.focus(), 100);
}

function closeEditOrderModal() {
  const modal = document.getElementById('modal-edit-order');
  if (modal) {
    modal.style.setProperty('display', 'none', 'important');
    modal.classList.remove('modal-active');
  }
}

window.openEditOrderModal = openEditOrderModal;
window.closeEditOrderModal = closeEditOrderModal;

async function updateOrderStatus(id, status, user) {
  try {
    const res = await fetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, user })
    });
    if (!res.ok) console.error('Erreur mise à jour statut ordre');
  } catch (err) {
    console.error('Erreur mise à jour statut ordre:', err);
  }
}

async function toggleArchive(id, isArchived) {
  try {
    const res = await fetch(`/api/orders/${id}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: isArchived })
    });
    if (!res.ok) console.error('Erreur archivage ordre');
  } catch (err) {
    console.error('Erreur archivage ordre:', err);
  }
}

async function deleteOrder(id) {
  try {
    const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    if (!res.ok) console.error('Erreur suppression ordre');
  } catch (err) {
    console.error('Erreur suppression ordre:', err);
  }
}

function startOrdersBlink() {
  const btn = document.querySelector('.nav-tab-btn[data-tab="tab-orders"]');
  if (btn) btn.classList.add('tab-blink');
  const badge = document.getElementById('orders-badge');
  if (badge) badge.classList.add('badge-blink');
}

function clearOrdersBlink() {
  const btn = document.querySelector('.nav-tab-btn[data-tab="tab-orders"]');
  if (btn) btn.classList.remove('tab-blink');
  const badge = document.getElementById('orders-badge');
  if (badge) badge.classList.remove('badge-blink');

  // Mémorise le plus grand ID d'ordre vu
  if (ordersList && ordersList.length > 0) {
    const maxId = Math.max(...ordersList.map(o => Number(o.id) || 0));
    localStorage.setItem('hk_last_seen_order_id', String(maxId));
  }
}

function updateOrdersBadge() {
  const badge = document.getElementById('orders-badge');
  const pendingOrders = ordersList.filter(o => o.status === 'in_attesa');
  const pendingCount = pendingOrders.length;

  if (badge) {
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // Vérifier si des ordres en attente n'ont pas encore été consultés
  const activeTab = window.App ? window.App.getActiveTab() : '';
  if (activeTab !== 'tab-orders') {
    const lastSeenId = parseInt(localStorage.getItem('hk_last_seen_order_id') || '0', 10);
    const hasUnseen = pendingOrders.some(o => (Number(o.id) || 0) > lastSeenId);
    if (hasUnseen) {
      startOrdersBlink();
    }
  } else {
    clearOrdersBlink();
  }
}

// Événements Socket.io
function onOrderCreated(order) {
  ordersList.unshift(order);
  renderOrders();
  updateOrdersBadge();

  const activeTab = window.App ? window.App.getActiveTab() : '';
  if (activeTab !== 'tab-orders') {
    startOrdersBlink();
  }

  const currentUser = window.App ? window.App.getCurrentUser() : '';
  if (order.created_by && order.created_by.toLowerCase() !== currentUser.toLowerCase()) {
    if (order.priority === 'emergenza' || order.priority === 'urgente') {
      if (window.SoundEngine) window.SoundEngine.playUrgentAlert();
    } else {
      if (window.SoundEngine) window.SoundEngine.playMessageSound();
    }
  }
}

function onOrderUpdated(order) {
  const idx = ordersList.findIndex(o => o.id === order.id);
  if (idx !== -1) {
    ordersList[idx] = order;
  } else {
    const archIdx = archivedList.findIndex(o => o.id === order.id);
    if (archIdx !== -1) {
      archivedList[archIdx] = order;
    } else {
      ordersList.unshift(order);
    }
  }
  renderOrders();
  updateOrdersBadge();
}

function onOrderArchived(order) {
  ordersList = ordersList.filter(o => o.id !== order.id);
  const archIdx = archivedList.findIndex(o => o.id === order.id);
  if (order.is_archived === 1) {
    if (archIdx === -1) archivedList.unshift(order);
    else archivedList[archIdx] = order;
  } else {
    if (archIdx !== -1) archivedList.splice(archIdx, 1);
    ordersList.unshift(order);
  }
  renderOrders();
  updateOrdersBadge();
}

function onOrderDeleted(id) {
  ordersList = ordersList.filter(o => o.id !== parseInt(id));
  archivedList = archivedList.filter(o => o.id !== parseInt(id));
  renderOrders();
  updateOrdersBadge();
}

function openNewOrderModal() {
  const modalOrder = document.getElementById('modal-order');
  const formOrder = document.getElementById('form-order');
  if (formOrder) formOrder.reset();
  if (modalOrder) {
    modalOrder.style.setProperty('display', 'flex', 'important');
    modalOrder.classList.add('modal-active');
  }
  const roomInput = document.getElementById('order-room');
  if (roomInput) {
    setTimeout(() => roomInput.focus(), 100);
  }
}

function closeNewOrderModal() {
  const modalOrder = document.getElementById('modal-order');
  if (modalOrder) {
    modalOrder.style.setProperty('display', 'none', 'important');
    modalOrder.classList.remove('modal-active');
  }
}

window.openNewOrderModal = openNewOrderModal;
window.closeNewOrderModal = closeNewOrderModal;

async function submitNewOrder(e) {
  if (e && e.preventDefault) e.preventDefault();

  const roomEl = document.getElementById('order-room');
  const titleEl = document.getElementById('order-title');
  const prioEl = document.getElementById('order-priority');
  const descEl = document.getElementById('order-desc');
  const btnSubmit = document.getElementById('btn-submit-order');

  const room = roomEl ? roomEl.value.trim() : '';
  const title = titleEl ? titleEl.value.trim() : '';
  const priority = prioEl ? prioEl.value : 'normale';
  const desc = descEl ? descEl.value.trim() : '';
  const user = window.App ? window.App.getCurrentUser() : 'Roberto';

  if (!room) {
    if (roomEl) {
      roomEl.focus();
      roomEl.style.borderColor = '#dc2626';
      setTimeout(() => { roomEl.style.borderColor = ''; }, 2000);
    }
    return;
  }
  if (!title) {
    if (titleEl) {
      titleEl.focus();
      titleEl.style.borderColor = '#dc2626';
      setTimeout(() => { titleEl.style.borderColor = ''; }, 2000);
    }
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Envoi...';
  }

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_or_area: room,
        title,
        description: desc,
        priority,
        created_by: user
      })
    });

    if (res.ok) {
      closeNewOrderModal();
      if (window.SoundEngine) window.SoundEngine.playSentSound();
    } else {
      const errData = await res.json().catch(() => ({}));
      alert(errData.error || 'Erreur lors de la création de l\'ordre.');
    }
  } catch (err) {
    console.error('Erreur création ordre:', err);
    alert('Erreur réseau. Veuillez réessayer.');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '✅ Envoyer l\'Ordre';
    }
  }
}

async function submitEditOrder(e) {
  if (e && e.preventDefault) e.preventDefault();

  const idEl = document.getElementById('edit-order-id');
  const roomEl = document.getElementById('edit-order-room');
  const titleEl = document.getElementById('edit-order-title');
  const prioEl = document.getElementById('edit-order-priority');
  const descEl = document.getElementById('edit-order-desc');
  const btnSubmit = document.getElementById('btn-submit-edit-order');

  const id = idEl ? idEl.value : '';
  const room = roomEl ? roomEl.value.trim() : '';
  const title = titleEl ? titleEl.value.trim() : '';
  const priority = prioEl ? prioEl.value : 'normale';
  const desc = descEl ? descEl.value.trim() : '';

  if (!id || !room || !title) return;

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Enregistrement...';
  }

  try {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_or_area: room,
        title,
        description: desc,
        priority
      })
    });

    if (res.ok) {
      closeEditOrderModal();
      if (window.SoundEngine) window.SoundEngine.playSuccessSound();
    } else {
      const errData = await res.json().catch(() => ({}));
      alert(errData.error || 'Erreur lors de la modification de l\'ordre.');
    }
  } catch (err) {
    console.error('Erreur mise à jour ordre:', err);
    alert('Erreur réseau. Veuillez réessayer.');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '💾 Enregistrer';
    }
  }
}

window.submitNewOrder = submitNewOrder;
window.submitEditOrder = submitEditOrder;

function setupOrderEvents() {
  // Filtres
  document.querySelectorAll('#orders-filter-bar .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setFilter(btn.getAttribute('data-filter'));
    });
  });

  // Modal Nouvel Ordre
  const btnNewOrder = document.getElementById('btn-new-order');
  const modalOrder = document.getElementById('modal-order');
  const btnCloseModal = document.getElementById('btn-close-modal-order');
  const btnCancelOrder = document.getElementById('btn-cancel-order');
  const formOrder = document.getElementById('form-order');

  if (btnNewOrder) {
    btnNewOrder.addEventListener('click', (e) => {
      e.preventDefault();
      openNewOrderModal();
    });
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeNewOrderModal);
  if (btnCancelOrder) btnCancelOrder.addEventListener('click', closeNewOrderModal);
  if (modalOrder) {
    modalOrder.addEventListener('click', (e) => {
      if (e.target === modalOrder) closeNewOrderModal();
    });
  }

  // Suggestions de chambres pour Nouvel Ordre
  document.querySelectorAll('.room-suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const roomInput = document.getElementById('order-room');
      if (roomInput) roomInput.value = chip.getAttribute('data-room');
    });
  });

  // Form submit Nouvel Ordre
  if (formOrder) {
    formOrder.addEventListener('submit', submitNewOrder);
  }

  // Modal Modifier Ordre
  const modalEditOrder = document.getElementById('modal-edit-order');
  const btnCloseEditModal = document.getElementById('btn-close-modal-edit-order');
  const btnCancelEditOrder = document.getElementById('btn-cancel-edit-order');
  const formEditOrder = document.getElementById('form-edit-order');

  if (btnCloseEditModal) btnCloseEditModal.addEventListener('click', closeEditOrderModal);
  if (btnCancelEditOrder) btnCancelEditOrder.addEventListener('click', closeEditOrderModal);
  if (modalEditOrder) {
    modalEditOrder.addEventListener('click', (e) => {
      if (e.target === modalEditOrder) closeEditOrderModal();
    });
  }

  // Suggestions de chambres pour Modifier Ordre
  document.querySelectorAll('.room-suggestion-chip-edit').forEach(chip => {
    chip.addEventListener('click', () => {
      const roomInput = document.getElementById('edit-order-room');
      if (roomInput) roomInput.value = chip.getAttribute('data-room');
    });
  });

  // Form submit Modifier Ordre
  if (formEditOrder) {
    formEditOrder.addEventListener('submit', submitEditOrder);
  }
}

function refreshAll() {
  selectedDate = getTodayStr();
  loadDailyRooms(selectedDate);
  loadOrders();
}

  window.OrdersModule = {
    initOrders,
    loadOrders,
    loadDailyRooms,
    renderDailyBoard,
    renderDailyUpdateBanner,
    validateTodayPlanning,
    actualizeRoom,
    notifyTabletWithSong,
    onTabletAlertReceived,
    checkMissedTabletNotification,
    goToToday,
    onDailyPlanningValidated,
    refreshAll,
    renderOrders,
    setFilter,
    openModal: openNewOrderModal,
    closeModal: closeNewOrderModal,
    openNewOrderModal,
    closeNewOrderModal,
    onOrderCreated,
    onOrderUpdated,
    onOrderArchived,
    onOrderDeleted,
    onRoomStatusUpdated,
    updateOrdersBadge,
    startOrdersBlink,
    clearOrdersBlink,
    getSelectedDate: () => selectedDate,
    submitNewOrder,
    submitEditOrder
  };

  window.setOrdersFilter = setFilter;
  window.openNewOrderModal = openNewOrderModal;
  window.closeNewOrderModal = closeNewOrderModal;
  window.submitNewOrder = submitNewOrder;
  window.submitEditOrder = submitEditOrder;
  window.validateTodayPlanning = validateTodayPlanning;
  window.actualizeRoom = actualizeRoom;
  window.notifyTabletWithSong = notifyTabletWithSong;
  window.goToToday = goToToday;
})();