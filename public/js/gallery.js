// gallery.js - Module Galerie Photos pour Tablette et PC
// Housekeeping App - Fuseau horaire Europe/Zurich

(function() {
  let photos = [];
  let activePhoto = null;
  let holdTimer = null;
  let isHoldTriggered = false;
  let touchStartPos = { x: 0, y: 0 };
  const HOLD_DURATION_MS = 2000; // 2 secondes requises pour l'action

  function initGallery() {
    setupFileInput();
    setupModalEvents();
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
    const btnSendChat = document.getElementById('btn-gallery-modal-send');
    const btnDelete = document.getElementById('btn-gallery-modal-delete');
    const btnFullscreen = document.getElementById('btn-gallery-modal-fullscreen');

    if (btnClose) btnClose.addEventListener('click', closeActionModal);
    if (btnCancel) btnCancel.addEventListener('click', closeActionModal);

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
        <div class="gallery-card" data-photo-id="${photo.id}" tabindex="0" role="button" aria-label="Photo du ${dt.dateStr} à ${dt.timeStr}">
          <div class="gallery-card-thumb-wrap">
            <img src="${escapeHtml(photo.image_url)}" alt="Photo ${photo.id}" class="gallery-thumb-img" loading="lazy" />
            
            <!-- Indicateur visuel du maintien de 2 secondes -->
            <div class="gallery-hold-overlay">
              <div class="gallery-hold-circle">
                <svg class="hold-progress-svg" viewBox="0 0 40 40">
                  <circle class="hold-circle-bg" cx="20" cy="20" r="17"></circle>
                  <circle class="hold-circle-bar" cx="20" cy="20" r="17"></circle>
                </svg>
                <span class="hold-text-seconds">2s</span>
              </div>
              <span class="hold-instruction-label">Maintenez 2s</span>
            </div>

            <!-- Bouton rapide d'options pour desktop ou clic direct -->
            <button type="button" class="gallery-card-quick-menu" title="Options de la photo" onclick="event.stopPropagation(); window.GalleryModule.openActionModalById(${photo.id});">
              ⚙️
            </button>
          </div>

          <div class="gallery-card-footer">
            <div class="gallery-card-datetime">
              <span class="gallery-datetime-icon">🕒</span>
              <span class="gallery-datetime-text">${dt.relativeOrDate} à ${dt.timeStr}</span>
            </div>
            <div class="gallery-card-subline">
              <span class="gallery-card-author">👤 ${author}</span>
              ${caption ? `<span class="gallery-card-caption-pill" title="${caption}">💬 ${caption}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    attachCardInteractions();
  }

  function attachCardInteractions() {
    const cards = document.querySelectorAll('.gallery-card');

    cards.forEach(card => {
      const photoId = parseInt(card.getAttribute('data-photo-id'), 10);
      const photo = photos.find(p => p.id === photoId);
      if (!photo) return;

      let holdStartTimestamp = 0;
      let hasMovedSignificantly = false;

      const startHold = (clientX, clientY) => {
        isHoldTriggered = false;
        hasMovedSignificantly = false;
        touchStartPos = { x: clientX, y: clientY };
        holdStartTimestamp = Date.now();

        card.classList.add('is-holding');

        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          isHoldTriggered = true;
          card.classList.remove('is-holding');
          triggerHapticSuccess();
          openActionModal(photo);
        }, HOLD_DURATION_MS);
      };

      const cancelHold = (openLightboxIfQuickTap = false) => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        card.classList.remove('is-holding');

        if (!isHoldTriggered && openLightboxIfQuickTap && !hasMovedSignificantly) {
          const duration = Date.now() - holdStartTimestamp;
          // Un appui court (< 400ms) sans déplacement ouvre la photo en plein écran
          if (duration < 400 && typeof window.openImageLightbox === 'function') {
            const dt = formatZurichDateTime(photo.created_at);
            window.openImageLightbox(
              photo.image_url,
              photo.captured_by || 'Tablette',
              dt.dateStr + ' ' + dt.timeStr,
              photo.caption || ''
            );
          }
        }
      };

      const handleMove = (clientX, clientY) => {
        const dx = Math.abs(clientX - touchStartPos.x);
        const dy = Math.abs(clientY - touchStartPos.y);
        // Si l'utilisateur défile l'écran (déplacement > 10px), annuler le timer 2s
        if (dx > 10 || dy > 10) {
          hasMovedSignificantly = true;
          cancelHold(false);
        }
      };

      // Événements Touch (Tablette / Mobile)
      card.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) {
          startHold(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length === 1) {
          handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      card.addEventListener('touchend', () => {
        cancelHold(true);
      });

      card.addEventListener('touchcancel', () => {
        cancelHold(false);
      });

      // Événements Souris / Pointer (PC)
      card.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // clic gauche uniquement
          startHold(e.clientX, e.clientY);
        }
      });

      card.addEventListener('mousemove', (e) => {
        handleMove(e.clientX, e.clientY);
      });

      card.addEventListener('mouseup', () => {
        cancelHold(true);
      });

      card.addEventListener('mouseleave', () => {
        cancelHold(false);
      });

      // Empêcher le menu contextuel par défaut sur appui long pour les navigateurs tactiles
      card.addEventListener('contextmenu', (e) => {
        if (isHoldTriggered) {
          e.preventDefault();
        }
      });
    });
  }

  function triggerHapticSuccess() {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([60, 40, 60]);
      } catch (e) {}
    }
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
    sendPhotoToChat,
    deletePhoto,
    onPhotoCreated,
    onPhotoDeleted
  };
})();
