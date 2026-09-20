// expenses.js - Suivi des Achats & Dépenses (Feuille de calcul PC)
(function() {
  'use strict';

  let expensesList = [];
  let filterStatus = 'all'; // 'all', 'pending', 'completed'
  let searchQuery = '';

  function initExpenses() {
    setupEventListeners();
    setupSocketEvents();
    loadExpenses();
  }

  function setupSocketEvents() {
    if (window.SocketClient && window.SocketClient.getSocket) {
      const socket = window.SocketClient.getSocket();
      if (socket) {
        socket.on('expenses:updated', () => {
          loadExpenses();
        });
      }
    }
  }

  function setupEventListeners() {
    const searchInput = document.getElementById('expenses-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderTable();
      });
    }

    const filterBtns = document.querySelectorAll('#expenses-filter-bar .filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterStatus = btn.getAttribute('data-filter') || 'all';
        renderTable();
      });
    });

    const btnNewExpense = document.getElementById('btn-new-expense');
    if (btnNewExpense) {
      btnNewExpense.addEventListener('click', openNewExpenseModal);
    }
  }

  async function loadExpenses() {
    try {
      const res = await fetch('/api/expenses');
      if (res.ok) {
        expensesList = await res.json();
        updateStats();
        renderTable();
      }
    } catch (err) {
      console.error('Erreur chargement dépenses:', err);
    }
  }

  function updateStats() {
    let totalTtc = 0;
    let pendingCount = 0;
    let completedCount = 0;

    expensesList.forEach(item => {
      const price = parseFloat(item.price_ttc);
      const qty = parseInt(item.quantity, 10) || 1;
      if (!isNaN(price) && price > 0) {
        totalTtc += price * qty;
      }

      if (item.purchase_date || (!isNaN(price) && price > 0)) {
        completedCount++;
      } else {
        pendingCount++;
      }
    });

    const elTotal = document.getElementById('stat-expenses-total');
    const elPending = document.getElementById('stat-expenses-pending');
    const elCompleted = document.getElementById('stat-expenses-completed');
    const elCount = document.getElementById('stat-expenses-count');

    if (elTotal) elTotal.textContent = `${totalTtc.toFixed(2)} CHF`;
    if (elPending) elPending.textContent = pendingCount;
    if (elCompleted) elCompleted.textContent = completedCount;
    if (elCount) elCount.textContent = expensesList.length;
  }

  function renderTable() {
    const tbody = document.getElementById('expenses-tbody');
    const tfootTotal = document.getElementById('expenses-table-total-ttc');
    if (!tbody) return;

    let filtered = expensesList.filter(item => {
      const isCompleted = !!item.purchase_date || (item.price_ttc !== null && item.price_ttc !== '' && Number(item.price_ttc) > 0);
      if (filterStatus === 'pending' && isCompleted) return false;
      if (filterStatus === 'completed' && !isCompleted) return false;

      if (searchQuery) {
        const text = `${item.product_name} ${item.category || ''} ${item.notes || ''} ${item.requested_by || ''}`.toLowerCase();
        if (!text.includes(searchQuery)) return false;
      }
      return true;
    });

    let currentTotal = 0;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="expenses-empty-cell">
            <div class="empty-state" style="padding: 24px 0;">
              <div class="empty-icon">📊</div>
              <div class="empty-title">Aucune dépense trouvée</div>
              <div class="empty-desc">Les articles commandés dans « Achats & Courses » apparaîtront automatiquement ici.</div>
            </div>
          </td>
        </tr>
      `;
      if (tfootTotal) tfootTotal.textContent = '0.00 CHF';
      return;
    }

    const rowsHtml = filtered.map(item => {
      const price = parseFloat(item.price_ttc);
      const qty = parseInt(item.quantity, 10) || 1;
      const isCompleted = !!item.purchase_date || (!isNaN(price) && price > 0);

      if (!isNaN(price) && price > 0) {
        currentTotal += price * qty;
      }

      const formattedPrice = item.price_ttc !== null && item.price_ttc !== '' && !isNaN(price) ? Number(price).toFixed(2) : '';

      return `
        <tr data-expense-id="${item.id}" class="${isCompleted ? 'row-completed' : 'row-pending'}">
          <td class="col-date">
            <div class="cell-text-main">${escapeHtml(item.request_date || '')}</div>
            ${item.requested_by ? `<div class="cell-subtext">Par ${escapeHtml(item.requested_by)}</div>` : ''}
          </td>
          <td class="col-product">
            <div class="product-title-cell">
              <strong>${escapeHtml(item.product_name)}</strong>
              ${item.category ? `<span class="expense-cat-badge">${escapeHtml(item.category)}</span>` : ''}
            </div>
            ${item.notes ? `<div class="cell-notes-hint" title="${escapeHtml(item.notes)}">📝 ${escapeHtml(item.notes)}</div>` : ''}
          </td>
          <td class="col-qty">
            <input 
              type="number" 
              class="sheet-input sheet-input-qty" 
              min="1" 
              value="${qty}" 
              data-field="quantity" 
              onchange="window.ExpensesModule.onCellChange(${item.id}, 'quantity', this.value)"
            />
          </td>
          <td class="col-purchase-date">
            <input 
              type="date" 
              class="sheet-input sheet-input-date" 
              value="${item.purchase_date || ''}" 
              data-field="purchase_date" 
              onchange="window.ExpensesModule.onCellChange(${item.id}, 'purchase_date', this.value)"
            />
          </td>
          <td class="col-price">
            <div class="input-currency-wrapper">
              <input 
                type="number" 
                step="0.05" 
                min="0" 
                placeholder="0.00" 
                class="sheet-input sheet-input-price" 
                value="${formattedPrice}" 
                data-field="price_ttc" 
                onchange="window.ExpensesModule.onCellChange(${item.id}, 'price_ttc', this.value)"
              />
              <span class="currency-label">CHF</span>
            </div>
          </td>
          <td class="col-status">
            ${isCompleted ? 
              `<span class="badge-expense badge-purchased" title="Article acheté">✅ Acheté</span>` : 
              `<span class="badge-expense badge-pending" title="En attente d'achat">⏳ En attente</span>`
            }
          </td>
          <td class="col-actions">
            <button 
              type="button" 
              class="btn-sheet-action btn-save-row" 
              title="Enregistrer la ligne" 
              onclick="window.ExpensesModule.saveRow(${item.id}, this)">
              💾
            </button>
            <button 
              type="button" 
              class="btn-sheet-action btn-delete-row" 
              title="Supprimer la ligne" 
              onclick="window.ExpensesModule.deleteRow(${item.id})">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml;
    if (tfootTotal) tfootTotal.textContent = `${currentTotal.toFixed(2)} CHF`;
  }

  async function onCellChange(id, field, value) {
    try {
      const payload = {};
      payload[field] = value;

      const res = await fetch(`/api/expenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const updated = await res.json();
        const idx = expensesList.findIndex(e => e.id === id);
        if (idx !== -1) {
          expensesList[idx] = updated;
        }
        updateStats();
        
        // Mettre à jour l'aspect visuel de la ligne
        const tr = document.querySelector(`tr[data-expense-id="${id}"]`);
        if (tr) {
          const isCompleted = !!updated.purchase_date || (updated.price_ttc !== null && updated.price_ttc !== '' && Number(updated.price_ttc) > 0);
          tr.className = isCompleted ? 'row-completed' : 'row-pending';
          const statusTd = tr.querySelector('.col-status');
          if (statusTd) {
            statusTd.innerHTML = isCompleted ? 
              `<span class="badge-expense badge-purchased" title="Article acheté">✅ Acheté</span>` : 
              `<span class="badge-expense badge-pending" title="En attente d'achat">⏳ En attente</span>`;
          }
          flashSaved(tr);
        }
      }
    } catch (err) {
      console.error('Erreur mise à jour cellule:', err);
    }
  }

  async function saveRow(id, btn) {
    const tr = document.querySelector(`tr[data-expense-id="${id}"]`);
    if (!tr) return;

    const qtyInput = tr.querySelector('.sheet-input-qty');
    const dateInput = tr.querySelector('.sheet-input-date');
    const priceInput = tr.querySelector('.sheet-input-price');

    const payload = {
      quantity: qtyInput ? qtyInput.value : 1,
      purchase_date: dateInput ? dateInput.value : '',
      price_ttc: priceInput && priceInput.value !== '' ? priceInput.value : null
    };

    try {
      if (btn) btn.textContent = '⏳';
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const updated = await res.json();
        const idx = expensesList.findIndex(e => e.id === id);
        if (idx !== -1) expensesList[idx] = updated;
        updateStats();
        flashSaved(tr);
      }
    } catch (err) {
      console.error('Erreur sauvegarde ligne:', err);
    } finally {
      if (btn) btn.textContent = '💾';
    }
  }

  function flashSaved(el) {
    if (!el) return;
    el.classList.add('row-flash-saved');
    setTimeout(() => {
      el.classList.remove('row-flash-saved');
    }, 1200);
  }

  async function deleteRow(id) {
    if (!window.confirm('Voulez-vous supprimer cette ligne de dépense ?')) return;

    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        expensesList = expensesList.filter(e => e.id !== id);
        updateStats();
        renderTable();
      }
    } catch (err) {
      console.error('Erreur suppression ligne dépense:', err);
    }
  }

  function openNewExpenseModal() {
    const name = window.prompt('Nom du produit / article à ajouter :');
    if (!name || !name.trim()) return;

    const qtyStr = window.prompt('Quantité :', '1');
    const qty = parseInt(qtyStr, 10) || 1;

    const priceStr = window.prompt('Prix d\'achat TTC en CHF (facultatif) :', '');
    const price = priceStr && !isNaN(parseFloat(priceStr)) ? parseFloat(priceStr) : null;

    const now = new Date();
    const dateFormatted = now.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Zurich'
    });

    const user = window.App ? window.App.getCurrentUser() : 'Roberto';

    fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_name: name.trim(),
        quantity: qty,
        price_ttc: price,
        request_date: dateFormatted,
        requested_by: user,
        purchase_date: price ? now.toISOString().slice(0, 10) : ''
      })
    }).then(res => res.json()).then(item => {
      expensesList.unshift(item);
      updateStats();
      renderTable();
    }).catch(err => {
      console.error('Erreur création dépense manuelle:', err);
    });
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

  window.ExpensesModule = {
    initExpenses,
    loadExpenses,
    renderTable,
    onCellChange,
    saveRow,
    deleteRow,
    openNewExpenseModal
  };

})();
