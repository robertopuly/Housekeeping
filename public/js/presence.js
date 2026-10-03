// presence.js - Suivi en temps réel de la consultation des pages par Adélcia (v69)
(function () {
  let presenceData = {
    rooms: { is_viewing: false, last_viewed_at: null },
    deadlines: { is_viewing: false, last_viewed_at: null },
    orders: { is_viewing: false, last_viewed_at: null }
  };

  let heartbeatInterval = null;
  let currentTrackedPage = null;

  function getCurrentUser() {
    return (window.App && typeof window.App.getCurrentUser === 'function')
      ? window.App.getCurrentUser()
      : (localStorage.getItem('hk_user') || 'Roberto');
  }

  function isAdelcia() {
    const u = getCurrentUser().toLowerCase();
    return u === 'adelcia' || u === 'adélcia';
  }

  function mapTabToPage(tabId) {
    if (tabId === 'tab-rooms') return 'rooms';
    if (tabId === 'tab-deadlines') return 'deadlines';
    if (tabId === 'tab-orders') return 'orders';
    return null;
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
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
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

  function formatPresenceTime(rawDate) {
    if (!rawDate) return null;
    const dateObj = parseDateSafe(rawDate);
    if (!dateObj || isNaN(dateObj.getTime())) return null;

    const dateIso = getZurichDateStr(dateObj);
    const todayIso = getZurichDateStr(new Date());

    const [tY, tM, tD] = todayIso.split('-').map(Number);
    const dYesterday = new Date(tY, tM - 1, tD, 12, 0, 0);
    dYesterday.setDate(dYesterday.getDate() - 1);
    const yesterdayIso = getZurichDateStr(dYesterday);

    const timeStr = dateObj.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Zurich'
    });

    if (dateIso === todayIso) {
      return { type: 'today', text: `à ${timeStr}`, rawDate: dateObj };
    } else if (dateIso === yesterdayIso) {
      return { type: 'yesterday', text: `hier à ${timeStr}`, rawDate: dateObj };
    } else {
      const fullDate = dateObj.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Zurich'
      });
      return { type: 'older', text: `le ${fullDate} à ${timeStr}`, rawDate: dateObj };
    }
  }

  // ----------------------------------------------------
  // GESTION CÔTÉ ADÉLCIA (ENVOI D'ACTIVITÉ & HEARTBEAT)
  // ----------------------------------------------------
  function sendEnterPage(page) {
    if (!isAdelcia() || !page) return;
    currentTrackedPage = page;
    const socket = window.SocketClient ? window.SocketClient.getSocket() : null;
    if (socket && socket.connected) {
      socket.emit('page_view:enter', { user: 'Adélcia', page });
    }
    startHeartbeat(page);
  }

  function sendLeavePage(page = currentTrackedPage) {
    stopHeartbeat();
    if (!isAdelcia() || !page) return;
    const socket = window.SocketClient ? window.SocketClient.getSocket() : null;
    if (socket && socket.connected) {
      socket.emit('page_view:leave', { user: 'Adélcia', page });
    }
    currentTrackedPage = null;
  }

  function startHeartbeat(page) {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      if (!isAdelcia() || document.hidden || currentTrackedPage !== page) return;
      const socket = window.SocketClient ? window.SocketClient.getSocket() : null;
      if (socket && socket.connected) {
        socket.emit('page_view:heartbeat', { user: 'Adélcia', page });
      }
    }, 15000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  // ----------------------------------------------------
  // GESTION CÔTÉ ROBERTO (AFFICHAGE DES BANDEAUX)
  // ----------------------------------------------------
  async function loadPresenceStatus() {
    try {
      const res = await fetch('/api/page-views?user=Adelcia');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          presenceData = { ...presenceData, ...data };
          renderAllPresenceBanners();
        }
      }
    } catch (err) {
      console.warn('Erreur chargement présence Adélcia:', err);
    }
  }

  function onPageViewStatus(data) {
    if (!data || !data.page) return;
    const user = data.user || '';
    if (user.toLowerCase() !== 'adelcia' && user.toLowerCase() !== 'adélcia') return;

    presenceData[data.page] = {
      user: 'Adélcia',
      page: data.page,
      is_viewing: !!data.is_viewing,
      last_viewed_at: data.last_viewed_at
    };

    renderPresenceBanner(data.page);
  }

  function renderPresenceBanner(page) {
    const bannerEl = document.getElementById(`adelcia-presence-${page}`);
    if (!bannerEl) return;

    // Si l'utilisateur connecté est Adélcia, masquer pour ne pas encombrer sa vue
    if (isAdelcia()) {
      bannerEl.style.display = 'none';
      return;
    }

    const info = presenceData[page];
    if (!info) {
      bannerEl.style.display = 'none';
      return;
    }

    bannerEl.style.display = 'block';

    if (info.is_viewing) {
      bannerEl.className = 'adelcia-presence-banner is-active';
      bannerEl.innerHTML = `
        <div class="presence-content">
          <span class="presence-pulse-dot" title="En direct"></span>
          <span class="presence-text">
            🟢 <strong>Adélcia consulte actuellement cette page</strong>
          </span>
          <span class="presence-badge-live">EN DIRECT</span>
        </div>
      `;
    } else if (info.last_viewed_at) {
      const timeInfo = formatPresenceTime(info.last_viewed_at);
      bannerEl.className = 'adelcia-presence-banner is-inactive';
      if (timeInfo) {
        bannerEl.innerHTML = `
          <div class="presence-content">
            <span class="presence-icon">👁️</span>
            <span class="presence-text">
              Adélcia a consulté cette page <strong>${timeInfo.text}</strong>
            </span>
          </div>
        `;
      } else {
        bannerEl.innerHTML = `
          <div class="presence-content">
            <span class="presence-icon">👁️</span>
            <span class="presence-text">
              Adélcia a consulté cette page
            </span>
          </div>
        `;
      }
    } else {
      bannerEl.className = 'adelcia-presence-banner is-none';
      bannerEl.innerHTML = `
        <div class="presence-content">
          <span class="presence-icon">ℹ️</span>
          <span class="presence-text">
            <em>Adélcia n'a pas encore consulté cette page aujourd'hui</em>
          </span>
        </div>
      `;
    }
  }

  function renderAllPresenceBanners() {
    ['rooms', 'deadlines', 'orders'].forEach(renderPresenceBanner);
  }

  function handleTabChange(newTabId) {
    const page = mapTabToPage(newTabId);

    if (isAdelcia()) {
      if (currentTrackedPage && currentTrackedPage !== page) {
        sendLeavePage(currentTrackedPage);
      }
      if (page && document.visibilityState === 'visible') {
        sendEnterPage(page);
      }
    } else {
      if (page) {
        renderPresenceBanner(page);
      }
    }
  }

  function onSocketConnected() {
    if (isAdelcia()) {
      const activeTabEl = document.querySelector('.tab-panel.active');
      const page = activeTabEl ? mapTabToPage(activeTabEl.id) : null;
      if (page && document.visibilityState === 'visible') {
        sendEnterPage(page);
      }
    } else {
      loadPresenceStatus();
    }
  }

  function initPresence() {
    loadPresenceStatus();

    // Rendu périodique toutes les 30s pour actualiser les horodatages relatifs
    setInterval(() => {
      if (!isAdelcia()) {
        renderAllPresenceBanners();
      }
    }, 30000);

    // Événements de visibilité d'onglet
    document.addEventListener('visibilitychange', () => {
      if (isAdelcia()) {
        if (document.hidden) {
          if (currentTrackedPage) {
            sendLeavePage(currentTrackedPage);
          }
        } else {
          const activeTabEl = document.querySelector('.tab-panel.active');
          const page = activeTabEl ? mapTabToPage(activeTabEl.id) : null;
          if (page) {
            sendEnterPage(page);
          }
        }
      } else {
        if (!document.hidden) {
          loadPresenceStatus();
        }
      }
    });

    window.addEventListener('beforeunload', () => {
      if (isAdelcia() && currentTrackedPage) {
        sendLeavePage(currentTrackedPage);
      }
    });

    // Détection initiale après chargement DOM
    setTimeout(() => {
      const activeTabEl = document.querySelector('.tab-panel.active');
      const page = activeTabEl ? mapTabToPage(activeTabEl.id) : null;
      if (page) {
        handleTabChange(activeTabEl.id);
      }
    }, 400);
  }

  window.PresenceModule = {
    initPresence,
    handleTabChange,
    onPageViewStatus,
    onSocketConnected,
    loadPresenceStatus,
    renderPresenceBanner,
    renderAllPresenceBanners
  };
})();
