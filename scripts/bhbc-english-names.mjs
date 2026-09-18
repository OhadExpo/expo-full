// BHBC ROSTER: THE ENGLISH NAME, WHERE ONE ACTUALLY EXISTS.
//
// Ohad, 18.9: "replace all the israeli athletes to their names in english (all
// bhbc athletes and previous bhbc athletes) … make sure you fill all their info
// too".
//
// Every rename below is checked against something, and the Hebrew is KEPT in
// `nameLocal` so nothing is lost and a Hebrew search still finds the player:
//
//   עמית מנחם    -> Amit Menachem   RealGM/Proballers; DOB 2004-03-14 + PG + 187cm all match our row
//   עמית גרשון   -> Amit Gershon    Eurobasket/RealGM; DOB 1995-12-05 + 191cm + 88kg all match
//   רועי סולומון -> Roy Solomon     RealGM; DOB 2008-09-20 + 188cm match
//   נדבר בלצ'ר   -> Nadav Blachar   HIS OWN sheet map (nadav-blachar). Also fixes נדבר -> נדב.
//   יואב שמרי    -> Yoav Shamri     HIS OWN EMAIL (yoavshamri@). The web was no help and worse:
//                                   Basketball-Reference says "Shimri", Proballers "Yoal Shamri",
//                                   Eurobasket files him as "Ariel Shamri".
//   אמרי בילט    -> Imri Billet     HIS OWN EMAIL (billet.imri@). No English spelling of his name
//                                   exists on basket.co.il, Eurobasket, Proballers or RealGM.
//
// THE ATHLETE'S OWN EMAIL BEATS EVERY WEBSITE. Three of these five were settled
// by how the man spells himself — gershon.amit@, roy.solomon124@, yoavshamri@,
// billet.imri@ — and where a site disagreed, the site was wrong.
//
// Weights are NOT invented: only Amit Gershon has one published, and he already
// has it. The rest stay empty.
//
//   DRY=1 node scripts/bhbc-english-names.mjs
//         node scripts/bhbc-english-names.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = !!process.env.DRY;
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const auth = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: process.env.OWNER_PW || '1234' });
if (auth.error) { console.log('sign-in failed: ' + auth.error.message); process.exit(1); }

const RENAME = {
  'עמית מנחם': { en: 'Amit Menachem', src: 'RealGM/Proballers' },
  'עמית גרשון': { en: 'Amit Gershon', src: 'Eurobasket/RealGM' },
  'רועי סולומון': { en: 'Roy Solomon', src: 'RealGM' },
  "נדבר בלצ׳ר": { en: "Nadav Blachar", src: "his own sheet map" },
  'יואב שמרי': { en: 'Yoav Shamri', src: 'his own email, yoavshamri@' },
  'אמרי בילט': { en: 'Imri Billet', src: 'his own email, billet.imri@' },
};
// Published facts we did not have. Nothing here is a guess.
const FILL = {
  'אמרי בילט': { dob: '2008-10-20', position: 'Point Guard', note: 'no published English spelling' },
  'יואב שמרי': { dob: '2005-12-15' },
};

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
