// LOG A GAME FROM basket.co.il INTO THE CLUB ZONE.
//
// Ohad 27.9: "every time there's a game you pull the stats from basket.co.il on
// your own immediately!!! rules!". This is the one path both uses share: by hand
// (`node scripts/bhbc-log-game.mjs 26637`) and from the daemon after a game
// ends (`--auto`, which finds the GameIds itself — see findGameIds()).
//
// Reads the official box score page through the signed-in debug Chrome, takes
// the Bnei Herzliya table, matches players to the club roster BY JERSEY NUMBER,
// checks the date against a GAME on the club calendar (a date the calendar does
// not know is refused, never guessed), snapshots expo-bhbc-loads, writes one
// game row per player who has minutes (min + box line), skips anyone already
// logged for that day, and reads it back. Never invents: a player on the sheet
// with no EXPO profile is reported, not created.
//
//   node scripts/bhbc-log-game.mjs <GameId> [--dry]
//   node scripts/bhbc-log-game.mjs --auto [--dry]   every club-calendar game that ended
//        (>= 20 min ago, last 14 days) with no game rows yet: find its GameId on
//        basket.co.il's results boards and log it. Exits at once, no Chrome, when
//        nothing is pending - the daemon runs this every 20 minutes.
//   node scripts/bhbc-log-game.mjs --find           print the BH GameIds by date (discovery check)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { ownerClient, readStore, writeStore } from './lib/store-client.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const AUTO = args.includes('--auto');
// --replace: the official box score OVERRULES rows logged from a paper sheet
// (27.9: two sheets disagreed with basket.co.il). That date's game rows for
// every roster player are rewritten from the official table; a player the
// league shows as not playing loses his game row. Snapshot first, as always.
const REPLACE = args.includes('--replace');
const FIND = args.includes('--find');
const ids = args.filter((a) => /^\d{4,}$/.test(a));
if (!ids.length && !AUTO && !FIND) { console.log('usage: node scripts/bhbc-log-game.mjs <GameId> [--dry] | --auto [--dry] | --find'); process.exit(2); }
const BACKUP_DIR = 'C:/Users/Administrator/expo-private-backups';
const CDP = process.env.CDP || 'http://localhost:9222';
const isBH = (s) => /הרצליה/.test(s || '');
const num = (s) => { const m = String(s || '').match(/-?\d+/); return m ? Number(m[0]) : null; };

async function scrape(gameId) {
  const j = await (await fetch(`${CDP}/json/version`)).json();
  const b = await puppeteer.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, protocolTimeout: 90000 });
  const p = await b.newPage();
  try {
    p.setDefaultNavigationTimeout(60000);
    await p.goto(`https://basket.co.il/game-zone.asp?GameId=${gameId}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('table', { timeout: 30000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));
    return await p.evaluate(() => {
      const text = document.body.innerText || '';
      const dates = [...new Set(text.match(/\d{2}\/\d{2}\/\d{4}/g) || [])];
      const tables = [...document.querySelectorAll('table')].map((t) => [...t.querySelectorAll('tr')].map((r) => [...r.querySelectorAll('td,th')].map((c) => c.innerText.trim())));
      return { dates, tables };
    });
  } finally { await p.close(); await b.disconnect(); }
}

// The per-player table: first row = team name (+ coach), a header row whose
// cells include "דק" (minutes) and "נק" (points), then one row per player.
function bhBox(tables) {
  for (const rows of tables) {
    if (!rows.length || !isBH(rows[0].join(' '))) continue;
    const hi = rows.findIndex((r) => r.includes('דק') && r.includes('נק') && r.includes('שם שחקן'));
    if (hi < 0) continue;
    const h = rows[hi];
    // THE FULL LINE (27.9, Ohad: "all the stats from the game ... shot
    // attempts, makes, 2/3, free throws, defensive - everything"). The league's
    // column order, verified against the page header on 27.9 (and the same map
    // scripts/bhbc-sync-league.mjs reads): # | name | starter | MIN | PTS |
    // 2P m/a | % | 3P m/a | % | FT m/a | % | OREB | DREB | REB | fouls | fouls
    // drawn | STL | TO | AST | BLK | blocked | PIR | +/-.
    if (h.length < 23 || h[3] !== 'דק' || h[4] !== 'נק' || h[21] !== 'מדד') { console.log('  REFUSED: the box score columns moved - header:', h.join(' | ')); return null; }
    const ma = (v) => { const m = String(v || '').match(/(\d+)\s*\/\s*(\d+)/); return m ? { m: +m[1], a: +m[2] } : { m: 0, a: 0 }; };
    const players = [];
    for (const r of rows.slice(hi + 1)) {
      const jersey = num(r[0]);
      if (jersey == null || !r[1] || /סה"כ|קבוצתי/.test(r[1])) continue;
      players.push({ jersey, name: r[1], starter: /\*/.test(r[2] || ''), min: num(r[3]), pts: num(r[4]),
        fg2: ma(r[5]), fg3: ma(r[7]), ft: ma(r[9]), oreb: num(r[11]), dreb: num(r[12]), reb: num(r[13]),
        pf: num(r[14]), fd: num(r[15]), stl: num(r[16]), to: num(r[17]), ast: num(r[18]), blk: num(r[19]), blka: num(r[20]),
        pir: num(r[21]), pm: num(r[22]) });
    }
    if (players.length) return players;
  }
  return null;
}

// BH GameIds by date, from every competition board of the current season
// (the league sync's board list). cYear = the season's END year.
const BOARDS = [5, 10, 34, 33, 16, 26, 17];
async function findGameIds() {
  const now = new Date();
  const cYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const j = await (await fetch(`${CDP}/json/version`)).json();
  const b = await puppeteer.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, protocolTimeout: 90000 });
  const p = await b.newPage();
  const found = new Map(); // GameId -> iso date
  try {
    p.setDefaultNavigationTimeout(60000);
    for (const board of BOARDS) {
      const url = board === 5 ? `https://basket.co.il/results.asp?cYear=${cYear}` : `https://basket.co.il/results.asp?cYear=${cYear}&Board=${board}`;
      try {
        await p.goto(url, { waitUntil: 'domcontentloaded' });
        await new Promise((r) => setTimeout(r, 2500));
        const rows = await p.evaluate(() => [...document.querySelectorAll('a[href*="GameId="]')].map((a) => {
          let el = a; for (let i = 0; i < 6 && el && !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(el.innerText || ''); i++) el = el.parentElement;
          const txt = (el && el.innerText) || '';
          return { id: (a.getAttribute('href').match(/GameId=(\d+)/i) || [])[1], txt };
        }));
        for (const r of rows) {
          if (!r.id || !/הרצליה/.test(r.txt)) continue;
          const m = r.txt.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
          if (!m) continue;
          const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
          found.set(r.id, `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
        }
      } catch (e) { console.log(`  board ${board}: ${String(e).slice(0, 80)}`); }
    }
  } finally { await p.close(); await b.disconnect(); }
  return found;
}

const s = await ownerClient();
const trainees = await readStore(s, 'expo-trainees');
const roster = (trainees || []).filter((t) => t && t.team === 'BHBC' && t.status !== 'Archived');
const byJersey = new Map(roster.map((t) => [Number(t.jersey), t]));
const fixtures = await readStore(s, 'expo-bhbc-fixtures') || [];
let exit = 0;

if (FIND) {
  const f = await findGameIds();
  console.log(`BH games on basket.co.il this season: ${f.size}`);
  for (const [id, d] of [...f.entries()].sort((a, b) => a[1].localeCompare(b[1]))) console.log(`  ${d}  GameId ${id}`);
  process.exit(f.size ? 0 : 1);
}
if (AUTO) {
  const loadsNow = await readStore(s, 'expo-bhbc-loads') || {};
  const endOf = (f) => { const [h, m] = String(f.start || '00:00').split(':').map(Number); const d = new Date(`${f.date}T00:00:00`); d.setHours(h || 0, (m || 0) + (Number(f.minutes) || 120), 0, 0); return d.getTime(); };
  const logged = (date) => roster.some((t) => (((loadsNow[t.id] || {}).sessions || {})[date] || []).some((r) => r && r.kind === 'game'));
  const pending = fixtures.filter((f) => f.type === 'game' && endOf(f) < Date.now() - 20 * 60000 && endOf(f) > Date.now() - 14 * 86400000 && !logged(f.date));
  if (!pending.length) { console.log('AUTO: no finished game waiting to be logged'); process.exit(0); }
  console.log(`AUTO: ${pending.length} finished game(s) not logged: ${pending.map((f) => `${f.date} ${f.title}`).join(' | ')}`);
  const f = await findGameIds();
  for (const g of pending) {
    const hit = [...f.entries()].find(([, d]) => d === g.date);
    if (hit) ids.push(hit[0]); else { console.log(`  ${g.date}: no box score on basket.co.il yet - will retry next run`); }
  }
}

for (const gid of ids) {
  const page = await scrape(gid);
  const box = bhBox(page.tables);
  const iso = page.dates.map((d) => { const [dd, mm, yy] = d.split('/'); return `${yy}-${mm}-${dd}`; });
  const fx = fixtures.find((f) => f.type === 'game' && iso.includes(f.date));
  console.log(`GAME ${gid}: page dates ${page.dates.join(', ') || 'none'}; club calendar game: ${fx ? `${fx.date} ${fx.start} ${fx.title}` : 'NONE'}`);
  if (!box) { console.log('  REFUSED: no Bnei Herzliya box score on the page (not played yet?)'); exit = 1; continue; }
  if (!fx) { console.log('  REFUSED: the page date is not a game on the club calendar - not guessing a date'); exit = 1; continue; }
  const DATE = fx.date;
  const loads = await readStore(s, 'expo-bhbc-loads');
  const next = { ...loads };
  const wrote = [], skipped = [], unknown = [], removed = [];
  if (REPLACE) {
    const played = new Set(box.filter((pl) => pl.min).map((pl) => pl.jersey));
    for (const t of roster) {
      const rec = next[t.id];
      const day = rec && rec.sessions && rec.sessions[DATE];
      if (!day || !day.some((r) => r && r.kind === 'game')) continue;
      next[t.id] = { ...rec, sessions: { ...rec.sessions, [DATE]: day.filter((r) => !(r && r.kind === 'game')) } };
      if (!played.has(Number(t.jersey))) removed.push(`#${t.jersey}`);
    }
  }
  for (const pl of box) {
    if (!pl.min) continue; // DNP: no minutes, no row
    const t = byJersey.get(pl.jersey);
    if (!t) { unknown.push(`#${pl.jersey} ${pl.name}`); continue; }
    const rec = next[t.id] ? { ...next[t.id] } : { loads: {}, sessions: {}, readiness: {}, availability: {}, attendance: {} };
    rec.sessions = { ...(rec.sessions || {}) };
    const day = rec.sessions[DATE] || [];
    if (day.some((r) => r && (r.kind === 'game' || String(r.type || '').toLowerCase() === 'game'))) { skipped.push(`#${pl.jersey}`); next[t.id] = rec; continue; }
    const { jersey: _j, name: _n, min: _m, ...line } = pl;
    rec.sessions[DATE] = [...day, { kind: 'game', type: 'Game', start: fx.start || '', min: pl.min, rpe: null, load: 0, attended: true,
      opp: fx.opponent || null, comp: fx.comp || null, home: fx.home ?? null,
      box: line, source: `basket.co.il/${gid}` }];
    next[t.id] = rec;
    wrote.push(`#${pl.jersey} ${pl.min}′ ${pl.pts}p`);
  }
  console.log(`  write: ${wrote.join(' · ') || 'nothing'}`);
  if (skipped.length) console.log(`  already logged: ${skipped.join(' ')}`);
  if (unknown.length) console.log(`  NOT ON THE CLUB ROSTER (no EXPO profile): ${unknown.join(', ')}`);
  if (removed.length) console.log(`  REMOVED (not in the official box score): ${removed.join(' ')}`);
  if (DRY || (!wrote.length && !removed.length)) continue;
  const snap = `${BACKUP_DIR}/expo-bhbc-loads-before-game-${gid}-${Date.now()}.json`;
  fs.writeFileSync(snap, JSON.stringify(loads));
  await writeStore(s, 'expo-bhbc-loads', next);
  const back = await readStore(s, 'expo-bhbc-loads');
  const ok = box.filter((pl) => pl.min && byJersey.get(pl.jersey)).every((pl) => ((back[byJersey.get(pl.jersey).id]?.sessions || {})[DATE] || []).some((r) => r.kind === 'game'));
  console.log(`  snapshot ${snap}\n  read-back ${ok ? 'OK' : 'MISSING ROWS'}; athletes ${Object.keys(loads).length} -> ${Object.keys(back).length}`);
  if (!ok) exit = 1;
}
process.exit(exit);
