// THE ATHLETE SEAT FENCE, TESTED — not just present.
//
// src/seatWrite.js decides which `store` rows a seat may write, and
// useSupaStore consults it before any write leaves the device (26.9, after an
// athlete saw "SAVE FAILED — EXPO-TRAINEES" over a workout that had saved).
// The fence shipped with an RLS contract test and a build-time boundary gate,
// but nothing exercised the fence itself. This does, four ways:
//
//   1. THE MATRIX — the real module, every seat against every kind of key.
//   2. THE WIRING — every `store` upsert in useSupaStore.js is behind
//      canSeatWrite: the offline-queue replay directly, the live writer
//      (writeToSupa) through its only caller, save(), after the fence.
//   3. THE BYPASSES — a `store` write outside the hook skips the fence. Each
//      one that exists is listed below with the reason it is safe; a new one
//      fails here until someone decides it is.
//   4. THE TIMING — App sets the seat during render. In an effect it ran after
//      every child's first-commit effects, so those writes met an 'unknown'
//      seat, which blocks nothing.
//
//   node scripts/verify-seat-fence.mjs        (exit 1 on any failure)
import fs from 'node:fs';
import { setSeat, canSeatWrite, recordBlockedWrite, blockedWrites } from '../src/seatWrite.js';

let bad = 0, checks = 0;
const check = (name, ok, detail = '') => { checks++; if (!ok) bad++; if (!ok || process.argv.includes('-v')) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`); };

// 1. the matrix ------------------------------------------------------------
const KEYS = {
  roster: 'expo-trainees', library: 'expo-exercises', workouts: 'expo-workouts', cw: 'expo-cw', bw: 'expo-bw',
  clubLoads: 'expo-bhbc-loads', clubRoster: 'expo-bhbc-roster', clubMedical: 'expo-bhbc-medical',
  presence: 'expo-presence-abc123', gymSession: 'expo-gym-session', leadNotes: 'expo-lead-notes', empty: '',
};
const CLUB = new Set(['clubLoads', 'clubRoster', 'clubMedical']);
const expect = {
  unknown: () => true,
  staff: () => true,
  athlete: (k) => k === 'presence',
  'bhbc-coach': (k) => k === 'presence' || CLUB.has(k),
};
for (const [seat, allowed] of Object.entries(expect)) {
  setSeat(seat, 'fixture@example.com');
  for (const [name, key] of Object.entries(KEYS)) {
    const want = allowed(name);
    check(`${seat.padEnd(10)} ${want ? 'may' : 'may NOT'} write ${key || '(empty key)'}`, canSeatWrite(key) === want, `-> ${canSeatWrite(key)}`);
  }
}
setSeat('athlete', 'fixture@example.com');
const before = blockedWrites().length;
let threw = null;
try { recordBlockedWrite('expo-trainees'); } catch (e) { threw = e; }
check('recording a blocked write never throws (no window, no same-origin fetch)', !threw, String(threw));
check('a blocked write is recorded for support', blockedWrites().length === before + 1 && blockedWrites().at(-1).key === 'expo-trainees' && blockedWrites().at(-1).seat === 'athlete');
setSeat('unknown');

// 2. the wiring --------------------------------------------------------------
const hook = fs.readFileSync('src/useSupaStore.js', 'utf8');
const storeUpserts = [...hook.matchAll(/from\('store'\)\.upsert\(/g)].map((m) => m.index);
check('useSupaStore.js has exactly the two known store upserts (replay + live writer)', storeUpserts.length === 2, `found ${storeUpserts.length} — a new write path must be fenced and listed here`);
// the enclosing top-level function of an offset: nearest preceding line that
// starts a function at column 0 or 2
const enclosing = (idx) => {
  const head = hook.slice(0, idx);
  const starts = [...head.matchAll(/\n(?:export )?(?:async )?function \w+|\n {2}const \w+ = useCallback\(/g)];
  return starts.length ? starts.at(-1).index : 0;
};
for (const at of storeUpserts) {
  const fnStart = enclosing(at);
  const body = hook.slice(fnStart, at);
  const line = hook.slice(0, at).split('\n').length;
  const isWriter = /const writeToSupa = useCallback/.test(body);
  if (isWriter) {
    const callers = [...hook.matchAll(/writeToSupa\(/g)].map((m) => m.index);
    const save = hook.indexOf('const save = useCallback(async (next) =>');
    const fence = hook.indexOf('if (!canSeatWrite(key))', save);
    const saveEnd = hook.indexOf('\n  }, [', save);
    check(`line ${line}: writeToSupa is called only from save()`, callers.length === 1 && callers[0] > save && callers[0] < saveEnd, `callers at ${callers.map((c) => hook.slice(0, c).split('\n').length)}`);
    check(`line ${line}: save() checks the fence before it calls writeToSupa`, fence > save && fence < callers[0], `fence at ${fence}`);
  } else {
    check(`line ${line}: the queued replay checks the fence before its upsert`, /if \(!canSeatWrite\(key\)\)/.test(body), 'no canSeatWrite in the enclosing function');
  }
}

// 3. the bypasses ------------------------------------------------------------
// file -> [expected count, why a fence is not needed]
const KNOWN_BYPASSES = {
  'src/App.jsx': [1, 'expo-bhbc-roster projection, inside `if (!isOwner) return`'],
  'src/ClientPortal.jsx': [1, "the athlete's own expo-presence-<id> row, the one write the seat is allowed"],
  'src/SessionsView.jsx': [4, 'expo-gym-session, the coach-only live floor (3 upserts + 1 delete)'],
  'src/SmartImportView.jsx': [3, 'owner-only import tool (library + roster)'],
  'src/WaitlistView.jsx': [1, 'expo-lead-notes, owner-only waitlist'],
};
const re = /from\(['"]store['"]\)\s*\.\s*(upsert|insert|update|delete)\(/g;
const found = {};
// Recursive: a store write in a subfolder bypasses the fence just the same.
for (const f of fs.readdirSync('src', { recursive: true })) {
  const rel = String(f).split('\\').join('/');
  if (!/\.(jsx?|mjs)$/.test(rel) || rel === 'useSupaStore.js') continue;
  const n = (fs.readFileSync(`src/${rel}`, 'utf8').match(re) || []).length;
  if (n) found[`src/${rel}`] = n;
}
for (const [f, n] of Object.entries(found)) {
  const known = KNOWN_BYPASSES[f];
  check(`${f}: ${n} direct store write(s) outside the fence are known`, !!known && known[0] === n, known ? `expected ${known[0]} (${known[1]})` : 'UNLISTED — route it through useSupaStore, or list it here with why the seat can never reach it');
}
for (const f of Object.keys(KNOWN_BYPASSES)) check(`${f}: listed bypass still exists (no stale allowlist)`, f in found, 'remove it from KNOWN_BYPASSES');

// 4. the timing --------------------------------------------------------------
const app = fs.readFileSync('src/App.jsx', 'utf8');
const call = app.indexOf('setSeat(isTrainer');
const effectBefore = app.lastIndexOf('useEffect(', call);
const lineBefore = app.lastIndexOf('\n', call);
check('App sets the seat during render, not inside a useEffect', call > 0 && !(effectBefore > 0 && call - effectBefore < 80 && !app.slice(effectBefore, call).includes('});')) && /^\s*$/.test(app.slice(lineBefore + 1, call)), 'setSeat(...) must be a statement in the component body');

console.log(`\nSEAT-FENCE GATE — ${checks} checks (4 seats x ${Object.keys(KEYS).length} keys, ${storeUpserts.length} hook upserts, ${Object.keys(found).length} bypass files), ${bad} failing`);
process.exit(bad ? 1 : 0);
