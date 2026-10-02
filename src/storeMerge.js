// THREE-WAY MERGE FOR A STORE VALUE (2.10 #510-B1/B2).
//
// The `store` table holds whole JSON values (the roster, the club's season of
// loads keyed by athlete, the activity feed...) and every save wrote the WHOLE
// value. A device holding a stale copy - a snapshot from a failed load, a phone
// that slept through realtime, a queued offline write replayed later - put its
// old copy over everything other devices had saved since. Measured shapes of
// the loss: another coach's twelve RPE entries gone when the physio tapped one
// availability chip; an athlete added on the desktop gone when the phone came
// back online.
//
// useSupaStore now writes compare-and-swap on the row's updated_at. When the
// row moved under it, it reads the newer value and merges:
//
//     base   = the value this device last knew the server held
//     mine   = what this device wants to write (base + its own edits)
//     theirs = what the server holds now (base + everyone else's edits)
//
// The result keeps BOTH sets of edits wherever they touch different things:
//   - plain objects merge key by key, recursively
//   - arrays whose items all carry an `id` merge item by item (theirs' order,
//     then my new items); an item I deleted goes unless they changed it
//   - anything else (numbers, strings, unkeyed arrays) is a leaf: if only one
//     side changed it, that side wins; if both did, MINE wins - this device's
//     user just made that edit, and it is the same rule the store had for
//     everything before, now confined to the one value both sides touched.
// Nothing here talks to the network; scripts/verify-store-merge.mjs holds it.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const idOf = (x) => (x && typeof x === 'object' && (typeof x.id === 'string' || typeof x.id === 'number') ? String(x.id) : null);
const keyedArray = (a) => Array.isArray(a) && a.every((x) => idOf(x) !== null) && new Set(a.map(idOf)).size === a.length;

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object') {
    if (Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

const ABSENT = Symbol('absent');

function mergeAny(base, mine, theirs) {
  if (deepEqual(mine, theirs)) return mine;
  if (deepEqual(mine, base)) return theirs;      // I did not touch it
  if (deepEqual(theirs, base)) return mine;      // they did not touch it
  // both changed it
  if (isObj(mine) && isObj(theirs)) return mergeObjects(isObj(base) ? base : {}, mine, theirs);
  if (keyedArray(mine) && keyedArray(theirs) && (base === ABSENT || base === undefined || keyedArray(base))) {
    return mergeKeyedArrays(keyedArray(base) ? base : [], mine, theirs);
  }
  return mine;                                   // a leaf both changed: this device's edit
}

function mergeObjects(base, mine, theirs) {
  const out = {};
  const keys = new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base)]);
  for (const k of keys) {
    const b = Object.prototype.hasOwnProperty.call(base, k) ? base[k] : ABSENT;
    const m = Object.prototype.hasOwnProperty.call(mine, k) ? mine[k] : ABSENT;
    const t = Object.prototype.hasOwnProperty.call(theirs, k) ? theirs[k] : ABSENT;
    const v = mergeSlot(b, m, t);
    if (v !== ABSENT) out[k] = v;
  }
  return out;
}

// one key / one id: present-or-absent on each side
function mergeSlot(b, m, t) {
  if (m === ABSENT && t === ABSENT) return ABSENT;
  if (m === ABSENT) {                    // gone on my side
    if (b === ABSENT) return t;          // never had it: they added it
    return deepEqual(t, b) ? ABSENT : t; // I deleted it; keep it only if they changed it
  }
  if (t === ABSENT) {                    // gone on theirs
    if (b === ABSENT) return m;          // I added it
    return deepEqual(m, b) ? ABSENT : m; // they deleted it; keep it only if I changed it
  }
  return mergeAny(b === ABSENT ? undefined : b, m, t);
}

function mergeKeyedArrays(base, mine, theirs) {
  const bm = new Map(base.map((x) => [idOf(x), x]));
  const mm = new Map(mine.map((x) => [idOf(x), x]));
  const tm = new Map(theirs.map((x) => [idOf(x), x]));
  const out = [];
  const seen = new Set();
  const push = (id) => {
    if (seen.has(id)) return; seen.add(id);
    const v = mergeSlot(bm.has(id) ? bm.get(id) : ABSENT, mm.has(id) ? mm.get(id) : ABSENT, tm.has(id) ? tm.get(id) : ABSENT);
    if (v !== ABSENT) out.push(v);
  };
  // the server's order, then what only I have, in my order (a new item lands
  // where I put it relative to the end - new rows are appended in this app)
  for (const x of theirs) push(idOf(x));
  for (const x of mine) push(idOf(x));
  return out;
}

// The entry point. `base` may be undefined (this device never saw the server's
// copy - e.g. it booted from a snapshot): then nothing can be called "mine
// only", and the merge keeps everything either side holds, preferring mine
// where both hold a different value.
export function mergeStoreValues(base, mine, theirs) {
  if (base === undefined) {
    if (isObj(mine) && isObj(theirs)) return mergeObjects({}, mine, theirs);
    if (keyedArray(mine) && keyedArray(theirs)) return mergeKeyedArrays([], mine, theirs);
    return mine;
  }
  return mergeAny(base, mine, theirs);
}
