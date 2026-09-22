// orders.js - Module Ordres de Service & Planning Quotidien des Chambres
(function() {
  'use strict';

  let ordersList = [];
  let archivedList = [];
  let currentFilter = 'attivi';

  let selectedDate = getTodayStr();
  let dailyRooms = [];
  let saveNoteTimeouts = {};

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

function updateRoomCardDOM(card, room) {
  const roomNum = room.room_number;
  const status = room.status || 'libera';
  const access = room.access_status || 'en_chambre';
  const cleanliness = room.cleanliness_status || 'a_faire';
  const guests = room.guests_count || 2;
  const isSeparati = room.beds_type === 'separati';
  const notes = room.notes || '';
  const isRoom5 = roomNum === 5;
  const needsExtraBed = isRoom5 && guests === 3;

  card.className = `daily-room-card status-card-${status} clean-${cleanliness}`;

  // Top badges
  const topBadges = card.querySelector('.daily-room-top-badges');
  if (topBadges) {
    topBadges.innerHTML = `
      ${cleanliness === 'deja_propre' ? '<span class="status-pill pill-propre">✨ Déjà Propre</span>' : ''}
      ${cleanliness === 'a_faire' ? '<span class="status-pill pill-a-faire">⏳ À faire</span>' : ''}
      ${cleanliness === 'termine' ? '<span class="status-pill pill-termine">✅ Terminé</span>' : ''}
      ${access === 'client_sorti' ? '<span class="status-pill pill-accessible">🟢 Accès Libre</span>' : ''}
      <span class="bed-type-badge ${isSeparati ? 'separati' : 'matrimoniale'}">
        ${isSeparati ? '🛏️🛏️ Lits Séparés' : '🛏️ Grand Lit'}
      </span>
    `;
  }

  // Flags Mouvement du jour
  card.querySelectorAll('.flag-btn').forEach(btn => {
    const s = btn.getAttribute('data-status');
    btn.classList.toggle('active', s === status);
  });

  // Accès en temps réel
  card.querySelectorAll('[data-access]').forEach(btn => {
    const a = btn.getAttribute('data-access');
    const isActive = a === access;
    btn.classList.toggle('active', isActive);
    btn.classList.toggle(`access-${a}`, isActive);
  });

  // État de propreté / ménage
  card.querySelectorAll('[data-clean]').forEach(btn => {
    const c = btn.getAttribute('data-clean');
    const isActive = c === cleanliness;
    btn.classList.toggle('active', isActive);
    btn.classList.toggle(`clean-${c}`, isActive);
  });

  // Occupants
  card.querySelectorAll('[data-guests]').forEach(btn => {
    const g = parseInt(btn.getAttribute('data-guests'), 10);
    btn.classList.toggle('active', g === guests);
  });

  // Alerte Lit Supplémentaire
  let alertBox = card.querySelector('.extra-bed-alert');
  if (needsExtraBed) {
    if (!alertBox) {
      const rows = card.querySelectorAll('.room-detail-row');
      const guestsRow = card.querySelector('[data-guests]') ? card.querySelector('[data-guests]').closest('.room-detail-row') : null;
      alertBox = document.createElement('div');
      alertBox.className = 'extra-bed-alert';
      alertBox.innerHTML = `<span>⚠️ 🛏️ <strong>AJOUTER UN LIT D'APPOINT !</strong> (3 Personnes)</span>`;
      if (guestsRow && guestsRow.nextSibling) {
        card.insertBefore(alertBox, guestsRow.nextSibling);
      } else {
        card.appendChild(alertBox);
      }
    }
  } else {
    if (alertBox) alertBox.remove();
  }

  // Type de lit
  card.querySelectorAll('[data-bedstype]').forEach(btn => {
    const bt = btn.getAttribute('data-bedstype');
    const isActive = (bt === 'separati' && isSeparati) || (bt === 'matrimoniale' && !isSeparati);
    btn.classList.toggle('active', isActive);
  });

  // Notes
  const noteInput = card.querySelector('.room-notes-input');
  if (noteInput && document.activeElement !== noteInput) {
    if (noteInput.value !== notes) {
      noteInput.value = notes;
    }
  }

  // Bouton Contrôle / Message envoyé à Roberto
  const readyBtn = card.querySelector('.btn-room-ready');
  if (readyBtn) {
    const isControlRequested = room.control_requested === 1;
    readyBtn.classList.toggle('btn-sent', isControlRequested);
    readyBtn.classList.remove('btn-holding');
    readyBtn.innerHTML = `<span>${isControlRequested ? '✅ Message envoyé à Roberto !' : `🔍 Chambre ${roomNum} prête pour le contrôle`}</span>`;
    readyBtn.title = isControlRequested ? 'Maintenir appuyé 2s pour annuler' : `Notifier Roberto que la Chambre ${roomNum} est prête pour le contrôle`;
  }
}

function createDailyRoomCardHtml(room) {
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

  const cardStatusClass = `status-card-${status} clean-${cleanliness}`;

  return `
    <div class="daily-room-card ${cardStatusClass}" id="daily-room-card-${roomNum}" data-room="${roomNum}">
      <div class="daily-room-top">
        <div class="daily-room-number-badge">
          <span>🚪 Chambre ${roomNum}</span>
        </div>
        <div class="daily-room-top-badges">
          ${cleanliness === 'deja_propre' ? '<span class="status-pill pill-propre">✨ Déjà Propre</span>' : ''}
          ${cleanliness === 'a_faire' ? '<span class="status-pill pill-a-faire">⏳ À faire</span>' : ''}
          ${cleanliness === 'termine' ? '<span class="status-pill pill-termine">✅ Terminé</span>' : ''}
          ${access === 'client_sorti' ? '<span class="status-pill pill-accessible">🟢 Accès Libre</span>' : ''}
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
    </div>
  `;
}

function attachDailyRoomListeners() {
  const grid = document.getElementById('daily-rooms-grid');
  if (!grid) return;

  const currentUser = window.App ? window.App.getCurrentUser() : 'Roberto';

  // Boutons Statut (Libre / Départ / Recouche)
  grid.querySelectorAll('.flag-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.daily-room-card');
      const roomNum = parseInt(card.getAttribute('data-room'), 10);
      const newStatus = btn.getAttribute('data-status');
      const room = dailyRooms.find(r => r.room_number === roomNum);
      if (room) {
        room.status = newStatus;
        updateRoomCardDOM(card, room);
      }
      await saveRoomUpdate(roomNum, { status: newStatus, updated_by: currentUser });
    });
  });

  // Boutons Accès (En chambre / Client sorti)
  grid.querySelectorAll('[data-access]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.daily-room-card');
      const roomNum = parseInt(card.getAttribute('data-room'), 10);
      const newAccess = btn.getAttribute('data-access');
      const room = dailyRooms.find(r => r.room_number === roomNum);
      if (room) {
        room.access_status = newAccess;
        updateRoomCardDOM(card, room);
      }
      await saveRoomUpdate(roomNum, { access_status: newAccess, updated_by: currentUser });
    });
  });

  // Boutons État (À faire / Déjà propre / Terminé)
  grid.querySelectorAll('[data-clean]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.daily-room-card');
      const roomNum = parseInt(card.getAttribute('data-room'), 10);
      const newClean = btn.getAttribute('data-clean');
      const room = dailyRooms.find(r => r.room_number === roomNum);
      if (room) {
        room.cleanliness_status = newClean;
        updateRoomCardDOM(card, room);
      }
      await saveRoomUpdate(roomNum, { cleanliness_status: newClean, updated_by: currentUser });
    });
  });

  // Boutons Occupants
  grid.querySelectorAll('[data-guests]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.daily-room-card');
      const roomNum = parseInt(card.getAttribute('data-room'), 10);
      const guests = parseInt(btn.getAttribute('data-guests'), 10);
      await saveRoomUpdate(roomNum, { guests_count: guests, updated_by: currentUser });
    });
  });

  // Boutons Type de Lit
  grid.querySelectorAll('[data-bedstype]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.daily-room-card');
      const roomNum = parseInt(card.getAttribute('data-room'), 10);
      const bedsType = btn.getAttribute('data-bedstype');
      await saveRoomUpdate(roomNum, { beds_type: bedsType, updated_by: currentUser });
    });
  });

  // Saisie des notes sans perturbation de curseur
  grid.querySelectorAll('.room-notes-input').forEach(input => {
    input.addEventListener('input', () => {
      const roomNum = parseInt(input.getAttribute('data-room'), 10);
      const text = input.value;

      if (saveNoteTimeouts[roomNum]) clearTimeout(saveNoteTimeouts[roomNum]);
      saveNoteTimeouts[roomNum] = setTimeout(async () => {
        await saveRoomUpdate(roomNum, { notes: text, updated_by: currentUser });
      }, 700);
    });

    input.addEventListener('blur', async () => {
      const roomNum = parseInt(input.getAttribute('data-room'), 10);
      const text = input.value;
      if (saveNoteTimeouts[roomNum]) clearTimeout(saveNoteTimeouts[roomNum]);
      await saveRoomUpdate(roomNum, { notes: text, updated_by: currentUser });
    });
  });

  // Bouton "Chambre N prête pour le contrôle" (avec maintien 2s pour annuler)
  grid.querySelectorAll('.btn-room-ready').forEach(btn => {
    let holdTimer = null;
    let isLongPressTriggered = false;
    const roomNum = parseInt(btn.getAttribute('data-room'), 10);

    const startHold = (e) => {
      const currentRoom = dailyRooms.find(r => r.room_number === roomNum);
      const isSent = currentRoom && currentRoom.control_requested === 1;

      // La pression longue de 2s n'est active que si le statut est déjà envoyé
      if (!isSent) return;

      isLongPressTriggered = false;
      btn.classList.add('btn-holding');
      btn.innerHTML = `<span>⏳ Maintenir 2s pour annuler...</span>`;

      holdTimer = setTimeout(async () => {
        isLongPressTriggered = true;
        btn.classList.remove('btn-holding');

        if (navigator.vibrate) {
          try { navigator.vibrate([50, 50, 50]); } catch (err) {}
        }

        const user = window.App ? window.App.getCurrentUser() : 'Adélcia';

        // 1. Remet l'état dans la base de données à 0 (non envoyé)
        await saveRoomUpdate(roomNum, { control_requested: 0, updated_by: user });

        // 2. Si l'utilisateur n'est pas Roberto, envoie le message d'annulation dans la discussion
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
      btn.classList.remove('btn-holding');

      const currentRoom = dailyRooms.find(r => r.room_number === roomNum);
      const isSent = currentRoom && currentRoom.control_requested === 1;
      if (isSent && !isLongPressTriggered) {
        btn.innerHTML = `<span>✅ Message envoyé à Roberto !</span>`;
      }
    };

    // Empêcher le menu contextuel lors du maintien prolongé
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    btn.addEventListener('mousedown', startHold);
    btn.addEventListener('mouseup', cancelHold);
    btn.addEventListener('mouseleave', cancelHold);

    btn.addEventListener('touchstart', startHold, { passive: true });
    btn.addEventListener('touchend', cancelHold);
    btn.addEventListener('touchcancel', cancelHold);

    // Clic normal
    btn.addEventListener('click', async (e) => {
      if (isLongPressTriggered) {
        isLongPressTriggered = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const currentRoom = dailyRooms.find(r => r.room_number === roomNum);
      const isSent = currentRoom && currentRoom.control_requested === 1;
      const user = window.App ? window.App.getCurrentUser() : 'Roberto';

      // Si pas encore envoyé, un simple clic envoie la notification
      if (!isSent) {
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
          btn.classList.add('btn-sent');
          btn.innerHTML = `<span>✅ Message envoyé à Roberto !</span>`;
          await saveRoomUpdate(roomNum, { control_requested: 1, updated_by: user });
        } else {
          await saveRoomUpdate(roomNum, { control_requested: 1, updated_by: user });
        }
      } else {
        // Si déjà envoyé et clic rapide < 2s, afficher le rappel
        btn.innerHTML = `<span>⏳ Maintenir 2s pour annuler</span>`;
        setTimeout(() => {
          const checkRoom = dailyRooms.find(r => r.room_number === roomNum);
          if (checkRoom && checkRoom.control_requested === 1 && !btn.classList.contains('btn-holding')) {
            btn.innerHTML = `<span>✅ Message envoyé à Roberto !</span>`;
          }
        }, 1500);
      }
    });
  });
}

async function saveRoomUpdate(roomNum, changes) {
  try {
    const res = await fetch(`/api/daily-rooms/${selectedDate}/${roomNum}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes)
    });

    if (res.ok) {
      const updated = await res.json();
      onRoomStatusUpdated({ date: selectedDate, room: updated });
    }
  } catch (err) {
    console.error('Erreur enregistrement statut chambre:', err);
  }
}

function onRoomStatusUpdated({ date, room }) {
  if (date !== selectedDate) return;
  const idx = dailyRooms.findIndex(r => r.room_number === room.room_number);
  if (idx !== -1) {
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
})();