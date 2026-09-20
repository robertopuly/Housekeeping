// audio.js - Synthétiseur sonore Web Audio API
let audioCtx = null;
let isAudioInitialized = false;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function initAudio() {
  if (isAudioInitialized) return;
  const ctx = getAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    isAudioInitialized = true;
  }
}

// Déverrouillage audio au premier toucher tactile / clic
['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'].forEach((evt) => {
  document.addEventListener(evt, () => initAudio(), { once: true, passive: true });
});

function isMuted() {
  return localStorage.getItem('hk_muted') === 'true';
}

function setMuted(muted) {
  localStorage.setItem('hk_muted', muted ? 'true' : 'false');
  updateSoundButtonUI();
}

function toggleMute() {
  const current = isMuted();
  setMuted(!current);
  if (!isMuted()) {
    playSuccessSound();
  }
  return !current;
}

function updateSoundButtonUI() {
  const btn = document.getElementById('btn-sound-toggle');
  if (btn) {
    const muted = isMuted();
    btn.innerHTML = muted ? '🔇 <span class="hide-mobile">Audio : Coupé</span>' : '🔔 <span class="hide-mobile">Audio : Actif</span>';
    btn.setAttribute('aria-label', muted ? 'Activer le son' : 'Couper le son');
  }
}

// Son pour message entrant
function playMessageSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.1); // E5
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.setValueAtTime(0.25, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.5);
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

// Son pour message envoyé
function playSentSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  } catch (e) {}
}

// Alerte pour urgence (triple bip)
function playUrgentAlert() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    [0, 0.15, 0.30].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(idx === 2 ? 1046.50 : 880, now + offset);
      gain.gain.setValueAtTime(0.25, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.12);
    });
  } catch (e) {}
}

// Son de succès / tâche terminée
function playSuccessSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.08);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.setValueAtTime(0.2, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.35);
    });
  } catch (e) {}
}

window.SoundEngine = {
  initAudio,
  isMuted,
  setMuted,
  toggleMute,
  updateSoundButtonUI,
  playMessageSound,
  playSentSound,
  playUrgentAlert,
  playSuccessSound
};