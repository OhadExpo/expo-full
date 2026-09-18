// BHBC ROSTER: THE ENGLISH NAME, WHERE ONE ACTUALLY EXISTS.
//
// Ohad, 18.9: "replace all the israeli athletes to their names in english (all
// bhbc athletes and previous bhbc athletes) … make sure you fill all their info
// too".
//
// Every rename is checked against something, and the Hebrew is KEPT in
// `nameLocal` so nothing is lost and a Hebrew search still finds the player.
// What each was checked against is recorded beside it IN THE PRIVATE MAP, not
// here: RealGM / Proballers / Eurobasket where the player is published, his
// own club sheet where he is not, and - for three of them - HIS OWN EMAIL
// ADDRESS, which beats every website. One site spelled a surname one way,
// another differently, a third filed him under a different first name
// entirely; the man's own signature settled it.
//
// Weights are NOT invented. Exactly one of these players has a published
// weight and he already had it; the rest stay empty.
//
//   DRY=1 node scripts/bhbc-english-names.mjs
//         node scripts/bhbc-english-names.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = !!process.env.DRY;
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const auth = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: process.env.OWNER_PW || '1234' });
if (auth.error) { console.log('sign-in failed: ' + auth.error.message); process.exit(1); }

// THE NAMES LIVE OUTSIDE THE REPO.
//
// They were inline here until 18.9 and that was a straight breach of the
// rule: OhadExpo/expo-full is PUBLIC, and this file held six athletes in two
// languages with their dates of birth, heights, weights and fragments of
// their personal email addresses. The map moved to
// expo-private-backups/bhbc/name-map.mjs; this refuses to run without it
// rather than keeping a copy.
const MAP_PATH = process.env.BHBC_NAME_MAP
  || 'C:/Users/Administrator/expo-private-backups/bhbc/name-map.mjs';
let RENAME, FILL;
try {
  ({ RENAME, FILL } = await import('file:///' + MAP_PATH.replace(/\\/g, '/')));
} catch (e) {
  console.log('FAILED: the private name map is not readable at ' + MAP_PATH);
  console.log('It is deliberately not in the repo. Point BHBC_NAME_MAP at it, or restore it from the backups.');
  process.exit(1);
}
if (!RENAME || !Object.keys(RENAME).length) { console.log('FAILED: the name map is empty - nothing would be renamed.'); process.exit(1); }

const get = async (k) => (await s.from('store').select('value').eq('key', k).maybeSingle()).data?.value ?? null;
const roster = (await get('expo-bhbc-roster')) || [];
const trainees = (await get('expo-trainees')) || [];

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
fs.mkdirSync('audit-out/bhbc-state', { recursive: true });
const snap = `audit-out/bhbc-state/names-before-${stamp}.json`;
fs.writeFileSync(snap, JSON.stringify({ roster, trainees }, null, 1));

// Hebrew text arrives with any of three apostrophes (' ׳ ’) and stray spaces;
// match on a normalised key so a geresh does not decide whether a player is
// renamed.
const norm = (x) => String(x || '').trim().replace(/['׳’ʼ]/g, "'").replace(/\s+/g, ' ');
const RENAME_N = Object.fromEntries(Object.entries(RENAME).map(([k, v]) => [norm(k), v]));
const FILL_N = Object.fromEntries(Object.entries(FILL).map(([k, v]) => [norm(k), v]));

const changes = [];
const apply = (arr, where) => arr.map((a) => {
  if (!a || !a.name) return a;
  const key = norm(a.name);
  const r = RENAME_N[key];
  let next = a;
  if (r) {
    next = { ...next, name: r.en, nameLocal: a.name };
    changes.push(`${where}: ${a.name} -> ${r.en}   (${r.src})`);
  }
  const fill = FILL_N[key];
  if (fill) {
    for (const [k, v] of Object.entries(fill)) {
      if (k === 'note') continue;
      if (!next[k]) { next = { ...next, [k]: v }; changes.push(`${where}: ${next.name} ${k} = ${v}`); }
    }
  }
  return next;
});

const roster2 = apply(roster, 'roster');
const trainees2 = apply(trainees, 'trainees');

// THE ROSTER AND THE TRAINEE RECORD ARE THE SAME PERSON. Measured 18.9: the
// club roster carried no email or phone for three players whose trainee record
// had both (gershon.amit@, roy.solomon124@). Nothing is invented here - a blank
// roster field is filled from the SAME ATHLETE'S trainee row, matched by id.
const byId = Object.fromEntries(trainees2.filter((t) => t && t.id).map((t) => [t.id, t]));
const CARRY = ['email', 'phone', 'position', 'weight', 'height', 'heightCm', 'dob', 'nationality'];
for (let i = 0; i < roster2.length; i++) {
  const a = roster2[i];
  const t = a && byId[a.id];
  if (!t) continue;
  let next = a;
  for (const k of CARRY) {
    const have = next[k];
    const from = t[k];
    if ((have === undefined || have === null || have === '') && from !== undefined && from !== null && from !== '') {
      next = { ...next, [k]: from };
      changes.push(`roster: ${next.name} ${k} <- trainee record (${String(from).slice(0, 28)})`);
    }
  }
  roster2[i] = next;
}

console.log(`restore point: ${snap}\n`);
console.log(changes.length ? changes.join('\n') : 'nothing to change');
if (DRY) { console.log('\nDRY RUN - nothing written.'); process.exit(0); }
if (!changes.length) process.exit(0);

for (const [key, val] of [['expo-bhbc-roster', roster2], ['expo-trainees', trainees2]]) {
  const up = await s.from('store').upsert({ key, value: val }, { onConflict: 'key' });
  if (up.error) { console.log(`WRITE FAILED ${key}: ${up.error.message}`); process.exit(1); }
}
const after = (await get('expo-bhbc-roster')) || [];
const stillHebrew = after.filter((a) => /[֐-׿]/.test(a.name || '')).map((a) => a.name);
console.log(`\nroster names still in Hebrew: ${stillHebrew.length ? stillHebrew.join(', ') : 'none'}`);
