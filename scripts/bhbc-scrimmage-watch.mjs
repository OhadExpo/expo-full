// A SCRIMMAGE THAT ENDED WITH NO BOX SCORE, TOLD TO HIM (14.10 #738, Ohad: "make sure the cup games, the scrimmages,
// and the bcl games also gets logged automatically").
//
// Cup games ride basket.co.il's boards (bhbc-log-game --auto) and the BCL its own site (bhbc-log-game-bcl --auto).
// A scrimmage has no public source: its box score is a printed sheet photographed into the club's medical WhatsApp
// group, and reading WhatsApp from a 20-minute loop means restarting it in debug mode, which has logged it out
// before. So this step does the part that can run unattended: every scrimmage that ended 2 h+ ago (last 14 days)
// with no game row for the squad is pushed to his phone ONCE, with where the sheet is.
//
//   node scripts/bhbc-scrimmage-watch.mjs [--dry]      break test: DAYS=60 IGNORE_LOGGED=1 ... --dry must list the old ones
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerClient, readStore } from './lib/store-client.mjs';
import { pushOwner } from './db-watchdog.mjs';

const DRY = process.argv.includes('--dry');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(REPO, 'audit-out/sheets/scrimmage-watch.json');
const say = (m) => console.log(m);

const s = await ownerClient();
const fixtures = (await readStore(s, 'expo-bhbc-fixtures')) || [];
const loads = (await readStore(s, 'expo-bhbc-loads')) || {};
const trainees = (await readStore(s, 'expo-trainees')) || [];
const roster = trainees.filter((t) => t && t.team === 'BHBC' && t.status !== 'Archived');
const endOf = (f) => { const [h, m] = String(f.start || '00:00').split(':').map(Number); const d = new Date(`${f.date}T00:00:00`); d.setHours(h || 0, (m || 0) + (Number(f.minutes) || 120), 0, 0); return d.getTime(); };
const logged = (date) => roster.some((t) => (((loads[t.id] || {}).sessions || {})[date] || []).some((r) => r && (r.box != null || r.kind === 'game')   /* a scrimmage row carries its box line, kind is unset on it */));
const DAYS = Number(process.env.DAYS) || 14, IGNORE_LOGGED = process.env.IGNORE_LOGGED === '1';
const due = fixtures.filter((f) => f && f.type === 'scrimmage' && endOf(f) < Date.now() - 2 * 3600e3 && endOf(f) > Date.now() - DAYS * 864e5 && (IGNORE_LOGGED || !logged(String(f.date).slice(0, 10))));
let st = {}; try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { /* first run */ }
const fresh = due.filter((f) => !st[`${f.date}|${f.start || ''}`]);
if (!due.length) { console.log('SCRIMMAGE WATCH: nothing waiting'); process.exit(0); }
console.log(`SCRIMMAGE WATCH: ${due.length} ended with no box score (${fresh.length} not told yet): ${due.map((f) => `${f.date} ${f.opponent || f.title || ''}`).join(' | ')}`);
if (DRY || !fresh.length || IGNORE_LOGGED) process.exit(0);   // a break test never pushes
for (const f of fresh) {
  const who = f.opponent ? ` vs ${f.opponent}` : '';
  await pushOwner(say, `BHBC: scrimmage ${f.date}${who} - no box score yet`, 'The sheet photo is usually in the WhatsApp group "בני הרצליה - רפואי 26/27". Send it to me (or say "log") and I will log every line.');
  st[`${f.date}|${f.start || ''}`] = new Date().toISOString();
}
fs.mkdirSync(path.dirname(STATE), { recursive: true });
fs.writeFileSync(STATE, JSON.stringify(st, null, 1));
