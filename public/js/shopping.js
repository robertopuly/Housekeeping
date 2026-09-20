// shopping.js - Module Achats & Courses (Liste de courses)
// Encapsulation stricte pour éviter toute collision lexicale globale
(function() {
  'use strict';

  let shoppingItems = [];
  let currentCategory = 'tous'; // 'tous', 'cochés', ou nom de la catégorie

  // Éléments DOM
  let listEl = null;
  let notesEl = null;
  let checkedCountEl = null;
  let badgeEl = null;

  function initShopping() {
    listEl = document.getElementById('shopping-list');
    notesEl = document.getElementById('shopping-notes-input');
    checkedCountEl = document.getElementById('shopping-checked-count');
    badgeEl = document.getElementById('shopping-badge');

    loadShoppingItems();
  }

  function sortShoppingItems() {
    shoppingItems.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
  }

  async function loadShoppingItems() {
    try {
      const res = await fetch('/api/shopping-items');
      if (!res.ok) throw new Error('Erreur HTTP ' + res.status);
      const data = await res.json();
      shoppingItems = Array.isArray(data) ? data : [];
      sortShoppingItems();
      renderShoppingList();
      updateCheckedBadge();
    } catch (err) {
      console.error('Erreur chargement articles achats:', err);
      if (listEl) {
        listEl.innerHTML = '<div class="empty-state">Impossible de charger la liste des courses.</div>';
      }
    }
  }

  function setShoppingFilter(cat) {
    currentCategory = cat;
    const filterBtns = document.querySelectorAll('#shopping-filter-bar .filter-btn');
    filterBtns.forEach(btn => {
      const match = btn.getAttribute('data-cat') === cat;
      btn.classList.toggle('active', match);
    });
    renderShoppingList();
  }

  function updateCheckedBadge() {
    const checked = shoppingItems.filter(item => item.is_checked);
    const count = checked.length;
    if (checkedCountEl) checkedCountEl.textContent = count;

    if (badgeEl) {
      if (count > 0) {
        badgeEl.textContent = count;
        badgeEl.style.display = 'inline-flex';
      } else {
        badgeEl.style.display = 'none';
      }
    }
  }

  function renderShoppingList() {
    if (!listEl) listEl = document.getElementById('shopping-list');
    if (!listEl) return;

    let filtered = shoppingItems;
    if (currentCategory === 'cochés') {
      filtered = shoppingItems.filter(item => item.is_checked);
    } else if (currentCategory !== 'tous') {
      filtered = shoppingItems.filter(item => item.category === currentCategory);
    }

    if (filtered.length === 0) {
      if (currentCategory === 'cochés') {
        listEl.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px 20px;">
            <div style="font-size: 40px; margin-bottom: 10px;">🛒</div>
            <h3 style="margin-bottom: 8px; color: var(--text-color);">Aucun produit sélectionné pour l'instant</h3>
            <p style="color: var(--text-muted); font-size: 14px;">Cochez les produits dans la liste pour préparer votre commande.</p>
          </div>
        `;
      } else {
        listEl.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px 20px;">
            <div style="font-size: 40px; margin-bottom: 10px;">📦</div>
            <h3 style="margin-bottom: 8px; color: var(--text-color);">Aucun produit trouvé</h3>
            <p style="color: var(--text-muted); font-size: 14px;">Utilisez le bouton "+ Nouveau Produit" pour en ajouter.</p>
          </div>
        `;
      }
      return;
    }

    let html = '';
    filtered.forEach(item => {
      const isChecked = !!item.is_checked;
      const checkedClass = isChecked ? 'shopping-item-card checked' : 'shopping-item-card';
      const checkIcon = isChecked ? '✅' : '⬜';

      html += `
        <div class="${checkedClass}" id="shopping-card-${item.id}">
          <div class="shopping-item-main" onclick="toggleShoppingItemCheck(${item.id})">
            <div class="shopping-checkbox-wrapper">
              <span class="shopping-check-icon">${checkIcon}</span>
            </div>
            <div class="shopping-item-info">
              <div class="shopping-item-name ${isChecked ? 'is-bought' : ''}">${escapeHtml(item.name)}</div>
              <div class="shopping-item-meta">
                <span class="shopping-cat-badge">${escapeHtml(item.category || 'Général')}</span>
              </div>
            </div>
          </div>
          <div class="shopping-item-actions">
            <button type="button" class="btn-icon-action" title="Modifier le produit" onclick="openEditShoppingModal(${item.id}, event)">
              ✏️
            </button>
            <button type="button" class="btn-icon-action btn-icon-delete" title="Supprimer le produit" onclick="deleteShoppingItem(${item.id}, event)">
              🗑️
            </button>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  }

  async function toggleShoppingItemCheck(id) {
    const item = shoppingItems.find(i => i.id === id);
    if (!item) return;

    const newChecked = !item.is_checked;
    item.is_checked = newChecked ? 1 : 0;
    renderShoppingList();
    updateCheckedBadge();

    if (window.SoundEngine && typeof window.SoundEngine.playNotificationSound === 'function') {
      window.SoundEngine.playNotificationSound();
    }

    try {
      const res = await fetch(`/api/shopping-items/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_checked: newChecked })
      });
      if (!res.ok) {
        // Rollback
        item.is_checked = !newChecked ? 1 : 0;
        renderShoppingList();
        updateCheckedBadge();
      }
    } catch (err) {
      console.error('Erreur toggle article shopping:', err);
      item.is_checked = !newChecked ? 1 : 0;
      renderShoppingList();
      updateCheckedBadge();
    }
  }

  async function submitShoppingList() {
    const checked = shoppingItems.filter(i => i.is_checked);
    if (checked.length === 0) {
      alert('Veuillez cocher au moins un produit à acheter dans la liste avant d\'envoyer.');
      return;
    }

    const sender = window.App && typeof window.App.getCurrentUser === 'function' ? window.App.getCurrentUser() : (localStorage.getItem('hk_user') || 'Roberto');
    const recipient = sender.toLowerCase().includes('roberto') ? 'Adélcia' : 'Roberto';
    const notesInput = document.getElementById('shopping-notes-input');
    const notes = notesInput ? notesInput.value.trim() : '';

    const confirmMsg = `Voulez-vous envoyer la liste de courses (${checked.length} article(s)) à ${recipient} ?`;
    if (!window.confirm(confirmMsg)) return;

    const btn = document.getElementById('btn-send-shopping');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Envoi en cours...';
    }

    try {
      const res = await fetch('/api/shopping/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: sender,
          notes: notes,
          selectedItems: checked
        })
      });

      if (res.ok) {
        if (notesInput) notesInput.value = '';
        shoppingItems.forEach(i => { i.is_checked = 0; });
        renderShoppingList();
        updateCheckedBadge();

        if (window.SoundEngine && typeof window.SoundEngine.playSuccessSound === 'function') {
          window.SoundEngine.playSuccessSound();
        }

        alert(`✅ La liste d'achats (${checked.length} articles) a été envoyée avec succès à ${recipient} dans la discussion !`);

        // Optionnel : rediriger vers le chat pour voir le message
        if (window.App && typeof window.App.switchTab === 'function') {
          window.App.switchTab('tab-chat');
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erreur lors de l\'envoi de la liste.');
      }
    } catch (err) {
      console.error('Erreur envoi liste shopping:', err);
      alert('Erreur réseau lors de l\'envoi.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `📤 Envoyer la commande (<span id="shopping-checked-count">${shoppingItems.filter(i => i.is_checked).length}</span>)`;
      }
    }
  }

  async function resetShoppingList() {
    const checked = shoppingItems.filter(i => i.is_checked);
    if (checked.length === 0) {
      return;
    }
    if (!window.confirm('Voulez-vous décocher tous les articles sélectionnés ?')) return;

    try {
      const res = await fetch('/api/shopping-items/reset', { method: 'POST' });
      if (res.ok) {
        shoppingItems.forEach(i => { i.is_checked = 0; });
        renderShoppingList();
        updateCheckedBadge();
      }
    } catch (err) {
      console.error('Erreur reset shopping:', err);
    }
  }

  function openNewShoppingModal() {
    const modal = document.getElementById('modal-shopping-product');
    const form = document.getElementById('form-shopping-product');
    const titleEl = document.getElementById('modal-shopping-title');
    const idEl = document.getElementById('shopping-prod-id');
    const nameEl = document.getElementById('shopping-prod-name');
    const catEl = document.getElementById('shopping-prod-category');

    if (form) form.reset();
    if (idEl) idEl.value = '';
    if (titleEl) titleEl.textContent = '🛒 Nouveau Produit';
    if (catEl) catEl.value = 'Nettoyage & Entretien';

    if (modal) {
      modal.style.setProperty('display', 'flex', 'important');
      modal.classList.add('modal-active');
    }
    if (nameEl) setTimeout(() => nameEl.focus(), 100);
  }

  function openEditShoppingModal(id, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const item = shoppingItems.find(i => i.id === id);
    if (!item) return;

    const modal = document.getElementById('modal-shopping-product');
    const titleEl = document.getElementById('modal-shopping-title');
    const idEl = document.getElementById('shopping-prod-id');
    const nameEl = document.getElementById('shopping-prod-name');
    const catEl = document.getElementById('shopping-prod-category');

    if (idEl) idEl.value = item.id;
    if (titleEl) titleEl.textContent = '✏️ Modifier le Produit';
    if (nameEl) nameEl.value = item.name;
    if (catEl) catEl.value = item.category || 'Nettoyage & Entretien';

    if (modal) {
      modal.style.setProperty('display', 'flex', 'important');
      modal.classList.add('modal-active');
    }
    if (nameEl) setTimeout(() => nameEl.focus(), 100);
  }

  function closeShoppingModal() {
    const modal = document.getElementById('modal-shopping-product');
    if (modal) {
      modal.style.setProperty('display', 'none', 'important');
      modal.classList.remove('modal-active');
    }
  }

  async function submitShoppingProduct(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const idEl = document.getElementById('shopping-prod-id');
    const nameEl = document.getElementById('shopping-prod-name');
    const catEl = document.getElementById('shopping-prod-category');
    const btnSubmit = document.getElementById('btn-submit-shopping-product');

    const id = idEl ? idEl.value : '';
    const name = nameEl ? nameEl.value.trim() : '';
    const category = catEl ? catEl.value : 'Nettoyage & Entretien';

    if (!name) {
      if (nameEl) nameEl.focus();
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = '⏳ Enregistrement...';
    }

    try {
      let res;
      if (id) {
        // Mise à jour
        res = await fetch(`/api/shopping-items/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, category })
        });
      } else {
        // Création
        res = await fetch('/api/shopping-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, category })
        });
      }

      if (res.ok) {
        closeShoppingModal();
        await loadShoppingItems();
        if (window.SoundEngine && typeof window.SoundEngine.playSuccessSound === 'function') {
          window.SoundEngine.playSuccessSound();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erreur lors de l\'enregistrement du produit.');
      }
    } catch (err) {
      console.error('Erreur sauvegarde produit shopping:', err);
      alert('Erreur réseau. Veuillez réessayer.');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = '💾 Enregistrer le Produit';
      }
    }
  }

  async function deleteShoppingItem(id, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const item = shoppingItems.find(i => i.id === id);
    const itemName = item ? item.name : 'cet article';

    if (!window.confirm(`Voulez-vous supprimer définitivement "${itemName}" de la liste des courses ?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/shopping-items/${id}`, { method: 'DELETE' });
      if (res.ok) {
        shoppingItems = shoppingItems.filter(i => i.id !== id);
        renderShoppingList();
        updateCheckedBadge();
      } else {
        alert('Erreur lors de la suppression du produit.');
      }
    } catch (err) {
      console.error('Erreur suppression produit shopping:', err);
      alert('Erreur réseau.');
    }
  }

  // Événements temps réel Socket
  function onShoppingCreated(item) {
    const exists = shoppingItems.find(i => i.id === item.id);
    if (!exists) {
      shoppingItems.push(item);
      sortShoppingItems();
      renderShoppingList();
      updateCheckedBadge();
    }
  }

  function onShoppingUpdated(item) {
    const idx = shoppingItems.findIndex(i => i.id === item.id);
    if (idx !== -1) {
      shoppingItems[idx] = item;
    } else {
      shoppingItems.push(item);
    }
    sortShoppingItems();
    renderShoppingList();
    updateCheckedBadge();
  }

  function onShoppingDeleted(id) {
    shoppingItems = shoppingItems.filter(i => i.id !== id);
    renderShoppingList();
    updateCheckedBadge();
  }

  function onShoppingReset() {
    shoppingItems.forEach(i => { i.is_checked = 0; });
    renderShoppingList();
    updateCheckedBadge();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Exportation publique dans window
  window.ShoppingModule = {
    initShopping,
    loadShoppingItems,
    setShoppingFilter,
    submitShoppingList,
    resetShoppingList,
    openNewShoppingModal,
    openEditShoppingModal,
    closeShoppingModal,
    submitShoppingProduct,
    deleteShoppingItem,
    toggleShoppingItemCheck,
    onShoppingCreated,
    onShoppingUpdated,
    onShoppingDeleted,
    onShoppingReset
  };

  // Raccourcis globaux pour les attributs onclick du HTML
  window.setShoppingFilter = setShoppingFilter;
  window.submitShoppingList = submitShoppingList;
  window.resetShoppingList = resetShoppingList;
  window.openNewShoppingModal = openNewShoppingModal;
  window.openEditShoppingModal = openEditShoppingModal;
  window.closeShoppingModal = closeShoppingModal;
  window.submitShoppingProduct = submitShoppingProduct;
  window.deleteShoppingItem = deleteShoppingItem;
  window.toggleShoppingItemCheck = toggleShoppingItemCheck;

})();
