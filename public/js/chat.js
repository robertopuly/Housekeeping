// chat.js - Module de Discussion / Chat Bidirectionnel
(function() {
  'use strict';

  let messages = [];
  let quickReplies = [];
  let unreadCount = 0;

  let currentReply = null;
  let activeActionMsg = null;

  let isTypingLocal = false;
  let stopTypingTimeout = null;
  let remoteTypingTimeout = null;
  let typingUsers = new Set();

async function initChat() {
  await loadQuickReplies();
  await loadMessages();
  setupChatEvents();
  setupMessageActionEvents();
  initEmojiPicker();
}

async function loadMessages() {
  try {
    const res = await fetch('/api/messages');
    if (res.ok) {
      messages = await res.json();
      renderMessages();
      scrollToBottom();
      if (window.App && window.App.getActiveTab() === 'tab-chat') {
        markAsReadOnServer();
      }
    }
  } catch (err) {
    console.error('Erreur chargement messages:', err);
  }
}

async function loadQuickReplies() {
  try {
    const res = await fetch('/api/quick-replies');
    if (res.ok) {
      quickReplies = await res.json();
      renderQuickReplies();
    }
  } catch (err) {
    console.error('Erreur chargement réponses rapides:', err);
  }
}

function renderQuickReplies() {
  const container = document.getElementById('quick-replies-container');
  if (!container) return;

  container.innerHTML = quickReplies.map(qr => {
    const label = qr.label || (qr.text.includes('pour le contrôle') ? qr.text.replace(' pour le contrôle', '') : qr.text);
    return `
      <button type="button" class="chip-btn" data-reply="${escapeHtml(qr.text)}">
        ${escapeHtml(label)}
      </button>
    `;
  }).join('');

  container.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-reply');
      sendMessage(text);
    });
  });
}

function parseShoppingMessage(text) {
  if (!text || !text.includes('LISTE DE COURSES & ACHATS')) return null;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let sender = '', recipient = '', date = '', notes = '', items = [];
  let isNotes = false, isItems = false;

  for (const line of lines) {
    if (line.includes('De :')) {
      sender = line.replace(/.*De\s*:\s*/, '');
    } else if (line.includes('Pour :')) {
      recipient = line.replace(/.*Pour\s*:\s*/, '');
    } else if (line.includes('Date :')) {
      date = line.replace(/.*Date\s*:\s*/, '');
    } else if (line.includes('Notes & Consignes')) {
      isNotes = true;
      isItems = false;
    } else if (line.includes('Articles à acheter')) {
      isNotes = false;
      isItems = true;
    } else if (isNotes) {
      notes += (notes ? '\n' : '') + line;
    } else if (isItems || /^\d+\.\s*✅/.test(line)) {
      const match = line.match(/^\d+\.\s*✅\s*([^_]+)(?:_\(([^)]+)\)_)?/);
      if (match) {
        items.push({ name: match[1].trim(), category: match[2] ? match[2].trim() : '' });
      } else {
        items.push({ name: line.replace(/^\d+\.\s*✅\s*/, '').trim(), category: '' });
      }
    }
  }
  return { sender, recipient, date, notes, items };
}

const REGEX_ONLY_EMOJI = /^[\s\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f\u20e3\u{1F1E6}-\u{1F1FF}]+$/u;
const REGEX_EMOJI_MATCH = /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

function getEmojiInfo(text) {
  if (!text) return { isOnly: false, count: 0 };
  const trimmed = text.trim();
  if (!trimmed) return { isOnly: false, count: 0 };
  const isOnly = REGEX_ONLY_EMOJI.test(trimmed);
  const matches = trimmed.match(REGEX_EMOJI_MATCH) || [];
  return { isOnly, count: matches.length };
}

function formatChatMessage(text, isMe, emojiInfo) {
  if (!text) return '';
  if (text.includes('LISTE DE COURSES & ACHATS')) {
    const parsed = parseShoppingMessage(text);
    if (parsed && parsed.items.length > 0) {
      const itemsHtml = parsed.items.map((it, idx) => `
        <div class="chat-shop-row">
          <span class="chat-shop-idx">${idx + 1}.</span>
          <span class="chat-shop-check">✅</span>
          <span class="chat-shop-name">${escapeHtml(it.name)}</span>
          ${it.category ? `<span class="chat-shop-cat">${escapeHtml(it.category)}</span>` : ''}
        </div>
      `).join('');

      let notesHtml = '';
      if (parsed.notes) {
        notesHtml = `
          <div class="chat-shop-notes-box">
            <div class="chat-shop-notes-label">📝 <strong>Notes & Consignes :</strong></div>
            <div class="chat-shop-notes-text">${escapeHtml(parsed.notes)}</div>
          </div>
        `;
      }

      return `
        <div class="chat-shop-card ${isMe ? 'chat-shop-out' : 'chat-shop-in'}">
          <div class="chat-shop-header">
            <div class="chat-shop-badge">🛒 LISTE DE COURSES & ACHATS</div>
          </div>
          <div class="chat-shop-meta-line">
            <span>👤 De : <strong>${escapeHtml(parsed.sender || '')}</strong></span>
            <span>🎯 Pour : <strong>${escapeHtml(parsed.recipient || '')}</strong></span>
            ${parsed.date ? `<span>📅 ${escapeHtml(parsed.date)}</span>` : ''}
          </div>
          ${notesHtml}
          <div class="chat-shop-subtitle">📦 Articles à acheter (${parsed.items.length}) :</div>
          <div class="chat-shop-list">
            ${itemsHtml}
          </div>
        </div>
      `;
    }
  }

  // Émoticônes seules : affichage agrandi au moins 2.5x
  const info = emojiInfo || getEmojiInfo(text);
  if (info.isOnly && info.count > 0 && info.count <= 10) {
    const sizeClass = info.count === 1 ? 'msg-emoji-single' : (info.count <= 4 ? 'msg-emoji-multi' : 'msg-emoji-large');
    return `<span class="msg-emoji-jumbo ${sizeClass}">${escapeHtml(text.trim())}</span>`;
  }

  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  escaped = escaped.replace(REGEX_EMOJI_MATCH, '<span class="chat-inline-emoji">$&</span>');
  escaped = escaped.replace(/\n/g, '<br>');
  return escaped;
}

function parseMessageDate(raw) {
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

function renderMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const currentUser = window.App ? window.App.getCurrentUser() : '';
  let html = '';
  let lastDateStr = '';

  messages.forEach(msg => {
    const date = parseMessageDate(msg.timestamp);
    const dateStr = date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Zurich'
    });
    const timeStr = date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Zurich'
    });

    if (dateStr !== lastDateStr) {
      html += `<div class="chat-date-divider"><span>${dateStr}</span></div>`;
      lastDateStr = dateStr;
    }

    const isMe = msg.sender && currentUser && msg.sender.toLowerCase() === currentUser.toLowerCase();
    const isSystem = msg.sender && (msg.sender.toLowerCase() === 'système' || msg.sender.toLowerCase() === 'sistema');
    const isDeleted = msg.is_deleted === 1 || msg.text === 'Message supprimé';

    if (isSystem) {
      html += `
        <div class="message message-system">
          <span class="system-bubble">ℹ️ ${escapeHtml(msg.text)}</span>
        </div>
      `;
    } else if (isDeleted) {
      html += `
        <div class="message ${isMe ? 'message-out' : 'message-in'} message-deleted">
          ${!isMe ? `<div class="msg-avatar msg-avatar-deleted">${escapeHtml((msg.sender || 'A').charAt(0).toUpperCase())}</div>` : ''}
          <div class="bubble bubble-deleted">
            <span class="deleted-icon">🚫</span>
            <span class="deleted-text">Message supprimé</span>
            <span class="msg-time deleted-time">${timeStr}</span>
          </div>
        </div>
      `;
    } else {
      const replyText = msg.reply_to_text || (msg.reply_to && msg.reply_to.text) || '';
      const replySender = msg.reply_to_sender || (msg.reply_to && msg.reply_to.sender) || 'Message';

      let replyHtml = '';
      if (replyText) {
        replyHtml = `
          <div class="reply-quote-bubble">
            <span class="reply-quote-sender">↩ ${escapeHtml(replySender)}</span>
            <span class="reply-quote-text">${escapeHtml(replyText)}</span>
          </div>
        `;
      }

      const emojiInfo = getEmojiInfo(msg.text);
      const isOnlyEmoji = emojiInfo.isOnly && emojiInfo.count > 0 && emojiInfo.count <= 10;
      const hasReply = !!replyText;
      const bubbleEmojiClass = (isOnlyEmoji && !hasReply) ? 'bubble-emoji-only' : '';

      if (isMe) {
        const isRead = msg.is_read === 1;
        const statusIcon = isRead ? '✓✓' : '✓';
        const statusClass = isRead ? 'msg-status-read' : 'msg-status-sent';
        const statusTitle = isRead ? 'Vu par le destinataire' : 'Envoyé / Reçu par le serveur';

        html += `
          <div class="message message-out message-clickable" data-msg-id="${msg.id}">
            <div class="bubble bubble-out ${bubbleEmojiClass}">
              ${replyHtml}
              <div class="msg-text ${isOnlyEmoji ? 'msg-text-only-emoji' : ''}">${formatChatMessage(msg.text, true, emojiInfo)}</div>
              <div class="msg-meta">
                <span class="msg-time">${timeStr}</span>
                <span class="msg-status ${statusClass}" title="${statusTitle}">${statusIcon}</span>
              </div>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="message message-in message-clickable" data-msg-id="${msg.id}">
            <div class="msg-avatar">${escapeHtml((msg.sender || 'A').charAt(0).toUpperCase())}</div>
            <div class="bubble bubble-in ${bubbleEmojiClass}">
              <div class="msg-sender">${escapeHtml(msg.sender)}</div>
              ${replyHtml}
              <div class="msg-text ${isOnlyEmoji ? 'msg-text-only-emoji' : ''}">${formatChatMessage(msg.text, false, emojiInfo)}</div>
              <div class="msg-meta">
                <span class="msg-time">${timeStr}</span>
              </div>
            </div>
          </div>
        `;
      }
    }
  });

  container.innerHTML = html;
  attachMessageClickEvents();
  renderTypingIndicator();
}

function attachMessageClickEvents() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  container.querySelectorAll('.message-clickable').forEach(el => {
    el.addEventListener('click', () => {
      const msgId = parseInt(el.getAttribute('data-msg-id'), 10);
      const msg = messages.find(m => m.id === msgId);
      if (msg) {
        openMessageActionsModal(msg);
      }
    });
  });
}

function openMessageActionsModal(msg) {
  activeActionMsg = msg;
  const modal = document.getElementById('modal-message-actions');
  const preview = document.getElementById('msg-action-preview-text');

  if (preview) {
    preview.innerHTML = `<strong>${escapeHtml(msg.sender)}:</strong> "${escapeHtml(msg.text)}"`;
  }

  if (modal) {
    modal.style.setProperty('display', 'flex', 'important');
    modal.classList.add('modal-active');
  }
}

function closeMessageActionsModal() {
  const modal = document.getElementById('modal-message-actions');
  if (modal) {
    modal.style.setProperty('display', 'none', 'important');
    modal.classList.remove('modal-active');
  }
}

window.openMessageActionsModal = openMessageActionsModal;
window.closeMessageActionsModal = closeMessageActionsModal;

function setupMessageActionEvents() {
  const btnClose = document.getElementById('btn-close-msg-actions');
  const btnReply = document.getElementById('btn-action-reply');
  const btnDelete = document.getElementById('btn-action-delete');
  const btnCancelReply = document.getElementById('btn-cancel-reply');

  if (btnClose) btnClose.addEventListener('click', closeMessageActionsModal);

  if (btnReply) {
    btnReply.addEventListener('click', () => {
      if (!activeActionMsg) return;
      setReplyTo(activeActionMsg);
      closeMessageActionsModal();
    });
  }

  if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
      if (!activeActionMsg) return;
      if (confirm('Êtes-vous sûr de vouloir supprimer ce message ?')) {
        const idToDelete = activeActionMsg.id;
        closeMessageActionsModal();
        try {
          await fetch(`/api/messages/${idToDelete}`, { method: 'DELETE' });
        } catch (err) {
          console.error('Erreur suppression message:', err);
        }
      }
    });
  }

  if (btnCancelReply) {
    btnCancelReply.addEventListener('click', () => {
      clearReplyTo();
    });
  }
}

function setReplyTo(msg) {
  currentReply = {
    id: msg.id,
    sender: msg.sender,
    text: msg.text
  };

  const bar = document.getElementById('chat-reply-bar');
  const senderEl = document.getElementById('reply-sender-name');
  const textEl = document.getElementById('reply-text-preview');
  const input = document.getElementById('chat-input');

  if (senderEl) senderEl.textContent = msg.sender;
  if (textEl) textEl.textContent = msg.text;
  if (bar) bar.style.display = 'flex';

  if (input) input.focus();
}

function clearReplyTo() {
  currentReply = null;
  const bar = document.getElementById('chat-reply-bar');
  if (bar) bar.style.display = 'none';
}

function scrollToBottom(smooth = false) {
  const container = document.getElementById('chat-messages');
  if (container) {
    if (smooth) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }
}

async function sendMessage(customText = null) {
  const input = document.getElementById('chat-input');
  const text = customText !== null ? customText : (input ? input.value.trim() : '');
  if (!text) return;

  const sender = window.App ? window.App.getCurrentUser() : 'Roberto';
  const replyPayload = currentReply ? { ...currentReply } : null;

  if (input && customText === null) {
    input.value = '';
    input.focus();
  }

  if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
  sendTypingStatus(false);

  clearReplyTo();
  closeEmojiPicker();

  if (window.SoundEngine) {
    window.SoundEngine.playSentSound();
  }

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender,
        text,
        reply_to: replyPayload
      })
    });

    if (!res.ok) {
      console.error('Erreur envoi message');
    }
  } catch (err) {
    console.error('Erreur envoi message:', err);
  }
}

function sendTypingStatus(isTyping) {
  const socket = window.SocketClient ? window.SocketClient.getSocket() : null;
  const user = window.App ? window.App.getCurrentUser() : 'Roberto';
  if (socket && isTypingLocal !== isTyping) {
    isTypingLocal = isTyping;
    socket.emit('chat:typing', { user, isTyping });
  }
}

function handleInputChange() {
  const input = document.getElementById('chat-input');
  if (!input) return;

  const hasText = input.value.trim().length > 0;
  if (hasText) {
    sendTypingStatus(true);
    if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
    stopTypingTimeout = setTimeout(() => {
      sendTypingStatus(false);
    }, 2500);
  } else {
    if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
    sendTypingStatus(false);
  }
}

function onTypingStatus({ user, isTyping }) {
  const currentUser = window.App ? window.App.getCurrentUser() : '';
  if (!user || user.toLowerCase() === currentUser.toLowerCase()) return;

  if (isTyping) {
    typingUsers.add(user);
  } else {
    typingUsers.delete(user);
  }

  renderTypingIndicator();

  // Sécurité : masquer automatiquement après 4.5s d'inactivité
  if (remoteTypingTimeout) clearTimeout(remoteTypingTimeout);
  if (typingUsers.size > 0) {
    remoteTypingTimeout = setTimeout(() => {
      typingUsers.clear();
      renderTypingIndicator();
    }, 4500);
  }
}

function renderTypingIndicator() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  let indicatorEl = document.getElementById('chat-typing-indicator');

  if (typingUsers.size === 0) {
    if (indicatorEl) indicatorEl.remove();
    return;
  }

  const names = Array.from(typingUsers);
  const textLabel = names.length === 1 
    ? `<strong>${escapeHtml(names[0])}</strong> est en train d’écrire`
    : `<strong>${escapeHtml(names.join(', '))}</strong> sont en train d’écrire`;
  const avatarChar = (names[0] || 'A').charAt(0).toUpperCase();

  if (!indicatorEl) {
    indicatorEl = document.createElement('div');
    indicatorEl.id = 'chat-typing-indicator';
    indicatorEl.className = 'typing-indicator-row';
    container.appendChild(indicatorEl);
  }

  indicatorEl.innerHTML = `
    <div class="msg-avatar typing-avatar">${escapeHtml(avatarChar)}</div>
    <div class="typing-bubble">
      <span class="typing-text">${textLabel}</span>
      <span class="typing-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </span>
    </div>
  `;

  scrollToBottom(true);
}

function onMessageReceived(msg) {
  if (msg.sender) {
    typingUsers.delete(msg.sender);
    renderTypingIndicator();
  }

  messages.push(msg);
  renderMessages();
  scrollToBottom(true);

  const currentUser = window.App ? window.App.getCurrentUser() : '';
  const isMe = msg.sender.toLowerCase() === currentUser.toLowerCase();
  const isSystem = msg.sender.toLowerCase() === 'système' || msg.sender.toLowerCase() === 'sistema';

  if (!isMe && !isSystem) {
    if (window.SoundEngine) {
      window.SoundEngine.playMessageSound();
    }

    const isChatActive = window.App ? window.App.getActiveTab() === 'tab-chat' : false;
    if (!isChatActive) {
      unreadCount++;
      updateUnreadBadge();
    } else {
      markAsReadOnServer();
    }
  }
}

function onMessageDeleted(data) {
  const id = typeof data === 'object' && data !== null ? data.id : Number(data);
  const msg = messages.find(m => m.id === id);
  if (msg) {
    msg.is_deleted = 1;
    msg.text = 'Message supprimé';
    msg.reply_to_text = '';
  }
  renderMessages();
}

function onMessagesRead(data) {
  const currentUser = window.App ? window.App.getCurrentUser().toLowerCase() : '';
  let changed = false;
  messages.forEach(m => {
    if (m.sender && m.sender.toLowerCase() === currentUser && !m.is_read) {
      m.is_read = 1;
      changed = true;
    }
  });
  if (changed) {
    renderMessages();
  }
}

function clearUnread() {
  unreadCount = 0;
  updateUnreadBadge();
  markAsReadOnServer();
}

function updateUnreadBadge() {
  const badge = document.getElementById('chat-badge');
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

async function markAsReadOnServer() {
  const user = window.App ? window.App.getCurrentUser() : '';
  try {
    await fetch('/api/messages/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user })
    });
  } catch (e) {}
}

function setupChatEvents() {
  const form = document.getElementById('chat-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  const input = document.getElementById('chat-input');
  if (input) {
    input.addEventListener('input', () => {
      handleInputChange();
    });

    input.addEventListener('blur', () => {
      if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
      sendTypingStatus(false);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
}

/* ==========================================================================
   EMOJI PICKER MODULE
   ========================================================================== */
const EMOJI_CATEGORIES = {
  hotel: [
    '🏨', '🛏️', '🚪', '🔑', '🧹', '🧽', '🧼', '🧺', '🚿', '🚽',
    '🛁', '🪟', '💡', '🔌', '📦', '🗑️', '🍫', '☕', '🍷', '🍽️',
    '🍳', '🥐', '🥛', '🧴', '🪣', '🛎️', '🕒', '📋', '📝', '📍'
  ],
  faces: [
    '😊', '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😉', '😌',
    '😍', '🥰', '😘', '😋', '😎', '🤗', '🤔', '😴', '😮', '🥳',
    '😇', '🧐', '😬', '🫡', '🙄', '🥺', '🤐', '🥱', '😷', '🤒'
  ],
  gestures: [
    '👍', '👎', '👌', '✌️', '🤞', '🤙', '👋', '👏', '🙌', '👐',
    '🤝', '🙏', '💪', '👈', '👉', '👆', '👇', '✋', '🖐️', '👊',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🔥', '⭐', '✨', '💯'
  ],
  status: [
    '✅', '⏳', '❌', '⚠️', '🚨', '🆘', 'ℹ️', '🔔', '📌', '⏰',
    '📅', '💬', '📞', '🛠️', '🔧', '🚗', '🏃', '💨', '☀️', '🌧️',
    '⚡', '🟢', '🟡', '🔴', '⚪', '⚫', '🚩', '🏁', '🏷️', '🔄'
  ]
};

let currentEmojiCat = 'hotel';

function initEmojiPicker() {
  const btnToggle = document.getElementById('btn-emoji-toggle');
  const btnClose = document.getElementById('btn-close-emoji');
  const panel = document.getElementById('emoji-picker-panel');
  const tabs = document.querySelectorAll('.emoji-tab-btn');

  if (btnToggle && panel) {
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = panel.style.display === 'flex';
      if (isVisible) {
        closeEmojiPicker();
      } else {
        openEmojiPicker();
      }
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      closeEmojiPicker();
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const cat = tab.getAttribute('data-cat');
      renderEmojiGrid(cat);
    });
  });

  document.addEventListener('click', (e) => {
    if (panel && panel.style.display === 'flex') {
      const isInside = panel.contains(e.target) || (btnToggle && btnToggle.contains(e.target));
      if (!isInside) {
        closeEmojiPicker();
      }
    }
  });

  renderEmojiGrid(currentEmojiCat);
}

function openEmojiPicker() {
  const panel = document.getElementById('emoji-picker-panel');
  if (panel) {
    panel.style.display = 'flex';
    renderEmojiGrid(currentEmojiCat);
    scrollToBottom();
  }
}

function closeEmojiPicker() {
  const panel = document.getElementById('emoji-picker-panel');
  if (panel) {
    panel.style.display = 'none';
  }
}

function renderEmojiGrid(category) {
  currentEmojiCat = category || 'hotel';
  const grid = document.getElementById('emoji-grid');
  if (!grid) return;

  const emojis = EMOJI_CATEGORIES[currentEmojiCat] || EMOJI_CATEGORIES.hotel;
  grid.innerHTML = emojis.map(em => `
    <button type="button" class="emoji-item-btn" data-emoji="${em}">${em}</button>
  `).join('');

  grid.querySelectorAll('.emoji-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const emoji = btn.getAttribute('data-emoji');
      insertEmoji(emoji);
    });
  });
}

function insertEmoji(emoji) {
  const input = document.getElementById('chat-input');
  if (!input) return;

  const start = input.selectionStart !== null ? input.selectionStart : input.value.length;
  const end = input.selectionEnd !== null ? input.selectionEnd : input.value.length;
  const val = input.value;
  input.value = val.substring(0, start) + emoji + val.substring(end);
  input.focus();
  const newPos = start + emoji.length;
  input.setSelectionRange(newPos, newPos);
  handleInputChange();
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

  window.ChatModule = {
    initChat,
    sendMessage,
    onMessageReceived,
    onMessageDeleted,
    onMessagesRead,
    onTypingStatus,
    clearUnread,
    scrollToBottom
  };
})();