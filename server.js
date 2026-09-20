const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
  }
});

const PORT = process.env.PORT || 8765;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    port: PORT,
    serverTime: new Date().toISOString(),
    ips: getLocalIPs()
  });
});

// MESSAGES
app.get('/api/messages', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 150;
    res.json(db.getMessages(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages', (req, res) => {
  try {
    const { sender, text, type, reply_to } = req.body;
    if (!sender || !text) {
      return res.status(400).json({ error: 'Mittente e testo sono obbligatori' });
    }
    const msg = db.addMessage(sender, text, type || 'text', reply_to || null);
    io.emit('chat:message', msg);
    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/messages/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.deleteMessage(Number(id));
    io.emit('chat:deleted', result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages/read', (req, res) => {
  try {
    const user = req.body.user || req.query.user || '';
    db.markMessagesAsRead(user);
    io.emit('chat:read_all', { user });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quick-replies', (req, res) => {
  try {
    res.json(db.getQuickReplies());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DAILY ROOM STATUS (QUADRO GIORNALIERO CAMERE)
app.get('/api/daily-rooms', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const date = req.query.date || today;
    const rooms = db.getDailyRoomStatus(date);
    res.json({ date, rooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/daily-rooms/:date/:roomNumber', (req, res) => {
  try {
    const { date, roomNumber } = req.params;
    const updated = db.updateDailyRoomStatus(date, Number(roomNumber), req.body);
    io.emit('room_status:updated', { date, room: updated });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ORDERS
app.get('/api/orders', (req, res) => {
  try {
    const includeArchived = req.query.archived === 'true';
    res.json(db.getOrders(includeArchived));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/archived', (req, res) => {
  try {
    res.json(db.getArchivedOrders());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const { title, room_or_area } = req.body;
    if (!title || !room_or_area) {
      return res.status(400).json({ error: 'Titolo e Camera/Area sono obbligatori' });
    }
    const order = db.createOrder(req.body);
    io.emit('order:created', order);
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = db.updateOrder(Number(id), req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    io.emit('order:updated', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, user } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Stato obbligatorio' });
    }
    const updated = db.updateOrderStatus(Number(id), status, user);
    if (!updated) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    io.emit('order:updated', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/archive', (req, res) => {
  try {
    const { id } = req.params;
    const { is_archived } = req.body;
    const updated = db.toggleArchiveOrder(Number(id), is_archived);
    if (!updated) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    io.emit('order:archived', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.deleteOrder(Number(id));
    io.emit('order:deleted', { id: Number(id) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DEADLINES
app.get('/api/deadlines', (req, res) => {
  try {
    res.json(db.getDeadlines());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/deadlines', (req, res) => {
  try {
    const { title, due_date } = req.body;
    if (!title || !due_date) {
      return res.status(400).json({ error: 'Titolo e data scadenza sono obbligatori' });
    }
    const item = db.createDeadline(req.body);
    io.emit('deadline:created', item);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/deadlines/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;
    const result = db.toggleDeadline(Number(id), user);
    if (!result) {
      return res.status(404).json({ error: 'Mansione non trovata' });
    }
    io.emit('deadline:updated', result.updated);
    if (result.next) {
      io.emit('deadline:created', result.next);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/deadlines/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.deleteDeadline(Number(id));
    io.emit('deadline:deleted', { id: Number(id) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SHOPPING (ACHATS & COURSES)
app.get('/api/shopping-items', (req, res) => {
  try {
    res.json(db.getShoppingItems());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shopping-items', (req, res) => {
  try {
    const { name, category, sort_order } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Le nom du produit est obligatoire' });
    }
    const item = db.createShoppingItem(req.body);
    io.emit('shopping:created', item);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/shopping-items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = db.updateShoppingItem(Number(id), req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Produit introuvable' });
    }
    io.emit('shopping:updated', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/shopping-items/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const { is_checked } = req.body;
    const updated = db.toggleShoppingItem(Number(id), is_checked);
    if (!updated) {
      return res.status(404).json({ error: 'Produit introuvable' });
    }
    io.emit('shopping:updated', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shopping-items/reset', (req, res) => {
  try {
    const result = db.resetShoppingChecklist();
    io.emit('shopping:reset');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/shopping-items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.deleteShoppingItem(Number(id));
    io.emit('shopping:deleted', { id: Number(id) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shopping/send', (req, res) => {
  try {
    const { sender, notes, selectedItems } = req.body;
    const author = (sender || 'Système').trim();
    const recipient = author.toLowerCase().includes('roberto') ? 'Adélcia' : 'Roberto';
    
    const items = Array.isArray(selectedItems) ? selectedItems : [];
    if (items.length === 0) {
      return res.status(400).json({ error: 'Aucun produit sélectionné pour la commande' });
    }

    const now = new Date();
    const dateFormatted = now.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Zurich'
    });

    let messageText = `🛒 *LISTE DE COURSES & ACHATS*\n`;
    messageText += `👤 De : ${author}\n`;
    messageText += `🎯 Pour : ${recipient}\n`;
    messageText += `📅 Date : ${dateFormatted}\n\n`;

    if (notes && notes.trim()) {
      messageText += `📝 *Notes & Consignes :*\n${notes.trim()}\n\n`;
    }

    messageText += `📦 *Articles à acheter (${items.length}) :*\n`;
    items.forEach((item, index) => {
      const cat = item.category ? ` _(${item.category})_` : '';
      messageText += `${index + 1}. ✅ ${item.name}${cat}\n`;
    });

    // Insérer le message dans le chat
    const msg = db.addMessage(author, messageText, 'text');

    // Enregistrer chaque article dans le registre des dépenses (expenses)
    items.forEach((item) => {
      db.addExpense({
        request_date: dateFormatted,
        product_name: item.name,
        category: item.category || '',
        quantity: 1,
        purchase_date: '',
        price_ttc: null,
        requested_by: author,
        notes: notes || ''
      });
    });

    // Réinitialiser la liste à cocher des courses
    db.resetShoppingChecklist();

    // Diffuser les événements temps réel
    io.emit('chat:message', msg);
    io.emit('shopping:reset');
    io.emit('expenses:updated');

    res.json({ success: true, message: msg, recipient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================================
// EXPENSES (SUIVI DES ACHATS & DÉPENSES - PC ONLY)
// ==========================================================================
app.get('/api/expenses', (req, res) => {
  try {
    const list = db.getExpenses();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', (req, res) => {
  try {
    const item = db.addExpense(req.body);
    io.emit('expenses:updated');
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/expenses/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = db.updateExpense(Number(id), req.body);
    if (!updated) return res.status(404).json({ error: 'Dépense non trouvée' });
    io.emit('expenses:updated');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.deleteExpense(Number(id));
    io.emit('expenses:updated');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// USERS PRESENCE
const onlineUsers = new Map();

io.on('connection', (socket) => {
  socket.on('user:join', ({ username, platform }) => {
    onlineUsers.set(socket.id, {
      username: username || 'Anonimo',
      platform: platform || 'Desktop',
      connectedAt: new Date().toISOString()
    });
    io.emit('users:online', Array.from(onlineUsers.values()));
  });

  socket.on('chat:typing', (data) => {
    socket.broadcast.emit('chat:typing', data);
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('users:online', Array.from(onlineUsers.values()));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIPs = getLocalIPs();
  console.log('====================================================');
  console.log('🏨 HOUSEKEEPING MANAGER - SERVER ATTIVO');
  console.log(`📡 Porta: ${PORT} (In ascolto su 0.0.0.0)`);
  console.log('----------------------------------------------------');
  console.log(`💻 PC Roberto:     http://localhost:${PORT}/?user=Roberto`);
  if (localIPs.length > 0) {
    localIPs.forEach((ip) => {
      console.log(`📱 Tablet Adélcia: http://${ip}:${PORT}/?user=Adelcia`);
    });
  } else {
    console.log(`📱 Tablet Adélcia: http://<IP-LOCALE-PC>:${PORT}/?user=Adelcia`);
  }
  console.log('====================================================');
});