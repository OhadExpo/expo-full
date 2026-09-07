import fs from 'node:fs';
const f = 'scripts/build-tonight.mjs';
let s = fs.readFileSync(f, 'utf8');
const rep = (from, to) => { if (s.split(from).length - 1 !== 1) throw new Error('match count != 1: ' + from.slice(0, 60)); s = s.split(from).join(to); };
rep(`...readPairs('audit-out/pairs/pairs-small.json')];`, `...readPairs('audit-out/pairs/pairs-small.json'), ...readPairs('audit-out/pairs/pairs-small2.json')];`);
rep(`  'billing-he': ['Billing, in Hebrew',`, `  'waitlist-he': ['The waitlist, in Hebrew', 'The funnel tiles, the table headers, the note placeholders and the kanban cards: the owner-only prospects page had no translator in two of its three components.'],
  'workouts-he': ['Workouts, in Hebrew', 'CUE, Completed, Complete Workout, LOG INTO and the two empty states: the logger component had no translator.'],
  'review-he': ['The review page, in Hebrew', 'Compare with…, WORKOUT, SETS DONE, READINESS CHECK-IN and the two empty states.'],
  'billing-he': ['Billing, in Hebrew',`);
fs.writeFileSync(f, s);
console.log('build-tonight patched (small2)');
