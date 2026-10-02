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

// Son festif de récompense / gain (fanfare joyeuse + carillon de pièces scintillantes)
function playRewardSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    // Fanfare de triomphe joyeux : Do5, Mi5, Sol5, Do6, Mi6
    const fanfareNotes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    fanfareNotes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.setValueAtTime(0.26, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + (idx === fanfareNotes.length - 1 ? 0.9 : 0.25));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + (idx === fanfareNotes.length - 1 ? 0.9 : 0.25));
    });

    // Carillon doré scintillant (effet pièces d'or)
    const sparkleTimes = [0.25, 0.45, 0.65, 0.85, 1.05, 1.25];
    sparkleTimes.forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760 + i * 220, now + t);
      gain.gain.setValueAtTime(0.12, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.18);
    });
  } catch (e) {
    console.warn('Audio reward error:', e);
  }
}

// Son comique déçu puis gourmand ("wah-wah" comique + carillon gourmand)
function playDisappointedDessertSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    // Descente comique fa, mi, mib, re
    const wahNotes = [349.23, 329.63, 311.13, 293.66];
    wahNotes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.94, now + idx * 0.16 + 0.15);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.setValueAtTime(0.18, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.16);
    });

    // Carillon gourmand double dessert
    const chimeTimes = [0.75, 0.92, 1.08];
    const chimeNotes = [587.33, 783.99, 1174.66];
    chimeTimes.forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(chimeNotes[i], now + t);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.setValueAtTime(0.22, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.28);
    });
  } catch (e) {
    console.warn('Audio disappointed error:', e);
  }
}

// Son joyeux d'actualisation de chambre (canzone allegra di ~3 secondi per il tablet)
function playHappySongSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    function playNote(freq, startTime, duration, type = 'triangle', gainVal = 0.22) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      const attack = 0.012;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(gainVal, startTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    // Mélodie joyeuse et rythmée (~3 secondes)
    const melody = [
      // Phrase 1: bond joyeux
      { f: 523.25, t: 0.00, d: 0.14 }, // Do5
      { f: 659.25, t: 0.14, d: 0.14 }, // Mi5
      { f: 783.99, t: 0.28, d: 0.14 }, // Sol5
      { f: 1046.50, t: 0.44, d: 0.22 }, // Do6

      // Phrase 2: saut dansant
      { f: 987.77, t: 0.70, d: 0.14 }, // Si5
      { f: 783.99, t: 0.84, d: 0.14 }, // Sol5
      { f: 880.00, t: 0.98, d: 0.14 }, // La5
      { f: 987.77, t: 1.12, d: 0.14 }, // Si5
      { f: 1046.50, t: 1.26, d: 0.18 }, // Do6

      // Phrase 3: montée entraînante
      { f: 1174.66, t: 1.46, d: 0.14 }, // Re6
      { f: 1046.50, t: 1.60, d: 0.14 }, // Do6
      { f: 1174.66, t: 1.74, d: 0.14 }, // Re6
      { f: 1318.51, t: 1.88, d: 0.22 }, // Mi6

      // Phrase 4: apothéose triomphante et finale
      { f: 1567.98, t: 2.12, d: 0.18 }, // Sol6
      { f: 1318.51, t: 2.30, d: 0.18 }, // Mi6
      { f: 1174.66, t: 2.48, d: 0.16 }, // Re6
      { f: 1046.50, t: 2.64, d: 0.46 }  // Do6 (longue note finale)
    ];

    melody.forEach(n => playNote(n.f, now + n.t, n.d, 'triangle', 0.20));

    // Harmonies chaleureuses / basse rythmée
    const chords = [
      { f: 261.63, t: 0.00, d: 0.65 }, // Do4
      { f: 329.63, t: 0.00, d: 0.65 }, // Mi4
      { f: 196.00, t: 0.70, d: 0.65 }, // Sol3
      { f: 293.66, t: 0.70, d: 0.65 }, // Re4
      { f: 349.23, t: 1.46, d: 0.60 }, // Fa4
      { f: 440.00, t: 1.46, d: 0.60 }, // La4
      { f: 392.00, t: 2.12, d: 0.50 }, // Sol4
      { f: 493.88, t: 2.12, d: 0.50 }, // Si4
      { f: 261.63, t: 2.64, d: 0.50 }, // Do4 (accord final Do majeur)
      { f: 392.00, t: 2.64, d: 0.50 }, // Sol4
      { f: 659.25, t: 2.64, d: 0.50 }  // Mi5
    ];

    chords.forEach(c => playNote(c.f, now + c.t, c.d, 'sine', 0.14));

    // Petits carillons scintillants sur la fin (effet joyeux magique)
    const sparkles = [
      { f: 1567.98, t: 2.70, d: 0.20 }, // Sol6
      { f: 2093.00, t: 2.84, d: 0.22 }, // Do7
      { f: 2637.02, t: 2.98, d: 0.25 }  // Mi7
    ];

    sparkles.forEach(s => playNote(s.f, now + s.t, s.d, 'sine', 0.12));
  } catch (e) {
    console.warn('Audio happy song error:', e);
  }
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
  playSuccessSound,
  playRewardSound,
  playDisappointedDessertSound,
  playHappySongSound
};