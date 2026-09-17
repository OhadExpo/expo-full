// A prep game's result, from the printed box score he photographs.
//
//   node scripts/bhbc-set-scrimmage-result.mjs <date> <us> <them> [opponent]
//
// Scrimmages come off the club calendar with a title and a clock and nothing
// else - basket.co.il never sees them, so the only source for the opponent and
// the scoreline is the sheet he is handed at the table. Stored on the fixture
// itself (`us`/`them`), which the calendar sync carries forward untouched.
import { ownerClient, readStore, writeStore } from './lib/store-client.mjs';

const DRY = process.argv.includes('--dry');
const [date, us, them, ...opp] = process.argv.slice(2).filter((a) => a !== '--dry');
if (!date || us == null || them == null) { console.log('usage: <YYYY-MM-DD> <us> <them> [opponent]'); process.exit(2); }

const s = await ownerClient();
const fx = (await readStore(s, 'expo-bhbc-fixtures')) || [];
const hits = fx.filter((f) => String(f.date).slice(0, 10) === date && (f.type === 'scrimmage' || f.type === 'game'));
if (hits.length !== 1) { console.log(`expected ONE game/scrimmage on ${date}, found ${hits.length}:`, hits.map((h) => h.title).join(' | ')); process.exit(1); }
const f = hits[0];
f.us = Number(us); f.them = Number(them); f.played = true;
if (opp.length) f.opponent = opp.join(' ');
console.log(`${date} ${f.type} vs ${f.opponent || '(no opponent)'} — Bnei Herzliya ${f.us}–${f.them} (${f.us > f.them ? 'W' : 'L'})`);
if (DRY) { console.log('--dry: nothing written'); process.exit(0); }
console.log('written; backup', await writeStore(s, 'expo-bhbc-fixtures', fx));
