// What the zone actually holds for a date: every session logged that day, and
// any fixture on it. A read-only check - used to prove a box score landed.
import { ownerClient, readStore } from './lib/store-client.mjs';
const s = await ownerClient();
const byId = Object.fromEntries(((await readStore(s, 'expo-trainees')) || []).map((x) => [x.id, x.name]));
const loads = (await readStore(s, 'expo-bhbc-loads')) || {};
const days = process.argv.slice(2);
for (const d of days) {
  const hits = [];
  for (const [id, rec] of Object.entries(loads)) {
    for (const e of (rec.sessions || {})[d] || []) hits.push(`${byId[id] || id}:${e.type}:${e.min ?? e.minutes ?? '?'}`);
  }
  console.log(d, hits.length ? hits.join(' | ') : 'NOTHING');
}
for (const f of (await readStore(s, 'expo-bhbc-fixtures')) || []) {
  if (days.includes(String(f.date).slice(0, 10))) console.log('FIXTURE', f.date, f.type, f.opponent || '', f.venue || '', f.us != null ? `${f.us}-${f.them}` : '');
}
