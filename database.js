const path = require('path');

let DatabaseSync;
try {
  const sqlite = require('node:sqlite');
  DatabaseSync = sqlite.DatabaseSync;
} catch (e) {
  try {
    DatabaseSync = require('better-sqlite3');
  } catch (err) {
    console.error('Aucun pilote SQLite disponible:', err);
    process.exit(1);
  }
}

const dbPath = path.join(__dirname, 'data.db');
const db = new DatabaseSync(dbPath);

try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
  console.warn('Avis PRAGMA:', e.message);
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read INTEGER DEFAULT 0,
      type TEXT DEFAULT 'text',
      reply_to_id INTEGER DEFAULT NULL,
      reply_to_sender TEXT DEFAULT '',
      reply_to_text TEXT DEFAULT '',
      is_deleted INTEGER DEFAULT 0,
      image_url TEXT DEFAULT '',
      is_ephemeral INTEGER DEFAULT 0,
      expires_at DATETIME DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      room_or_area TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority TEXT DEFAULT 'normale',
      status TEXT DEFAULT 'in_attesa',
      created_by TEXT NOT NULL,
      assigned_to TEXT DEFAULT '',
      completed_by TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME DEFAULT NULL,
      is_archived INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS daily_room_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      room_number INTEGER NOT NULL,
      status TEXT DEFAULT 'libera',
      guests_count INTEGER DEFAULT 2,
      extra_bed INTEGER DEFAULT 0,
      beds_type TEXT DEFAULT 'matrimoniale',
      notes TEXT DEFAULT '',
      access_status TEXT DEFAULT 'en_chambre',
      cleanliness_status TEXT DEFAULT 'a_faire',
      control_requested INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT DEFAULT '',
      UNIQUE(date, room_number)
    );

    CREATE TABLE IF NOT EXISTS deadlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'Général',
      due_date TEXT NOT NULL,
      recurrence TEXT DEFAULT 'nessuna',
      is_completed INTEGER DEFAULT 0,
      completed_at DATETIME DEFAULT NULL,
      completed_by TEXT DEFAULT '',
      priority TEXT DEFAULT 'normale',
      notes TEXT DEFAULT '',
      room_number TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS quick_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS shopping_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Nettoyage & Entretien',
      is_checked INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_date TEXT NOT NULL,
      product_name TEXT NOT NULL,
      category TEXT DEFAULT '',
      quantity INTEGER DEFAULT 1,
      purchase_date TEXT DEFAULT '',
      price_ttc REAL DEFAULT NULL,
      requested_by TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT DEFAULT '',
      dates_json TEXT DEFAULT '[]',
      user_name TEXT DEFAULT 'Adélcia',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'en_attente',
      sent_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, is_archived);
    CREATE INDEX IF NOT EXISTS idx_deadlines_date ON deadlines(due_date, is_completed);
    CREATE INDEX IF NOT EXISTS idx_daily_rooms_date ON daily_room_status(date);
    CREATE INDEX IF NOT EXISTS idx_shopping_checked ON shopping_items(is_checked);
    CREATE INDEX IF NOT EXISTS idx_expenses_request_date ON expenses(request_date);
    CREATE INDEX IF NOT EXISTS idx_leave_start_date ON leave_requests(start_date);
  `);

  try {
    db.exec('ALTER TABLE messages ADD COLUMN reply_to_id INTEGER DEFAULT NULL;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE messages ADD COLUMN reply_to_sender TEXT DEFAULT "";');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE messages ADD COLUMN reply_to_text TEXT DEFAULT "";');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0;');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE messages ADD COLUMN image_url TEXT DEFAULT "";');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE messages ADD COLUMN question_type TEXT DEFAULT "";');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE messages ADD COLUMN question_status TEXT DEFAULT "";');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE messages ADD COLUMN answered_by TEXT DEFAULT "";');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE messages ADD COLUMN answered_at DATETIME DEFAULT NULL;');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE messages ADD COLUMN question_options TEXT DEFAULT "";');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE messages ADD COLUMN selected_option TEXT DEFAULT "";');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE quick_replies ADD COLUMN label TEXT DEFAULT "";');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE daily_room_status ADD COLUMN access_status TEXT DEFAULT "en_chambre";');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE daily_room_status ADD COLUMN cleanliness_status TEXT DEFAULT "a_faire";');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE daily_room_status ADD COLUMN control_requested INTEGER DEFAULT 0;');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE messages ADD COLUMN is_ephemeral INTEGER DEFAULT 0;');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE messages ADD COLUMN expires_at DATETIME DEFAULT NULL;');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE deadlines ADD COLUMN room_number TEXT DEFAULT "";');
  } catch (e) {}

  const defaultReplies = [
    { text: 'Nettoyage terminé ✅', label: 'Nettoyage terminé ✅' },
    { text: 'Peux-tu venir ici dès que possible ? 🏃', label: 'Peux-tu venir ici ? 🏃' },
    { text: 'Besoin d\'aide 🆘', label: 'Besoin d\'aide 🆘' },
    { text: 'Tout est ok 👌', label: 'Tout est ok 👌' },
    { text: 'J\'arrive tout de suite 🏃', label: 'J\'arrive tout de suite 🏃' }
  ];

  db.exec('DELETE FROM quick_replies;');
  const insertQR = db.prepare('INSERT INTO quick_replies (text, label, sort_order) VALUES (?, ?, ?)');
  for (let i = 0; i < defaultReplies.length; i++) {
    insertQR.run(defaultReplies[i].text, defaultReplies[i].label, i);
  }

  const msgCheck = db.prepare('SELECT COUNT(*) as count FROM messages').get();
  if (!msgCheck || msgCheck.count === 0) {
    db.prepare('INSERT INTO messages (sender, text) VALUES (?, ?)').run('Système', 'Bienvenue sur l\'application Housekeeping ! La synchronisation en temps réel est active.');
  }

  // Initialisation des produits les plus courants pour la liste des courses
  const shoppingCheck = db.prepare('SELECT COUNT(*) as count FROM shopping_items').get();
  if (!shoppingCheck || shoppingCheck.count === 0) {
    const defaultShoppingProducts = [
      { name: 'Papier toilette (rouleaux)', category: 'Sanitaires & Accueil', sort_order: 1 },
      { name: 'Sacs poubelle 50L (renforcés)', category: 'Nettoyage & Entretien', sort_order: 2 },
      { name: 'Sacs poubelle 30L (salle de bain)', category: 'Nettoyage & Entretien', sort_order: 3 },
      { name: 'Produit lave-vitres', category: 'Nettoyage & Entretien', sort_order: 4 },
      { name: 'Détergent sols multi-surfaces', category: 'Nettoyage & Entretien', sort_order: 5 },
      { name: 'Désinfectant sanitaires & anticalcaire', category: 'Nettoyage & Entretien', sort_order: 6 },
      { name: 'Lessive liquide pour linge', category: 'Linge & Buanderie', sort_order: 7 },
      { name: 'Assouplissant pour linge', category: 'Linge & Buanderie', sort_order: 8 },
      { name: 'Savon liquide mains (recharge)', category: 'Sanitaires & Accueil', sort_order: 9 },
      { name: 'Shampoing & Gel douche accueil', category: 'Sanitaires & Accueil', sort_order: 10 },
      { name: 'Éponges avec face abrasive', category: 'Nettoyage & Entretien', sort_order: 11 },
      { name: 'Chiffons microfibres (lot)', category: 'Nettoyage & Entretien', sort_order: 12 },
      { name: 'Pastilles pour lave-vaisselle', category: 'Cuisine & Petit-déjeuner', sort_order: 13 },
      { name: 'Eau de Javel', category: 'Nettoyage & Entretien', sort_order: 14 },
      { name: 'Gants de ménage (taille M)', category: 'Nettoyage & Entretien', sort_order: 15 },
      { name: 'Gants de ménage (taille L)', category: 'Nettoyage & Entretien', sort_order: 16 },
      { name: 'Désodorisant d\'ambiance', category: 'Sanitaires & Accueil', sort_order: 17 },
      { name: 'Essuie-tout / Bobines papier', category: 'Nettoyage & Entretien', sort_order: 18 },
      { name: 'Sachets hygiéniques poubelles SDB', category: 'Sanitaires & Accueil', sort_order: 19 }
    ];
    const insertShop = db.prepare('INSERT INTO shopping_items (name, category, sort_order) VALUES (?, ?, ?)');
    for (const p of defaultShoppingProducts) {
      insertShop.run(p.name, p.category, p.sort_order);
    }
  }

  // Zero seed preimpostato per le scadenze: gestione solo manuale
}

initSchema();

// MESSAGES
function cleanupExpiredMessages() {
  const nowIso = new Date().toISOString();
  const expired = db.prepare('SELECT id, image_url, is_read FROM messages WHERE is_ephemeral = 1 AND expires_at IS NOT NULL AND expires_at <= ?').all(nowIso);
  const readExpired = [];
  const unreadExpired = [];

  if (expired.length > 0) {
    for (const m of expired) {
      if (m.is_read === 1) {
        readExpired.push(m);
      } else {
        unreadExpired.push(m);
      }
    }

    // 1. Messaggi già letti: cancellati completamente
    if (readExpired.length > 0) {
      const readIds = readExpired.map(m => m.id);
      db.prepare(`DELETE FROM messages WHERE id IN (${readIds.map(() => '?').join(',')})`).run(...readIds);
    }

    // 2. Messaggi NON letti: contrassegnati come "Message supprimé et non lu"
    if (unreadExpired.length > 0) {
      const unreadIds = unreadExpired.map(m => m.id);
      db.prepare(`
        UPDATE messages 
        SET is_deleted = 1, 
            text = 'Message supprimé et non lu', 
            reply_to_text = '', 
            image_url = '', 
            is_ephemeral = 0, 
            expires_at = NULL 
        WHERE id IN (${unreadIds.map(() => '?').join(',')})
      `).run(...unreadIds);
    }
  }
  return { expired, readExpired, unreadExpired };
}

function getMessages(limit = 150) {
  cleanupExpiredMessages();
  return db.prepare('SELECT * FROM messages ORDER BY id ASC LIMIT ?').all(limit);
}

function addMessage(sender, text, type = 'text', replyTo = null, imageUrl = '', questionType = '', questionStatus = '', questionOptions = '', selectedOption = '', isEphemeral = 0, expiresAt = null) {
  const reply_to_id = replyTo ? replyTo.id : null;
  const reply_to_sender = replyTo ? (replyTo.sender || '') : '';
  const reply_to_text = replyTo ? (replyTo.text || '') : '';
  const nowIso = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO messages (sender, text, type, reply_to_id, reply_to_sender, reply_to_text, timestamp, image_url, question_type, question_status, question_options, selected_option, is_ephemeral, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sender, text, type, reply_to_id, reply_to_sender, reply_to_text, nowIso, imageUrl || '', questionType || '', questionStatus || '', questionOptions || '', selectedOption || '', isEphemeral ? 1 : 0, expiresAt || null);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
}

function answerYesNoQuestion(messageId, answer, answeredBy = 'Adélcia') {
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE messages
    SET question_status = ?, answered_by = ?, answered_at = ?
    WHERE id = ?
  `).run(answer, answeredBy, nowIso, messageId);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
}

function answerChoiceQuestion(messageId, selectedOption, answeredBy = 'Adélcia') {
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE messages
    SET question_status = 'answered', selected_option = ?, answered_by = ?, answered_at = ?
    WHERE id = ?
  `).run(selectedOption, answeredBy, nowIso, messageId);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
}

function deleteMessage(id) {
  db.prepare(`
    UPDATE messages 
    SET is_deleted = 1, text = 'Message supprimé', reply_to_text = '' 
    WHERE id = ?
  `).run(id);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) || { id, is_deleted: 1, text: 'Message supprimé' };
}

function markMessagesAsRead(byUser = '') {
  if (byUser) {
    db.prepare('UPDATE messages SET is_read = 1 WHERE is_read = 0 AND LOWER(sender) != LOWER(?)').run(byUser);
  } else {
    db.prepare('UPDATE messages SET is_read = 1 WHERE is_read = 0').run();
  }
  return true;
}

function getQuickReplies() {
  return db.prepare('SELECT * FROM quick_replies ORDER BY sort_order ASC, id ASC').all();
}

// ORDERS
function getOrders(includeArchived = false) {
  if (includeArchived) {
    return db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  }
  return db.prepare(`
    SELECT * FROM orders 
    WHERE is_archived = 0 
    ORDER BY 
      CASE priority 
        WHEN 'emergenza' THEN 1 
        WHEN 'urgente' THEN 2 
        WHEN 'normale' THEN 3 
        ELSE 4 
      END, 
      id DESC
  `).all();
}

function getArchivedOrders() {
  return db.prepare('SELECT * FROM orders WHERE is_archived = 1 ORDER BY completed_at DESC, id DESC').all();
}

function createOrder(data) {
  const { title, room_or_area, description, priority, created_by, assigned_to } = data;
  const result = db.prepare(`
    INSERT INTO orders (title, room_or_area, description, priority, status, created_by, assigned_to)
    VALUES (?, ?, ?, ?, 'in_attesa', ?, ?)
  `).run(title, room_or_area, description || '', priority || 'normale', created_by || 'Roberto', assigned_to || '');
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
}

function updateOrder(id, data) {
  const current = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!current) return null;

  const title = data.title !== undefined ? data.title : current.title;
  const room_or_area = data.room_or_area !== undefined ? data.room_or_area : current.room_or_area;
  const description = data.description !== undefined ? data.description : current.description;
  const priority = data.priority !== undefined ? data.priority : current.priority;

  db.prepare(`
    UPDATE orders 
    SET title = ?, room_or_area = ?, description = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, room_or_area, description, priority, id);

  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

function updateOrderStatus(id, status, user) {
  const current = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!current) return null;

  let completed_at = current.completed_at;
  let completed_by = current.completed_by;
  let assigned_to = current.assigned_to;

  if (status === 'in_carico') {
    assigned_to = user || assigned_to || 'Adélcia';
  } else if (status === 'ultimato') {
    completed_at = new Date().toISOString();
    completed_by = user || 'Adélcia';
    if (!assigned_to) assigned_to = completed_by;
  } else if (status === 'in_attesa') {
    completed_at = null;
    completed_by = '';
  }

  db.prepare(`
    UPDATE orders 
    SET status = ?, assigned_to = ?, completed_by = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, assigned_to, completed_by, completed_at, id);

  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

function toggleArchiveOrder(id, is_archived) {
  db.prepare('UPDATE orders SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(is_archived ? 1 : 0, id);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

function deleteOrder(id) {
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  return { success: true, id };
}

// DAILY ROOM STATUS (PLANNING QUOTIDIEN DES CHAMBRES 1..5)
function getDailyRoomStatus(dateStr) {
  const existing = db.prepare('SELECT * FROM daily_room_status WHERE date = ? ORDER BY room_number ASC').all(dateStr);
  if (existing.length < 5) {
    const existingRooms = new Set(existing.map(r => r.room_number));
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO daily_room_status (date, room_number, status, guests_count, extra_bed, beds_type, notes, access_status, cleanliness_status, control_requested)
      VALUES (?, ?, 'libera', 2, 0, 'matrimoniale', '', 'en_chambre', 'a_faire', 0)
    `);
    for (let r = 1; r <= 5; r++) {
      if (!existingRooms.has(r)) {
        insertStmt.run(dateStr, r);
      }
    }
    return db.prepare('SELECT * FROM daily_room_status WHERE date = ? ORDER BY room_number ASC').all(dateStr);
  }
  return existing;
}

function updateDailyRoomStatus(dateStr, roomNumber, data) {
  const current = db.prepare('SELECT * FROM daily_room_status WHERE date = ? AND room_number = ?').get(dateStr, roomNumber);
  
  const finalStatus = data.status !== undefined ? data.status : (current ? current.status : 'libera');
  const finalGuests = data.guests_count !== undefined ? parseInt(data.guests_count) : (current ? current.guests_count : 2);
  let finalExtraBed = data.extra_bed !== undefined ? (data.extra_bed ? 1 : 0) : (current ? current.extra_bed : 0);
  if (parseInt(roomNumber) === 5 && finalGuests === 3) {
    finalExtraBed = 1;
  } else if (parseInt(roomNumber) !== 5 || finalGuests < 3) {
    finalExtraBed = 0;
  }

  const finalBedsType = data.beds_type !== undefined ? data.beds_type : (current ? current.beds_type : 'matrimoniale');
  const finalNotes = data.notes !== undefined ? data.notes : (current ? current.notes : '');
  const finalAccess = data.access_status !== undefined ? data.access_status : (current ? (current.access_status || 'en_chambre') : 'en_chambre');
  const finalCleanliness = data.cleanliness_status !== undefined ? data.cleanliness_status : (current ? (current.cleanliness_status || 'a_faire') : 'a_faire');
  const finalControlRequested = data.control_requested !== undefined ? (data.control_requested ? 1 : 0) : (current ? (current.control_requested || 0) : 0);
  const finalUpdatedBy = data.updated_by || (current ? current.updated_by : '');

  db.prepare(`
    INSERT INTO daily_room_status (date, room_number, status, guests_count, extra_bed, beds_type, notes, access_status, cleanliness_status, control_requested, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(date, room_number) DO UPDATE SET
      status = excluded.status,
      guests_count = excluded.guests_count,
      extra_bed = excluded.extra_bed,
      beds_type = excluded.beds_type,
      notes = excluded.notes,
      access_status = excluded.access_status,
      cleanliness_status = excluded.cleanliness_status,
      control_requested = excluded.control_requested,
      updated_by = excluded.updated_by,
      updated_at = CURRENT_TIMESTAMP
  `).run(dateStr, parseInt(roomNumber), finalStatus, finalGuests, finalExtraBed, finalBedsType, finalNotes, finalAccess, finalCleanliness, finalControlRequested, finalUpdatedBy);

  return db.prepare('SELECT * FROM daily_room_status WHERE date = ? AND room_number = ?').get(dateStr, roomNumber);
}

// DEADLINES
function getDeadlines() {
  return db.prepare(`
    SELECT * FROM deadlines 
    ORDER BY 
      is_completed ASC, 
      due_date ASC, 
      CASE priority 
        WHEN 'emergenza' THEN 1 
        WHEN 'urgente' THEN 2 
        WHEN 'normale' THEN 3 
        ELSE 4 
      END
  `).all();
}

function createDeadline(data) {
  const { title, category, due_date, recurrence, priority, notes, room_number } = data;
  const result = db.prepare(`
    INSERT INTO deadlines (title, category, due_date, recurrence, priority, notes, room_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title, category || 'Général', due_date, recurrence || 'nessuna', priority || 'normale', notes || '', room_number || '');
  return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(result.lastInsertRowid);
}

function updateDeadline(id, data) {
  const current = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id);
  if (!current) return null;
  const title = data.title !== undefined ? data.title : current.title;
  const category = data.category !== undefined ? data.category : current.category;
  const due_date = data.due_date !== undefined ? data.due_date : current.due_date;
  const recurrence = data.recurrence !== undefined ? data.recurrence : current.recurrence;
  const priority = data.priority !== undefined ? data.priority : current.priority;
  const notes = data.notes !== undefined ? data.notes : current.notes;
  const room_number = data.room_number !== undefined ? data.room_number : (current.room_number || '');

  db.prepare(`
    UPDATE deadlines
    SET title = ?, category = ?, due_date = ?, recurrence = ?, priority = ?, notes = ?, room_number = ?
    WHERE id = ?
  `).run(title, category, due_date, recurrence, priority, notes, room_number, id);
  return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id);
}

function toggleDeadline(id, completedBy) {
  const current = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id);
  if (!current) return null;

  let newStatus = current.is_completed ? 0 : 1;
  let completedAt = newStatus ? new Date().toISOString() : null;
  let by = newStatus ? (completedBy || 'Adélcia') : '';

  db.prepare(`
    UPDATE deadlines
    SET is_completed = ?, completed_at = ?, completed_by = ?
    WHERE id = ?
  `).run(newStatus, completedAt, by, id);

  let nextItem = null;
  if (newStatus === 1 && current.recurrence && current.recurrence !== 'nessuna') {
    const nextDate = computeNextDate(current.due_date, current.recurrence);
    const nextResult = db.prepare(`
      INSERT INTO deadlines (title, category, due_date, recurrence, priority, notes, room_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(current.title, current.category, nextDate, current.recurrence, current.priority, current.notes, current.room_number || '');
    nextItem = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(nextResult.lastInsertRowid);
  }

  return {
    updated: db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id),
    next: nextItem
  };
}

function computeNextDate(dateStr, recurrence) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  if (recurrence === 'giornaliera') {
    d.setDate(d.getDate() + 1);
  } else if (recurrence === 'settimanale') {
    d.setDate(d.getDate() + 7);
  } else if (recurrence === 'mensile') {
    d.setMonth(d.getMonth() + 1);
  } else if (recurrence === 'trimestrale') {
    d.setMonth(d.getMonth() + 3);
  } else if (recurrence === 'semestrale') {
    d.setMonth(d.getMonth() + 6);
  } else if (recurrence === 'annuale') {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d.toISOString().split('T')[0];
}

function deleteDeadline(id) {
  db.prepare('DELETE FROM deadlines WHERE id = ?').run(id);
  return { success: true, id };
}

// SHOPPING ITEMS
function getShoppingItems() {
  const items = db.prepare('SELECT * FROM shopping_items').all();
  return items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
}

function createShoppingItem(item) {
  const name = (item.name || '').trim();
  const category = (item.category || 'Nettoyage & Entretien').trim();
  const sort_order = Number(item.sort_order) || 0;
  const result = db.prepare(`
    INSERT INTO shopping_items (name, category, sort_order)
    VALUES (?, ?, ?)
  `).run(name, category, sort_order);
  return db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(result.lastInsertRowid);
}

function updateShoppingItem(id, item) {
  const current = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
  if (!current) return null;
  const newName = item.name !== undefined ? item.name.trim() : current.name;
  const newCat = item.category !== undefined ? item.category.trim() : current.category;
  const newSort = item.sort_order !== undefined ? Number(item.sort_order) : current.sort_order;
  const newChecked = item.is_checked !== undefined ? (item.is_checked ? 1 : 0) : current.is_checked;

  db.prepare(`
    UPDATE shopping_items
    SET name = ?, category = ?, sort_order = ?, is_checked = ?
    WHERE id = ?
  `).run(newName, newCat, newSort, newChecked, id);

  return db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
}

function toggleShoppingItem(id, is_checked) {
  const current = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
  if (!current) return null;
  const val = is_checked !== undefined ? (is_checked ? 1 : 0) : (current.is_checked ? 0 : 1);
  db.prepare('UPDATE shopping_items SET is_checked = ? WHERE id = ?').run(val, id);
  return db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
}

function resetShoppingChecklist() {
  db.prepare('UPDATE shopping_items SET is_checked = 0').run();
  return { success: true };
}

function deleteShoppingItem(id) {
  db.prepare('DELETE FROM shopping_items WHERE id = ?').run(id);
  return { success: true, id };
}

// EXPENSES (SUIVI DES ACHATS & DÉPENSES)
function getExpenses() {
  return db.prepare('SELECT * FROM expenses ORDER BY id DESC').all();
}

function addExpense({ request_date, product_name, category, quantity, purchase_date, price_ttc, requested_by, notes }) {
  const q = quantity !== undefined && quantity !== null && !isNaN(quantity) ? Number(quantity) : 1;
  const p = price_ttc !== undefined && price_ttc !== null && price_ttc !== '' && !isNaN(price_ttc) ? Number(price_ttc) : null;
  const reqDate = request_date || new Date().toISOString().slice(0, 10);

  const result = db.prepare(`
    INSERT INTO expenses (request_date, product_name, category, quantity, purchase_date, price_ttc, requested_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reqDate,
    product_name || 'Article',
    category || '',
    q,
    purchase_date || '',
    p,
    requested_by || '',
    notes || ''
  );

  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
}

function updateExpense(id, updates) {
  const current = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!current) return null;

  const product_name = updates.product_name !== undefined ? updates.product_name : current.product_name;
  const category = updates.category !== undefined ? updates.category : current.category;
  const quantity = updates.quantity !== undefined && !isNaN(updates.quantity) ? Number(updates.quantity) : current.quantity;
  const purchase_date = updates.purchase_date !== undefined ? updates.purchase_date : current.purchase_date;
  const price_ttc = updates.price_ttc !== undefined ? (updates.price_ttc === null || updates.price_ttc === '' || isNaN(updates.price_ttc) ? null : Number(updates.price_ttc)) : current.price_ttc;
  const notes = updates.notes !== undefined ? updates.notes : current.notes;
  const request_date = updates.request_date !== undefined ? updates.request_date : current.request_date;

  db.prepare(`
    UPDATE expenses
    SET product_name = ?, category = ?, quantity = ?, purchase_date = ?, price_ttc = ?, notes = ?, request_date = ?
    WHERE id = ?
  `).run(product_name, category, quantity, purchase_date, price_ttc, notes, request_date, id);

  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
}

function deleteExpense(id) {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  return { success: true, id };
}

// LEAVE & VACATION REQUESTS
function getLeaveRequests() {
  return db.prepare('SELECT * FROM leave_requests ORDER BY start_date ASC, id ASC').all();
}

function getLeaveRequestById(id) {
  return db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id);
}

function addLeaveRequest({ type, start_date, end_date = '', dates_json = '[]', user_name = 'Adélcia', notes = '' }) {
  const reqType = type === 'vacances' ? 'vacances' : 'conge';
  const sDate = start_date || new Date().toISOString().split('T')[0];
  const eDate = reqType === 'vacances' ? (end_date || sDate) : '';
  const dJson = typeof dates_json === 'string' ? dates_json : JSON.stringify(dates_json || []);

  const result = db.prepare(`
    INSERT INTO leave_requests (type, start_date, end_date, dates_json, user_name, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, 'en_attente')
  `).run(reqType, sDate, eDate, dJson, user_name || 'Adélcia', notes || '');

  return getLeaveRequestById(result.lastInsertRowid);
}

function updateLeaveRequest(id, updates) {
  const current = getLeaveRequestById(id);
  if (!current) return null;

  const type = updates.type !== undefined ? updates.type : current.type;
  const start_date = updates.start_date !== undefined ? updates.start_date : current.start_date;
  const end_date = updates.end_date !== undefined ? updates.end_date : current.end_date;
  const dates_json = updates.dates_json !== undefined ? (typeof updates.dates_json === 'string' ? updates.dates_json : JSON.stringify(updates.dates_json)) : current.dates_json;
  const notes = updates.notes !== undefined ? updates.notes : current.notes;
  const status = updates.status !== undefined ? updates.status : current.status;
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE leave_requests
    SET type = ?, start_date = ?, end_date = ?, dates_json = ?, notes = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(type, start_date, end_date, dates_json, notes, status, nowIso, id);

  return getLeaveRequestById(id);
}

function deleteLeaveRequest(id) {
  db.prepare('DELETE FROM leave_requests WHERE id = ?').run(id);
  return { success: true, id };
}

function markLeaveRequestAsSent(id) {
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE leave_requests
    SET status = 'envoye', sent_at = ?, updated_at = ?
    WHERE id = ?
  `).run(nowIso, nowIso, id);

  return getLeaveRequestById(id);
}

module.exports = {
  db,
  getMessages,
  cleanupExpiredMessages,
  addMessage,
  answerYesNoQuestion,
  answerChoiceQuestion,
  deleteMessage,
  markMessagesAsRead,
  getQuickReplies,
  getOrders,
  getArchivedOrders,
  createOrder,
  updateOrder,
  updateOrderStatus,
  toggleArchiveOrder,
  deleteOrder,
  getDailyRoomStatus,
  updateDailyRoomStatus,
  getDeadlines,
  createDeadline,
  updateDeadline,
  toggleDeadline,
  deleteDeadline,
  getShoppingItems,
  createShoppingItem,
  updateShoppingItem,
  toggleShoppingItem,
  resetShoppingChecklist,
  deleteShoppingItem,
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getLeaveRequests,
  getLeaveRequestById,
  addLeaveRequest,
  updateLeaveRequest,
  deleteLeaveRequest,
  markLeaveRequestAsSent
};

