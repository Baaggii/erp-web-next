const SOUND_PRESETS = {
  chime: [
    { type: 'sine', frequency: 880, duration: 0.12, gain: 0.35 },
    { type: 'sine', frequency: 660, duration: 0.14, gain: 0.35 },
  ],
  soft: [
    { type: 'triangle', frequency: 540, duration: 0.18, gain: 0.25 },
  ],
  alert: [
    { type: 'square', frequency: 720, duration: 0.16, gain: 0.3 },
    { type: 'square', frequency: 520, duration: 0.14, gain: 0.3 },
    { type: 'square', frequency: 720, duration: 0.12, gain: 0.25 },
  ],
};

let cachedContext = null;
let userGestureCaptured = false;
let unlockHandlersAttached = false;

function getAudioContext() {
  if (cachedContext) return cachedContext;
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext || window.webkitAudioContext
      : null;
  if (!AudioCtx) return null;
  cachedContext = new AudioCtx();
  return cachedContext;
}

function handleFirstUserGesture() {
  userGestureCaptured = true;
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export function initializeAudioContextUnlock() {
  if (unlockHandlersAttached || typeof window === 'undefined') return;
  unlockHandlersAttached = true;
  ['pointerdown', 'keydown', 'touchstart'].forEach((event) => {
    window.addEventListener(
      event,
      () => {
        handleFirstUserGesture();
      },
      { once: true },
    );
  });
}

function scheduleTone(ctx, startTime, { type, frequency, duration, gain }) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = type || 'sine';
  oscillator.frequency.value = frequency || 660;
  gainNode.gain.setValueAtTime(gain ?? 0.2, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
  return startTime + duration + 0.04;
}

export async function playNotificationSound(preset = 'chime', options = {}) {
  if (preset === 'off') return;
  if (options.userGesture) {
    handleFirstUserGesture();
  }
  if (!userGestureCaptured) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (err) {
      console.warn('Unable to resume audio context', err);
      return;
    }
  }

  const steps = SOUND_PRESETS[preset] || SOUND_PRESETS.chime;
  if (!Array.isArray(steps) || steps.length === 0) return;

  const startAt = ctx.currentTime + 0.02;
  steps.reduce((time, step) => scheduleTone(ctx, time, step), startAt);
}

export function getNotificationSoundOptions() {
  return [
    { value: 'chime', label: 'Chime' },
    { value: 'soft', label: 'Soft ping' },
    { value: 'alert', label: 'Alert' },
    { value: 'off', label: 'Off' },
  ];
}
