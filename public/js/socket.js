// socket.js - Client temps réel Socket.io
let socket = null;

function initSocket() {
  socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  socket.on('connect', () => {
    updateConnectionStatus(true);
    const user = window.App ? window.App.getCurrentUser() : 'Roberto';
    const platform = window.App ? window.App.getPlatform() : 'Desktop';
    socket.emit('user:join', { username: user, platform });
  });

  socket.on('disconnect', () => {
    updateConnectionStatus(false);
  });

  socket.on('connect_error', () => {
    updateConnectionStatus(false);
  });

  // Détection de nouvelle version et rafraîchissement automatique
  socket.on('app:version', (data) => {
    if (window.APP_VERSION && data && data.version && window.APP_VERSION < data.version) {
      console.log('Mise à jour v' + data.version + ' disponible (actuelle v' + window.APP_VERSION + '). Rafraîchissement...');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
          for (let r of regs) r.unregister();
          setTimeout(() => window.location.reload(true), 250);
        }).catch(() => {
          window.location.reload(true);
        });
      } else {
        window.location.reload(true);
      }
    }
  });

  // Événements Chat
  socket.on('chat:message', (msg) => {
    if (window.ChatModule) {
      window.ChatModule.onMessageReceived(msg);
    }
  });

  socket.on('chat:read_all', () => {
    if (window.ChatModule) {
      window.ChatModule.onMessagesRead();
    }
  });

  socket.on('chat:deleted', (data) => {
    if (window.ChatModule && window.ChatModule.onMessageDeleted) {
      window.ChatModule.onMessageDeleted(data.id);
    }
  });

  socket.on('chat:question_answered', (data) => {
    if (window.ChatModule && window.ChatModule.onQuestionAnswered) {
      window.ChatModule.onQuestionAnswered(data);
    }
  });

  socket.on('chat:typing', (data) => {
    if (window.ChatModule && window.ChatModule.onTypingStatus) {
      window.ChatModule.onTypingStatus(data);
    }
  });

  // Événements Ordres de service
  socket.on('order:created', (order) => {
    if (window.OrdersModule) {
      window.OrdersModule.onOrderCreated(order);
    }
  });

  socket.on('order:updated', (order) => {
    if (window.OrdersModule) {
      window.OrdersModule.onOrderUpdated(order);
    }
  });

  socket.on('order:archived', (order) => {
    if (window.OrdersModule) {
      window.OrdersModule.onOrderArchived(order);
    }
  });

  socket.on('order:deleted', (data) => {
    if (window.OrdersModule) {
      window.OrdersModule.onOrderDeleted(data.id);
    }
  });

  // Événements Planning Quotidien Chambres
  socket.on('room_status:updated', (data) => {
    if (window.OrdersModule && window.OrdersModule.onRoomStatusUpdated) {
      window.OrdersModule.onRoomStatusUpdated(data);
    }
  });

  // Événements Échéances
  socket.on('deadline:created', (item) => {
    if (window.DeadlinesModule) {
      window.DeadlinesModule.onDeadlineCreated(item);
    }
  });

  socket.on('deadline:updated', (item) => {
    if (window.DeadlinesModule) {
      window.DeadlinesModule.onDeadlineUpdated(item);
    }
  });

  socket.on('deadline:deleted', (data) => {
    if (window.DeadlinesModule) {
      window.DeadlinesModule.onDeadlineDeleted(data.id);
    }
  });

  // Événements Achats & Courses
  socket.on('shopping:created', (item) => {
    if (window.ShoppingModule && window.ShoppingModule.onShoppingCreated) {
      window.ShoppingModule.onShoppingCreated(item);
    }
  });

  socket.on('shopping:updated', (item) => {
    if (window.ShoppingModule && window.ShoppingModule.onShoppingUpdated) {
      window.ShoppingModule.onShoppingUpdated(item);
    }
  });

  socket.on('shopping:reset', () => {
    if (window.ShoppingModule && window.ShoppingModule.onShoppingReset) {
      window.ShoppingModule.onShoppingReset();
    }
  });

  socket.on('shopping:deleted', (data) => {
    if (window.ShoppingModule && window.ShoppingModule.onShoppingDeleted) {
      window.ShoppingModule.onShoppingDeleted(data.id);
    }
  });

  // Présence des utilisateurs
  socket.on('users:online', (users) => {
    console.log('Utilisateurs en ligne:', users);
  });
}

function updateConnectionStatus(isOnline) {
  const dot = document.getElementById('connection-dot');
  const text = document.getElementById('connection-text');
  if (dot && text) {
    if (isOnline) {
      dot.className = 'status-dot dot-online';
      text.textContent = 'Connecté';
    } else {
      dot.className = 'status-dot dot-offline';
      text.textContent = 'Reconnexion...';
    }
  }
}

window.SocketClient = {
  initSocket,
  getSocket: () => socket
};