// E9 — dictionary hygiene for the two Hebrew dictionaries.
//   node audit-out/dict-hygiene.mjs            report
// Reports, per dictionary:
//   1. the same English under different casings mapped to DIFFERENT Hebrew
//      (tr() is case-insensitive with exact-first, so which one wins depends
//      on how the call site spelled it - that is the trap)
//   2. values that still carry Latin letters beyond the allowed tokens
//   3. values identical to their key (an untranslated entry)
//   4. empty values
import { HE } from '../src/i18n.js';
import { HE as BHBC } from '../src/bhbcHe.js';

// Brand, tech and jargon that stays Latin inside Hebrew on purpose.
const ALLOW = /\b(?:EXPO|BHBC|MD[-+]?\d?|RPE|RTP|ACWR|ROM|GD|BW|HRV|VBT|PDF|CSV|SHA|URL|ID|AI|VS|vs|W\d?|1RM|RM|DB|BB|KB|TRX|RDL|OHP|PPG|RPG|APG|MPG|PIR|GP|FT|3P|kg|km|cm|mm|ms|min|Bit|Zoom|WhatsApp|Google|Gmail|YouTube|Drive|Sheets|Vercel|Supabase|iOS|Android|Chrome|Safari|PWA|SW|CTA|UA|Ctrl|Enter|Space|Shift|Esc|Alt|Cmd|Tab|Nord|Heebo|Wi-Fi|L\d\/L\d|L\d|S\d|C\d|T\d|[A-Z]\.?)\b|\d+(?:st|nd|rd|th)|%1RM|\/coaches#waitlist|\/book|\/try|\/demo|\/athlete|\/coach|#\w+|@|expo-app\.co\.il|[a-z]+\.[a-z]{2,}/g;

function report(name, dict) {
  const keys = Object.keys(dict);
  const byLower = new Map();
  for (const k of keys) {
    const l = k.toLowerCase();
    if (!byLower.has(l)) byLower.set(l, []);
    byLower.get(l).push(k);
  }
  const casingConflicts = [...byLower.values()].filter((ks) => ks.length > 1 && new Set(ks.map((k) => dict[k])).size > 1);
  const casingDup = [...byLower.values()].filter((ks) => ks.length > 1 && new Set(ks.map((k) => dict[k])).size === 1);
  const latin = keys.filter((k) => {
    const v = String(dict[k] ?? '');
    const stripped = v.replace(ALLOW, '').replace(/\{[a-z]+\}/g, '');
    return /[A-Za-z]{2,}/.test(stripped);
  });
  const same = keys.filter((k) => dict[k] === k);
  const empty = keys.filter((k) => !String(dict[k] ?? '').trim());
  console.log(`\n=== ${name}: ${keys.length} keys ===`);
  console.log(`1. casing conflicts (same English, different Hebrew): ${casingConflicts.length}`);
  for (const ks of casingConflicts) console.log('   ' + ks.map((k) => `${JSON.stringify(k)} → ${dict[k]}`).join('  |  '));
  console.log(`   (same English under several casings with ONE Hebrew: ${casingDup.length} - harmless, tr() folds them)`);
  console.log(`2. values with Latin words beyond the allowlist: ${latin.length}`);
  for (const k of latin) console.log(`   ${JSON.stringify(k)} → ${dict[k]}`);
  console.log(`3. values identical to their key: ${same.length}`);
  for (const k of same) console.log(`   ${JSON.stringify(k)}`);
  console.log(`4. empty values: ${empty.length}`);
  for (const k of empty) console.log(`   ${JSON.stringify(k)}`);
  return { casingConflicts, latin, same, empty };
}

const a = report('src/i18n.js HE', HE);
const b = report('src/bhbcHe.js HE', BHBC);
const total = a.casingConflicts.length + a.latin.length + a.same.length + a.empty.length + b.casingConflicts.length + b.latin.length + b.same.length + b.empty.length;
console.log(`\nTOTAL findings: ${total}`);
