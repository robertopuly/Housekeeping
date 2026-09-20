// deadlines.js - Module Échéances & Checklist des Tâches
(function() {
  'use strict';

  let deadlinesList = [];
  let currentFilter = 'tutte';

async function initDeadlines() {
  setupDeadlineEvents();
  await loadDeadlines();
}

async function loadDeadlines() {
  try {
    const res = await fetch('/api/deadlines');
    if (res.ok) {
      deadlinesList = await res.json();
      renderDeadlines();
      updateDeadlinesBadge();
    }
  } catch (err) {
    console.error('Erreur chargement échéances:', err);
  }
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('#deadlines-filter-bar .filter-btn').forEach(btn => {
    const btnFilter = btn.getAttribute('data-filter');
    btn.classList.toggle('active', btnFilter === filter);
  });
  renderDeadlines();
}

window.setDeadlinesFilter = setFilter;

function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDueDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dateObj = new Date(y, m, d);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      }
    }
  } catch (e) {}
  return dateStr;
}

function renderDeadlines() {
  const container = document.getElementById('deadlines-list');
  if (!container) return;

  const todayStr = getTodayStr();
  let displayItems = [];

  if (currentFilter === 'oggi_scadute') {
    displayItems = deadlinesList.filter(d => !d.is_completed && d.due_date <= todayStr);
  } else if (currentFilter === 'giornaliere') {
    displayItems = deadlinesList.filter(d => d.recurrence === 'giornaliera');
  } else if (currentFilter === 'settimanale') {
    displayItems = deadlinesList.filter(d => d.recurrence === 'settimanale');
  } else if (currentFilter === 'completate') {
    displayItems = deadlinesList.filter(d => d.is_completed === 1);
  } else {
    // 'tutte' - non terminées d'abord, triées par date
    displayItems = [...deadlinesList].sort((a, b) => {
      if (a.is_completed !== b.is_completed) return a.is_completed - b.is_completed;
      return (a.due_date || '').localeCompare(b.due_date || '');
    });
  }

  if (displayItems.length === 0) {
    let emptyMsg = 'Aucun élément présent.';
    if (currentFilter === 'oggi_scadute') {
      emptyMsg = 'Excellent travail ! Aucune tâche en retard ou prévue pour aujourd’hui.';
    } else if (currentFilter === 'giornaliere') {
      emptyMsg = 'Aucune tâche quotidienne configurée.';
    } else if (currentFilter === 'settimanale') {
      emptyMsg = 'Aucune tâche hebdomadaire configurée.';
    } else if (currentFilter === 'completate') {
      emptyMsg = 'Aucune tâche terminée pour le moment.';
    }
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⏰</div>
        <div class="empty-title">Aucune tâche dans cette vue</div>
        <div class="empty-desc">${emptyMsg}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = displayItems.map(item => createDeadlineCardHtml(item, todayStr)).join('');
  attachDeadlineListeners();
}

function createDeadlineCardHtml(item, todayStr) {
  const isCompleted = item.is_completed === 1;
  const isToday = !isCompleted && item.due_date === todayStr;
  const isOverdue = !isCompleted && item.due_date < todayStr;

  let cardClasses = 'card deadline-card';
  let alertBadge = '';

  if (isCompleted) {
    cardClasses += ' deadline-completed';
  } else if (isOverdue) {
    cardClasses += ' deadline-overdue pulse-border-strong';
    alertBadge = '<span class="deadline-alert-badge badge-overdue">⚠️ EN RETARD</span>';
  } else if (isToday) {
    cardClasses += ' deadline-today pulse-border';
    alertBadge = '<span class="deadline-alert-badge badge-today">🚨 AUJOURD\'HUI</span>';
  }

  // Puce de récurrence
  let recurrenceBadge = '';
  if (item.recurrence === 'giornaliera') {
    recurrenceBadge = '<span class="recurrence-chip">🔄 Quotidienne</span>';
  } else if (item.recurrence === 'settimanale') {
    recurrenceBadge = '<span class="recurrence-chip">🔄 Hebdomadaire</span>';
  } else if (item.recurrence === 'mensile') {
    recurrenceBadge = '<span class="recurrence-chip">🔄 Mensuelle</span>';
  }

  // Badge priorité
  let priorityBadge = '';
  if (item.priority === 'emergenza') {
    priorityBadge = '<span class="priority-badge emergenza">🚨 Urgence</span>';
  } else if (item.priority === 'urgente') {
    priorityBadge = '<span class="priority-badge urgente">⚠️ Urgente</span>';
  }

  const formattedDate = formatDueDate(item.due_date);

  let completionInfo = '';
  if (isCompleted) {
    let compTime = '';
    let compDate = '';
    if (item.completed_at) {
      try {
        const s = String(item.completed_at).trim();
        const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') + 'Z' : (s.includes('T') && !s.endsWith('Z') && !s.includes('+') ? s + 'Z' : s);
        const cDate = new Date(iso);
        if (!isNaN(cDate.getTime())) {
          compTime = cDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
          compDate = cDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Zurich' });
        }
      } catch (e) {}
    }
    completionInfo = `
      <div class="completion-meta">
        ✅ Terminée par <strong>${escapeHtml(item.completed_by || 'Opérateur')}</strong> ${compDate ? 'le ' + compDate : ''} ${compTime ? 'à ' + compTime : ''}
      </div>
    `;
  }

  return `
    <div class="${cardClasses}" id="deadline-card-${item.id}">
      <div class="deadline-left">
        <label class="custom-checkbox-wrapper" aria-label="Marquer comme terminée">
          <input type="checkbox" class="deadline-check" data-id="${item.id}" ${isCompleted ? 'checked' : ''}>
          <span class="custom-checkbox"></span>
        </label>
      </div>

      <div class="deadline-content">
        <div class="deadline-header">
          <div class="deadline-category-row">
            <span class="category-tag">📁 ${escapeHtml(item.category || 'Général')}</span>
            ${recurrenceBadge}
            ${priorityBadge}
            ${alertBadge}
          </div>
          <span class="deadline-date ${isToday ? 'date-today' : ''} ${isOverdue ? 'date-overdue' : ''}">
            📅 ${formattedDate}
          </span>
        </div>

        <div class="deadline-title">${escapeHtml(item.title)}</div>
        ${item.notes ? `<div class="deadline-notes">${escapeHtml(item.notes)}</div>` : ''}
        ${completionInfo}

        <div class="deadline-actions">
          <button type="button" class="btn btn-secondary btn-delete-deadline" data-id="${item.id}" style="padding: 4px 8px; font-size: 11px;">
            🗑️ Supprimer
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachDeadlineListeners() {
  const container = document.getElementById('deadlines-list');
  if (!container) return;

  const currentUser = window.App ? window.App.getCurrentUser() : 'Adélcia';

  // Toggle Checkbox
  container.querySelectorAll('.deadline-check').forEach(input => {
    input.addEventListener('change', async () => {
      const id = input.getAttribute('data-id');
      const isCompleted = input.checked;
      await toggleDeadlineCompletion(id, isCompleted, currentUser);
      if (isCompleted && window.SoundEngine) {
        window.SoundEngine.playSuccessSound();
      }
    });
  });

  // Supprimer
  container.querySelectorAll('.btn-delete-deadline').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
        const id = btn.getAttribute('data-id');
        await deleteDeadline(id);
      }
    });
  });
}

async function toggleDeadlineCompletion(id, isCompleted, user) {
  try {
    const res = await fetch(`/api/deadlines/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted, user })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.updated) {
        onDeadlineUpdated(data.updated);
        if (data.next) {
          onDeadlineCreated(data.next);
        }
      }
    }
  } catch (err) {
    console.error('Erreur validation tâche:', err);
  }
}

async function deleteDeadline(id) {
  try {
    const res = await fetch(`/api/deadlines/${id}`, { method: 'DELETE' });
    if (res.ok) {
      onDeadlineDeleted(id);
    }
  } catch (err) {
    console.error('Erreur suppression échéance:', err);
  }
}

function updateDeadlinesBadge() {
  const badge = document.getElementById('deadlines-badge');
  if (badge) {
    const todayStr = getTodayStr();
    const count = deadlinesList.filter(d => !d.is_completed && d.due_date <= todayStr).length;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

// Événements Socket
function onDeadlineCreated(item) {
  if (!item || !item.id) return;
  const idx = deadlinesList.findIndex(d => d.id === item.id);
  if (idx === -1) {
    deadlinesList.unshift(item);
  } else {
    deadlinesList[idx] = item;
  }
  renderDeadlines();
  updateDeadlinesBadge();
}

function onDeadlineUpdated(item) {
  if (!item || !item.id) return;
  const idx = deadlinesList.findIndex(d => d.id === item.id);
  if (idx !== -1) {
    deadlinesList[idx] = item;
  } else {
    deadlinesList.unshift(item);
  }
  renderDeadlines();
  updateDeadlinesBadge();
}

function onDeadlineDeleted(id) {
  deadlinesList = deadlinesList.filter(d => d.id !== parseInt(id));
  renderDeadlines();
  updateDeadlinesBadge();
}

function openNewDeadlineModal() {
  const modalDeadline = document.getElementById('modal-deadline');
  const formDeadline = document.getElementById('form-deadline');
  if (formDeadline) formDeadline.reset();
  const dateInput = document.getElementById('deadline-date');
  if (dateInput) dateInput.value = getTodayStr();
  if (modalDeadline) {
    modalDeadline.style.setProperty('display', 'flex', 'important');
    modalDeadline.classList.add('modal-active');
  }
  const titleInput = document.getElementById('deadline-title');
  if (titleInput) {
    setTimeout(() => titleInput.focus(), 100);
  }
}

function closeNewDeadlineModal() {
  const modalDeadline = document.getElementById('modal-deadline');
  if (modalDeadline) {
    modalDeadline.style.setProperty('display', 'none', 'important');
    modalDeadline.classList.remove('modal-active');
  }
}

window.openNewDeadlineModal = openNewDeadlineModal;
window.closeNewDeadlineModal = closeNewDeadlineModal;

function normalizeIsoDate(val) {
  if (!val) return getTodayStr();
  val = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const m = val.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    const year = m[3];
    return `${year}-${month}-${day}`;
  }
  return val;
}

async function submitNewDeadline(e) {
  if (e && e.preventDefault) e.preventDefault();

  const titleEl = document.getElementById('deadline-title');
  const catEl = document.getElementById('deadline-category');
  const dateEl = document.getElementById('deadline-date');
  const recEl = document.getElementById('deadline-recurrence');
  const prioEl = document.getElementById('deadline-priority');
  const notesEl = document.getElementById('deadline-notes');
  const btnSubmit = document.getElementById('btn-submit-deadline');

  const title = titleEl ? titleEl.value.trim() : '';
  const category = catEl ? catEl.value : 'Nettoyage';
  const rawDate = dateEl ? dateEl.value : '';
  const dueDate = normalizeIsoDate(rawDate);
  const recurrence = recEl ? recEl.value : 'nessuna';
  const priority = prioEl ? prioEl.value : 'normale';
  const notes = notesEl ? notesEl.value.trim() : '';
  const user = window.App ? window.App.getCurrentUser() : 'Roberto';

  if (!title) {
    if (titleEl) {
      titleEl.focus();
      titleEl.style.borderColor = '#dc2626';
      setTimeout(() => { titleEl.style.borderColor = ''; }, 2000);
    }
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Enregistrement...';
  }

  try {
    const res = await fetch('/api/deadlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        category,
        due_date: dueDate,
        recurrence,
        priority,
        notes,
        created_by: user
      })
    });

    if (res.ok) {
      const item = await res.json();
      closeNewDeadlineModal();
      const form = document.getElementById('form-deadline');
      if (form) form.reset();
      onDeadlineCreated(item);
      if (window.SoundEngine) window.SoundEngine.playSentSound();
    } else {
      const errData = await res.json().catch(() => ({}));
      alert(errData.error || 'Erreur lors de l\'enregistrement de la tâche.');
    }
  } catch (err) {
    console.error('Erreur création tâche:', err);
    alert('Erreur réseau. Veuillez réessayer.');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '✅ Enregistrer la Tâche';
    }
  }
}

window.submitNewDeadline = submitNewDeadline;

function setupDeadlineEvents() {
  // Filtres
  document.querySelectorAll('#deadlines-filter-bar .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setFilter(btn.getAttribute('data-filter'));
    });
  });

  // Modal Nouvelle Tâche
  const btnNewDeadline = document.getElementById('btn-new-deadline');
  const modalDeadline = document.getElementById('modal-deadline');
  const btnCloseModal = document.getElementById('btn-close-modal-deadline');
  const btnCancelDeadline = document.getElementById('btn-cancel-deadline');
  const formDeadline = document.getElementById('form-deadline');

  if (btnNewDeadline) {
    btnNewDeadline.addEventListener('click', (e) => {
      e.preventDefault();
      openNewDeadlineModal();
    });
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeNewDeadlineModal);
  if (btnCancelDeadline) btnCancelDeadline.addEventListener('click', closeNewDeadlineModal);

  if (modalDeadline) {
    modalDeadline.addEventListener('click', (e) => {
      if (e.target === modalDeadline) closeNewDeadlineModal();
    });
  }

  // Form submit
  if (formDeadline) {
    formDeadline.addEventListener('submit', submitNewDeadline);
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

  window.DeadlinesModule = {
    initDeadlines,
    loadDeadlines,
    renderDeadlines,
    setFilter,
    submitNewDeadline,
    openModal: openNewDeadlineModal,
    closeModal: closeNewDeadlineModal,
    openNewDeadlineModal,
    closeNewDeadlineModal,
    onDeadlineCreated,
    onDeadlineUpdated,
    onDeadlineDeleted,
    updateDeadlinesBadge
  };

  window.setDeadlinesFilter = setFilter;
  window.openNewDeadlineModal = openNewDeadlineModal;
  window.closeNewDeadlineModal = closeNewDeadlineModal;
  window.submitNewDeadline = submitNewDeadline;
  window.loadDeadlines = loadDeadlines;
  window.renderDeadlines = renderDeadlines;
})();