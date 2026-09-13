// THE CLUB CALENDAR INTO THE CLUB ZONE.
//
// Ohad (2026-09-13): "the google calendar is not synced with bhbc.. make sure
// all the practices and scrimmages are logged in" · "where are all the
// shootarounds? i need bhbc better updated and always synced".
//
// Source: the "Bnei Herzliya - 2026/27" Google Calendar (owned by the club,
// Ohad is a reader). Events come in as JSON ({summary, start, end, location?})
// or as an .ics file; the standing sync needs one of:
//   - the calendar's secret iCal address (ICS=<url>), or
//   - the calendar shared with the gsheets service account (Drive/Calendar API),
// neither of which a reader can grant himself - until then this runs on a JSON
// pulled through the Calendar connector in a session.
//
// Rules (his titles): "BB…" = practice, "Weight Room…" = lift, "Shootaround…"
// = shootaround, "Scrimmage…" = scrimmage (opponent after "vs", venue after
// "@"), "…game…", "BCL…", "G1…" = game; buses, flights, dinners, media days,
// birthdays are not sessions and are skipped. "@home" = HaYovel, Herzliya.
//
// Merge into store key expo-bhbc-fixtures: keyed by date + type + start.
// Games already on the zone keep their competition / venue / travel and take
// the calendar's time; practices, lifts, shootarounds and scrimmages inside the
// synced window that the calendar no longer has are dropped (a cancelled
// practice must disappear). Snapshot before the write. Idempotent.
//
//   node scripts/sync-bhbc-calendar.mjs audit-out/sheets/bhbc-calendar-2026-09.json [--dry]
//   ICS=https://…/basic.ics node scripts/sync-bhbc-calendar.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const DRY = process.argv.includes('--dry');
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const HOME = 'HaYovel, Herzliya';

function parseICS(text) {
  const out = [];
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  for (const b of blocks) {
    const get = (k) => { const m = b.match(new RegExp('^' + k + '[^:]*:(.*)$', 'm')); return m ? m[1].trim() : ''; };
    const toIso = (v) => { const m = v.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : null; };
    const start = toIso(get('DTSTART')), end = toIso(get('DTEND'));
    if (!start) continue; // all-day (birthdays) carry no time and are not sessions
    out.push({ summary: get('SUMMARY').replace(/\\,/g, ','), start, end, location: get('LOCATION') });
  }
  return out;
}

function classify(ev) {
  const s = String(ev.summary || '').trim();
  const at = (s.match(/@\s*([^\s].*?)(?:\s+vs\.?\s+.*)?$/i) || [])[1] || '';
  const vs = (s.match(/vs\.?\s+([^@]+)/i) || [])[1] || '';
  const place = at.replace(/^home$/i, HOME).replace(/hadar-yossef/i, 'Hadar Yosef, Tel Aviv').replace(/^hayovel$/i, HOME).trim();
  if (/weight\s*room/i.test(s)) return { type: 'lift', location: place || undefined };
  if (/shootaround/i.test(s)) return { type: 'shootaround', location: place || undefined };
  if (/scrimmage/i.test(s)) return { type: 'scrimmage', opponent: vs.trim() || undefined, venue: place || undefined };
  if (/\bgame\b|\bBCL\b|^G\d\b|cup/i.test(s)) return { type: 'game', opponent: vs.trim() || undefined, venue: place || undefined, home: /@\s*home/i.test(s) || undefined, comp: /BCL/i.test(s) ? 'Champions League' : (/winner/i.test(s) ? 'Winner Cup' : (/^G\d/.test(s) ? 'League' : undefined)) };
  if (/^BB\b/i.test(s)) return { type: 'practice', location: place || undefined };
  return null; // bus, flight, dinner, media day, toast, birthdays
}

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
if (error) { console.log('AUTH FAILED', error.message); process.exit(1); }

let events;
if (process.env.ICS) { const r = await fetch(process.env.ICS); if (!r.ok) { console.log('ICS fetch', r.status); process.exit(1); } events = parseICS(await r.text()); }
else if (file && file.endsWith('.ics')) events = parseICS(fs.readFileSync(file, 'utf8'));
else if (file) events = JSON.parse(fs.readFileSync(file, 'utf8'));
else { console.log('usage: node scripts/sync-bhbc-calendar.mjs <events.json|.ics>   or ICS=<url>'); process.exit(2); }

const sessions = [];
let skipped = 0;
for (const ev of events) {
  const c = classify(ev);
  if (!c) { skipped++; continue; }
  const date = ev.start.slice(0, 10), start = ev.start.slice(11, 16), end = ev.end ? ev.end.slice(11, 16) : '';
  const minutes = ev.end ? Math.round((new Date(ev.end) - new Date(ev.start)) / 60000) : undefined;
  sessions.push({ date, start, end, minutes, ...c, source: 'calendar', title: ev.summary });
}
const dates = sessions.map((x) => x.date).sort();
const winLo = dates[0], winHi = dates[dates.length - 1];
console.log(`calendar: ${events.length} events → ${sessions.length} sessions (${skipped} not sessions), window ${winLo}..${winHi}`);

const { data: row } = await s.from('store').select('value').eq('key', 'expo-bhbc-fixtures').maybeSingle();
const existing = row?.value || [];
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
fs.writeFileSync(`audit-out/sheets/backup-expo-bhbc-fixtures-${stamp}.json`, JSON.stringify(existing));

const key = (f) => `${f.date}|${f.type}|${f.start || ''}`;
const sameDayGame = (f, g) => f.type === 'game' && g.type === 'game' && f.date === g.date;
const out = [];
const used = new Set();
let updated = 0, added = 0, dropped = 0, kept = 0;
for (const f of existing) {
  const inWindow = f.date >= winLo && f.date <= winHi;
  // A game keeps its league facts and takes the calendar's clock.
  // A seeded 'game' that the calendar calls a scrimmage on the same day IS that
  // scrimmage (pre-season vs Maccabi): it becomes one and takes the clock.
  const asScrim = f.type === 'game' ? sessions.find((c) => c.type === 'scrimmage' && c.date === f.date) : null;
  const cal = sessions.find((c) => key(c) === key(f)) || sessions.find((c) => sameDayGame(c, f)) || asScrim;
  if (cal) {
    used.add(key(cal));
    const merged = { ...f, start: cal.start || f.start, end: cal.end || f.end, minutes: cal.minutes ?? f.minutes, source: 'calendar', title: cal.title };
    if (asScrim && cal === asScrim) merged.type = 'scrimmage';
    if (f.type === 'game') { merged.opponent = f.opponent || cal.opponent; merged.venue = f.venue || cal.venue; merged.comp = f.comp || cal.comp; if (cal.start) delete merged.timeTBD; }
    else { merged.location = cal.location || f.location; }
    out.push(merged); updated++;
  } else if (inWindow && f.type !== 'game') { dropped++; }
  else { out.push(f); kept++; }
}
for (const c of sessions) if (!used.has(key(c))) { out.push(c); added++; }
out.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
const byType = {}; for (const f of out) byType[f.type] = (byType[f.type] || 0) + 1;
console.log(`fixtures: ${existing.length} → ${out.length} · updated ${updated} · added ${added} · dropped ${dropped} (absent from the calendar) · kept outside window ${kept}`);
console.log('by type:', JSON.stringify(byType));
if (DRY) { console.log('--dry: nothing written'); process.exit(0); }
const { error: e2 } = await s.from('store').upsert({ key: 'expo-bhbc-fixtures', value: out }, { onConflict: 'key' });
if (e2) { console.log('write failed', e2.message); process.exit(1); }
console.log(`written; backup audit-out/sheets/backup-expo-bhbc-fixtures-${stamp}.json`);
