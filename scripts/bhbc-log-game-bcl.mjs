// LOG A BASKETBALL CHAMPIONS LEAGUE GAME INTO THE CLUB ZONE.
//
// The twin of scripts/bhbc-log-game.mjs (basket.co.il: Winner Cup + League) for
// the club's FIBA Basketball Champions League games, which basket.co.il does not
// carry. Ohad 5.10: "Ppg should only be of this season (but all the games) and
// updated constantly everywhere it appears" - so the BCL games get the same row,
// the same way, on the same 20-minute clock.
//
// SOURCE: the official competition site's own game page,
// championsleague.basketball/en/games/<gameId> (FIBA's site; the box score tab
// on that page). The page is server-rendered: its payload carries the FIBA
// statistics feed per player (Id P_<personId>: PTS, FG2M/A, FG3M/A, FTM/A, OR,
// DR, REB, AS, ST, TO, BS, BSR, PF, FD, PM, TP "mm:ss", Starter, HasPlayed) and
// the team rosters (personId -> uniformNumber). Plain HTTPS, no browser, no key.
// The game list comes from championsleague.basketball/en/games (every game of
// the season with its gameId, teams and UTC tip-off).
//
// Same rules as the basket.co.il logger: match players to the club roster BY
// JERSEY NUMBER; the date must be a GAME on the club calendar (an unknown date
// is refused, never guessed); a game that is not FINAL is refused; snapshot
// expo-bhbc-loads, write one game row per player who played, skip anyone
// already logged that day, read it back. Never invents: a player on the sheet
// with no EXPO profile is reported, not created. Before anything is written the
// box is checked against itself: each line's PTS = 2*2PM + 3*3PM + FTM and
// REB = OREB + DREB, and the club's PTS sum = the team score on the page.
//
//   node scripts/bhbc-log-game-bcl.mjs <gameId> [--dry]      e.g. 136307 (G1 @ Joventut)
//   node scripts/bhbc-log-game-bcl.mjs --auto [--dry]   every club-calendar Champions League
//        game that ended (>= 20 min ago, last 14 days) with no game rows yet: find its
//        gameId on the season's game list and log it. Exits at once, no network, when
//        nothing is pending - the daemon runs this every 20 minutes.
//   node scripts/bhbc-log-game-bcl.mjs --find           print the club's BCL gameIds by date
//
// TEST ONLY (never writes, never signs in):
//   node scripts/bhbc-log-game-bcl.mjs --url <game page> --team <name> --fake-roster
//        parses any finished game page (e.g. last season's, which lives on
//        fiba.basketball/en/history/...), treats <name> as "the club", maps every
//        jersey to a fake profile and a fake calendar game, and prints the box.
import fs from 'node:fs';
import os from 'node:os';
import { ownerClient, readStore, writeStore } from './lib/store-client.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FAKE = args.includes('--fake-roster');
const DRY = args.includes('--dry') || FAKE;
const AUTO = args.includes('--auto');
const FIND = args.includes('--find');
const URL_ARG = opt('--url');
const TEAM = new RegExp(opt('--team') || 'Herzliya', 'i');
const ids = args.filter((a) => /^\d{5,}$/.test(a) && a !== URL_ARG);
if (!ids.length && !AUTO && !FIND && !URL_ARG) { console.log('usage: node scripts/bhbc-log-game-bcl.mjs <gameId> [--dry] | --auto [--dry] | --find'); process.exit(2); }
if (FAKE && !URL_ARG && !ids.length) { console.log('--fake-roster needs a game (--url or a gameId)'); process.exit(2); }
const BACKUP_DIR = `${os.homedir().replace(/\\/g, '/')}/expo-private-backups`;
const SITE = 'https://www.championsleague.basketball';
const HEADERS = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36', 'accept-language': 'en' };
const IL = 'Asia/Jerusalem';
const ilDate = (utc) => new Date(`${utc}Z`).toLocaleDateString('en-CA', { timeZone: IL });
const ilTime = (utc) => new Date(`${utc}Z`).toLocaleTimeString('en-GB', { timeZone: IL, hour: '2-digit', minute: '2-digit' });

async function getPayload(url) {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const html = await r.text();
  // The Next.js flight payload: self.__next_f.push([1,"<json string>"]) chunks.
  let rsc = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) rsc += JSON.parse(m[1]);
  return { url: r.url, title: (html.match(/<title>([^<]*)/) || [])[1] || '', rsc };
}

// The balanced JSON value that starts at t[i] ('{' or '[').
function parseAt(t, i) {
  let d = 0, j = i, inStr = false;
  for (; j < t.length; j++) {
    const c = t[j];
    if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{' || c === '[') d++;
    else if (c === '}' || c === ']') { d--; if (d === 0) { j++; break; } }
  }
  return JSON.parse(t.slice(i, j));
}
const valueOf = (t, key) => { const i = t.indexOf(`"${key}":`); if (i < 0) return null; const s = i + key.length + 3; return '{['.includes(t[s]) ? parseAt(t, s) : null; };
// Every game object on a page: {"gameId":N, ... teamA:{organisationId}, gameDateTimeUTC}.
function gameObjects(t) {
  const out = new Map();
  for (const m of t.matchAll(/\{"gameId":(\d+),/g)) {
    if (out.has(m[1])) continue;
    let g; try { g = parseAt(t, m.index); } catch { continue; }
    if (g && g.teamA && g.teamB && g.teamA.organisationId && g.gameDateTimeUTC) out.set(m[1], g);
  }
  return out;
}

// One game page -> the club's box score, or a reason it cannot be used.
async function scrape(gameIdOrUrl) {
  const url = /^https?:/.test(gameIdOrUrl) ? gameIdOrUrl : `${SITE}/en/games/${gameIdOrUrl}`;
  const p = await getPayload(url);
  if (/not found/i.test(p.title)) return { url: p.url, refuse: `page not found (${p.title})` };
  const gd = valueOf(p.rsc, 'gameDetails');
  const gid = String((gd && gd.id) || (p.url.match(/\/games\/(\d+)/) || [])[1] || gameIdOrUrl);
  const head = gameObjects(p.rsc).get(gid);
  if (!head) return { url: p.url, gid, refuse: 'no game header on the page (layout changed?)' };
  const side = TEAM.test(`${head.teamA.officialName} ${head.teamA.shortName}`) ? 'A' : TEAM.test(`${head.teamB.officialName} ${head.teamB.shortName}`) ? 'B' : null;
  const base = { url: p.url, gid, head, date: ilDate(head.gameDateTimeUTC), time: ilTime(head.gameDateTimeUTC), title: `${head.teamA.shortName} ${head.teamAScore}-${head.teamBScore} ${head.teamB.shortName} [stats ${head.gameStatisticStatusCode || '?'}]` };
  if (!side) return { ...base, refuse: `${TEAM} is not in this game` };
  if (!gd || !Array.isArray(gd.c) || !gd.c.length) return { ...base, refuse: 'no box score on the page yet (not played yet?) - will retry' };
  // FINAL only: the live feed's game status 999 ("end of game") with the last
  // period ended. A live game is refused and retried next run. The header's
  // statistics status (VALID on a validated game) is printed, not required -
  // like basket.co.il, the box is taken as the page shows it after the buzzer.
  const final = Number(gd.status) === 999 && gd.CurrentPeriodStatus === 'E';
  if (!final) return { ...base, refuse: `not final yet (feed status ${gd.status}/${gd.CurrentPeriodStatus}) - will retry` };
  const club = side === 'A' ? head.teamA : head.teamB;
  const team = gd.c.find((c) => c && c.Id === `T_${club.organisationId}`);
  const people = valueOf(p.rsc, side === 'A' ? 'playersTeamA' : 'playersTeamB') || [];
  if (!team || !Array.isArray(team.Children)) return { ...base, refuse: `no T_${club.organisationId} table in the box score` };
  const byPerson = new Map(people.map((x) => [`P_${x.personId}`, x]));
  const players = [], problems = [];
  for (const ch of team.Children) {
    const st = ch && ch.Stats; if (!st || typeof st !== 'object') continue;
    const who = byPerson.get(ch.Id);
    const jersey = who && /^\d+$/.test(String(who.uniformNumber)) ? Number(who.uniformNumber) : null;
    const name = who ? `${who.firstName} ${who.lastName}` : ch.Id;
    if (jersey == null) { problems.push(`${name}: no jersey number on the roster`); continue; }
    const [mm, ss] = String(st.TP || '0:0').split(':').map(Number);
    const secs = (mm || 0) * 60 + (ss || 0);
    // THE SAME KEYS, THE SAME ORDER as bhbc-log-game.mjs writes for basket.co.il.
    // pir = the league's PIR (מדד): verified 5.10 against all 25 basket.co.il
    // rows in the store (25/25). FIBA's own EFF is a different formula - not used.
    const line = { starter: !!st.Starter, pts: st.PTS, fg2: { m: st.FG2M, a: st.FG2A }, fg3: { m: st.FG3M, a: st.FG3A }, ft: { m: st.FTM, a: st.FTA },
      oreb: st.OR, dreb: st.DR, reb: st.REB, pf: st.PF, fd: st.FD, stl: st.ST, to: st.TO, ast: st.AS, blk: st.BS, blka: st.BSR, pir: null, pm: st.PM };
    line.pir = line.pts + line.reb + line.ast + line.stl + line.blk + line.fd
      - (line.fg2.a + line.fg3.a - line.fg2.m - line.fg3.m) - (line.ft.a - line.ft.m) - line.to - line.blka - line.pf;
    if (line.pts !== 2 * line.fg2.m + 3 * line.fg3.m + line.ft.m) problems.push(`#${jersey} ${name}: PTS ${line.pts} != 2P/3P/FT makes`);
    if (line.reb !== line.oreb + line.dreb) problems.push(`#${jersey} ${name}: REB ${line.reb} != OREB+DREB`);
    // Minutes: whole minutes, rounded (FIBA shows mm:ss; the club zone stores minutes).
    players.push({ jersey, name, played: !!st.HasPlayed || secs > 0, min: Math.round(secs / 60), tp: st.TP, ...line });
  }
  const sum = players.reduce((a, x) => a + (x.pts || 0), 0);
  const headScore = side === 'A' ? head.teamAScore : head.teamBScore;
  if (sum !== team.Score || sum !== headScore) problems.push(`club PTS sum ${sum} != team score ${team.Score}/${headScore}`);
  return { ...base, side, club, players, sum, score: headScore, problems };
}

// The club's BCL gameIds by Israel date, from the season's game list.
async function findGameIds() {
  const p = await getPayload(`${SITE}/en/games`);
  const found = new Map(); // gameId -> { date, time, title, status }
  for (const [id, g] of gameObjects(p.rsc)) {
    if (!TEAM.test(`${g.teamA.officialName} ${g.teamA.shortName} ${g.teamB.officialName} ${g.teamB.shortName}`)) continue;
    found.set(id, { date: ilDate(g.gameDateTimeUTC), time: ilTime(g.gameDateTimeUTC), title: `${g.teamA.shortName} - ${g.teamB.shortName}`, status: g.statusCode });
  }
  return found;
}

if (FIND) {
  const f = await findGameIds();
  console.log(`club BCL games on championsleague.basketball: ${f.size}`);
  for (const [id, g] of [...f.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date))) console.log(`  ${g.date} ${g.time} IL  gameId ${id}  ${g.title}  [${g.status}]`);
  process.exit(f.size ? 0 : 1);
}

let s = null;
let exit = 0;
try {
  let roster, fixtures;
  if (FAKE) {
    console.log('TEST MODE (--fake-roster): no sign-in, no store read, nothing written. Roster + calendar below are SYNTHETIC.');
  } else {
    s = await ownerClient();
    const trainees = await readStore(s, 'expo-trainees');
    roster = (trainees || []).filter((t) => t && t.team === 'BHBC' && t.status !== 'Archived');
    fixtures = await readStore(s, 'expo-bhbc-fixtures') || [];
  }
  const isBcl = (f) => f && f.type === 'game' && /champions/i.test(f.comp || '');

  if (AUTO) {
    const loadsNow = await readStore(s, 'expo-bhbc-loads') || {};
    const endOf = (f) => { const [h, m] = String(f.start || '00:00').split(':').map(Number); const d = new Date(`${f.date}T00:00:00`); d.setHours(h || 0, (m || 0) + (Number(f.minutes) || 120), 0, 0); return d.getTime(); };
    const logged = (date) => roster.some((t) => (((loadsNow[t.id] || {}).sessions || {})[date] || []).some((r) => r && r.kind === 'game'));
    const pending = fixtures.filter((f) => isBcl(f) && endOf(f) < Date.now() - 20 * 60000 && endOf(f) > Date.now() - 14 * 86400000 && !logged(f.date));
    if (!pending.length) { console.log('AUTO: no finished BCL game waiting to be logged'); }
    else {
      console.log(`AUTO: ${pending.length} finished BCL game(s) not logged: ${pending.map((f) => `${f.date} ${f.title}`).join(' | ')}`);
      const f = await findGameIds();
      for (const g of pending) {
        const hit = [...f.entries()].find(([, x]) => x.date === g.date);
        if (hit) ids.push(hit[0]); else console.log(`  ${g.date}: no club game on championsleague.basketball that day - will retry next run`);
      }
    }
  }

  const targets = URL_ARG ? [URL_ARG, ...ids] : ids;
  for (const target of targets) {
    const g = await scrape(target);
    let fx;
    if (FAKE && g.players) {
      roster = g.players.map((x) => ({ id: `fake-${x.jersey}`, jersey: x.jersey, team: 'BHBC' }));
      fixtures = [{ date: g.date, type: 'game', start: g.time, opponent: '(test)', comp: 'Champions League', home: g.side === 'A', title: 'SYNTHETIC test fixture' }];
    }
    if (g.date) fx = (fixtures || []).find((f) => isBcl(f) && f.date === g.date);
    console.log(`GAME ${g.gid || target}: ${g.title || ''} official tip-off ${g.date || '?'} ${g.time || ''} (Israel time); club calendar game: ${fx ? `${fx.date} ${fx.start} ${fx.title}` : 'NONE'}`);
    console.log(`  source ${g.url}`);
    if (g.refuse) { console.log(`  REFUSED: ${g.refuse}`); if (!AUTO || !/will retry/.test(g.refuse)) exit = 1; continue; }
    if (g.problems.length) { console.log(`  REFUSED: the box score does not add up - ${g.problems.join('; ')}`); exit = 1; continue; }
    console.log(`  box checks OK: club PTS sum ${g.sum} = team score ${g.score}; every line PTS = 2P/3P/FT makes, REB = OREB+DREB`);
    if (!fx) { console.log('  REFUSED: the game date is not a Champions League game on the club calendar - not guessing a date'); exit = 1; continue; }
    if (fx.start && fx.start !== g.time) console.log(`  note: the club calendar says ${fx.start}, the official tip-off is ${g.time} (Israel time)`);
    const byJersey = new Map(roster.map((t) => [Number(t.jersey), t]));
    const DATE = fx.date;
    const loads = FAKE ? {} : await readStore(s, 'expo-bhbc-loads');
    const next = { ...loads };
    const wrote = [], skipped = [], unknown = [];
    for (const pl of g.players) {
      if (!pl.played) continue; // DNP: no minutes, no row
      const t = byJersey.get(pl.jersey);
      if (!t) { unknown.push(`#${pl.jersey} ${pl.name}`); continue; }
      const rec = next[t.id] ? { ...next[t.id] } : { loads: {}, sessions: {}, readiness: {}, availability: {}, attendance: {} };
      rec.sessions = { ...(rec.sessions || {}) };
      const day = rec.sessions[DATE] || [];
      if (day.some((r) => r && (r.kind === 'game' || String(r.type || '').toLowerCase() === 'game'))) { skipped.push(`#${pl.jersey}`); next[t.id] = rec; continue; }
      const { jersey: _j, name: _n, min: _m, played: _p, tp: _tp, ...line } = pl;
      rec.sessions[DATE] = [...day, { kind: 'game', type: 'Game', start: fx.start || '', min: pl.min, rpe: null, load: 0, attended: true,
        opp: fx.opponent || null, comp: fx.comp || null, home: fx.home ?? null,
        box: line, source: `championsleague.basketball/${g.gid}` }];
      next[t.id] = rec;
      wrote.push(`#${pl.jersey} ${pl.min}′ ${pl.pts}p`);
    }
    console.log(`  write: ${wrote.join(' · ') || 'nothing'}`);
    if (skipped.length) console.log(`  already logged: ${skipped.join(' ')}`);
    if (unknown.length) console.log(`  NOT ON THE CLUB ROSTER (no EXPO profile): ${unknown.join(', ')}`);
    if (DRY) {
      const played = g.players.filter((x) => x.played);
      console.log(`  DRY: ${played.length} played, ${g.players.length - played.length} DNP. Row for the first 3 who played:`);
      for (const pl of played.slice(0, 3)) {
        const t = byJersey.get(pl.jersey);
        const row = t && (next[t.id]?.sessions?.[DATE] || []).find((r) => r.source === `championsleague.basketball/${g.gid}`);
        console.log(`   #${pl.jersey} ${pl.name} (TP ${pl.tp}) -> ${row ? JSON.stringify(row) : '(not written: see above)'}`);
      }
      const T = (f) => played.reduce((a, x) => a + (Number(f(x)) || 0), 0);
      console.log(`  DRY totals: PTS ${T((x) => x.pts)} | 2P ${T((x) => x.fg2.m)}/${T((x) => x.fg2.a)} | 3P ${T((x) => x.fg3.m)}/${T((x) => x.fg3.a)} | FT ${T((x) => x.ft.m)}/${T((x) => x.ft.a)} | REB ${T((x) => x.reb)} (O ${T((x) => x.oreb)} D ${T((x) => x.dreb)}) | AST ${T((x) => x.ast)} | STL ${T((x) => x.stl)} | TO ${T((x) => x.to)} | BLK ${T((x) => x.blk)} | PF ${T((x) => x.pf)} | PIR ${T((x) => x.pir)} | MIN ${T((x) => x.min)}`);
      continue;
    }
    if (!wrote.length) continue;
    const snap = `${BACKUP_DIR}/expo-bhbc-loads-before-bcl-game-${g.gid}-${Date.now()}.json`;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(snap, JSON.stringify(loads));
    await writeStore(s, 'expo-bhbc-loads', next); // CAS on updated_at + its own backup (scripts/lib/store-client.mjs)
    const back = await readStore(s, 'expo-bhbc-loads');
    const ok = g.players.filter((pl) => pl.played && byJersey.get(pl.jersey)).every((pl) => ((back[byJersey.get(pl.jersey).id]?.sessions || {})[DATE] || []).some((r) => r.kind === 'game'));
    console.log(`  snapshot ${snap}\n  read-back ${ok ? 'OK' : 'MISSING ROWS'}; athletes ${Object.keys(loads).length} -> ${Object.keys(back).length}`);
    if (!ok) exit = 1;
  }
} catch (e) {
  console.log(`FAILED: ${String((e && e.stack) || e).slice(0, 400)}`);
  exit = 1;
} finally {
  if (s) await s.auth.signOut({ scope: 'local' }).catch(() => {});
}
process.exit(exit);
