// app.js - Main Application Controller
let currentUser = 'Roberto';
let activeTab = 'tab-chat';

function initVisualViewportHandler() {
  if (!window.visualViewport) return;

  function updateViewport() {
    var vv = window.visualViewport;
    var windowH = window.innerHeight;
    var keyboardHeight = Math.max(0, windowH - vv.height);
    var isKeyboardOpen = keyboardHeight > 60;

    if (isKeyboardOpen) {
      document.documentElement.style.setProperty('--keyboard-offset', keyboardHeight + 'px');
      document.documentElement.style.setProperty('--app-height', vv.height + 'px');
      document.body.classList.add('keyboard-open');
    } else {
      document.documentElement.style.setProperty('--keyboard-offset', '0px');
      document.documentElement.style.removeProperty('--app-height');
      document.body.classList.remove('keyboard-open');
    }

    if (window.App && typeof window.App.getActiveTab === 'function' && window.App.getActiveTab() === 'tab-chat') {
      if (window.ChatModule && typeof window.ChatModule.scrollToBottom === 'function') {
        window.ChatModule.scrollToBottom(false);
      }
    }
  }

  window.visualViewport.addEventListener('resize', updateViewport);
  window.visualViewport.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);
  window.addEventListener('orientationchange', function() {
    setTimeout(updateViewport, 250);
  });

  updateViewport();
}

function initApp() {
  initVisualViewportHandler();
  initUser();
  initNavigation();
  initSoundButton();
  initWakeLock();
  registerServiceWorker();

  if (window.SocketClient) window.SocketClient.initSocket();
  if (window.ChatModule) window.ChatModule.initChat();
  if (window.OrdersModule) window.OrdersModule.initOrders();
  if (window.DeadlinesModule) window.DeadlinesModule.initDeadlines();
  if (window.ShoppingModule) window.ShoppingModule.initShopping();
  if (window.ExpensesModule) window.ExpensesModule.initExpenses();
  if (window.LeaveModule) window.LeaveModule.initLeave();
  if (window.PresenceModule) window.PresenceModule.initPresence();
  if (window.GalleryModule) window.GalleryModule.initGallery();
  loadUserAvatars();
  initProfilePhotoEvents();

  const hash = window.location.hash.replace('#', '');
  if (hash === 'orders') switchTab('tab-orders');
  else if (hash === 'rooms') switchTab('tab-rooms');
  else if (hash === 'deadlines') switchTab('tab-deadlines');
  else if (hash === 'shopping') switchTab('tab-shopping');
  else if (hash === 'leave' || hash === 'conges' || hash === 'vacances') switchTab('tab-leave');
  else if (hash === 'gallery' || hash === 'photos') switchTab('tab-gallery');
  else if (hash === 'expenses' && getPlatform() === 'PC') switchTab('tab-expenses');
  else switchTab('tab-chat');
}

function normalizeUsername(name) {
  if (!name) return 'Roberto';
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === 'adelcia' || trimmed.toLowerCase() === 'adélcia') {
    return 'Adélcia';
  }
  if (trimmed.toLowerCase() === 'roberto') {
    return 'Roberto';
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function initUser() {
  const urlParams = new URLSearchParams(window.location.search);
  const userParam = urlParams.get('user');

  if (userParam) {
    currentUser = normalizeUsername(userParam);
    localStorage.setItem('hk_user', currentUser);
  } else {
    const stored = localStorage.getItem('hk_user');
    if (stored) {
      currentUser = normalizeUsername(stored);
    } else {
      const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      currentUser = isMobileOrTablet ? 'Adélcia' : 'Roberto';
      localStorage.setItem('hk_user', currentUser);
    }
  }

  if (getPlatform() === 'PC') {
    document.body.classList.add('is-pc');
  } else {
    document.body.classList.remove('is-pc');
  }

  updateUserUI();
  initUserChipClick();
}

function initUserChipClick() {
  const chip = document.querySelector('.user-chip-badge');
  if (!chip) return;
  chip.style.cursor = 'pointer';
  chip.title = "Cliquer pour modifier votre photo de profil";
  chip.addEventListener('click', () => {
    openProfilePhotoModal();
  });
}

let userAvatars = {};

async function loadUserAvatars() {
  try {
    const stored = localStorage.getItem('hk_user_avatars');
    if (stored) {
      userAvatars = JSON.parse(stored);
      updateUserUI();
    }
  } catch (e) {}

  try {
    const res = await fetch('/api/user/avatars');
    if (res.ok) {
      const data = await res.json();
      userAvatars = Object.assign({}, userAvatars, data);
      localStorage.setItem('hk_user_avatars', JSON.stringify(userAvatars));
      updateUserUI();
      if (window.ChatModule && typeof window.ChatModule.renderMessages === 'function') {
        window.ChatModule.renderMessages();
      }
    }
  } catch (err) {
    console.warn('Erreur chargement avatars:', err);
  }
}

function getUserAvatarUrl(username) {
  if (!username) return '';
  const norm = (username.toLowerCase() === 'adelcia' || username.toLowerCase() === 'adélcia') ? 'Adélcia' : 'Roberto';
  return userAvatars[norm] || userAvatars[norm.toLowerCase()] || '';
}

function updateUserUI() {
  const nameEl = document.getElementById('current-user-name');
  const initialEl = document.getElementById('current-user-avatar-initial');
  const imgEl = document.getElementById('current-user-avatar-img');
  const avatarContainer = document.getElementById('current-user-avatar');

  if (nameEl) nameEl.textContent = currentUser;

  const avatarUrl = getUserAvatarUrl(currentUser);
  if (avatarUrl) {
    if (imgEl) {
      imgEl.src = avatarUrl;
      imgEl.style.display = 'block';
    }
    if (initialEl) initialEl.style.display = 'none';
  } else {
    if (imgEl) {
      imgEl.src = '';
      imgEl.style.display = 'none';
    }
    if (initialEl) {
      initialEl.textContent = currentUser.charAt(0).toUpperCase();
      initialEl.style.display = 'inline';
    } else if (avatarContainer) {
      avatarContainer.textContent = currentUser.charAt(0).toUpperCase();
    }
  }
}

function openProfilePhotoModal() {
  const modal = document.getElementById('modal-profile-photo');
  const titleEl = document.getElementById('modal-profile-title');
  const previewImg = document.getElementById('profile-preview-img');
  const previewInitial = document.getElementById('profile-preview-initial');
  const btnReset = document.getElementById('btn-reset-profile-photo');

  if (titleEl) titleEl.textContent = `👤 Photo de Profil - ${currentUser}`;

  const currentUrl = getUserAvatarUrl(currentUser);
  if (currentUrl) {
    if (previewImg) {
      previewImg.src = currentUrl;
      previewImg.style.display = 'block';
    }
    if (previewInitial) previewInitial.style.display = 'none';
    if (btnReset) btnReset.style.display = 'flex';
  } else {
    if (previewImg) {
      previewImg.src = '';
      previewImg.style.display = 'none';
    }
    if (previewInitial) {
      previewInitial.textContent = currentUser.charAt(0).toUpperCase();
      previewInitial.style.display = 'inline';
    }
    if (btnReset) btnReset.style.display = 'none';
  }

  if (modal) {
    modal.style.setProperty('display', 'flex', 'important');
    modal.classList.add('modal-active');
  }
}

function closeProfilePhotoModal() {
  const modal = document.getElementById('modal-profile-photo');
  if (modal) {
    modal.style.setProperty('display', 'none', 'important');
    modal.classList.remove('modal-active');
  }
}

function initProfilePhotoEvents() {
  const fileInput = document.getElementById('profile-photo-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleProfilePhotoSelected(file);
      }
      fileInput.value = '';
    });
  }
}

function handleProfilePhotoSelected(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('Veuillez sélectionner un fichier image valide.');
    return;
  }

  const btnChoose = document.getElementById('btn-choose-profile-photo');
  if (btnChoose) {
    btnChoose.disabled = true;
    btnChoose.textContent = '⏳ Enregistrement...';
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    const rawData = evt.target.result;
    compressSquareImage(rawData, 600, 0.88, async function(compressedBase64) {
      await uploadUserProfileAvatar(compressedBase64);
      if (btnChoose) {
        btnChoose.disabled = false;
        btnChoose.innerHTML = '<span class="btn-icon">📷</span><span>Prendre une photo / Choisir une image</span>';
      }
    });
  };
  reader.onerror = function() {
    alert('Erreur lors de la lecture du fichier image.');
    if (btnChoose) {
      btnChoose.disabled = false;
      btnChoose.innerHTML = '<span class="btn-icon">📷</span><span>Prendre une photo / Choisir une image</span>';
    }
  };
  reader.readAsDataURL(file);
}

function compressSquareImage(base64Src, targetSize, quality, callback) {
  const img = new Image();
  img.onload = function() {
    const size = Math.min(img.width, img.height);
    const startX = (img.width - size) / 2;
    const startY = (img.height - size) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, startX, startY, size, size, 0, 0, targetSize, targetSize);

    const compressed = canvas.toDataURL('image/jpeg', quality);
    callback(compressed);
  };
  img.onerror = function() {
    callback(base64Src);
  };
  img.src = base64Src;
}

async function uploadUserProfileAvatar(base64Data) {
  try {
    const res = await fetch('/api/user/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser,
        image: base64Data
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erreur enregistrement photo de profil');
    }

    const data = await res.json();
    onAvatarUpdated(data);
    closeProfilePhotoModal();

    if (window.SoundEngine && typeof window.SoundEngine.playSentSound === 'function') {
      window.SoundEngine.playSentSound();
    }

    showAppToast('✅ Photo de profil mise à jour !');
  } catch (err) {
    console.error('Erreur enregistrement avatar:', err);
    alert('Impossible d\'enregistrer la photo: ' + err.message);
  }
}

async function resetProfilePhoto() {
  if (!confirm('Voulez-vous réinitialiser votre avatar et réutiliser l\'initiale par défaut ?')) {
    return;
  }

  try {
    const res = await fetch('/api/user/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser,
        image: ''
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erreur réinitialisation');
    }

    const data = await res.json();
    onAvatarUpdated(data);
    closeProfilePhotoModal();
    showAppToast('🔄 Initiale par défaut rétablie.');
  } catch (err) {
    console.error('Erreur réinitialisation avatar:', err);
    alert('Erreur: ' + err.message);
  }
}

function onAvatarUpdated(data) {
  if (!data || !data.username) return;
  const norm = (data.username.toLowerCase() === 'adelcia' || data.username.toLowerCase() === 'adélcia') ? 'Adélcia' : 'Roberto';
  userAvatars[norm] = data.avatar_url || '';
  userAvatars[norm.toLowerCase()] = data.avatar_url || '';
  try {
    localStorage.setItem('hk_user_avatars', JSON.stringify(userAvatars));
  } catch (e) {}

  updateUserUI();

  if (window.ChatModule && typeof window.ChatModule.renderMessages === 'function') {
    window.ChatModule.renderMessages();
  }
}

function showAppToast(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'gallery-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 2800);
}

function getPlatform() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 'Tablet' : 'PC';
}

function initNavigation() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  activeTab = tabId;

  // Aggiorna bottoni navigazione
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-tab') === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Aggiorna pannelli visibili
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isActive = panel.id === tabId;
    panel.classList.toggle('active', isActive);
  });

  // Notifica présence Adélcia
  if (window.PresenceModule && typeof window.PresenceModule.handleTabChange === 'function') {
    window.PresenceModule.handleTabChange(tabId);
  }

  // Notifica moduli
  if (tabId === 'tab-chat') {
    window.location.hash = 'chat';
    if (window.ChatModule) {
      window.ChatModule.clearUnread();
      window.ChatModule.scrollToBottom(false);
      setTimeout(() => window.ChatModule.scrollToBottom(false), 50);
      setTimeout(() => window.ChatModule.scrollToBottom(false), 150);
      setTimeout(() => window.ChatModule.scrollToBottom(false), 400);
    }
  } else if (tabId === 'tab-orders') {
    window.location.hash = 'orders';
    if (window.OrdersModule) {
      if (typeof window.OrdersModule.clearOrdersBlink === 'function') {
        window.OrdersModule.clearOrdersBlink();
      }
      if (typeof window.OrdersModule.loadOrders === 'function') {
        window.OrdersModule.loadOrders();
      }
    }
  } else if (tabId === 'tab-rooms') {
    window.location.hash = 'rooms';
    if (window.OrdersModule) {
      if (typeof window.OrdersModule.onChambresTabOpened === 'function') {
        window.OrdersModule.onChambresTabOpened();
      }
      if (typeof window.OrdersModule.loadDailyRooms === 'function') {
        const curDate = window.OrdersModule.getSelectedDate ? window.OrdersModule.getSelectedDate() : undefined;
        window.OrdersModule.loadDailyRooms(curDate);
      }
    }
  } else if (tabId === 'tab-deadlines') {
    window.location.hash = 'deadlines';
    if (window.DeadlinesModule && typeof window.DeadlinesModule.loadDeadlines === 'function') {
      window.DeadlinesModule.loadDeadlines();
    }
  } else if (tabId === 'tab-shopping') {
    window.location.hash = 'shopping';
    if (window.ShoppingModule && typeof window.ShoppingModule.loadShoppingItems === 'function') {
      window.ShoppingModule.loadShoppingItems();
    }
  } else if (tabId === 'tab-expenses') {
    window.location.hash = 'expenses';
    if (window.ExpensesModule && typeof window.ExpensesModule.loadExpenses === 'function') {
      window.ExpensesModule.loadExpenses();
    }
  } else if (tabId === 'tab-gallery') {
    window.location.hash = 'gallery';
    if (window.GalleryModule && typeof window.GalleryModule.loadGallery === 'function') {
      window.GalleryModule.loadGallery();
    }
  }
}

function initSoundButton() {
  const btn = document.getElementById('btn-sound-toggle');
  if (btn && window.SoundEngine) {
    window.SoundEngine.updateSoundButtonUI();
    btn.addEventListener('click', () => {
      window.SoundEngine.toggleMute();
    });
  }
}

let screenWakeLock = null;
let isWakeLockRequested = false;

async function requestScreenWakeLock() {
  if ('wakeLock' in navigator && navigator.wakeLock) {
    try {
      if (screenWakeLock !== null) {
        return;
      }
      screenWakeLock = await navigator.wakeLock.request('screen');
      screenWakeLock.addEventListener('release', () => {
        screenWakeLock = null;
        updateWakeLockUI(false);
      });
      updateWakeLockUI(true);
      console.log('Screen Wake Lock actif: écran maintenu allumé pour le tablet');
    } catch (err) {
      console.warn('Wake Lock request error:', err.message);
      updateWakeLockUI(false);
    }
  }
}

function releaseScreenWakeLock() {
  if (screenWakeLock !== null) {
    try {
      screenWakeLock.release();
    } catch (e) {}
    screenWakeLock = null;
    updateWakeLockUI(false);
  }
}

function updateWakeLockUI(isActive) {
  const btn = document.getElementById('btn-wakelock-toggle');
  const textEl = document.getElementById('wakelock-text');
  if (btn) {
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('inactive', !isActive);
    if (textEl) {
      textEl.textContent = isActive ? 'Anti-veille : Actif' : 'Anti-veille : Inactif';
    }
    btn.title = isActive 
      ? "L'écran reste allumé pour ne jamais rater une sonnerie" 
      : "Cliquer pour activer le maintien de l'écran allumé";
  }
}

function toggleWakeLock() {
  if (screenWakeLock) {
    isWakeLockRequested = false;
    releaseScreenWakeLock();
  } else {
    isWakeLockRequested = true;
    requestScreenWakeLock();
  }
}

function initWakeLock() {
  const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isAdelcia = currentUser && currentUser.toLowerCase().includes('adelcia');

  const btn = document.getElementById('btn-wakelock-toggle');
  if (btn) {
    if (isMobileOrTablet || isAdelcia) {
      btn.style.display = 'inline-flex';
      btn.addEventListener('click', () => {
        toggleWakeLock();
      });
    } else {
      btn.style.display = 'none';
    }
  }

  if (isMobileOrTablet || isAdelcia) {
    isWakeLockRequested = true;
    requestScreenWakeLock();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isWakeLockRequested) {
        requestScreenWakeLock();
        if (window.SoundEngine && typeof window.SoundEngine.startAudioKeepAlive === 'function') {
          window.SoundEngine.startAudioKeepAlive();
        }
      }
    });

    ['touchstart', 'click'].forEach(evt => {
      document.addEventListener(evt, () => {
        if (isWakeLockRequested && !screenWakeLock) {
          requestScreenWakeLock();
        }
        if (window.SoundEngine && typeof window.SoundEngine.startAudioKeepAlive === 'function') {
          window.SoundEngine.startAudioKeepAlive();
        }
      }, { once: true, passive: true });
    });
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('Service Worker registration skipped:', err);
      });
    });
  }
}

// Verrouillage du défilement de la fenêtre (maintient l'en-tête et les onglets toujours fixes en haut sur mobile et tablette)
window.addEventListener('scroll', () => {
  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0);
  }
}, { passive: true });

document.addEventListener('focusin', () => {
  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0);
  }
});

document.addEventListener('focusout', () => {
  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0);
  }
});

window.App = {
  getCurrentUser: () => currentUser,
  getActiveTab: () => activeTab,
  getPlatform,
  switchTab,
  getUserAvatarUrl,
  openProfilePhotoModal,
  closeProfilePhotoModal,
  resetProfilePhoto,
  onAvatarUpdated
};

document.addEventListener('DOMContentLoaded', initApp);