// gallery.js - Module Galerie Photos pour Tablette et PC
// Housekeeping App - Fuseau horaire Europe/Zurich

(function() {
  let photos = [];
  let activePhoto = null;

  function initGallery() {
    setupFileInput();
    setupModalEvents();
    preventContextMenu();
  }

  function preventContextMenu() {
    // Empêche systématiquement le menu contextuel natif du système/navigateur (Android/iOS)
    const galleryPanel = document.getElementById('tab-gallery');
    if (galleryPanel) {
      galleryPanel.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, { capture: true });
    }
    const modalAction = document.getElementById('modal-gallery-action');
    if (modalAction) {
      modalAction.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, { capture: true });
    }
  }

  function setupFileInput() {
    const fileInput = document.getElementById('gallery-file-input');
    const btnCapture = document.getElementById('btn-gallery-capture');

    if (btnCapture && fileInput) {
      btnCapture.addEventListener('click', () => {
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          handleFileSelected(file);
        }
        fileInput.value = '';
      });
    }
  }

  function setupModalEvents() {
    const btnClose = document.getElementById('btn-close-modal-gallery');
    const btnCancel = document.getElementById('btn-gallery-modal-cancel');
    const btnOrder = document.getElementById('btn-gallery-modal-order');
    const btnSendChat = document.getElementById('btn-gallery-modal-send');
    const btnDelete = document.getElementById('btn-gallery-modal-delete');
    const btnFullscreen = document.getElementById('btn-gallery-modal-fullscreen');
    const previewImg = document.getElementById('gallery-action-preview-img');

    if (btnClose) btnClose.addEventListener('click', closeActionModal);
    if (btnCancel) btnCancel.addEventListener('click', closeActionModal);

    if (btnOrder) {
      btnOrder.addEventListener('click', () => {
        if (activePhoto) {
          createOrderWithPhoto(activePhoto.image_url);
        }
      });
    }

    if (btnSendChat) {
      btnSendChat.addEventListener('click', () => {
        if (activePhoto) {
          sendPhotoToChat(activePhoto.id);
        }
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        if (activePhoto) {
          deletePhoto(activePhoto.id);
        }
      });
    }

    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        if (activePhoto && typeof window.openImageLightbox === 'function') {
          const dt = formatZurichDateTime(activePhoto.created_at);
          window.openImageLightbox(
            activePhoto.image_url,
            activePhoto.captured_by || 'Tablette',
            dt.dateStr + ' ' + dt.timeStr,
            activePhoto.caption || ''
          );
          closeActionModal();
        }
      });
    }

    if (previewImg) {
      previewImg.addEventListener('click', () => {
        if (activePhoto && typeof window.openImageLightbox === 'function') {
          const dt = formatZurichDateTime(activePhoto.created_at);
          window.openImageLightbox(
            activePhoto.image_url,
            activePhoto.captured_by || 'Tablette',
            dt.dateStr + ' ' + dt.timeStr,
            activePhoto.caption || ''
          );
        }
      });
    }
  }

  async function loadGallery() {
    const grid = document.getElementById('gallery-grid');
    const emptyState = document.getElementById('gallery-empty-state');
    const counterBadge = document.getElementById('gallery-badge');

    try {
      const res = await fetch('/api/gallery');
      if (!res.ok) throw new Error('Erreur HTTP ' + res.status);
      const data = await res.json();
      photos = Array.isArray(data) ? data : [];

      if (counterBadge) {
        if (photos.length > 0) {
          counterBadge.textContent = photos.length;
          counterBadge.style.display = 'inline-flex';
        } else {
          counterBadge.style.display = 'none';
        }
      }

      renderGallery();
    } catch (err) {
      console.error('Erreur chargement galerie:', err);
      if (grid) {
        grid.innerHTML = '<div class="gallery-error-msg">⚠️ Impossible de charger les photos. Vérifiez votre connexion.</div>';
      }
    }
  }

  function renderGallery() {
    const grid = document.getElementById('gallery-grid');
    const emptyState = document.getElementById('gallery-empty-state');
    const totalCountEl = document.getElementById('gallery-total-count');

    if (totalCountEl) {
      totalCountEl.textContent = photos.length + (photos.length > 1 ? ' photos' : ' photo');
    }

    if (!grid) return;

    if (photos.length === 0) {
      grid.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    grid.innerHTML = photos.map(photo => {
      const dt = formatZurichDateTime(photo.created_at);
      const author = photo.captured_by ? escapeHtml(photo.captured_by) : 'Tablette';
      const caption = photo.caption ? escapeHtml(photo.caption) : '';

      return `
        <div class="gallery-card" data-photo-id="${photo.id}">
          <!-- Zone aperçu image (toucher ouvre la boîte d'options/agrandissement) -->
          <div class="gallery-card-thumb-wrap" onclick="window.GalleryModule.openActionModalById(${photo.id})" title="Toucher pour afficher les options">
            <img src="${escapeHtml(photo.image_url)}" alt="Photo ${photo.id}" class="gallery-thumb-img" loading="lazy" />
            
            <div class="gallery-thumb-overlay-hint">
              <span class="gallery-thumb-hint-badge">🔍 Options & Agrandir</span>
            </div>
          </div>

          <!-- Pied de carte avec date/heure et boutons d'action directs -->
          <div class="gallery-card-footer">
            <div class="gallery-card-datetime">
              <span class="gallery-datetime-icon">🕒</span>
              <span class="gallery-datetime-text">${dt.relativeOrDate} à ${dt.timeStr}</span>
            </div>
            
            <div class="gallery-card-subline">
              <span class="gallery-card-author">👤 ${author}</span>
              ${caption ? `<span class="gallery-card-caption-pill" title="${caption}">💬 ${caption}</span>` : ''}
            </div>

            <!-- BOUTONS D'ACTION DIRECTS À UN TOUCHE (SANS LONG-PRESS) -->
            <div class="gallery-card-actions-row">
              <button type="button" class="btn-card-action btn-card-order" title="Créer un ordre de service avec cette photo" onclick="event.stopPropagation(); window.GalleryModule.createOrderWithPhoto(${photo.id});">
                <span class="btn-card-action-icon">📋</span>
                <span>Ordre</span>
              </button>

              <button type="button" class="btn-card-action btn-card-chat" title="Envoyer directement dans la messagerie" onclick="event.stopPropagation(); window.GalleryModule.sendPhotoToChat(${photo.id});">
                <span class="btn-card-action-icon">💬</span>
                <span>Envoyer</span>
              </button>

              <button type="button" class="btn-card-action btn-card-delete" title="Supprimer la photo" onclick="event.stopPropagation(); window.GalleryModule.deletePhoto(${photo.id});">
                <span class="btn-card-action-icon">🗑️</span>
                <span>Supprimer</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function openActionModal(photo) {
    if (!photo) return;
    activePhoto = photo;

    const modal = document.getElementById('modal-gallery-action');
    const thumbImg = document.getElementById('gallery-action-preview-img');
    const metaDate = document.getElementById('gallery-action-meta-date');
    const metaAuthor = document.getElementById('gallery-action-meta-author');

    if (thumbImg) thumbImg.src = photo.image_url;

    const dt = formatZurichDateTime(photo.created_at);
    if (metaDate) metaDate.textContent = `📅 ${dt.dateStr} à ${dt.timeStr}`;
    if (metaAuthor) metaAuthor.textContent = `👤 Par ${photo.captured_by || 'Tablette'}`;

    if (modal) {
      modal.style.setProperty('display', 'flex', 'important');
      modal.classList.add('modal-active');
    }
  }

  function openActionModalById(photoId) {
    const photo = photos.find(p => p.id === photoId);
    if (photo) openActionModal(photo);
  }

  function closeActionModal() {
    const modal = document.getElementById('modal-gallery-action');
    if (modal) {
      modal.style.setProperty('display', 'none', 'important');
      modal.classList.remove('modal-active');
    }
    activePhoto = null;
  }

  function createOrderWithPhoto(photoIdOrUrl) {
    let imageUrl = '';
    if (typeof photoIdOrUrl === 'number' || (typeof photoIdOrUrl === 'string' && /^\d+$/.test(photoIdOrUrl))) {
      const p = photos.find(item => item.id === parseInt(photoIdOrUrl));
      if (p) imageUrl = p.image_url;
    } else if (typeof photoIdOrUrl === 'string') {
      imageUrl = photoIdOrUrl;
    } else if (activePhoto) {
      imageUrl = activePhoto.image_url;
    }

    if (!imageUrl) {
      alert("Impossible de récupérer la photo pour l'ordre de service.");
      return;
    }

    // 1. Fermer la modale d'action de la galerie
    closeActionModal();

    // 2. Basculer vers l'onglet Ordres de Service
    if (window.App && typeof window.App.switchTab === 'function') {
      window.App.switchTab('tab-orders');
    }

    // 3. Ouvrir la modale Nouvel Ordre avec la photo attachée
    setTimeout(() => {
      if (typeof window.openNewOrderModal === 'function') {
        window.openNewOrderModal(imageUrl);
      } else if (window.OrdersModule && typeof window.OrdersModule.openNewOrderModal === 'function') {
        window.OrdersModule.openNewOrderModal(imageUrl);
      }
    }, 60);
  }

  async function sendPhotoToChat(photoId) {
    const currentUser = (window.App && typeof window.App.getCurrentUser === 'function')
      ? window.App.getCurrentUser()
      : (localStorage.getItem('hk_user') || 'Roberto');

    const btnSend = document.getElementById('btn-gallery-modal-send');
    if (btnSend) {
      btnSend.disabled = true;
      btnSend.textContent = '⏳ Envoi...';
    }

    try {
      const res = await fetch(`/api/gallery/${photoId}/send-to-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: currentUser })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de l\'envoi');
      }

      closeActionModal();

      if (window.SoundEngine && typeof window.SoundEngine.playSentSound === 'function') {
        window.SoundEngine.playSentSound();
      }

      showGalleryToast('✅ Photo envoyée avec succès dans la messagerie !');
    } catch (err) {
      console.error('Erreur envoi photo chat:', err);
      alert('Erreur lors de l\'envoi de la photo : ' + err.message);
    } finally {
      if (btnSend) {
        btnSend.disabled = false;
        btnSend.textContent = '💬 Envoyer dans la messagerie';
      }
    }
  }

  async function deletePhoto(photoId) {
    if (!confirm('Voulez-vous vraiment supprimer définitivement cette photo de la galerie ?')) {
      return;
    }

    const btnDelete = document.getElementById('btn-gallery-modal-delete');
    if (btnDelete) {
      btnDelete.disabled = true;
      btnDelete.textContent = '⏳ Suppression...';
    }

    try {
      const res = await fetch(`/api/gallery/${photoId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la suppression');
      }

      // Retrait local
      photos = photos.filter(p => p.id !== photoId);
      closeActionModal();
      renderGallery();
      showGalleryToast('🗑️ Photo supprimée.');
    } catch (err) {
      console.error('Erreur suppression photo:', err);
      alert('Erreur lors de la suppression : ' + err.message);
    } finally {
      if (btnDelete) {
        btnDelete.disabled = false;
        btnDelete.textContent = '🗑️ Supprimer la photo';
      }
    }
  }

  function handleFileSelected(file) {
    if (!file || !file.type.startsWith('image/')) {
      alert('Veuillez sélectionner un fichier image valide.');
      return;
    }

    const btnCapture = document.getElementById('btn-gallery-capture');
    if (btnCapture) {
      btnCapture.disabled = true;
      btnCapture.textContent = '⏳ Compression & Enregistrement...';
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
      const rawData = evt.target.result;
      compressImage(rawData, 1600, 1600, 0.85, async function(compressedBase64) {
        await uploadGalleryPhoto(compressedBase64);
        if (btnCapture) {
          btnCapture.disabled = false;
          btnCapture.textContent = '📷 Prendre une photo / Ajouter';
        }
      });
    };
    reader.onerror = function() {
      alert('Erreur de lecture du fichier image.');
      if (btnCapture) {
        btnCapture.disabled = false;
        btnCapture.textContent = '📷 Prendre une photo / Ajouter';
      }
    };
    reader.readAsDataURL(file);
  }

  async function uploadGalleryPhoto(base64Data) {
    const currentUser = (window.App && typeof window.App.getCurrentUser === 'function')
      ? window.App.getCurrentUser()
      : (localStorage.getItem('hk_user') || 'Adélcia');

    try {
      const res = await fetch('/api/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Data,
          captured_by: currentUser,
          caption: ''
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur enregistrement photo');
      }

      const newPhoto = await res.json();
      onPhotoCreated(newPhoto);

      if (window.SoundEngine && typeof window.SoundEngine.playSentSound === 'function') {
        window.SoundEngine.playSentSound();
      }

      showGalleryToast('📸 Photo enregistrée dans la galerie !');
    } catch (err) {
      console.error('Erreur upload galerie:', err);
      alert('Impossible d\'enregistrer la photo: ' + err.message);
    }
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

  function onPhotoCreated(photo) {
    if (!photo || !photo.id) return;
    const exists = photos.some(p => p.id === photo.id);
    if (!exists) {
      photos.unshift(photo);
      renderGallery();
    }
  }

  function onPhotoDeleted(photoId) {
    photos = photos.filter(p => p.id !== photoId);
    renderGallery();
  }

  function formatZurichDateTime(raw) {
    if (!raw) {
      return { dateStr: '', timeStr: '', relativeOrDate: '' };
    }
    const d = parseRawDate(raw);
    const dateStr = d.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Europe/Zurich'
    });
    const timeStr = d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Zurich'
    });

    const now = new Date();
    const todayStr = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Zurich' });
    const itemDayStr = d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Zurich' });

    let relativeOrDate = dateStr;
    if (todayStr === itemDayStr) {
      relativeOrDate = "Aujourd'hui";
    }

    return { dateStr, timeStr, relativeOrDate };
  }

  function parseRawDate(raw) {
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

  function showGalleryToast(msg) {
    let toast = document.getElementById('gallery-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'gallery-toast';
      toast.className = 'gallery-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 2800);
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

  window.GalleryModule = {
    initGallery,
    loadGallery,
    renderGallery,
    openActionModalById,
    openActionModal,
    closeActionModal,
    createOrderWithPhoto,
    sendPhotoToChat,
    deletePhoto,
    onPhotoCreated,
    onPhotoDeleted
  };
})();
