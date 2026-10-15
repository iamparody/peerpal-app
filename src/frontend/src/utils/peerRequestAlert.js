// In-app alert for incoming peer requests (app open / foreground).
// Background pushes are rendered by the service worker (public/sw-notifications.js).
// Design: docs/peer-request-push.md
//
// The ringtone is a rising three-note motif (C5 → E5 → G5), played twice. It is
// deliberately different from the two-tone 660/880 Hz pair used for therapist calls,
// so a peer can tell "someone needs support" apart by ear.

export const PEER_REQUEST_TAG = 'peer_request_broadcast';

const MOTIF = [523.25, 659.25, 783.99]; // C5, E5, G5
const NOTE_S = 0.16;
const NOTE_GAP_S = 0.05;
const REPEAT_AFTER_S = 1.1;
const REPEATS = 2;
const PEAK_GAIN = 0.22;

// Pure: [{ at, freq, dur }] offsets in seconds from start.
export function toneSchedule() {
  const notes = [];
  for (let r = 0; r < REPEATS; r++) {
    MOTIF.forEach((freq, i) => {
      notes.push({ at: r * REPEAT_AFTER_S + i * (NOTE_S + NOTE_GAP_S), freq, dur: NOTE_S });
    });
  }
  return notes;
}

// Pure: returns a gate that lets one ring through per cooldown window. The banner (App.jsx)
// and PeerRequestScreen both watch the same open-request list; the gate stops a double ring.
export function createRingGate(cooldownMs = 4000) {
  let last = -Infinity;
  return (now = Date.now()) => {
    if (now - last < cooldownMs) return false;
    last = now;
    return true;
  };
}

const gate = createRingGate();
let ctx = null;

function audioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  // One shared context: browsers cap concurrent contexts and the old code made one per beep.
  if (!ctx || ctx.state === 'closed') ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Returns true if the ringtone was scheduled.
export function playPeerRequestTone({ now = Date.now(), getContext = audioContext } = {}) {
  if (!gate(now)) return false;
  try {
    const ac = getContext();
    if (!ac) return false;
    const t0 = ac.currentTime;
    for (const { at, freq, dur } of toneSchedule()) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(PEAK_GAIN, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + at + dur);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([300, 100, 300]);
    return true;
  } catch {
    return false; // AudioContext blocked (no user gesture yet) — the banner still shows
  }
}

// Pure: notifications whose request is no longer open.
export function staleRequestNotifications(notifications, openRequestIds) {
  const open = new Set(openRequestIds.map(String));
  return notifications.filter(n => !open.has(String(n.data?.request_id ?? '')));
}

// A peer-request push lives until tapped (requireInteraction), but the request itself
// lasts ~130s. When the app polls open requests, close the system notifications for
// requests that were taken, cancelled or expired, so nobody taps a dead request.
export async function closeStaleRequestNotifications(openRequestIds) {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 0;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.getNotifications) return 0;
    const shown = await reg.getNotifications({ tag: PEER_REQUEST_TAG });
    const stale = staleRequestNotifications(shown, openRequestIds);
    stale.forEach(n => n.close());
    return stale.length;
  } catch {
    return 0;
  }
}
