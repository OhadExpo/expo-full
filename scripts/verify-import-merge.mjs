// verify-import-merge.mjs - Smart Import never erases an athlete's data with a
// blank cell (5.10 #554). Pure logic, no network. BREAK=1 runs the OLD merge
// (Object.assign) and must FAIL - proof the gate sees the bug.
import { mergeFilled } from '../src/importMerge.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const merge = process.env.BREAK ? (cur, item) => Object.assign(cur, item) : mergeFilled;

const athlete = () => ({ id: 'tr_1', name: 'Test Athlete', phone: '050-1234567', email: 'a@b.c', notes: 'left knee', goals: ['strength'], status: 'Active' });

let a = merge(athlete(), { name: 'Test Athlete', phone: '', email: '   ', notes: null, goals: [] });
ok(a.phone === '050-1234567' && a.email === 'a@b.c' && a.notes === 'left knee' && a.goals.length === 1, 'blank, whitespace, null and empty-list cells leave the existing values alone');

a = merge(athlete(), { phone: '052-7654321', notes: 'right shoulder' });
ok(a.phone === '052-7654321' && a.notes === 'right shoulder', 'a cell WITH a value updates the athlete');

a = merge(athlete(), { package: '10 sessions' });
ok(a.package === '10 sessions' && a.phone === '050-1234567', 'a new field is added, nothing else touched');

a = merge(athlete(), { sessions: 0 });
ok(a.sessions === 0, 'a real zero is a value, not a blank');

a = merge(athlete(), {});
ok(JSON.stringify(a) === JSON.stringify(athlete()), 'an empty row changes nothing');

console.log(`IMPORT MERGE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
