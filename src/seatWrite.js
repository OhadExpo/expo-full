// WHICH STORE ROWS THIS SEAT MAY WRITE — decided once, enforced everywhere.
//
// Ohad, 26.9: "build guards and safety nets that will never allow the athletes
// to not be able to use the app. 0 fails and bugs." The same day an athlete had
// been shown "SAVE FAILED — EXPO-TRAINEES" over a workout that had saved: the
// portal had upserted the staff-only roster row from the athlete's seat and RLS
// refused it. RLS is the last line; this is the first. A write the seat cannot
// make never leaves the device and never reaches the screen — it is recorded,
// not shown.
//
// The seat is set by App once the role is known (setSeat). Until then it is
// 'unknown' and nothing is blocked: a coach's first save must not wait on a
// role lookup, and RLS still stands behind it.

const BHBC_COACH_KEYS = [
  'expo-bhbc-roster', 'expo-bhbc-loads', 'expo-bhbc-fixtures', 'expo-bhbc-league',
  'expo-bhbc-medical', 'expo-bhbc-plans', 'expo-bhbc-activity',
];

let seat = { kind: 'unknown', email: null };
const blocked = [];   // ring buffer for support: window.__expoBlockedWrites

export function setSeat(kind, email = null) {
  seat = { kind: kind || 'unknown', email: email || null };
}

export function seatKind() { return seat.kind; }

// 'staff' writes everything (owner, partner, staff tier). 'bhbc-coach' writes
// the club zone's keys. 'athlete' writes only its own presence row. 'unknown'
// is not yet decided and is not blocked.
export function canSeatWrite(key) {
  const k = String(key || '');
  if (seat.kind === 'unknown' || seat.kind === 'staff') return true;
  if (/^expo-presence-/.test(k)) return true;
  if (seat.kind === 'bhbc-coach') return BHBC_COACH_KEYS.includes(k);
  return false;
}

// A blocked write is a BUG somewhere upstream (the seat should not have been
// asked), so it is recorded loudly for whoever debugs and quietly for the user.
export function recordBlockedWrite(key, why = 'seat may not write this key') {
  const entry = { key, seat: seat.kind, why, at: new Date().toISOString(), url: typeof location !== 'undefined' ? location.pathname : '' };
  blocked.push(entry);
  if (blocked.length > 50) blocked.shift();
  try { if (typeof window !== 'undefined') window.__expoBlockedWrites = blocked; } catch { /* noop */ }
  // eslint-disable-next-line no-console
  console.warn(`[EXPO] write to "${key}" blocked for seat "${seat.kind}" — ${why}`);
  try {
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'blocked-write', ...entry, ua: typeof navigator !== 'undefined' ? navigator.userAgent : '' }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* never let telemetry throw */ }
}

export function blockedWrites() { return blocked.slice(); }
