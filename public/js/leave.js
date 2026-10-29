// leave.js - Module de gestion des congés et vacances pour Adélcia et Roberto
(function() {
  'use strict';

  let currentCalYear = new Date().getFullYear();
  let currentCalMonth = new Date().getMonth(); // 0-11
  let activeMode = 'vacances'; // 'vacances' | 'conge'
  
  // Selection states
  let vacationStartDate = '';
  let vacationEndDate = '';
  let selectedCongesDates = new Set(); // Set of 'YYYY-MM-DD' strings
  let editingRequestId = null;

  // Requests cache
  let leaveRequests = [];
  let currentFilter = 'all'; // 'all' | 'en_attente' | 'envoye'

  const MONTH_NAMES_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const DAY_NAMES_SHORT_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const FULL_DAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const FULL_MONTHS_FR = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];

  function formatFrenchDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr + 'T12:00:00');
    return `${FULL_DAYS_FR[d.getDay()]} ${d.getDate()} ${FULL_MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatFrenchDateShort(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr + 'T12:00:00');
    return `${FULL_DAYS_FR[d.getDay()].slice(0, 3)} ${d.getDate()} ${FULL_MONTHS_FR[d.getMonth()].slice(0, 4)}.`;
  }

  function formatSwissDateTime(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('fr-CH', {
        timeZone: 'Europe/Zurich',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoStr;
    }
  }

  function toIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getCurrentUser() {
    if (window.App && typeof window.App.getCurrentUser === 'function') {
      return window.App.getCurrentUser();
    }
    return localStorage.getItem('hk_user') || 'Adélcia';
  }

  function isCurrentUserRoberto() {
    const u = getCurrentUser();
    return !!(u && u.toLowerCase().trim() === 'roberto');
  }

  function initLeave() {
    setupEventListeners();
    setupSocketListeners();
    renderCalendar();
    updateSelectionUI();
    loadLeaveRequests();
  }

  function setupEventListeners() {
    // Mode toggles
    const btnModeVac = document.getElementById('leave-mode-vacances');
    const btnModeConge = document.getElementById('leave-mode-conge');

    if (btnModeVac) {
      btnModeVac.addEventListener('click', () => switchMode('vacances'));
    }
    if (btnModeConge) {
      btnModeConge.addEventListener('click', () => switchMode('conge'));
    }

    // Month Navigation
    const btnPrev = document.getElementById('btn-leave-cal-prev');
    const btnNext = document.getElementById('btn-leave-cal-next');
    const btnToday = document.getElementById('btn-leave-cal-today');

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        currentCalMonth--;
        if (currentCalMonth < 0) {
          currentCalMonth = 11;
          currentCalYear--;
        }
        renderCalendar();
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        currentCalMonth++;
        if (currentCalMonth > 11) {
          currentCalMonth = 0;
          currentCalYear++;
        }
        renderCalendar();
      });
    }

    if (btnToday) {
      btnToday.addEventListener('click', () => {
        const now = new Date();
        currentCalYear = now.getFullYear();
        currentCalMonth = now.getMonth();
        renderCalendar();
      });
    }

    // Direct Date Inputs for Vacations
    const inputStart = document.getElementById('leave-vac-start');
    const inputEnd = document.getElementById('leave-vac-end');

    if (inputStart) {
      inputStart.addEventListener('change', (e) => {
        vacationStartDate = e.target.value;
        if (vacationEndDate && vacationEndDate < vacationStartDate) {
          vacationEndDate = vacationStartDate;
          if (inputEnd) inputEnd.value = vacationEndDate;
        }
        renderCalendar();
        updateSelectionUI();
      });
    }

    if (inputEnd) {
      inputEnd.addEventListener('change', (e) => {
        vacationEndDate = e.target.value;
        if (vacationStartDate && vacationEndDate < vacationStartDate) {
          vacationStartDate = vacationEndDate;
          if (inputStart) inputStart.value = vacationStartDate;
        }
        renderCalendar();
        updateSelectionUI();
      });
    }

    // Reset Selection Button
    const btnReset = document.getElementById('btn-leave-reset-selection');
    if (btnReset) {
      btnReset.addEventListener('click', resetSelection);
    }

    // Save Request Button
    const btnSave = document.getElementById('btn-leave-save-request');
    if (btnSave) {
      btnSave.addEventListener('click', saveRequest);
    }

    // Filter Buttons
    document.querySelectorAll('.leave-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.leave-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter') || 'all';
        renderRequestsList();
      });
    });
  }

  function setupSocketListeners() {
    const s = (window.SocketClient && typeof window.SocketClient.getSocket === 'function')
      ? window.SocketClient.getSocket()
      : window.socket;

    if (!s) return;

    s.on('leave:created', onLeaveCreated);
    s.on('leave:updated', onLeaveUpdated);
    s.on('leave:approved', onLeaveApproved);
    s.on('leave:deleted', onLeaveDeleted);
  }

  function switchMode(mode) {
    activeMode = mode;
    const btnModeVac = document.getElementById('leave-mode-vacances');
    const btnModeConge = document.getElementById('leave-mode-conge');
    const vacControls = document.getElementById('leave-vacances-controls');
    const congeHint = document.getElementById('leave-conge-hint');

    if (btnModeVac) btnModeVac.classList.toggle('active', mode === 'vacances');
    if (btnModeConge) btnModeConge.classList.toggle('active', mode === 'conge');
    if (vacControls) vacControls.style.display = mode === 'vacances' ? 'flex' : 'none';
    if (congeHint) congeHint.style.display = mode === 'conge' ? 'block' : 'none';

    renderCalendar();
    updateSelectionUI();
  }

  function renderCalendar() {
    const titleEl = document.getElementById('leave-cal-month-title');
    if (titleEl) {
      titleEl.textContent = `${MONTH_NAMES_FR[currentCalMonth]} ${currentCalYear}`;
    }

    const gridEl = document.getElementById('leave-cal-grid');
    if (!gridEl) return;

    gridEl.innerHTML = '';

    // Day of week headers (Monday to Sunday)
    DAY_NAMES_SHORT_FR.forEach(day => {
      const headerCell = document.createElement('div');
      headerCell.className = 'leave-cal-header-cell';
      headerCell.textContent = day;
      gridEl.appendChild(headerCell);
    });

    const firstDayOfMonth = new Date(currentCalYear, currentCalMonth, 1);
    const lastDayOfMonth = new Date(currentCalYear, currentCalMonth + 1, 0);

    // Day of week for first day (0 is Sunday, convert to Monday = 0)
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday is 6

    const totalDaysInMonth = lastDayOfMonth.getDate();
    const todayIso = toIsoDate(new Date());

    // Previous month empty/filler cells
    const prevMonthLastDay = new Date(currentCalYear, currentCalMonth, 0).getDate();
    for (let i = 0; i < startDayOfWeek; i++) {
      const dayNum = prevMonthLastDay - startDayOfWeek + 1 + i;
      const cell = document.createElement('div');
      cell.className = 'leave-cal-cell leave-cal-cell-muted';
      cell.textContent = dayNum;
      gridEl.appendChild(cell);
    }

    // Days of current month
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'leave-cal-cell leave-cal-cell-active';

      const currentIso = `${currentCalYear}-${String(currentCalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cell.setAttribute('data-date', currentIso);

      if (currentIso === todayIso) {
        cell.classList.add('today');
      }

      // Check selections based on activeMode
      if (activeMode === 'vacances') {
        if (vacationStartDate && vacationEndDate) {
          if (currentIso === vacationStartDate && currentIso === vacationEndDate) {
            cell.classList.add('selected-start', 'selected-end', 'selected-single');
          } else if (currentIso === vacationStartDate) {
            cell.classList.add('selected-start');
          } else if (currentIso === vacationEndDate) {
            cell.classList.add('selected-end');
          } else if (currentIso > vacationStartDate && currentIso < vacationEndDate) {
            cell.classList.add('selected-range');
          }
        } else if (vacationStartDate && currentIso === vacationStartDate) {
          cell.classList.add('selected-start', 'selected-single');
        }
      } else {
        // Congé mode
        if (selectedCongesDates.has(currentIso)) {
          cell.classList.add('selected-conge');
        }
      }

      cell.innerHTML = `<span class="day-number">${day}</span>`;

      // Click handler
      cell.addEventListener('click', () => handleDateClick(currentIso));

      gridEl.appendChild(cell);
    }

    // Fill trailing cells to complete grid row (7 columns)
    const totalRendered = startDayOfWeek + totalDaysInMonth;
    const remaining = (7 - (totalRendered % 7)) % 7;
    for (let j = 1; j <= remaining; j++) {
      const cell = document.createElement('div');
      cell.className = 'leave-cal-cell leave-cal-cell-muted';
      cell.textContent = j;
      gridEl.appendChild(cell);
    }
  }

  function handleDateClick(isoStr) {
    if (activeMode === 'vacances') {
      if (!vacationStartDate || (vacationStartDate && vacationEndDate)) {
        // First click sets start
        vacationStartDate = isoStr;
        vacationEndDate = '';
      } else {
        // Second click sets end
        if (isoStr < vacationStartDate) {
          vacationEndDate = vacationStartDate;
          vacationStartDate = isoStr;
        } else {
          vacationEndDate = isoStr;
        }
      }

      const inputStart = document.getElementById('leave-vac-start');
      const inputEnd = document.getElementById('leave-vac-end');
      if (inputStart) inputStart.value = vacationStartDate;
      if (inputEnd) inputEnd.value = vacationEndDate;
    } else {
      // Toggle date in Congé mode
      if (selectedCongesDates.has(isoStr)) {
        selectedCongesDates.delete(isoStr);
      } else {
        selectedCongesDates.add(isoStr);
      }
    }

    renderCalendar();
    updateSelectionUI();
  }

  function updateSelectionUI() {
    const chipsContainer = document.getElementById('leave-selected-chips');
    const messagePreviewEl = document.getElementById('leave-message-preview-text');
    const countBadge = document.getElementById('leave-selected-count-badge');
    const btnSave = document.getElementById('btn-leave-save-request');

    if (!chipsContainer || !messagePreviewEl) return;

    chipsContainer.innerHTML = '';

    let hasSelection = false;
    let previewMessage = '';

    if (activeMode === 'vacances') {
      if (vacationStartDate) {
        hasSelection = true;
        const sFormatted = formatFrenchDate(vacationStartDate);

        if (vacationEndDate && vacationEndDate !== vacationStartDate) {
          const eFormatted = formatFrenchDate(vacationEndDate);
          const startD = new Date(vacationStartDate + 'T12:00:00');
          const endD = new Date(vacationEndDate + 'T12:00:00');
          const diffDays = Math.round((endD - startD) / (1000 * 60 * 60 * 24)) + 1;

          previewMessage = `🏖️ Demande de vacances du ${sFormatted} au ${eFormatted} (${diffDays} jours)`;
          if (countBadge) countBadge.textContent = `${diffDays} jours`;

          const chip = document.createElement('div');
          chip.className = 'leave-chip leave-chip-vacances';
          chip.innerHTML = `
            <span>🏖️ Du <strong>${formatFrenchDateShort(vacationStartDate)}</strong> au <strong>${formatFrenchDateShort(vacationEndDate)}</strong> (${diffDays}j)</span>
            <button type="button" class="btn-chip-remove" title="Supprimer">&times;</button>
          `;
          chip.querySelector('.btn-chip-remove').addEventListener('click', () => {
            vacationStartDate = '';
            vacationEndDate = '';
            const inS = document.getElementById('leave-vac-start');
            const inE = document.getElementById('leave-vac-end');
            if (inS) inS.value = '';
            if (inE) inE.value = '';
            renderCalendar();
            updateSelectionUI();
          });
          chipsContainer.appendChild(chip);

        } else {
          // Single day or waiting for end date
          previewMessage = `🏖️ Demande de vacances du ${sFormatted} (sélectionner la date de fin sur le calendrier...)`;
          if (countBadge) countBadge.textContent = '1 jour (en cours)';

          const chip = document.createElement('div');
          chip.className = 'leave-chip leave-chip-vacances';
          chip.innerHTML = `
            <span>🏖️ Date de début : <strong>${formatFrenchDateShort(vacationStartDate)}</strong></span>
            <button type="button" class="btn-chip-remove" title="Supprimer">&times;</button>
          `;
          chip.querySelector('.btn-chip-remove').addEventListener('click', () => {
            vacationStartDate = '';
            vacationEndDate = '';
            const inS = document.getElementById('leave-vac-start');
            if (inS) inS.value = '';
            renderCalendar();
            updateSelectionUI();
          });
          chipsContainer.appendChild(chip);
        }
      } else {
        if (countBadge) countBadge.textContent = '0 jour';
      }
    } else {
      // Congé mode
      const sortedDates = Array.from(selectedCongesDates).sort();
      const count = sortedDates.length;

      if (countBadge) countBadge.textContent = `${count} jour${count > 1 ? 's' : ''}`;

      if (count > 0) {
        hasSelection = true;
        const formattedList = sortedDates.map(formatFrenchDate);
        let listStr = '';
        if (formattedList.length === 1) {
          listStr = formattedList[0];
        } else if (formattedList.length === 2) {
          listStr = `${formattedList[0]} et ${formattedList[1]}`;
        } else {
          listStr = formattedList.slice(0, -1).join(', ') + ' et ' + formattedList[formattedList.length - 1];
        }

        previewMessage = `🗓️ Demande des jours de congé suivants : ${listStr}`;

        sortedDates.forEach(isoDate => {
          const chip = document.createElement('div');
          chip.className = 'leave-chip leave-chip-conge';
          chip.innerHTML = `
            <span>🗓️ <strong>${formatFrenchDateShort(isoDate)}</strong></span>
            <button type="button" class="btn-chip-remove" title="Retirer ce jour">&times;</button>
          `;
          chip.querySelector('.btn-chip-remove').addEventListener('click', () => {
            selectedCongesDates.delete(isoDate);
            renderCalendar();
            updateSelectionUI();
          });
          chipsContainer.appendChild(chip);
        });
      }
    }

    const notesInput = document.getElementById('leave-notes-input');
    const notesVal = notesInput ? notesInput.value.trim() : '';
    if (notesVal && previewMessage) {
      previewMessage += `\n💬 Note : ${notesVal}`;
    }

    if (hasSelection) {
      messagePreviewEl.textContent = previewMessage;
      messagePreviewEl.classList.remove('empty');
      if (btnSave) btnSave.disabled = false;
    } else {
      messagePreviewEl.textContent = 'Aucun jour sélectionné pour le moment. Cliquez sur le calendrier pour faire votre choix.';
      messagePreviewEl.classList.add('empty');
      if (btnSave) btnSave.disabled = true;
    }
  }

  function resetSelection() {
    vacationStartDate = '';
    vacationEndDate = '';
    selectedCongesDates.clear();
    editingRequestId = null;

    const inS = document.getElementById('leave-vac-start');
    const inE = document.getElementById('leave-vac-end');
    const inNotes = document.getElementById('leave-notes-input');
    const btnSave = document.getElementById('btn-leave-save-request');

    if (inS) inS.value = '';
    if (inE) inE.value = '';
    if (inNotes) inNotes.value = '';
    if (btnSave) btnSave.textContent = '💾 Enregistrer la demande';

    renderCalendar();
    updateSelectionUI();
  }

  async function saveRequest() {
    const btnSave = document.getElementById('btn-leave-save-request');
    const inNotes = document.getElementById('leave-notes-input');
    const notes = inNotes ? inNotes.value.trim() : '';
    const user = getCurrentUser();

    let payload = {};

    if (activeMode === 'vacances') {
      if (!vacationStartDate) {
        alert('Veuillez sélectionner au moins la date de début des vacances.');
        return;
      }
      const eDate = vacationEndDate || vacationStartDate;
      payload = {
        type: 'vacances',
        start_date: vacationStartDate,
        end_date: eDate,
        dates_json: JSON.stringify([vacationStartDate, eDate]),
        user_name: user,
        notes: notes
      };
    } else {
      if (selectedCongesDates.size === 0) {
        alert('Veuillez sélectionner au moins un jour de congé sur le calendrier.');
        return;
      }
      const sorted = Array.from(selectedCongesDates).sort();
      payload = {
        type: 'conge',
        start_date: sorted[0],
        end_date: sorted[sorted.length - 1],
        dates_json: JSON.stringify(sorted),
        user_name: user,
        notes: notes
      };
    }

    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = '⏳ Enregistrement...';
    }

    try {
      let res;
      if (editingRequestId) {
        res = await fetch(`/api/leave-requests/${editingRequestId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/leave-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        if (window.SoundEngine && typeof window.SoundEngine.playSentSound === 'function') {
          window.SoundEngine.playSentSound();
        }
        resetSelection();
        await loadLeaveRequests();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Erreur lors de l\'enregistrement.');
      }
    } catch (err) {
      console.error('Erreur sauvegarde demande:', err);
      alert('Erreur de connexion. Veuillez réessayer.');
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.textContent = '💾 Enregistrer la demande';
      }
    }
  }

  async function loadLeaveRequests() {
    try {
      const res = await fetch('/api/leave-requests');
      if (res.ok) {
        leaveRequests = await res.json();
        renderRequestsList();
        updateBadge();
        return leaveRequests;
      }
    } catch (err) {
      console.error('Erreur chargement demandes:', err);
    }
    return [];
  }

  function updateBadge() {
    const badge = document.getElementById('leave-badge');
    if (!badge) return;
    const isRoberto = isCurrentUserRoberto();
    let count = 0;
    if (isRoberto) {
      count = leaveRequests.filter(r => r.status === 'envoye').length;
    } else {
      count = leaveRequests.filter(r => r.status === 'approuve' && !r.celebrated).length;
    }

    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  function renderRequestsList() {
    const listContainer = document.getElementById('leave-requests-container');
    const emptyNotice = document.getElementById('leave-empty-state');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    let filtered = leaveRequests;
    if (currentFilter === 'en_attente') {
      filtered = leaveRequests.filter(r => r.status === 'en_attente');
    } else if (currentFilter === 'envoye') {
      filtered = leaveRequests.filter(r => r.status === 'envoye');
    } else if (currentFilter === 'approuve') {
      filtered = leaveRequests.filter(r => r.status === 'approuve');
    }

    if (filtered.length === 0) {
      if (emptyNotice) emptyNotice.style.display = 'flex';
      return;
    }

    if (emptyNotice) emptyNotice.style.display = 'none';

    const isRoberto = isCurrentUserRoberto();

    filtered.forEach(item => {
      const isApproved = item.status === 'approuve';
      const isWaitingApproval = item.status === 'envoye';
      const isPending = item.status === 'en_attente' || !item.status;

      let cardClass = 'leave-request-card';
      if (isApproved) cardClass += ' is-approved';
      else if (isWaitingApproval) cardClass += ' is-sent';
      else cardClass += ' is-pending';

      const card = document.createElement('div');
      card.className = cardClass;
      card.setAttribute('data-id', item.id);

      const isVacances = item.type === 'vacances';
      let datesDesc = '';
      let daysCount = 0;

      if (isVacances) {
        const sFormatted = formatFrenchDate(item.start_date);
        const eFormatted = formatFrenchDate(item.end_date || item.start_date);
        const startD = new Date(item.start_date + 'T12:00:00');
        const endD = new Date((item.end_date || item.start_date) + 'T12:00:00');
        daysCount = Math.round((endD - startD) / (1000 * 60 * 60 * 24)) + 1;
        datesDesc = `Du <strong>${sFormatted}</strong> au <strong>${eFormatted}</strong>`;
      } else {
        let datesArr = [];
        try {
          datesArr = JSON.parse(item.dates_json || '[]');
        } catch (e) {
          datesArr = [item.start_date];
        }
        if (!datesArr.length && item.start_date) datesArr = [item.start_date];
        datesArr.sort();
        daysCount = datesArr.length;
        const formattedDays = datesArr.map(d => `<strong>${formatFrenchDate(d)}</strong>`);
        if (formattedDays.length === 1) {
          datesDesc = formattedDays[0];
        } else if (formattedDays.length === 2) {
          datesDesc = `${formattedDays[0]} et ${formattedDays[1]}`;
        } else {
          datesDesc = formattedDays.slice(0, -1).join(', ') + ' et ' + formattedDays[formattedDays.length - 1];
        }
      }

      // Badge de statut
      let statusBadge = '';
      if (isApproved) {
        const approvedDate = formatSwissDateTime(item.approved_at || item.sent_at);
        statusBadge = `<span class="badge-status-approved">✅ Approuvé par ${item.approved_by || 'Roberto'} le ${approvedDate}</span>`;
      } else if (isWaitingApproval) {
        if (isRoberto) {
          statusBadge = `<span class="badge-status-waiting-approval">📩 Demande d'approbation reçue de ${item.user_name || 'Adélcia'}</span>`;
        } else {
          statusBadge = `<span class="badge-status-waiting-approval">📋 Demande d'approbation</span>`;
        }
      } else {
        statusBadge = `<span class="badge-status-pending">⏳ Brouillon (non envoyé)</span>`;
      }

      // Tampon encreur officiel pour les demandes approuvées
      let stampHtml = '';
      if (isApproved) {
        const approvedDateStr = formatSwissDateTime(item.approved_at || item.sent_at);
        stampHtml = `
          <div class="leave-stamp-seal" id="stamp-seal-${item.id}">
            <span class="leave-stamp-header">★ ★ ★ OFFICIEL ★ ★ ★</span>
            <span class="leave-stamp-text">APPROUVÉ</span>
            <span class="leave-stamp-footer">PAR ${item.approved_by || 'ROBERTO'} • ${approvedDateStr}</span>
          </div>
        `;
      }

      // Boutons d'action adaptés au rôle
      let actionsHtml = '';
      if (isApproved) {
        if (isRoberto) {
          actionsHtml = `
            <span class="approved-tag-info">✅ Demande validée & approuvée</span>
            <button type="button" class="btn btn-secondary btn-edit-leave" title="Corriger les dates">✏️ Corriger</button>
            <button type="button" class="btn btn-danger btn-delete-leave" title="Supprimer la demande">🗑️ Supprimer</button>
          `;
        } else {
          actionsHtml = `
            <span class="approved-tag-info">🎉 Demande officiellement approuvée</span>
            <button type="button" class="btn btn-danger btn-delete-leave" title="Supprimer la demande">🗑️ Supprimer</button>
          `;
        }
      } else if (isWaitingApproval) {
        if (isRoberto) {
          actionsHtml = `
            <button type="button" class="btn btn-approve-leave" title="Approuver officiellement cette demande">✅ Approuver la demande</button>
            <button type="button" class="btn btn-secondary btn-edit-leave" title="Corriger les dates">✏️ Corriger</button>
            <button type="button" class="btn btn-danger btn-delete-leave" title="Supprimer la demande">🗑️ Supprimer</button>
          `;
        } else {
          actionsHtml = `
            <button type="button" class="btn btn-secondary btn-edit-leave" title="Corriger les dates">✏️ Corriger</button>
            <button type="button" class="btn btn-danger btn-delete-leave" title="Supprimer la demande">🗑️ Supprimer</button>
            <button type="button" class="btn btn-success btn-send-leave btn-already-sent" disabled title="Demande déjà soumise à Roberto">📋 Demande d'approbation envoyée</button>
          `;
        }
      } else {
        actionsHtml = `
          <button type="button" class="btn btn-secondary btn-edit-leave" title="Corriger les dates">✏️ Corriger</button>
          <button type="button" class="btn btn-danger btn-delete-leave" title="Supprimer la demande">🗑️ Supprimer</button>
          <button type="button" class="btn btn-success btn-send-leave" title="Envoyer le message à Roberto">✉️ Envoyer à Roberto</button>
        `;
      }

      card.innerHTML = `
        ${stampHtml}
        <div class="leave-card-top">
          <div class="leave-card-type">
            <span class="type-icon">${isVacances ? '🏖️' : '🗓️'}</span>
            <span class="type-title">${isVacances ? 'Demande de Vacances' : 'Demande de Congé / Repos'}</span>
            <span class="type-days-badge">${daysCount} jour${daysCount > 1 ? 's' : ''}</span>
          </div>
          ${statusBadge}
        </div>

        <div class="leave-card-body">
          <div class="leave-card-dates">
            <span class="dates-icon">📅</span>
            <span class="dates-text">${datesDesc}</span>
          </div>

          ${item.notes ? `
            <div class="leave-card-notes">
              <span class="notes-icon">💬</span>
              <span class="notes-text">${item.notes}</span>
            </div>
          ` : ''}

          <div class="leave-card-meta">
            <span>Demandé par : <strong>${item.user_name || 'Adélcia'}</strong></span>
            <span>Créé le : ${formatSwissDateTime(item.created_at)}</span>
          </div>
        </div>

        <div class="leave-card-actions">
          ${actionsHtml}
        </div>
      `;

      // Event listeners for actions
      const btnEdit = card.querySelector('.btn-edit-leave');
      if (btnEdit) btnEdit.addEventListener('click', () => editRequest(item));

      const btnDelete = card.querySelector('.btn-delete-leave');
      if (btnDelete) btnDelete.addEventListener('click', () => deleteRequest(item.id));

      const btnSend = card.querySelector('.btn-send-leave:not([disabled])');
      if (btnSend) btnSend.addEventListener('click', () => sendRequestToRoberto(item));

      const btnApprove = card.querySelector('.btn-approve-leave');
      if (btnApprove) btnApprove.addEventListener('click', () => approveRequest(item.id));

      listContainer.appendChild(card);
    });
  }

  async function approveRequest(id) {
    if (!confirm('Confirmez-vous l\'approbation officielle de cette demande de vacances / congé ?')) return;

    try {
      const res = await fetch(`/api/leave-requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: getCurrentUser() || 'Roberto' })
      });

      if (res.ok) {
        if (window.SoundEngine && typeof window.SoundEngine.playStampSound === 'function') {
          window.SoundEngine.playStampSound();
        }
        await loadLeaveRequests();
        setTimeout(() => triggerStampAnimation(id), 120);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Erreur lors de l\'approbation.');
      }
    } catch (err) {
      console.error('Erreur approbation:', err);
      alert('Erreur de connexion avec le serveur.');
    }
  }

  function triggerStampAnimation(id) {
    const card = document.querySelector(`.leave-request-card[data-id="${id}"]`);
    if (!card) return;

    try {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {}

    const stamp = card.querySelector('.leave-stamp-seal');
    if (stamp) {
      card.classList.remove('card-stamp-impact');
      stamp.classList.remove('stamp-animating');
      void stamp.offsetWidth; // Force reflow
      stamp.classList.add('stamp-animating');
      card.classList.add('card-stamp-impact');
    }

    if (window.SoundEngine && typeof window.SoundEngine.playStampSound === 'function') {
      window.SoundEngine.playStampSound();
    }
  }

  async function markRequestCelebrated(id) {
    try {
      await fetch(`/api/leave-requests/${id}/celebrate`, { method: 'POST' });
      const target = leaveRequests.find(r => r.id === id);
      if (target) target.celebrated = 1;
      updateBadge();
    } catch (e) {
      console.warn('Erreur celebrate:', e);
    }
  }

  async function checkPendingApprovalAnimation() {
    if (isCurrentUserRoberto()) return;
    const uncelebrated = leaveRequests.filter(r => r.status === 'approuve' && !r.celebrated);
    if (!uncelebrated.length) return;

    uncelebrated.forEach((item, idx) => {
      setTimeout(() => {
        triggerStampAnimation(item.id);
        markRequestCelebrated(item.id);
      }, 350 + idx * 450);
    });
  }

  function onLeaveCreated(data) {
    loadLeaveRequests();
  }

  function onLeaveUpdated(data) {
    loadLeaveRequests();
  }

  function onLeaveDeleted(data) {
    loadLeaveRequests();
  }

  async function onLeaveApproved(data) {
    await loadLeaveRequests();
    if (!isCurrentUserRoberto() && data && data.id) {
      setTimeout(() => {
        triggerStampAnimation(data.id);
        markRequestCelebrated(data.id);
      }, 300);
    }
  }

  function editRequest(item) {
    editingRequestId = item.id;
    switchMode(item.type);

    if (item.type === 'vacances') {
      vacationStartDate = item.start_date;
      vacationEndDate = item.end_date || item.start_date;
      const inS = document.getElementById('leave-vac-start');
      const inE = document.getElementById('leave-vac-end');
      if (inS) inS.value = vacationStartDate;
      if (inE) inE.value = vacationEndDate;
      if (vacationStartDate) {
        const d = new Date(vacationStartDate + 'T12:00:00');
        currentCalYear = d.getFullYear();
        currentCalMonth = d.getMonth();
      }
    } else {
      selectedCongesDates.clear();
      let arr = [];
      try {
        arr = JSON.parse(item.dates_json || '[]');
      } catch (e) {
        arr = [item.start_date];
      }
      arr.forEach(d => selectedCongesDates.add(d));
      if (arr.length > 0) {
        const d = new Date(arr[0] + 'T12:00:00');
        currentCalYear = d.getFullYear();
        currentCalMonth = d.getMonth();
      }
    }

    const inNotes = document.getElementById('leave-notes-input');
    if (inNotes) inNotes.value = item.notes || '';

    const btnSave = document.getElementById('btn-leave-save-request');
    if (btnSave) btnSave.textContent = '💾 Mettre à jour la demande';

    renderCalendar();
    updateSelectionUI();

    // Scroll smoothly to top of leave container
    const panel = document.getElementById('tab-leave');
    if (panel) panel.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteRequest(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette demande ?')) return;

    try {
      const res = await fetch(`/api/leave-requests/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (editingRequestId === id) {
          resetSelection();
        }
        await loadLeaveRequests();
      } else {
        alert('Erreur lors de la suppression.');
      }
    } catch (err) {
      console.error('Erreur suppression demande:', err);
    }
  }

  async function sendRequestToRoberto(item) {
    const isAlreadySent = item.status === 'envoye';
    const confirmMsg = isAlreadySent
      ? 'Cette demande a déjà été envoyée à Roberto. Souhaitez-vous lui renvoyer le message dans la discussion ?'
      : 'Confirmez-vous l\'envoi de cette demande par message à Roberto ?';

    if (!confirm(confirmMsg)) return;

    const sender = getCurrentUser();

    try {
      const res = await fetch(`/api/leave-requests/${item.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender })
      });

      if (res.ok) {
        if (window.SoundEngine && typeof window.SoundEngine.playSentSound === 'function') {
          window.SoundEngine.playSentSound();
        }
        await loadLeaveRequests();
        alert('✅ Message envoyé avec succès à Roberto dans la discussion !');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Erreur lors de l\'envoi.');
      }
    } catch (err) {
      console.error('Erreur envoi message demande:', err);
      alert('Erreur de connexion. Veuillez réessayer.');
    }
  }

  // Expose module globally
  window.LeaveModule = {
    initLeave,
    loadLeaveRequests,
    switchMode,
    approveRequest,
    triggerStampAnimation,
    checkPendingApprovalAnimation,
    onLeaveCreated,
    onLeaveUpdated,
    onLeaveDeleted,
    onLeaveApproved
  };

})();
