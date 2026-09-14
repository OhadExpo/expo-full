// A game the calendar no longer has must go too - but only if the CALENDAR is
// where it came from. Seeded league fixtures (travel, flights, venues typed by
// hand) have no `source`, and nothing in a calendar edit should delete those.
// Until now games were never dropped, so a cancelled or moved game would have
// lingered next to its replacement forever.
import fs from 'node:fs';
const f = 'scripts/sync-bhbc-calendar.mjs';
let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const a = `  } else if (inWindow && f.type !== 'game') { dropped++; }`;
if (s.split(a).length !== 2) throw new Error('anchor');
s = s.replace(a, `  } else if (inWindow && (f.type !== 'game' || f.source === 'calendar')) { dropped++; }`);
fs.writeFileSync(f, s);
console.log('ok: a calendar-sourced game that vanished is dropped');
