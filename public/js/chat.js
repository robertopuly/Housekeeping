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
  let typingDrafts = {};
  let activeChoiceSelections = {};

async function initChat() {
  await loadQuickReplies();
  await loadMessages();
  setupChatEvents();
  setupMessageActionEvents();
  initEmojiPicker();
  initEphemeralMode();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (window.App && window.App.getActiveTab() === 'tab-chat') {
        clearUnread();
      }
    }
  });
}

async function loadMessages() {
  try {
    const res = await fetch('/api/messages');
    if (res.ok) {
      messages = await res.json();
      renderMessages();
      scrollToBottom();
      if (window.App && window.App.getActiveTab() === 'tab-chat' && document.visibilityState !== 'hidden') {
        markAsReadOnServer();
        checkPendingRewardCelebration();
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

function renderYesNoQuestionHtml(msg, isMe, currentUser) {
  const isRoberto = (currentUser && currentUser.toLowerCase() === 'roberto');
  const status = msg.question_status || 'pending';
  let bodyHtml = '';

  if (status === 'pending') {
    if (isRoberto) {
      bodyHtml = `
        <div class="msg-yesno-pending">
          <span class="yesno-pending-icon">⏳</span>
          <span class="yesno-pending-text">En attente de réponse d’Adélcia...</span>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="msg-yesno-actions-box" onclick="event.stopPropagation()">
          <div class="yesno-prompt-text">Veuillez choisir une réponse :</div>
          <div class="yesno-btn-group">
            <button type="button" class="btn-yesno-choice btn-yesno-oui" onclick="window.ChatModule.submitYesNoAnswer(${msg.id}, 'yes')">
              ✅ OUI
            </button>
            <button type="button" class="btn-yesno-choice btn-yesno-non" onclick="window.ChatModule.submitYesNoAnswer(${msg.id}, 'no')">
              ❌ NON
            </button>
          </div>
        </div>
      `;
    }
  } else if (status === 'yes') {
    if (isRoberto) {
      bodyHtml = `
        <div class="msg-yesno-result result-accepted">
          <div class="result-title">✅ Réponse : ACCEPTATION (OUI)</div>
          <div class="result-sub">Confirmé par ${escapeHtml(msg.answered_by || 'Adélcia')}</div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="msg-yesno-result result-selected">
          <div class="result-title">🔘 Choix sélectionné : <strong>OUI ✅</strong></div>
        </div>
      `;
    }
  } else if (status === 'no') {
    if (isRoberto) {
      bodyHtml = `
        <div class="msg-yesno-result result-refused">
          <div class="result-title">❌ Réponse : REFUS (NON)</div>
          <div class="result-sub">Répondu par ${escapeHtml(msg.answered_by || 'Adélcia')}</div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="msg-yesno-result result-selected">
          <div class="result-title">🔘 Choix sélectionné : <strong>NON ❌</strong></div>
        </div>
      `;
    }
  }

  return `
    <div class="msg-yesno-card ${isMe ? 'card-out' : 'card-in'}" data-question-id="${msg.id}">
      <div class="msg-yesno-header">
        <span class="msg-yesno-badge">❓ Demande de confirmation Oui / Non</span>
      </div>
      ${bodyHtml}
    </div>
  `;
}

function isRienAujourdhuiOption(text) {
  if (!text) return false;
  const s = String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return s.includes('rien') && (s.includes('aujourd') || s.includes('aujord'));
}

function renderChoiceQuestionHtml(msg, isMe, currentUser) {
  const isRoberto = (currentUser && currentUser.toLowerCase() === 'roberto');
  const status = msg.question_status || 'pending';
  let options = [];
  try {
    options = typeof msg.question_options === 'string' ? JSON.parse(msg.question_options) : (msg.question_options || []);
  } catch (e) {
    options = [];
  }
  const selectedOption = msg.selected_option || '';
  const answeredBy = msg.answered_by || 'Adélcia';

  let bodyHtml = '';

  if (status === 'pending') {
    if (isRoberto) {
      bodyHtml = `
        <div class="choice-options-preview">
          ${options.map(opt => `
            <div class="choice-preview-item">
              <span class="choice-bullet">🔘</span>
              <span class="choice-preview-label">${escapeHtml(opt)}</span>
            </div>
          `).join('')}
        </div>
        <div class="msg-choice-pending">
          <span class="choice-pending-icon">⏳</span>
          <span class="choice-pending-text">En attente du choix d’Adélcia...</span>
        </div>
      `;
    } else {
      const currentSelected = activeChoiceSelections[msg.id];
      bodyHtml = `
        <div class="msg-choice-actions-box" onclick="event.stopPropagation()">
          <div class="choice-prompt-text">Sélectionnez une option :</div>
          <div class="choice-options-list" data-choice-msg-id="${msg.id}">
            ${options.map(opt => {
              const isSel = (currentSelected === opt);
              return `
                <div class="choice-option-item ${isSel ? 'selected' : ''}" data-val="${escapeHtml(opt)}" onclick="window.ChatModule.selectChoiceOption(${msg.id}, this)">
                  <span class="choice-radio-bullet">${isSel ? '🔘' : '⚪'}</span>
                  <span class="choice-option-label">${escapeHtml(opt)}</span>
                </div>
              `;
            }).join('')}
          </div>
          <button type="button" class="btn-choice-submit" id="btn-choice-submit-${msg.id}" ${currentSelected ? '' : 'disabled'} onclick="window.ChatModule.submitChoiceAnswer(${msg.id})">
            📤 Envoyer la Réponse
          </button>
        </div>
      `;
    }
  } else {
    if (isRoberto) {
      bodyHtml = `
        <div class="msg-choice-result result-selected-roberto">
          <div class="result-title">🎯 Choix : <strong>${escapeHtml(selectedOption)}</strong></div>
          <div class="result-sub">Sélectionné par ${escapeHtml(answeredBy)}</div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="msg-choice-result result-selected">
          <div class="result-title">🔘 Choix sélectionné : <strong>${escapeHtml(selectedOption)} ✅</strong></div>
        </div>
      `;
    }

    if (isRienAujourdhuiOption(selectedOption)) {
      bodyHtml += `
        <div class="comic-inline-callout" onclick="window.ChatModule.showDisappointedDessertModal()" title="Cliquer pour afficher la réaction complète">
          <div class="comic-callout-avatar">🥺🧁</div>
          <div class="comic-callout-content">
            <div class="comic-callout-bubble">
              « D'accord ! Ce sera pour une autre fois, aujourd'hui pour moi double dessert ! » 🧁🍰
            </div>
            <div class="comic-callout-author">💬 Roberto (Double Dessert !)</div>
          </div>
        </div>
      `;
    }
  }

  const isReward = msg.reward_animation === 1 || msg.reward_animation === '1';

  return `
    <div class="msg-choice-card ${isMe ? 'card-out' : 'card-in'} ${isReward ? 'msg-choice-card-reward' : ''}" data-choice-id="${msg.id}">
      <div class="msg-choice-header">
        <span class="msg-choice-badge ${isReward ? 'msg-choice-badge-reward' : ''}">
          ${isReward ? '🎁 Question Récompense ✨' : '📋 Question à choix multiples'}
        </span>
        ${isReward ? `
          <button type="button" class="btn-replay-reward" onclick="window.ChatModule.replayRewardCelebration(${msg.id})" title="Rejouer l'animation de célébration">
            🎉 Rejouer l'animation
          </button>
        ` : ''}
      </div>
      ${bodyHtml}
    </div>
  `;
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

function renderMsgAvatar(sender, extraClass = '') {
  const norm = (sender && (sender.toLowerCase() === 'adelcia' || sender.toLowerCase() === 'adélcia')) ? 'Adélcia' : 'Roberto';
  const url = (window.App && typeof window.App.getUserAvatarUrl === 'function') ? window.App.getUserAvatarUrl(norm) : '';
  if (url) {
    return `<div class="msg-avatar ${extraClass}"><img src="${escapeHtml(url)}" alt="${escapeHtml(norm)}" class="msg-avatar-img" /></div>`;
  }
  const char = (norm || 'A').charAt(0).toUpperCase();
  return `<div class="msg-avatar ${extraClass}">${escapeHtml(char)}</div>`;
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
    const isDeleted = msg.is_deleted === 1 || msg.text === 'Message supprimé' || msg.text === 'Message supprimé et non lu';

    if (isDeleted) {
      const delTime = msg.deleted_at ? new Date(msg.deleted_at).getTime() : (msg.timestamp ? new Date(msg.timestamp).getTime() : 0);
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
      if (delTime && (Date.now() - delTime >= TWO_HOURS_MS)) {
        // Le texte "Message supprimé" disparaît après 2 heures
        return;
      }
    }

    if (isSystem) {
      html += `
        <div class="message message-system">
          <span class="system-bubble">ℹ️ ${escapeHtml(msg.text)}</span>
        </div>
      `;
    } else if (isDeleted) {
      const isUnreadDeleted = msg.text === 'Message supprimé et non lu' || (typeof msg.text === 'string' && msg.text.toLowerCase().includes('non lu'));
      const deletedLabel = isUnreadDeleted ? 'Message supprimé et non lu' : 'Message supprimé';
      const deletedIcon = isUnreadDeleted ? '⏳🚫' : '🚫';
      html += `
        <div class="message ${isMe ? 'message-out' : 'message-in'} message-deleted ${isUnreadDeleted ? 'message-deleted-unread' : ''}">
          ${!isMe ? renderMsgAvatar(msg.sender, 'msg-avatar-deleted') : ''}
          <div class="bubble bubble-deleted ${isUnreadDeleted ? 'bubble-deleted-unread' : ''}">
            <span class="deleted-icon">${deletedIcon}</span>
            <span class="deleted-text">${escapeHtml(deletedLabel)}</span>
            <span class="msg-time deleted-time">${timeStr}</span>
          </div>
        </div>
      `;
    } else {
      const replyText = msg.reply_to_text || (msg.reply_to && msg.reply_to.text) || '';
      const replySender = msg.reply_to_sender || (msg.reply_to && msg.reply_to.sender) || 'Message';
      const refId = msg.reply_to_id || (msg.reply_to && msg.reply_to.id) || null;
      let replyImageUrl = msg.reply_to_image_url || (msg.reply_to && msg.reply_to.image_url) || '';

      if (!replyImageUrl && refId) {
        const origMsg = messages.find(m => m.id === refId);
        if (origMsg && origMsg.image_url) {
          replyImageUrl = origMsg.image_url;
        }
      }

      let replyHtml = '';
      if (replyText || replyImageUrl) {
        let displayText = replyText;
        if (!displayText || displayText === '📷 Photo' || displayText === '🎥 Vidéo') {
          if (replyImageUrl) displayText = '📷 [Photo]';
          else displayText = 'Message';
        }

        const photoThumbHtml = replyImageUrl ? `
          <div class="reply-quote-thumb-wrap" data-reply-img="${escapeHtml(replyImageUrl)}" data-reply-sender="${escapeHtml(replySender)}" title="Cliquer pour agrandir la photo">
            <img src="${escapeHtml(replyImageUrl)}" class="reply-quote-thumb" alt="Photo" />
            <span class="reply-quote-thumb-zoom">🔍</span>
          </div>
        ` : '';

        replyHtml = `
          <div class="reply-quote-bubble ${replyImageUrl ? 'has-reply-photo' : ''}" data-reply-id="${refId || ''}" ${replyImageUrl ? `data-reply-img="${escapeHtml(replyImageUrl)}" data-reply-sender="${escapeHtml(replySender)}" title="Cliquer pour agrandir la photo"` : 'title="Message cité"'}>
            <div class="reply-quote-content">
              <span class="reply-quote-sender">↩ ${escapeHtml(replySender)}</span>
              <span class="reply-quote-text">${escapeHtml(displayText)}</span>
            </div>
            ${photoThumbHtml}
          </div>
        `;
      }

      const emojiInfo = getEmojiInfo(msg.text);
      const isOnlyEmoji = emojiInfo.isOnly && emojiInfo.count > 0 && emojiInfo.count <= 10;
      const hasReply = !!(replyText || replyImageUrl);
      const hasImage = !!msg.image_url;
      const hasVideo = !!msg.video_url;
      const bubbleEmojiClass = (isOnlyEmoji && !hasReply && !hasImage && !hasVideo) ? 'bubble-emoji-only' : '';
      const bubbleMediaClass = hasImage ? 'bubble-has-photo' : (hasVideo ? 'bubble-has-video' : '');

      let photoHtml = '';
      if (hasImage) {
        photoHtml = `
          <div class="msg-photo-wrapper" data-img-url="${escapeHtml(msg.image_url)}" data-sender="${escapeHtml(msg.sender)}" data-time="${timeStr}" data-caption="${escapeHtml(msg.text || '')}">
            <img src="${escapeHtml(msg.image_url)}" class="msg-photo-img" alt="Photo" />
            <div class="msg-photo-zoom-hint">🔍 Agrandir</div>
          </div>
        `;
      }

      let videoHtml = '';
      if (hasVideo) {
        videoHtml = `
          <div class="msg-video-wrapper" data-video-url="${escapeHtml(msg.video_url)}" data-sender="${escapeHtml(msg.sender)}" data-time="${timeStr}" data-caption="${escapeHtml(msg.text || '')}">
            <video src="${escapeHtml(msg.video_url)}" class="msg-video-player" controls playsinline preload="metadata"></video>
          </div>
        `;
      }

      const showText = msg.text && (!hasImage || msg.text !== '📷 Photo') && (!hasVideo || msg.text !== '🎥 Vidéo');
      const isYesNoQuestion = (msg.question_type === 'yes_no');
      const yesNoCardHtml = isYesNoQuestion ? renderYesNoQuestionHtml(msg, isMe, currentUser) : '';
      const isChoiceQuestion = (msg.question_type === 'choice');
      const choiceCardHtml = isChoiceQuestion ? renderChoiceQuestionHtml(msg, isMe, currentUser) : '';

      let textToFormat = msg.text;
      if (msg.type === 'yes_no_response') {
        const isYes = String(msg.text).toUpperCase().includes('OUI');
        const isRoberto = (currentUser && currentUser.toLowerCase() === 'roberto');
        if (isRoberto) {
          textToFormat = isYes ? '✅ Acceptation de la demande (OUI)' : '❌ Refus de la demande (NON)';
        } else {
          textToFormat = isYes ? '🔘 Choix sélectionné : OUI ✅' : '🔘 Choix sélectionné : NON ❌';
        }
      } else if (msg.type === 'choice_response') {
        const isRoberto = (currentUser && currentUser.toLowerCase() === 'roberto');
        const optVal = msg.text.replace(/^Choix sélectionné\s*:\s*/i, '');
        if (isRoberto) {
          textToFormat = `🎯 Choix d'${msg.sender || 'Adélcia'} : ${optVal}`;
        } else {
          textToFormat = `🔘 Choix sélectionné : ${optVal} ✅`;
        }
      }

      const captionClass = hasImage ? 'msg-text-photo-caption' : (hasVideo ? 'msg-text-video-caption' : '');

      if (isMe) {
        const isRead = msg.is_read === 1;
        const statusIcon = isRead ? '✓✓' : '✓';
        const statusClass = isRead ? 'msg-status-read' : 'msg-status-sent';
        const statusTitle = isRead ? 'Vu par le destinataire' : 'Envoyé / Reçu par le serveur';
        const ephemeralBadge = (msg.is_ephemeral === 1) ? '<span class="ephemeral-timer-badge" title="Message éphémère (s\'efface 1h après l\'envoi)">⏳ 1h</span>' : '';

        html += `
          <div class="message message-out message-clickable ${msg.is_ephemeral === 1 ? 'message-ephemeral' : ''}" data-msg-id="${msg.id}">
            <div class="bubble bubble-out ${bubbleEmojiClass} ${bubbleMediaClass}">
              ${replyHtml}
              ${photoHtml}
              ${videoHtml}
              ${showText ? `<div class="msg-text ${isOnlyEmoji ? 'msg-text-only-emoji' : ''} ${captionClass}">${formatChatMessage(textToFormat, true, emojiInfo)}</div>` : ''}
              ${yesNoCardHtml}
              ${choiceCardHtml}
              <div class="msg-meta">
                <span class="msg-time">${timeStr}</span>
                ${ephemeralBadge}
                <span class="msg-status ${statusClass}" title="${statusTitle}">${statusIcon}</span>
              </div>
            </div>
          </div>
        `;
      } else {
        const ephemeralBadge = (msg.is_ephemeral === 1) ? '<span class="ephemeral-timer-badge" title="Message éphémère (s\'efface 1h après l\'envoi)">⏳ 1h</span>' : '';
        html += `
          <div class="message message-in message-clickable ${msg.is_ephemeral === 1 ? 'message-ephemeral' : ''}" data-msg-id="${msg.id}">
            ${renderMsgAvatar(msg.sender)}
            <div class="bubble bubble-in ${bubbleEmojiClass} ${bubbleMediaClass}">
              <div class="msg-sender">${escapeHtml(msg.sender)}</div>
              ${replyHtml}
              ${photoHtml}
              ${videoHtml}
              ${showText ? `<div class="msg-text ${isOnlyEmoji ? 'msg-text-only-emoji' : ''} ${captionClass}">${formatChatMessage(textToFormat, false, emojiInfo)}</div>` : ''}
              ${yesNoCardHtml}
              ${choiceCardHtml}
              <div class="msg-meta">
                <span class="msg-time">${timeStr}</span>
                ${ephemeralBadge}
              </div>
            </div>
          </div>
        `;
      }
    }
  });

  container.innerHTML = html + '<div id="chat-bottom-anchor" style="height: 1px; width: 100%; pointer-events: none; clear: both;"></div>';
  attachMessageClickEvents();
  attachPhotoClickEvents();
  renderTypingIndicator();

  // Écoute le chargement des images et vidéos pour garantir le défilement en bas dès qu'elles sont rendues
  container.querySelectorAll('.msg-photo-img, .msg-video-player').forEach(el => {
    if (el.tagName === 'IMG') {
      if (!el.complete) {
        el.addEventListener('load', () => scrollToBottom(false), { once: true });
        el.addEventListener('error', () => scrollToBottom(false), { once: true });
      }
    } else if (el.tagName === 'VIDEO') {
      if (el.readyState < 1) {
        el.addEventListener('loadedmetadata', () => scrollToBottom(false), { once: true });
      }
    }
  });
}

function attachPhotoClickEvents() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  container.querySelectorAll('.msg-photo-wrapper').forEach(wrapper => {
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      const imgUrl = wrapper.getAttribute('data-img-url');
      const sender = wrapper.getAttribute('data-sender');
      const time = wrapper.getAttribute('data-time');
      const caption = wrapper.getAttribute('data-caption');
      openImageLightbox(imgUrl, sender, time, caption, false);
    });
  });

  // Clic sur l'aperçu photo ou la bulle d'une réponse pour agrandir immédiatement
  container.querySelectorAll('.reply-quote-bubble').forEach(quoteEl => {
    quoteEl.addEventListener('click', (e) => {
      e.stopPropagation(); // Évite formellement d'ouvrir le menu d'action Répondre / Supprimer
      const replyImg = quoteEl.getAttribute('data-reply-img');
      const replySender = quoteEl.getAttribute('data-reply-sender') || 'Photo';
      if (replyImg) {
        openImageLightbox(replyImg, replySender, '', '', false);
        return;
      }
      const replyId = quoteEl.getAttribute('data-reply-id');
      if (replyId) {
        const targetMsg = container.querySelector(`.message[data-msg-id="${replyId}"]`);
        if (targetMsg) {
          targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetMsg.classList.add('message-highlight');
          setTimeout(() => targetMsg.classList.remove('message-highlight'), 1800);
        }
      }
    });
  });

  // Éviter que les contrôles de lecture vidéo ouvrent le menu d'action
  container.querySelectorAll('.msg-video-wrapper video').forEach(vid => {
    vid.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
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
    if (msg.image_url) {
      preview.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="position:relative; width:48px; height:48px; min-width:48px; border-radius:8px; overflow:hidden; border:1px solid #cbd5e1; cursor:pointer;" onclick="event.stopPropagation(); closeMessageActionsModal(); openImageLightbox('${escapeHtml(msg.image_url)}', '${escapeHtml(msg.sender)}', '', '${escapeHtml(msg.text && msg.text !== '📷 Photo' ? msg.text : '')}', false);" title="Cliquer pour agrandir la photo">
            <img src="${escapeHtml(msg.image_url)}" style="width:100%; height:100%; object-fit:cover; display:block;" />
            <span style="position:absolute; bottom:1px; right:1px; font-size:9px; background:rgba(0,0,0,0.6); color:#fff; border-radius:3px; padding:1px 2px;">🔍</span>
          </div>
          <div>
            <strong>${escapeHtml(msg.sender)}:</strong> 📷 [Photo] ${msg.text && msg.text !== '📷 Photo' ? `<br/><span style="font-style:italic;">"${escapeHtml(msg.text)}"</span>` : ''}
          </div>
        </div>
      `;
    } else if (msg.video_url) {
      preview.innerHTML = `<strong>${escapeHtml(msg.sender)}:</strong> 🎥 [Vidéo] ${msg.text && msg.text !== '🎥 Vidéo' ? `"${escapeHtml(msg.text)}"` : ''}`;
    } else {
      let refPhotoHtml = '';
      const refImg = msg.reply_to_image_url || (msg.reply_to && msg.reply_to.image_url);
      if (refImg) {
        refPhotoHtml = `
          <div style="display:flex; align-items:center; gap:8px; margin-top:8px; padding:6px 10px; background:#f1f5f9; border-radius:8px; border-left:3px solid #6366f1; cursor:pointer;" onclick="event.stopPropagation(); closeMessageActionsModal(); openImageLightbox('${escapeHtml(refImg)}', '${escapeHtml(msg.reply_to_sender || 'Photo')}', '', '', false);" title="Cliquer pour agrandir la photo liée">
            <img src="${escapeHtml(refImg)}" style="width:36px; height:36px; object-fit:cover; border-radius:4px;" />
            <span style="font-size:12px; color:#475569;">↩ En réponse à cette photo (Cliquer pour agrandir 🔍)</span>
          </div>
        `;
      }
      preview.innerHTML = `<div><strong>${escapeHtml(msg.sender)}:</strong> "${escapeHtml(msg.text)}"</div>${refPhotoHtml}`;
    }
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
  let repText = msg.text;
  if (!repText || repText === '📷 Photo' || repText === '🎥 Vidéo') {
    if (msg.video_url) repText = '🎥 [Vidéo]';
    else if (msg.image_url) repText = '📷 [Photo]';
  }

  const replyImg = msg.image_url || '';

  currentReply = {
    id: msg.id,
    sender: msg.sender,
    text: repText,
    image_url: replyImg
  };

  const bar = document.getElementById('chat-reply-bar');
  const senderEl = document.getElementById('reply-sender-name');
  const textEl = document.getElementById('reply-text-preview');
  const thumbEl = document.getElementById('reply-thumb-preview');
  const input = document.getElementById('chat-input');

  if (senderEl) senderEl.textContent = msg.sender;
  if (textEl) textEl.textContent = repText;

  if (thumbEl) {
    if (replyImg) {
      thumbEl.src = replyImg;
      thumbEl.style.display = 'block';
      thumbEl.onclick = (e) => {
        e.stopPropagation();
        openImageLightbox(replyImg, msg.sender, '', msg.text && msg.text !== '📷 Photo' ? msg.text : '', false);
      };
    } else {
      thumbEl.src = '';
      thumbEl.style.display = 'none';
      thumbEl.onclick = null;
    }
  }

  if (bar) bar.style.display = 'flex';

  if (input) input.focus();
}

function clearReplyTo() {
  currentReply = null;
  const bar = document.getElementById('chat-reply-bar');
  const thumbEl = document.getElementById('reply-thumb-preview');
  if (thumbEl) {
    thumbEl.src = '';
    thumbEl.style.display = 'none';
    thumbEl.onclick = null;
  }
  if (bar) bar.style.display = 'none';
}

function scrollToBottom(smooth = false) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const performScroll = () => {
    container.scrollTop = container.scrollHeight;
    const anchor = document.getElementById('chat-bottom-anchor');
    if (anchor && typeof anchor.scrollIntoView === 'function') {
      anchor.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  performScroll();
  requestAnimationFrame(performScroll);
  setTimeout(performScroll, 50);
  setTimeout(performScroll, 150);
  setTimeout(performScroll, 350);
  setTimeout(performScroll, 600);
}

async function sendMessage(customText = null) {
  const input = document.getElementById('chat-input');
  const flagYesNo = document.getElementById('chat-flag-yesno');
  const text = customText !== null ? customText : (input ? input.value.trim() : '');
  if (!text) return;

  const sender = window.App ? window.App.getCurrentUser() : 'Roberto';
  const replyPayload = currentReply ? { ...currentReply } : null;
  const isYesNo = (sender.toLowerCase() === 'roberto') && flagYesNo && flagYesNo.checked;

  if (input) {
    if (customText === null) {
      input.value = '';
    }
    const isPC = (window.App && typeof window.App.getPlatform === 'function')
      ? (window.App.getPlatform() === 'PC')
      : document.body.classList.contains('is-pc');

    if (isPC) {
      input.focus();
    } else {
      input.blur();
    }
  }

  if (flagYesNo) {
    flagYesNo.checked = false;
  }

  if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
  sendTypingStatus(false, '');

  clearReplyTo();
  closeEmojiPicker();
  scrollToBottom(false);

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
        reply_to: replyPayload,
        question_type: isYesNo ? 'yes_no' : '',
        is_ephemeral: isEphemeralActive ? 1 : 0
      })
    });

    if (res.ok) {
      scrollToBottom(false);
    } else {
      console.error('Erreur envoi message');
    }
  } catch (err) {
    console.error('Erreur envoi message:', err);
  }
}

async function submitYesNoAnswer(questionId, answer) {
  const currentUser = window.App ? window.App.getCurrentUser() : 'Adélcia';

  const card = document.querySelector(`.msg-yesno-card[data-question-id="${questionId}"]`);
  if (card) {
    const btns = card.querySelectorAll('.btn-yesno-choice');
    btns.forEach(b => {
      b.disabled = true;
      b.style.pointerEvents = 'none';
      b.style.opacity = '0.5';
    });
  }

  if (window.SoundEngine) {
    window.SoundEngine.playSentSound();
  }

  try {
    const res = await fetch(`/api/messages/${questionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answer,
        answered_by: currentUser
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.question) {
        onQuestionAnswered(data);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Erreur lors de la réponse.');
    }
  } catch (err) {
    console.error('Erreur réponse question Oui/Non:', err);
    alert('Erreur réseau. Veuillez réessayer.');
  }
}

function onQuestionAnswered(data) {
  if (!data || !data.question) return;
  const q = data.question;
  const existing = messages.find(m => m.id === q.id);
  if (existing) {
    existing.question_status = q.question_status;
    existing.answered_by = q.answered_by;
    existing.answered_at = q.answered_at;
  }
  renderMessages();
}

function toggleChoiceRewardAnimation() {
  const input = document.getElementById('choice-reward-animation-input');
  const btn = document.getElementById('btn-toggle-reward-anim');
  const badge = document.getElementById('reward-toggle-badge');
  const icon = document.getElementById('reward-toggle-icon');
  if (!input || !btn) return;

  const isCurrentlyActive = input.value === '1';
  const nextState = !isCurrentlyActive;
  input.value = nextState ? '1' : '0';

  if (nextState) {
    btn.classList.add('active');
    if (badge) badge.textContent = '✨ ACTIF';
    if (icon) icon.textContent = '🎉';
    if (window.SoundEngine && typeof window.SoundEngine.playSentSound === 'function') {
      window.SoundEngine.playSentSound();
    }
  } else {
    btn.classList.remove('active');
    if (badge) badge.textContent = 'OFF';
    if (icon) icon.textContent = '🎁';
  }
}

function openChoiceModal() {
  const modal = document.getElementById('modal-chat-choice');
  const questionInput = document.getElementById('choice-question-text');
  const container = document.getElementById('choice-options-inputs-container');
  if (questionInput) questionInput.value = '';

  const rewardInput = document.getElementById('choice-reward-animation-input');
  const rewardBtn = document.getElementById('btn-toggle-reward-anim');
  const rewardBadge = document.getElementById('reward-toggle-badge');
  const rewardIcon = document.getElementById('reward-toggle-icon');
  if (rewardInput) rewardInput.value = '0';
  if (rewardBtn) rewardBtn.classList.remove('active');
  if (rewardBadge) rewardBadge.textContent = 'OFF';
  if (rewardIcon) rewardIcon.textContent = '🎁';

  if (container) {
    container.innerHTML = `
      <div class="choice-opt-input-row">
        <span class="choice-opt-num">1</span>
        <input type="text" class="form-control choice-opt-val" placeholder="Option 1" required />
      </div>
      <div class="choice-opt-input-row">
        <span class="choice-opt-num">2</span>
        <input type="text" class="form-control choice-opt-val" placeholder="Option 2" required />
      </div>
      <div class="choice-opt-input-row">
        <span class="choice-opt-num">3</span>
        <input type="text" class="form-control choice-opt-val" value="Rien aujourd'hui!" placeholder="Option 3" required />
        <button type="button" class="btn-remove-opt" onclick="this.parentElement.remove(); window.ChatModule.renumberChoiceOptions();" title="Supprimer">&times;</button>
      </div>
    `;
  }
  if (modal) {
    modal.style.setProperty('display', 'flex', 'important');
    modal.classList.add('modal-active');
  }
  if (questionInput) {
    setTimeout(() => questionInput.focus(), 100);
  }
}

function closeChoiceModal() {
  const modal = document.getElementById('modal-chat-choice');
  if (modal) {
    modal.style.setProperty('display', 'none', 'important');
    modal.classList.remove('modal-active');
  }
}

function addChoiceOptionInput() {
  const container = document.getElementById('choice-options-inputs-container');
  if (!container) return;
  const count = container.querySelectorAll('.choice-opt-input-row').length + 1;
  const row = document.createElement('div');
  row.className = 'choice-opt-input-row';
  row.innerHTML = `
    <span class="choice-opt-num">${count}</span>
    <input type="text" class="form-control choice-opt-val" placeholder="Option ${count}" required />
    <button type="button" class="btn-remove-opt" onclick="this.parentElement.remove(); window.ChatModule.renumberChoiceOptions();" title="Supprimer">&times;</button>
  `;
  container.appendChild(row);
  const input = row.querySelector('.choice-opt-val');
  if (input) input.focus();
}

function renumberChoiceOptions() {
  const container = document.getElementById('choice-options-inputs-container');
  if (!container) return;
  const rows = container.querySelectorAll('.choice-opt-input-row');
  rows.forEach((row, idx) => {
    const numEl = row.querySelector('.choice-opt-num');
    const input = row.querySelector('.choice-opt-val');
    if (numEl) numEl.textContent = (idx + 1);
    if (input && !input.value) input.placeholder = `Option ${idx + 1}`;
  });
}

async function submitChoiceQuestion(event) {
  if (event) {
    if (event.preventDefault) event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
  }

  const questionEl = document.getElementById('choice-question-text');
  const btnSubmit = document.getElementById('btn-submit-choice-question');
  const optInputs = document.querySelectorAll('.choice-opt-val');

  const question = questionEl ? questionEl.value.trim() : '';
  const options = Array.from(optInputs).map(inp => inp.value.trim()).filter(Boolean);
  const isReward = document.getElementById('choice-reward-animation-input')?.value === '1';

  if (!question) {
    if (questionEl) {
      questionEl.focus();
      questionEl.style.borderColor = '#dc2626';
      setTimeout(() => questionEl.style.borderColor = '', 2000);
    }
    return false;
  }

  if (options.length < 2) {
    alert('Veuillez renseigner au moins 2 options au choix.');
    return false;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Envoi...';
  }

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: 'Roberto',
        text: question,
        question_type: 'choice',
        options: options,
        reward_animation: isReward ? 1 : 0
      })
    });

    if (res.ok) {
      closeChoiceModal();
      if (window.SoundEngine) {
        window.SoundEngine.playSentSound();
      }
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Erreur lors de l\'envoi de la question.');
    }
  } catch (err) {
    console.error('Erreur envoi question à choix multiples:', err);
    alert('Erreur réseau. Veuillez réessayer.');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '📤 Envoyer la Question';
    }
  }
  return false;
}

function selectChoiceOption(questionId, itemEl) {
  const optionValue = itemEl.getAttribute('data-val');
  if (!optionValue) return;

  activeChoiceSelections[questionId] = optionValue;

  const list = itemEl.closest('.choice-options-list');
  if (list) {
    list.querySelectorAll('.choice-option-item').forEach(el => {
      el.classList.remove('selected');
      const bullet = el.querySelector('.choice-radio-bullet');
      if (bullet) bullet.textContent = '⚪';
    });
  }

  itemEl.classList.add('selected');
  const bullet = itemEl.querySelector('.choice-radio-bullet');
  if (bullet) bullet.textContent = '🔘';

  const btn = document.getElementById(`btn-choice-submit-${questionId}`);
  if (btn) {
    btn.disabled = false;
  }
}

async function submitChoiceAnswer(questionId) {
  const currentUser = window.App ? window.App.getCurrentUser() : 'Adélcia';
  const selectedOption = activeChoiceSelections[questionId];

  if (!selectedOption) {
    alert('Veuillez sélectionner une option avant d\'envoyer.');
    return;
  }

  const btn = document.getElementById(`btn-choice-submit-${questionId}`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Envoi...';
  }

  const card = document.querySelector(`.msg-choice-card[data-choice-id="${questionId}"]`);
  if (card) {
    card.querySelectorAll('.choice-option-item').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.7';
    });
  }

  if (window.SoundEngine) {
    window.SoundEngine.playSentSound();
  }

  try {
    const res = await fetch(`/api/messages/${questionId}/choose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selected_option: selectedOption,
        answered_by: currentUser
      })
    });

    if (res.ok) {
      const data = await res.json();
      delete activeChoiceSelections[questionId];
      if (data && data.question) {
        onChoiceAnswered(data);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Erreur lors de l\'enregistrement de votre choix.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '📤 Envoyer la Réponse';
      }
    }
  } catch (err) {
    console.error('Erreur réponse question choix multiples:', err);
    alert('Erreur réseau. Veuillez réessayer.');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📤 Envoyer la Réponse';
    }
  }
}

function onChoiceAnswered(data) {
  if (!data || !data.question) return;
  const q = data.question;
  const existing = messages.find(m => m.id === q.id);
  if (existing) {
    existing.question_status = q.question_status;
    existing.selected_option = q.selected_option;
    existing.answered_by = q.answered_by;
    existing.answered_at = q.answered_at;
  }
  renderMessages();

  if (isRienAujourdhuiOption(q.selected_option)) {
    showDisappointedDessertModal();
  }
}

let lastSentTypingText = '';

function sendTypingStatus(isTyping, text = '') {
  const socket = window.SocketClient ? window.SocketClient.getSocket() : null;
  const user = window.App ? window.App.getCurrentUser() : 'Roberto';
  if (!socket) return;

  const currentText = isTyping ? text : '';
  if (isTypingLocal !== isTyping || lastSentTypingText !== currentText) {
    isTypingLocal = isTyping;
    lastSentTypingText = currentText;
    socket.emit('chat:typing', { user, isTyping, text: currentText });
  }
}

function handleInputChange() {
  const input = document.getElementById('chat-input');
  if (!input) return;

  const currentVal = input.value;
  const hasText = currentVal.trim().length > 0;

  if (hasText) {
    sendTypingStatus(true, currentVal);
    if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
    stopTypingTimeout = setTimeout(() => {
      sendTypingStatus(false, '');
    }, 3500);
  } else {
    if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
    sendTypingStatus(false, '');
  }
}

function onTypingStatus({ user, isTyping, text }) {
  const currentUser = window.App ? window.App.getCurrentUser() : '';
  if (!user || user.toLowerCase() === currentUser.toLowerCase()) return;

  if (isTyping) {
    typingUsers.add(user);
    if (typeof text === 'string') {
      typingDrafts[user] = text;
    }
  } else {
    typingUsers.delete(user);
    delete typingDrafts[user];
  }

  renderTypingIndicator();

  // Sécurité : masquer automatiquement après 5s d'inactivité
  if (remoteTypingTimeout) clearTimeout(remoteTypingTimeout);
  if (typingUsers.size > 0) {
    remoteTypingTimeout = setTimeout(() => {
      typingUsers.clear();
      typingDrafts = {};
      renderTypingIndicator();
    }, 5000);
  }
}

function renderTypingIndicator() {
  const container = document.getElementById('chat-messages');
  const bannerEl = document.getElementById('chat-typing-banner');
  const bannerTextEl = document.getElementById('typing-banner-text');

  const names = Array.from(typingUsers);
  const currentUser = window.App ? window.App.getCurrentUser() : '';
  const isRoberto = (currentUser && currentUser.toLowerCase() === 'roberto');

  if (typingUsers.size === 0) {
    if (bannerEl) bannerEl.style.display = 'none';
    const oldIndicator = document.getElementById('chat-typing-indicator');
    if (oldIndicator) oldIndicator.remove();
    return;
  }

  const textLabel = names.length === 1 
    ? `<strong>${escapeHtml(names[0])}</strong> est en train d’écrire`
    : `<strong>${escapeHtml(names.join(', '))}</strong> sont en train d’écrire`;

  // 1. Pour Adélcia (sur tablette / mobile) :
  // Afficher la bannière TOUJOURS visible au-dessus de la saisie,
  // sans avoir besoin de faire défiler et sans qu'elle soit cachée sous le clavier.
  if (!isRoberto) {
    if (bannerEl) {
      if (bannerTextEl) {
        bannerTextEl.innerHTML = textLabel;
      }
      bannerEl.style.display = 'flex';
    }
    const oldIndicator = document.getElementById('chat-typing-indicator');
    if (oldIndicator) oldIndicator.remove();
    return;
  }

  // 2. Pour Roberto (sur tablette / PC) :
  // Conserver exactement le comportement dans le flux des messages (chat-messages),
  // car Roberto y voit l'aperçu en direct (liveDraft) de ce qu'Adélcia écrit !
  if (bannerEl) bannerEl.style.display = 'none';

  if (!container) return;
  let indicatorEl = document.getElementById('chat-typing-indicator');

  const liveDraft = (isRoberto && names.length === 1 && typeof typingDrafts[names[0]] === 'string' && typingDrafts[names[0]].length > 0)
    ? typingDrafts[names[0]]
    : '';

  if (!indicatorEl) {
    indicatorEl = document.createElement('div');
    indicatorEl.id = 'chat-typing-indicator';
    indicatorEl.className = 'typing-indicator-row';
    container.appendChild(indicatorEl);
  }

  if (liveDraft) {
    const formattedDraft = escapeHtml(liveDraft).replace(/\n/g, '<br>');
    indicatorEl.innerHTML = `
      ${renderMsgAvatar(names[0], 'typing-avatar')}
      <div class="typing-bubble typing-bubble-with-preview">
        <div class="typing-header">
          <span class="typing-text">${textLabel} :</span>
          <span class="typing-dots">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </span>
        </div>
        <div class="typing-live-preview">
          <span class="live-preview-quote">«</span>
          <span class="live-preview-content">${formattedDraft}</span>
          <span class="live-preview-cursor">|</span>
          <span class="live-preview-quote">»</span>
        </div>
      </div>
    `;
  } else {
    indicatorEl.innerHTML = `
      ${renderMsgAvatar(names[0], 'typing-avatar')}
      <div class="typing-bubble">
        <span class="typing-text">${textLabel}</span>
        <span class="typing-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </span>
      </div>
    `;
  }

  scrollToBottom(false);
}

function onMessageReceived(msg) {
  if (msg.sender) {
    typingUsers.delete(msg.sender);
    delete typingDrafts[msg.sender];
    renderTypingIndicator();
  }

  messages.push(msg);
  renderMessages();
  scrollToBottom(false);

  const currentUser = window.App ? window.App.getCurrentUser() : '';
  const isMe = msg.sender && currentUser && msg.sender.toLowerCase() === currentUser.toLowerCase();
  const isSystem = msg.sender && (msg.sender.toLowerCase() === 'système' || msg.sender.toLowerCase() === 'sistema');

  if (!isMe && !isSystem) {
    const isChatActive = window.App ? window.App.getActiveTab() === 'tab-chat' : false;
    const isVisibleAndActive = isChatActive && document.visibilityState !== 'hidden';

    if (!isVisibleAndActive) {
      unreadCount++;
      updateUnreadBadge();
      if (window.SoundEngine) {
        window.SoundEngine.playMessageSound();
      }
    } else {
      markAsReadOnServer();
      const isReward = (msg.reward_animation === 1 || msg.reward_animation === '1');
      if (isReward) {
        checkPendingRewardCelebration(msg);
      } else if (window.SoundEngine) {
        window.SoundEngine.playMessageSound();
      }
    }
  }
}

function onMessageDeleted(data) {
  const id = typeof data === 'object' && data !== null ? data.id : Number(data);
  const text = (typeof data === 'object' && data !== null && data.text) ? data.text : 'Message supprimé';
  const deletedAt = (typeof data === 'object' && data !== null && data.deleted_at) ? data.deleted_at : new Date().toISOString();
  const msg = messages.find(m => m.id === id);
  if (msg) {
    msg.is_deleted = 1;
    msg.text = text;
    msg.deleted_at = deletedAt;
    msg.reply_to_text = '';
    msg.image_url = '';
    msg.video_url = '';
    msg.is_ephemeral = 0;
    msg.expires_at = null;
  }
  renderMessages();
}

function onMessagesExpired(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const idSet = new Set(ids.map(Number));
  const prevLen = messages.length;
  messages = messages.filter(m => !idSet.has(m.id));
  if (messages.length !== prevLen) {
    renderMessages();
  }
}

function checkLocalMessageExpiration() {
  const now = new Date();
  const readExpiredIds = [];
  const unreadExpired = [];

  messages.forEach(m => {
    if (m.is_ephemeral === 1 && m.expires_at) {
      if (new Date(m.expires_at) <= now) {
        if (m.is_read === 1) {
          readExpiredIds.push(m.id);
        } else {
          unreadExpired.push(m);
        }
      }
    }
  });

  if (readExpiredIds.length > 0) {
    onMessagesExpired(readExpiredIds);
  }

  if (unreadExpired.length > 0) {
    unreadExpired.forEach(m => {
      onMessageDeleted({ id: m.id, text: 'Message supprimé et non lu', deleted_at: new Date().toISOString() });
    });
  }

  // Disparition automatique des messages supprimés après 2 heures
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const expiredDeletedIds = [];
  messages.forEach(m => {
    if (m.is_deleted === 1 || m.text === 'Message supprimé' || m.text === 'Message supprimé et non lu') {
      const delTime = m.deleted_at ? new Date(m.deleted_at).getTime() : (m.timestamp ? new Date(m.timestamp).getTime() : 0);
      if (delTime && (now.getTime() - delTime >= TWO_HOURS_MS)) {
        expiredDeletedIds.push(m.id);
      }
    }
  });

  if (expiredDeletedIds.length > 0) {
    onMessagesExpired(expiredDeletedIds);
  }
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

function checkPendingRewardCelebration(specificMsg = null) {
  const currentUser = window.App ? window.App.getCurrentUser() : '';
  const isChatActive = window.App ? window.App.getActiveTab() === 'tab-chat' : false;
  const isVisible = document.visibilityState !== 'hidden';

  if (!isChatActive || !isVisible) return;

  if (specificMsg) {
    const isMe = specificMsg.sender && currentUser && specificMsg.sender.toLowerCase() === currentUser.toLowerCase();
    const isReward = (specificMsg.reward_animation === 1 || specificMsg.reward_animation === '1');
    if (!isMe && isReward) {
      const seenKey = 'hk_reward_seen_' + specificMsg.id;
      if (!localStorage.getItem(seenKey)) {
        localStorage.setItem(seenKey, '1');
        setTimeout(() => {
          showRewardCelebration(specificMsg);
        }, 350);
      }
    }
    return;
  }

  // Scan all messages for any unseen reward question sent to current user
  if (!messages || messages.length === 0) return;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const isMe = m.sender && currentUser && m.sender.toLowerCase() === currentUser.toLowerCase();
    const isReward = (m.reward_animation === 1 || m.reward_animation === '1');
    if (!isMe && isReward) {
      const seenKey = 'hk_reward_seen_' + m.id;
      if (!localStorage.getItem(seenKey)) {
        localStorage.setItem(seenKey, '1');
        setTimeout(() => {
          showRewardCelebration(m);
        }, 400);
        break;
      }
    }
  }
}

function clearUnread() {
  unreadCount = 0;
  updateUnreadBadge();
  markAsReadOnServer();
  checkPendingRewardCelebration();
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

    input.addEventListener('focus', () => {
      // Quando si apre la tastiera virtuale, assicura che l'input rimanga visibile sopra la tastiera
      setTimeout(() => {
        if (window.visualViewport) {
          const offset = Math.max(0, window.innerHeight - window.visualViewport.height);
          if (offset > 60) {
            document.documentElement.style.setProperty('--keyboard-offset', offset + 'px');
            document.documentElement.style.setProperty('--app-height', window.visualViewport.height + 'px');
            document.body.classList.add('keyboard-open');
          }
        }
        scrollToBottom(false);
        try {
          input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (e) {}
      }, 120);

      setTimeout(() => {
        scrollToBottom(false);
      }, 350);
    });

    input.addEventListener('blur', () => {
      if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
      sendTypingStatus(false);
      setTimeout(() => {
        if (!document.activeElement || document.activeElement.id !== 'chat-input') {
          if (!window.visualViewport || (window.innerHeight - window.visualViewport.height) <= 60) {
            document.documentElement.style.setProperty('--keyboard-offset', '0px');
            document.documentElement.style.removeProperty('--app-height');
            document.body.classList.remove('keyboard-open');
          }
        }
      }, 200);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Permette di abbassare la tastiera toccando la cronologia messaggi
  const messagesContainer = document.getElementById('chat-messages');
  if (messagesContainer) {
    messagesContainer.addEventListener('touchstart', () => {
      if (input && document.activeElement === input) {
        input.blur();
      }
    }, { passive: true });
  }

  // Bouton photo / vidéo & inputs fichiers
  const btnPhoto = document.getElementById('btn-chat-photo');
  const photoInput = document.getElementById('chat-photo-input');
  const videoInput = document.getElementById('chat-video-input');
  const mediaInput = document.getElementById('chat-media-input');

  if (btnPhoto) {
    btnPhoto.addEventListener('click', (e) => {
      e.preventDefault();
      openCameraPickerModal();
    });
  }

  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handlePhotoSelected(file);
      }
    });
  }

  if (videoInput) {
    videoInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleVideoSelected(file);
      }
    });
  }

  if (mediaInput) {
    mediaInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        if (file.type.startsWith('video/') || /\.(mp4|mov|webm|3gp|m4v|mkv)$/i.test(file.name)) {
          handleVideoSelected(file);
        } else if (file.type.startsWith('image/')) {
          handlePhotoSelected(file);
        } else {
          alert('Veuillez sélectionner un fichier photo ou vidéo valide.');
        }
      }
    });
  }

  // Raccourci Entrée dans le commentaire photo / vidéo
  const captionInput = document.getElementById('photo-caption-input');
  if (captionInput) {
    captionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitMediaMessage(e);
      }
    });
  }

  // Fermeture des modales avec Échap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCameraPickerModal();
      closePhotoPreviewModal();
      closeImageLightbox();
      closeMessageActionsModal();
    }
  });

  // Maintient le scroll en bas si la fenêtre se redimensionne (ex. clavier virtuel ouvert/fermé ou rotation)
  window.addEventListener('resize', () => {
    if (window.App && typeof window.App.getActiveTab === 'function') {
      if (window.App.getActiveTab() === 'tab-chat') {
        scrollToBottom(false);
      }
    }
  });
}

/* ==========================================================================
   PHOTO & VIDEO CAPTURE & LIGHTBOX MODULE
   ========================================================================== */
let pendingPhotoBase64 = null;
let pendingVideoFile = null;
let pendingVideoObjectUrl = null;
let activeMediaType = 'none'; // 'photo' | 'video'

function openCameraPickerModal() {
  const modal = document.getElementById('modal-camera-picker');
  if (modal) {
    modal.style.setProperty('display', 'flex', 'important');
    modal.classList.add('modal-active');
  }
}

function closeCameraPickerModal() {
  const modal = document.getElementById('modal-camera-picker');
  if (modal) {
    modal.style.setProperty('display', 'none', 'important');
    modal.classList.remove('modal-active');
  }
}

function triggerChatPhotoCapture() {
  closeCameraPickerModal();
  const input = document.getElementById('chat-photo-input');
  if (input) {
    input.value = '';
    input.click();
  }
}

function triggerChatVideoCapture() {
  closeCameraPickerModal();
  const input = document.getElementById('chat-video-input');
  if (input) {
    input.value = '';
    input.click();
  }
}

function triggerChatMediaFile() {
  closeCameraPickerModal();
  const input = document.getElementById('chat-media-input');
  if (input) {
    input.value = '';
    input.click();
  }
}

function handlePhotoSelected(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('Veuillez sélectionner un fichier image valide.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    const rawData = evt.target.result;
    compressImage(rawData, 1600, 1600, 0.85, function(compressedBase64) {
      pendingPhotoBase64 = compressedBase64;
      pendingVideoFile = null;
      activeMediaType = 'photo';
      openMediaPreviewModal({
        type: 'photo',
        src: compressedBase64
      });
    });
  };
  reader.readAsDataURL(file);
}

function handleVideoSelected(file) {
  if (!file) return;
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|3gp|m4v|mkv)$/i.test(file.name)) {
    alert('Veuillez sélectionner un fichier vidéo valide (MP4, WebM, MOV...).');
    return;
  }

  const maxBytes = 100 * 1024 * 1024; // 100 Mo max
  if (file.size > maxBytes) {
    alert('La vidéo est trop volumineuse (maximum 100 Mo). Veuillez filmer une vidéo plus courte.');
    return;
  }

  pendingVideoFile = file;
  pendingPhotoBase64 = null;
  activeMediaType = 'video';

  if (pendingVideoObjectUrl) {
    try { URL.revokeObjectURL(pendingVideoObjectUrl); } catch (e) {}
  }
  pendingVideoObjectUrl = URL.createObjectURL(file);

  openMediaPreviewModal({
    type: 'video',
    src: pendingVideoObjectUrl,
    fileSize: file.size,
    fileName: file.name
  });
}

function compressImage(base64Src, maxWidth, maxHeight, quality, callback) {
  const img = new Image();
  img.onload = function() {
    let width = img.width;
    let height = img.height;

    if (width > maxWidth || height > maxHeight) {
      if (width / height > maxWidth / maxHeight) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      } else {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const compressed = canvas.toDataURL('image/jpeg', quality);
    callback(compressed);
  };
  img.onerror = function() {
    callback(base64Src);
  };
  img.src = base64Src;
}

function openMediaPreviewModal(media) {
  const modal = document.getElementById('modal-photo-preview');
  const img = document.getElementById('photo-preview-img');
  const video = document.getElementById('video-preview-player');
  const titleEl = document.getElementById('media-preview-modal-title');
  const btnSubmit = document.getElementById('btn-submit-photo');
  const badgeEl = document.getElementById('media-preview-badge');
  const captionLabel = document.getElementById('media-caption-label');
  const captionInput = document.getElementById('photo-caption-input');

  if (captionInput) captionInput.value = '';

  if (media && media.type === 'video') {
    activeMediaType = 'video';
    if (img) {
      img.style.display = 'none';
      img.src = '';
    }
    if (video) {
      video.src = media.src;
      video.style.display = 'block';
      video.load();
    }
    if (titleEl) titleEl.textContent = '🎥 Envoyer une Vidéo';
    if (btnSubmit) {
      btnSubmit.textContent = '📤 Envoyer la Vidéo';
      btnSubmit.disabled = false;
    }
    if (captionLabel) captionLabel.textContent = '💬 Commentaire / Explication de la vidéo :';
    if (captionInput) captionInput.placeholder = 'Ex. Chambre 3 : fuite d\'eau sous le lavabo, bruit étrange...';

    if (badgeEl) {
      const sizeMb = (media.fileSize / (1024 * 1024)).toFixed(1);
      badgeEl.innerHTML = `🎥 <strong>Vidéo prête</strong> &bull; ${sizeMb} Mo`;
      badgeEl.style.display = 'inline-flex';
    }
  } else {
    activeMediaType = 'photo';
    if (video) {
      video.style.display = 'none';
      video.pause();
      video.src = '';
    }
    if (img) {
      img.src = media ? media.src : '';
      img.style.display = 'block';
    }
    if (titleEl) titleEl.textContent = '📷 Envoyer une Photo';
    if (btnSubmit) {
      btnSubmit.textContent = '📤 Envoyer la Photo';
      btnSubmit.disabled = false;
    }
    if (captionLabel) captionLabel.textContent = '💬 Commentaire / Explication de la photo :';
    if (captionInput) captionInput.placeholder = 'Ex. Chambre 3 : rideau déchiré, tache sur le matelas...';
    if (badgeEl) badgeEl.style.display = 'none';
  }

  if (modal) {
    modal.style.setProperty('display', 'flex', 'important');
    modal.classList.add('modal-active');
  }

  const isPC = (window.App && typeof window.App.getPlatform === 'function')
    ? (window.App.getPlatform() === 'PC')
    : document.body.classList.contains('is-pc');
  if (isPC && captionInput) {
    setTimeout(() => captionInput.focus(), 150);
  }
}

function openPhotoPreviewModal(base64Data) {
  pendingPhotoBase64 = base64Data;
  pendingVideoFile = null;
  activeMediaType = 'photo';
  openMediaPreviewModal({ type: 'photo', src: base64Data });
}

function closePhotoPreviewModal() {
  const modal = document.getElementById('modal-photo-preview');
  const photoInput = document.getElementById('chat-photo-input');
  const videoInput = document.getElementById('chat-video-input');
  const mediaInput = document.getElementById('chat-media-input');
  const img = document.getElementById('photo-preview-img');
  const video = document.getElementById('video-preview-player');
  const captionInput = document.getElementById('photo-caption-input');
  const badgeEl = document.getElementById('media-preview-badge');
  const chatInput = document.getElementById('chat-input');

  pendingPhotoBase64 = null;
  pendingVideoFile = null;
  activeMediaType = 'none';

  if (pendingVideoObjectUrl) {
    try { URL.revokeObjectURL(pendingVideoObjectUrl); } catch (e) {}
    pendingVideoObjectUrl = null;
  }

  if (photoInput) photoInput.value = '';
  if (videoInput) videoInput.value = '';
  if (mediaInput) mediaInput.value = '';
  if (img) { img.src = ''; img.style.display = 'none'; }
  if (video) { video.pause(); video.src = ''; video.style.display = 'none'; }
  if (badgeEl) badgeEl.style.display = 'none';
  if (captionInput) captionInput.value = '';

  if (modal) {
    modal.style.setProperty('display', 'none', 'important');
    modal.classList.remove('modal-active');
  }

  if (chatInput) {
    const isPC = (window.App && typeof window.App.getPlatform === 'function')
      ? (window.App.getPlatform() === 'PC')
      : document.body.classList.contains('is-pc');
    if (isPC) {
      setTimeout(() => chatInput.focus(), 100);
    } else {
      chatInput.blur();
    }
  }
}

async function submitMediaMessage(event) {
  if (event) event.preventDefault();
  if (activeMediaType === 'video') {
    return submitVideoMessage();
  } else {
    return submitPhotoMessage();
  }
}

async function submitVideoMessage() {
  if (!pendingVideoFile) return;

  const captionInput = document.getElementById('photo-caption-input');
  const btnSubmit = document.getElementById('btn-submit-photo');
  const text = captionInput ? captionInput.value.trim() : '';
  const sender = window.App ? window.App.getCurrentUser() : 'Roberto';
  const replyPayload = currentReply ? { ...currentReply } : null;

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Envoi de la vidéo en cours...';
  }

  if (window.SoundEngine) {
    window.SoundEngine.playSentSound();
  }

  try {
    // 1. Téléversement binaire direct
    const uploadRes = await fetch('/api/upload-media', {
      method: 'POST',
      headers: {
        'Content-Type': pendingVideoFile.type || 'video/mp4',
        'x-file-name': encodeURIComponent(pendingVideoFile.name || 'video.mp4')
      },
      body: pendingVideoFile
    });

    if (!uploadRes.ok) {
      const errData = await uploadRes.json().catch(() => ({}));
      throw new Error(errData.error || 'Échec du téléversement de la vidéo.');
    }

    const uploadData = await uploadRes.json();
    const videoUrl = uploadData.video_url || uploadData.media_url;

    if (!videoUrl) {
      throw new Error('URL de la vidéo non reçue du serveur.');
    }

    // 2. Publication du message dans le chat
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender,
        text: text || '🎥 Vidéo',
        type: 'video',
        video_url: videoUrl,
        reply_to: replyPayload,
        is_ephemeral: isEphemeralActive ? 1 : 0
      })
    });

    if (res.ok) {
      clearReplyTo();
      closePhotoPreviewModal();
      scrollToBottom(false);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Erreur lors de l\'envoi du message vidéo.');
    }
  } catch (err) {
    console.error('Erreur envoi vidéo:', err);
    alert('Erreur lors de l\'envoi de la vidéo : ' + (err.message || 'Erreur réseau'));
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '📤 Envoyer la Vidéo';
    }
  }
}

async function submitPhotoMessage(event) {
  if (event) event.preventDefault();
  if (!pendingPhotoBase64) return;

  const captionInput = document.getElementById('photo-caption-input');
  const btnSubmit = document.getElementById('btn-submit-photo');
  const text = captionInput ? captionInput.value.trim() : '';
  const sender = window.App ? window.App.getCurrentUser() : 'Roberto';
  const replyPayload = currentReply ? { ...currentReply } : null;

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Envoi...';
  }

  if (window.SoundEngine) {
    window.SoundEngine.playSentSound();
  }

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender,
        text: text || '📷 Photo',
        type: 'image',
        image: pendingPhotoBase64,
        reply_to: replyPayload,
        is_ephemeral: isEphemeralActive ? 1 : 0
      })
    });

    if (res.ok) {
      clearReplyTo();
      closePhotoPreviewModal();
      scrollToBottom(false);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Erreur lors de l\'envoi de la photo.');
    }
  } catch (err) {
    console.error('Erreur envoi photo:', err);
    alert('Erreur réseau lors de l\'envoi de la photo.');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '📤 Envoyer la Photo';
    }
  }
}

function openImageLightbox(imgUrl, sender, time, caption, isVideo = false) {
  const modal = document.getElementById('modal-image-lightbox');
  const fullImg = document.getElementById('lightbox-full-img');
  const fullVideo = document.getElementById('lightbox-full-video');
  const senderEl = document.getElementById('lightbox-sender-name');
  const timeEl = document.getElementById('lightbox-time');
  const captionEl = document.getElementById('lightbox-caption');

  if (isVideo) {
    if (fullImg) {
      fullImg.style.display = 'none';
      fullImg.src = '';
    }
    if (fullVideo) {
      fullVideo.style.display = 'block';
      fullVideo.src = imgUrl;
      fullVideo.controls = true;
      fullVideo.play().catch(() => {});
    }
  } else {
    if (fullVideo) {
      fullVideo.style.display = 'none';
      fullVideo.pause();
      fullVideo.src = '';
    }
    if (fullImg) {
      fullImg.style.display = 'block';
      fullImg.src = imgUrl;
    }
  }

  if (senderEl) senderEl.textContent = sender || '';
  if (timeEl) timeEl.textContent = time || '';
  if (captionEl) {
    if (caption && caption !== '📷 Photo' && caption !== '🎥 Vidéo') {
      captionEl.textContent = caption;
      captionEl.style.display = 'block';
    } else {
      captionEl.textContent = '';
      captionEl.style.display = 'none';
    }
  }

  if (modal) {
    modal.style.setProperty('display', 'flex', 'important');
    modal.classList.add('lightbox-active');
  }
}

function closeImageLightbox() {
  const modal = document.getElementById('modal-image-lightbox');
  const fullImg = document.getElementById('lightbox-full-img');
  const fullVideo = document.getElementById('lightbox-full-video');
  if (fullImg) fullImg.src = '';
  if (fullVideo) {
    fullVideo.pause();
    fullVideo.src = '';
  }
  if (modal) {
    modal.style.setProperty('display', 'none', 'important');
    modal.classList.remove('lightbox-active');
  }
}

window.openCameraPickerModal = openCameraPickerModal;
window.closeCameraPickerModal = closeCameraPickerModal;
window.triggerChatPhotoCapture = triggerChatPhotoCapture;
window.triggerChatVideoCapture = triggerChatVideoCapture;
window.triggerChatMediaFile = triggerChatMediaFile;
window.closePhotoPreviewModal = closePhotoPreviewModal;
window.submitMediaMessage = submitMediaMessage;
window.submitPhotoMessage = submitPhotoMessage;
window.closeImageLightbox = closeImageLightbox;
window.openImageLightbox = openImageLightbox;
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

/* ==========================================================================
   MESSAGES ÉPHÉMÈRES (Désactivation auto 30m / Expiration 1h)
   ========================================================================== */
let isEphemeralActive = false;
let ephemeralAutoOffTimeout = null;
const EPHEMERAL_AUTO_OFF_MS = 30 * 60 * 1000; // 30 minutes
const EPHEMERAL_STORAGE_KEY = 'housekeeping_ephemeral_expiry';

function initEphemeralMode() {
  const savedExpiry = localStorage.getItem(EPHEMERAL_STORAGE_KEY);
  if (savedExpiry) {
    const remaining = parseInt(savedExpiry, 10) - Date.now();
    if (remaining > 0) {
      activateEphemeralMode(remaining);
    } else {
      localStorage.removeItem(EPHEMERAL_STORAGE_KEY);
      deactivateEphemeralMode();
    }
  }

  const btnToggle = document.getElementById('btn-ephemeral-toggle');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      toggleEphemeralMode();
    });
  }

  // Vérification périodique de l'expiration locale des messages (toutes les 10s)
  setInterval(checkLocalMessageExpiration, 10000);
}

function toggleEphemeralMode() {
  if (isEphemeralActive) {
    deactivateEphemeralMode();
  } else {
    activateEphemeralMode(EPHEMERAL_AUTO_OFF_MS);
  }
}

function activateEphemeralMode(durationMs = EPHEMERAL_AUTO_OFF_MS) {
  isEphemeralActive = true;
  const expiryTimestamp = Date.now() + durationMs;
  localStorage.setItem(EPHEMERAL_STORAGE_KEY, String(expiryTimestamp));

  if (ephemeralAutoOffTimeout) {
    clearTimeout(ephemeralAutoOffTimeout);
  }
  ephemeralAutoOffTimeout = setTimeout(() => {
    deactivateEphemeralMode();
  }, durationMs);

  updateEphemeralUI();
}

function deactivateEphemeralMode() {
  isEphemeralActive = false;
  localStorage.removeItem(EPHEMERAL_STORAGE_KEY);
  if (ephemeralAutoOffTimeout) {
    clearTimeout(ephemeralAutoOffTimeout);
    ephemeralAutoOffTimeout = null;
  }
  updateEphemeralUI();
}

function updateEphemeralUI() {
  const chatForm = document.getElementById('chat-form');
  const btnToggle = document.getElementById('btn-ephemeral-toggle');
  const chatInput = document.getElementById('chat-input');

  if (chatForm) {
    if (isEphemeralActive) {
      chatForm.classList.add('ephemeral-active');
    } else {
      chatForm.classList.remove('ephemeral-active');
    }
  }

  if (btnToggle) {
    if (isEphemeralActive) {
      btnToggle.classList.add('active');
      btnToggle.title = 'Messages éphémères actifs (1h, arrêt auto dans 30 min) - Cliquer pour désactiver';
    } else {
      btnToggle.classList.remove('active');
      btnToggle.title = 'Activer les messages éphémères (s\'effacent après 1h)';
    }
  }

  if (chatInput) {
    if (isEphemeralActive) {
      chatInput.placeholder = 'Message éphémère (effacé après 1h)...';
    } else {
      chatInput.placeholder = 'Écrire un message...';
    }
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

function onMessagesReset(newMessages) {
  messages = newMessages || [];
  unreadCount = 0;
  updateChatBadge();
  renderMessages();
  scrollToBottom();
}

let lastDisappointedModalTime = 0;

function showDisappointedDessertModal() {
  const now = Date.now();
  if (now - lastDisappointedModalTime < 2500) return;
  lastDisappointedModalTime = now;

  const overlay = document.getElementById('disappointed-dessert-overlay');
  if (!overlay) return;

  overlay.style.display = 'flex';

  if (window.SoundEngine && typeof window.SoundEngine.playDisappointedDessertSound === 'function') {
    window.SoundEngine.playDisappointedDessertSound();
  }
}

function closeDisappointedDessertModal() {
  const overlay = document.getElementById('disappointed-dessert-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

let activeRewardMsgId = null;
let confettiAnimId = null;

function showRewardCelebration(msg) {
  const overlay = document.getElementById('reward-celebration-overlay');
  const questionText = document.getElementById('reward-celebration-question-text');
  if (!overlay) return;

  activeRewardMsgId = msg ? msg.id : null;
  if (questionText && msg) {
    questionText.textContent = `« ${msg.text || ''} »`;
  }

  overlay.style.display = 'flex';
  overlay.classList.add('reward-active');

  if (window.SoundEngine && typeof window.SoundEngine.playRewardSound === 'function') {
    window.SoundEngine.playRewardSound();
  }

  startRewardConfetti();
}

function closeRewardCelebration(goToMessage = false) {
  const overlay = document.getElementById('reward-celebration-overlay');
  if (overlay) {
    overlay.classList.remove('reward-active');
    setTimeout(() => {
      overlay.style.display = 'none';
      stopRewardConfetti();
    }, 200);
  } else {
    stopRewardConfetti();
  }

  if (goToMessage) {
    if (window.App && typeof window.App.switchTab === 'function') {
      window.App.switchTab('tab-chat');
    }
    if (activeRewardMsgId) {
      setTimeout(() => {
        const card = document.querySelector(`.msg-choice-card[data-choice-id="${activeRewardMsgId}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('highlight-pulse');
          setTimeout(() => card.classList.remove('highlight-pulse'), 2000);
        } else {
          scrollToBottom(true);
        }
      }, 300);
    }
  }
}

function replayRewardCelebration(msgId) {
  const msg = messages.find(m => m.id === msgId);
  if (msg) {
    showRewardCelebration(msg);
  }
}

function startRewardConfetti() {
  const canvas = document.getElementById('reward-confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = [
    '#f59e0b', '#fbbf24', '#d97706', // Golds
    '#10b981', '#34d399', '#059669', // Emeralds
    '#ec4899', '#f43f5e', '#ef4444', // Pinks / Reds
    '#8b5cf6', '#6366f1', '#3b82f6'  // Purples / Blues
  ];

  const particleCount = 110;
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 120,
      w: 8 + Math.random() * 10,
      h: 5 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: -3 + Math.random() * 6,
      vy: 3 + Math.random() * 5,
      rot: Math.random() * 360,
      vRot: -6 + Math.random() * 12,
      isStar: Math.random() > 0.65,
      opacity: 1
    });
  }

  let startTime = Date.now();

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const elapsed = Date.now() - startTime;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vRot;

      if (p.y > canvas.height) {
        if (elapsed < 4000) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        } else {
          p.opacity -= 0.025;
        }
      }

      if (p.opacity <= 0) return;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;

      if (p.isStar) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    });

    if (particles.some(p => p.opacity > 0)) {
      confettiAnimId = requestAnimationFrame(draw);
    }
  }

  if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
  confettiAnimId = requestAnimationFrame(draw);
}

function stopRewardConfetti() {
  if (confettiAnimId) {
    cancelAnimationFrame(confettiAnimId);
    confettiAnimId = null;
  }
  const canvas = document.getElementById('reward-confetti-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

  window.ChatModule = {
    initChat,
    sendMessage,
    submitYesNoAnswer,
    onQuestionAnswered,
    openChoiceModal,
    closeChoiceModal,
    addChoiceOptionInput,
    renumberChoiceOptions,
    toggleChoiceRewardAnimation,
    submitChoiceQuestion,
    selectChoiceOption,
    submitChoiceAnswer,
    onChoiceAnswered,
    onMessageReceived,
    onMessageDeleted,
    onMessagesExpired,
    onMessagesReset,
    showRewardCelebration,
    closeRewardCelebration,
    replayRewardCelebration,
    showDisappointedDessertModal,
    closeDisappointedDessertModal,
    toggleEphemeralMode,
    isEphemeralActive: () => isEphemeralActive,
    onMessagesRead,
    onTypingStatus,
    clearUnread,
    checkPendingRewardCelebration,
    scrollToBottom
  };

  window.toggleChoiceRewardAnimation = toggleChoiceRewardAnimation;
  window.closeRewardCelebration = closeRewardCelebration;
  window.showDisappointedDessertModal = showDisappointedDessertModal;
  window.closeDisappointedDessertModal = closeDisappointedDessertModal;
})();