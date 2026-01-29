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
let hasUserInteracted = false;
let interactionPromise = null;

function waitForFirstInteraction() {
  if (hasUserInteracted || typeof window === 'undefined') {
    hasUserInteracted = true;
    return Promise.resolve();
  }
  if (!interactionPromise) {
    interactionPromise = new Promise((resolve) => {
      const events = ['pointerdown', 'keydown', 'touchstart'];
      const markInteracted = () => {
        hasUserInteracted = true;
        events.forEach((evt) => window.removeEventListener(evt, markInteracted));
        resolve();
      };
      events.forEach((evt) => window.addEventListener(evt, markInteracted, { once: true }));
    });
  }
  return interactionPromise;
}

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

async function ensureContextReady(ctx) {
  if (!ctx) return false;
  if (ctx.state === 'running') return true;

  try {
    await ctx.resume();
    if (ctx.state === 'running') return true;
  } catch (err) {
    // ignore and fall back to waiting for a gesture
  }

  await waitForFirstInteraction();
  try {
    await ctx.resume();
  } catch (err) {
    return false;
  }
  return ctx.state === 'running';
}

function scheduleTone(ctx, startTime, { type, frequency, duration, gain }, volume) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = type || 'sine';
  oscillator.frequency.value = frequency || 660;
  const adjustedGain = Math.max(0, Math.min(1, (gain ?? 0.2) * volume));
  gainNode.gain.setValueAtTime(adjustedGain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
  return startTime + duration + 0.04;
}

export async function playNotificationSound(preset = 'chime', volume = 1) {
  if (preset === 'off') return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const isReady = await ensureContextReady(ctx);
  if (!isReady) return;

  const steps = SOUND_PRESETS[preset] || SOUND_PRESETS.chime;
  if (!Array.isArray(steps) || steps.length === 0) return;

  const clampedVolume = Number.isFinite(Number(volume))
    ? Math.max(0, Math.min(1, Number(volume)))
    : 1;
  const startAt = ctx.currentTime + 0.02;
  steps.reduce((time, step) => scheduleTone(ctx, time, step, clampedVolume), startAt);
}

export function getNotificationSoundOptions() {
  return [
    { value: 'chime', label: 'Chime' },
    { value: 'soft', label: 'Soft ping' },
    { value: 'alert', label: 'Alert' },
    { value: 'off', label: 'Off' },
  ];
}
