// halloween-popup.js - Animation Pop-up Vidéo Halloween 2026 pour tablettes
(function() {
  'use strict';

  // Date et heure cible : 31 octobre 2026 à 10:30:00 (Fuseau Europe/Zurich)
  // Date.parse('2026-10-31T10:30:00+01:00') = 1793439000000
  const TARGET_TIMESTAMP_MS = 1793439000000;
  const STORAGE_KEY = 'hk_halloween_2026_animated_v1';
  const VIDEO_URL = '/img/Halloween%202026.mp4';

  let hasTriggered = false;
  let checkInterval = null;

  function isTabletDevice() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('test_halloween') || urlParams.has('preview_halloween')) {
      return true;
    }

    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet/i.test(ua);
    const platform = window.App && typeof window.App.getPlatform === 'function' ? window.App.getPlatform() : '';
    const user = window.App && typeof window.App.getCurrentUser === 'function' ? window.App.getCurrentUser() : '';
    const isAdelcia = user.toLowerCase() === 'adelcia' || user.toLowerCase() === 'adélcia';

    return platform === 'Tablet' || isMobileUA || isAdelcia;
  }

  function hasAlreadyPlayed() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function markAsPlayed() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (e) {}
  }

  // Préchargement immédiat de la vidéo dès l'activation du tablet
  function preloadVideo() {
    try {
      const vid = document.getElementById('halloween-popup-video');
      if (vid) {
        vid.preload = 'auto';
        if (!vid.src) {
          vid.src = VIDEO_URL;
        }
        vid.load();
      }

      // Préchargement supplémentaire via fetch dans le cache du navigateur
      if (window.fetch) {
        fetch(VIDEO_URL, { method: 'GET' })
          .then(res => {
            if (res.ok) console.log('🎃 Vidéo Halloween 2026 préchargée avec succès dans le cache.');
          })
          .catch(() => {});
      }
    } catch (err) {
      console.warn('Erreur préchargement vidéo Halloween:', err);
    }
  }

  function shouldTriggerNow() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('test_halloween')) return true;

    if (!isTabletDevice()) return false;
    if (hasAlreadyPlayed()) return false;

    const now = Date.now();
    // Doit se déclencher à partir de 10:30 le 31 octobre (fuseau Europe/Zurich)
    // Fenêtre active jusqu'au 1er novembre 23:59:59
    const expiryTimestamp = TARGET_TIMESTAMP_MS + (37.5 * 3600 * 1000);

    return (now >= TARGET_TIMESTAMP_MS && now <= expiryTimestamp);
  }

  function checkAndTrigger() {
    if (hasTriggered) return;
    if (shouldTriggerNow()) {
      hasTriggered = true;
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      showPopup();
    }
  }

  function showPopup(force = false) {
    if (!force && hasAlreadyPlayed()) {
      const urlParams = new URLSearchParams(window.location.search);
      if (!urlParams.has('test_halloween')) return;
    }

    const modal = document.getElementById('modal-halloween-2026');
    const video = document.getElementById('halloween-popup-video');
    if (!modal || !video) return;

    markAsPlayed();

    // S'assure que la source est définie
    if (!video.src || video.src.indexOf('Halloween') === -1) {
      video.src = VIDEO_URL;
    }

    modal.style.setProperty('display', 'flex', 'important');
    modal.classList.add('halloween-active');

    video.currentTime = 0;

    // Tentative de lecture immédiate (avec audio si déjà déverrouillé par l'interaction utilisateur)
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Autoplay audio bloqué par le navigateur, bascule avec son réactivable:', err);
        // Si l'autoplay avec son est refusé par la politique de sécurité Android, lecture muette + bouton son
        video.muted = true;
        video.play().catch(() => {});
        const unmuteBtn = document.getElementById('btn-halloween-unmute');
        if (unmuteBtn) unmuteBtn.style.display = 'inline-flex';
      });
    }

    // Lorsque la vidéo se termine
    video.onended = () => {
      const finishBanner = document.getElementById('halloween-video-ended-banner');
      if (finishBanner) finishBanner.style.display = 'block';
    };
  }

  function closePopup() {
    const modal = document.getElementById('modal-halloween-2026');
    const video = document.getElementById('halloween-popup-video');
    if (video) {
      try {
        video.pause();
        video.currentTime = 0;
      } catch (e) {}
    }
    if (modal) {
      modal.style.setProperty('display', 'none', 'important');
      modal.classList.remove('halloween-active');
    }
  }

  function unmuteVideo() {
    const video = document.getElementById('halloween-popup-video');
    const unmuteBtn = document.getElementById('btn-halloween-unmute');
    if (video) {
      video.muted = false;
      video.play().catch(() => {});
    }
    if (unmuteBtn) {
      unmuteBtn.style.display = 'none';
    }
  }

  function initHalloweenPopup() {
    preloadVideo();

    // Vérification immédiate au chargement
    checkAndTrigger();

    // Vérification fréquente (toutes les 5 secondes pour réagir immédiatement à 10:30)
    checkInterval = setInterval(checkAndTrigger, 5000);

    // Vérification lors du réveil du tablet (déverrouillage écran ou retour sur l'onglet)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        preloadVideo();
        checkAndTrigger();
      }
    });

    window.addEventListener('focus', () => {
      checkAndTrigger();
    });

    // Écoute touche Échap sur clavier
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePopup();
      }
    });
  }

  // Exposition globale
  window.HalloweenPopup = {
    init: initHalloweenPopup,
    show: showPopup,
    close: closePopup,
    unmute: unmuteVideo,
    preload: preloadVideo,
    test: () => showPopup(true),
    resetPlayedFlag: () => {
      localStorage.removeItem(STORAGE_KEY);
      hasTriggered = false;
      console.log('Flag Halloween 2026 réinitialisé');
    }
  };

  document.addEventListener('DOMContentLoaded', initHalloweenPopup);
})();
