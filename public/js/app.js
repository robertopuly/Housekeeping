// app.js - Main Application Controller
let currentUser = 'Roberto';
let activeTab = 'tab-chat';

function initApp() {
  initUser();
  initNavigation();
  initSoundButton();
  registerServiceWorker();

  if (window.SocketClient) window.SocketClient.initSocket();
  if (window.ChatModule) window.ChatModule.initChat();
  if (window.OrdersModule) window.OrdersModule.initOrders();
  if (window.DeadlinesModule) window.DeadlinesModule.initDeadlines();
  if (window.ShoppingModule) window.ShoppingModule.initShopping();
  if (window.ExpensesModule) window.ExpensesModule.initExpenses();
  if (window.LeaveModule) window.LeaveModule.initLeave();

  const hash = window.location.hash.replace('#', '');
  if (hash === 'orders') switchTab('tab-orders');
  else if (hash === 'rooms') switchTab('tab-rooms');
  else if (hash === 'deadlines') switchTab('tab-deadlines');
  else if (hash === 'shopping') switchTab('tab-shopping');
  else if (hash === 'leave' || hash === 'conges' || hash === 'vacances') switchTab('tab-leave');
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
  chip.title = "Cliquer pour basculer d'utilisateur (Roberto / Adélcia)";
  chip.addEventListener('click', () => {
    const nextUser = (currentUser.toLowerCase() === 'roberto') ? 'Adélcia' : 'Roberto';
    if (confirm(`Changer d'utilisateur vers ${nextUser} ?`)) {
      localStorage.setItem('hk_user', nextUser);
      const url = new URL(window.location.href);
      url.searchParams.set('user', nextUser);
      window.location.href = url.toString();
    }
  });
}

function updateUserUI() {
  const nameEl = document.getElementById('current-user-name');
  const avatarEl = document.getElementById('current-user-avatar');
  if (nameEl) nameEl.textContent = currentUser;
  if (avatarEl) avatarEl.textContent = currentUser.charAt(0).toUpperCase();
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

  // Notifica moduli
  if (tabId === 'tab-chat') {
    window.location.hash = 'chat';
    if (window.ChatModule) {
      window.ChatModule.clearUnread();
      setTimeout(() => window.ChatModule.scrollToBottom(), 50);
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
    if (window.OrdersModule && typeof window.OrdersModule.loadDailyRooms === 'function') {
      const curDate = window.OrdersModule.getSelectedDate ? window.OrdersModule.getSelectedDate() : undefined;
      window.OrdersModule.loadDailyRooms(curDate);
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
  switchTab
};

document.addEventListener('DOMContentLoaded', initApp);