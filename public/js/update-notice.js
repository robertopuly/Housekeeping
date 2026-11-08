// update-notice.js - Notification pop-up de mise à jour pour Adélcia (Mardi 10 Novembre 2026)
(function() {
  'use strict';

  // Date cible : Mardi 10 Novembre 2026 à partir de 00:00:00 (Fuseau Europe/Zurich)
  const TARGET_TIMESTAMP_MS = Date.parse('2026-11-10T00:00:00+01:00');
  const STORAGE_KEY = 'hk_notice_nov10_2026_seen';

  function isTabletOrAdelcia() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('preview_notice') || urlParams.has('test_notice')) {
      return true;
    }

    const platform = window.App && typeof window.App.getPlatform === 'function' ? window.App.getPlatform() : '';
    const user = window.App && typeof window.App.getCurrentUser === 'function' ? window.App.getCurrentUser() : '';
    const isAdelcia = /adelcia|adélcia/i.test(user);

    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet/i.test(ua);

    return platform === 'Tablet' || isMobileUA || isAdelcia;
  }

  function hasAlreadySeen() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function markAsSeen() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (e) {}
  }

  function shouldDisplayNow() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('preview_notice') || urlParams.has('test_notice')) {
      return true;
    }

    // Pas avant mardi 10 novembre 2026
    const now = Date.now();
    if (now < TARGET_TIMESTAMP_MS) {
      return false;
    }

    // Réservé à Adélcia ou son tablet
    if (!isTabletOrAdelcia()) {
      return false;
    }

    // Visible une seule fois
    if (hasAlreadySeen()) {
      return false;
    }

    return true;
  }

  function showModal() {
    const modal = document.getElementById('modal-update-notice-nov2026');
    if (!modal) return;
    modal.style.display = 'flex';
  }

  function closeModal() {
    const modal = document.getElementById('modal-update-notice-nov2026');
    if (modal) {
      modal.style.display = 'none';
    }
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('preview_notice')) {
      markAsSeen();
    }
  }

  function initNotice() {
    if (shouldDisplayNow()) {
      // Léger délai d'apparition pour une transition douce à l'ouverture de l'application
      setTimeout(showModal, 700);
    }
  }

  // Écoute de l'événement de démarrage de l'app
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initNotice, 500);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(initNotice, 500));
  }

  window.UpdateNotice = {
    show: showModal,
    close: closeModal,
    reset: function() {
      localStorage.removeItem(STORAGE_KEY);
    }
  };
})();
