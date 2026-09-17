// THE CLUB CALENDAR, WITHOUT ASKING ANYONE FOR ANYTHING.
//
// Ohad (2026-09-14), after I said the standing sync needed the club to share
// the calendar: "figure it out that's not a good answer. you need to find a
// way on your own."
//
// It did not need them. He is a READER on "Bnei Herzliya - 2026/27", and a
// reader's own browser is already authorised to see every event on it. Three
// dead ends and the road:
//
//   - /calendar/exporticalzip exports only calendars he OWNS (verified: it
//     returned his own + birthdays, not the club's).
//   - The settings page shows a subscriber no secret iCal address.
//   - clients6.google.com refuses a hand-built SAPISIDHASH ("Origin doesn't
//     match Host"), and the service account cannot be added to the ACL.
//   - THE ROAD: the Calendar web app asks its OWN origin for a date range -
//     POST /calendar/u/0/sync.prefetcheventrange. A background tab lets it make
//     that call, captures the exact body Google built (session id and all), and
//     re-issues it with a different date range. Same origin, same cookies,
//     nothing invented. Per event: [5] = title, [35][1][0] = start ms,
//     [36][1][0] = end ms - located by searching for a known event's instant,
//     not by guessing.
//
// Output: audit-out/sheets/bhbc-calendar.json, the shape sync-bhbc-calendar.mjs
// already reads ({summary, start, end} in Israel local time).
//
//   node scripts/fetch-bhbc-calendar.mjs [fromISO] [toISO]
import P from 'puppeteer-core';
import fs from 'node:fs';
import { ensureDebugChrome } from './lib/ensure-debug-chrome.mjs';

const CAL = process.env.CAL || 'c_96a2ea9f1242d53540e3ae9d3c10d78dc274a394cc03d0c012e12019573433b4@group.calendar.google.com';
const OUT = process.env.OUT || 'audit-out/sheets/bhbc-calendar.json';
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const today = new Date();
const FROM = process.argv[2] || new Date(today.getTime() - 45 * 86400000).toISOString().slice(0, 10);
const TO = process.argv[3] || new Date(today.getTime() + 210 * 86400000).toISOString().slice(0, 10);

// Israel local wall clock for an epoch ms, as "YYYY-MM-DDTHH:MM".
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const localISO = (ms) => {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
};

// His Chrome closing mid-run killed this step once (ECONNREFUSED at 00:30,
// after everything else in the sync had succeeded).
console.log('chrome:', await ensureDebugChrome({ port: Number(new URL(CDP).port || 9222), log: (m) => console.log('  ' + m) }));
const b = await P.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 300000 });
// A BACKGROUND tab: this runs twice a day inside his own Chrome.
const cdpB = await b.target().createCDPSession();
await cdpB.send('Target.createTarget', { url: 'about:blank#expo-cal-sync', background: true });
const target = await b.waitForTarget((t) => t.type() === 'page' && t.url().endsWith('#expo-cal-sync'), { timeout: 20000 });
const pg = await target.page();
try {
  await pg.setViewport({ width: 1400, height: 900 });
  let body = null;
  pg.on('request', (r) => { if (/sync\.prefetcheventrange/.test(r.url()) && !body) body = r.postData() || null; });
  await pg.goto('https://calendar.google.com/calendar/u/0/r/week/2026/9/7', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 60 && !body; i++) await new Promise((r) => setTimeout(r, 400));
  if (!body) throw new Error('the app never issued its event-range call (is this profile signed in to Calendar?)');

  const events = await pg.evaluate(async (raw, cal, fromISO, toISO) => {
    const dayOf = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);
    const all = new Map();
    // Ask in ~120-day windows; the app itself never asks for a year at once.
    for (let start = dayOf(fromISO); start < dayOf(toISO); start += 120) {
      const end = Math.min(start + 120, dayOf(toISO));
      const swapped = decodeURIComponent(raw.split('f.req=')[1].split('&')[0])
        .replace(/\[null,null,\d+,\d+\]/, `[null,null,${start},${end}]`);
      const rest = raw.slice(raw.indexOf('&', raw.indexOf('f.req=')));
      const r = await fetch('/calendar/u/0/sync.prefetcheventrange', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'x-is-xhr-request': '1' },
        body: 'f.req=' + encodeURIComponent(swapped) + rest,
      });
      const txt = await r.text();
      if (!r.ok) return { err: `range ${start}-${end}: http ${r.status}` };
      let j; try { j = JSON.parse(txt.replace(/^\)\]\}'\s*/, '')); } catch (e) { return { err: 'unparseable response' }; }
      const blocks = [];
      (function walk(x, d) { if (!Array.isArray(x) || d > 14) return; if (x[0] === cal && Array.isArray(x[1])) blocks.push(x[1]); for (const y of x) walk(y, d + 1); })(j, 0);
      for (const e of blocks.flat()) {
        if (!Array.isArray(e) || typeof e[0] !== 'string') continue;
        const title = typeof e[5] === 'string' ? e[5] : null;
        const s = e[35] && e[35][1] && e[35][1][0];
        const en = e[36] && e[36][1] && e[36][1][0];
        if (!title || typeof s !== 'number' || typeof en !== 'number') continue;
        all.set(e[0] + '|' + s, { id: e[0], summary: title.trim(), startMs: s, endMs: en });
      }
    }
    return { list: [...all.values()] };
  }, body, CAL, FROM, TO);

  if (events.err) throw new Error(events.err);
  const list = events.list
    .map((e) => ({ summary: e.summary, start: localISO(e.startMs), end: localISO(e.endMs), id: e.id }))
    // An all-day event spans exactly 24h from local midnight; those are
    // birthdays and trips, never sessions - the classifier drops them anyway,
    // but they are kept so the file is the calendar, not an opinion of it.
    .sort((a, c) => a.start.localeCompare(c.start));
  fs.writeFileSync(OUT, JSON.stringify(list, null, 1));
  const kinds = {};
  for (const e of list) { const k = /^BB/i.test(e.summary) ? 'BB' : /weight/i.test(e.summary) ? 'weight' : /shootaround/i.test(e.summary) ? 'shootaround' : /scrimmage/i.test(e.summary) ? 'scrimmage' : /game|BCL|^G\d|cup/i.test(e.summary) ? 'game' : 'other'; kinds[k] = (kinds[k] || 0) + 1; }
  console.log(`OK ${OUT} · ${list.length} events ${FROM}..${TO} · ${JSON.stringify(kinds)}`);
  if (list.length) console.log(`   first ${list[0].start} ${list[0].summary}  ·  last ${list[list.length - 1].start} ${list[list.length - 1].summary}`);
} finally { await pg.close(); b.disconnect(); }
