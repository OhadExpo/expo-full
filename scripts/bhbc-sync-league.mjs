// BHBC LEAGUE SYNC — the "massive info tool" data engine.
//
// PROMOTED OUT OF scripts/_*.mjs (which .gitignore treats as scratch) on
// 2026-09-03: this is a recurring job the BHBC zone depends on, and a fix that
// only exists on one machine is a fix that gets lost. Run it whenever the
// league data looks stale.
//
// Scrapes the official league admin site (basket.co.il, מנהלת ליגת העל) via the
// debug Chrome and writes ONE store key `expo-bhbc-league` that the Games tab
// renders. Fully live: re-run (or cron it) and scores / standings / player &
// team stats refresh. NEVER fabricates — only what the league itself publishes.
//
//   node scripts/_bhbc-sync-league.mjs             season = current (2027 = 2026/27)
//   node scripts/_bhbc-sync-league.mjs 2026        cYear=2026 (the 2025/26 season, populated)
//   node scripts/_bhbc-sync-league.mjs 2026 --dry  print, no write
//
// cYear on basket.co.il = the season's END year (cYear=2026 → 2025/26).
// Board=5 = Ligat HaAl (Winner League). BHBC shows as "בני Penlink הרצליה".
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const cYear = Number(args.find((a) => /^\d{4}$/.test(a))) || 2027;
const seasonLabel = `${cYear - 1}/${String(cYear).slice(2)}`;
const CDP = (process.env.CDP || 'http://localhost:9222');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isBHBC = (name) => /הרצליה/.test(name || '');
// Canonical team name: strip Latin sponsor tokens (Penlink/Rapyd/IBI/Rivulis/…)
// so one club isn't split into several standings rows by its sponsor name.
const norm = (s) => String(s || '').replace(/[A-Za-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
const numOf = (s) => { const m = String(s || '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : 0; };

async function connect() {
  const j = await (await fetch(`${CDP}/json/version`)).json();
  const browser = await puppeteer.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, protocolTimeout: 120000 });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });
  return { browser, page };
}
async function render(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('table', { timeout: 30000 }).catch(() => {});
      await sleep(3000);
      return true;
    } catch (e) { await sleep(1500); }
  }
  return false;
}

// Every competition on results.asp, not just the regular season. `stage` is
// what the round heading cannot tell us — a playoff game has no "מחזור N".
const BOARDS = [
  { id: 5, stage: null },                    // Winner League — regular season
  { id: 33, stage: 'Play-In' },
  { id: 16, stage: 'Quarter Final' },
  { id: 26, stage: 'Semi Final' },
  { id: 17, stage: 'Final Series' },
  { id: 10, stage: 'Winner Cup' },
  { id: 34, stage: 'Supercup' },
];

// ---- 1. results (all games, all rounds, all competitions) ----
async function scrapeResults(page) {
  const all = [];
  const seen = new Set();
  for (const b of BOARDS) {
    // Board 5 keeps the bare URL it always used, so the regular-season
    // scrape is byte-for-byte the request that has been working.
    const url = b.id === 5
      ? `https://basket.co.il/results.asp?cYear=${cYear}`
      : `https://basket.co.il/results.asp?cYear=${cYear}&Board=${b.id}`;
    let rows = [];
    try { rows = await scrapeOneBoard(page, url); } catch (e) { console.log(`  board ${b.id}: ${String(e).slice(0, 80)}`); }
    let added = 0;
    for (const g of rows) {
      // A game can appear under more than one board; GameId is the identity.
      const key = g.gameId || JSON.stringify(g.cells);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ ...g, stage: b.stage });
      added++;
    }
    if (added) console.log(`  ${b.stage || `round robin`}: +${added} games`);
  }
  return all;
}

async function scrapeOneBoard(page, url) {
  await render(page, url);
  return page.evaluate(() => {
    const games = [];
    // Rows carrying a score belong to a round; the nearest preceding "מחזור N"
    // heading is the round number.
    const all = [...document.querySelectorAll('body *')];
    let curRound = null;
    for (const el of all) {
      if (el.children.length === 0) {
        const m = (el.innerText || '').match(/^מחזור\s*(\d+)/);
        if (m) curRound = Number(m[1]);
      }
      if (el.tagName === 'TR' && /\d{2,3}[-–]\d{2,3}/.test(el.innerText)) {
        const tds = [...el.querySelectorAll('td,th')].map((c) => c.innerText.trim());
        const scoreCell = tds.find((c) => /^\d{2,3}[-–]\d{2,3}$/.test(c));
        const link = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')).find((h) => /GameId=/i.test(h));
        const gameId = link ? (link.match(/GameId=(\d+)/i) || [])[1] : null;
        // teams: cells that START with an Israeli club prefix — this excludes
        // arena/venue names (which don't start with a club word) and channels.
        const teams = tds.filter((c) => /^(מכבי|הפועל|בני|עירוני|אליצור|א\.ס|הכוח|א\.ל)/.test(c || ''));
        games.push({ round: curRound, cells: tds, score: scoreCell || null, gameId, teams });
      }
    }
    return games;
  });
}

// ---- 2. box score for one game → player lines for both teams ----
// Each box score gets its OWN page (game-zone pages reload → detach a shared
// frame). Retries on detached-frame by opening a fresh page.
async function scrapeBox(browser, gameId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let bp;
    try {
      bp = await browser.newPage();
      bp.setDefaultNavigationTimeout(60000);
      await bp.goto(`https://basket.co.il/game-zone.asp?GameId=${gameId}`, { waitUntil: 'domcontentloaded' });
      await bp.waitForSelector('table', { timeout: 30000 }).catch(() => {});
      await sleep(2500);
      const res = await evalBox(bp);
      await bp.close().catch(() => {});
      return res;
    } catch (e) {
      try { if (bp) await bp.close(); } catch {}
      await sleep(1200);
    }
  }
  return [];
}
async function evalBox(page) {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table').forEach((t) => {
      const cap = (t.querySelector('caption, th')?.innerText || t.innerText.slice(0, 60));
      const rows = [...t.querySelectorAll('tr')];
      const wide = rows.some((r) => r.querySelectorAll('td,th').length >= 20);
      if (!wide) return;
      const teamHdr = (rows[0]?.innerText || '').trim();
      const players = [];
      rows.forEach((r) => {
        const c = [...r.querySelectorAll('td,th')].map((x) => x.innerText.trim());
        if (c.length < 20) return;
        const name = c[1];
        if (!name || /שם שחקן|סה.?כ|חמישייה|קבוצתי|ספסל/.test(name)) return; // skip headers/totals/team rows
        if (!/[א-ת]/.test(name)) return;
        players.push(c);
      });
      if (players.length) out.push({ teamHdr, players });
    });
    return out;
  });
}

// box-score column map (0-indexed): 1=name,3=min,4=pts,7=3Pm/a,9=FTm/a,13=rebTot,16=stl,17=to,18=ast,21=pir,22=+/-
function playerLine(c) {
  const madeAtt = (s) => { const m = String(s || '').match(/(\d+)\s*\/\s*(\d+)/); return m ? { m: +m[1], a: +m[2] } : { m: 0, a: 0 }; };
  return {
    name: c[1], min: numOf(c[3]), pts: numOf(c[4]),
    tp: madeAtt(c[7]), ft: madeAtt(c[9]),
    reb: numOf(c[13]), stl: numOf(c[16]), to: numOf(c[17]), ast: numOf(c[18]),
    pir: numOf(c[21]), pm: numOf(c[22]),
  };
}

(async () => {
  const { browser, page } = await connect();
  console.log(`Syncing ${seasonLabel} (cYear=${cYear})…`);
  const raw = await scrapeResults(page);
  // Normalize games. Score orientation: table is home(מארחת) then away(אורחת);
  // score string "H-A" (home-away) per the league layout.
  const games = raw.filter((g) => g.teams.length >= 2).map((g) => {
    const [home, away] = g.teams.map(norm);
    let hs = null, as = null;
    if (g.score) { const [a, b] = g.score.split(/[-–]/).map(Number); hs = a; as = b; }
    const dateCell = g.cells.find((c) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(c)) || '';
    const dm = dateCell.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const date = dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : null;
    const timeCell = g.cells.find((c) => /^\d{1,2}:\d{2}$/.test(c)) || '';
    const arena = g.cells.find((c) => /[א-ת]/.test(c) && c !== home && c !== away && !/\d/.test(c) && c.length > 3) || '';
    return { round: g.round, stage: g.stage || null, date, time: timeCell, arena, home, away, hs, as, gameId: g.gameId, played: hs != null };
  });
  const bhbcGames = games.filter((g) => isBHBC(g.home) || isBHBC(g.away));
  console.log(`  ${games.length} games total, ${bhbcGames.length} BHBC.`);

  // ---- standings computed from played games ----
  const tbl = {};
  const T = (n) => (tbl[n] = tbl[n] || { team: n, gp: 0, w: 0, l: 0, pf: 0, pa: 0, form: [] });
  for (const g of games.filter((x) => x.played)) {
    const h = T(g.home), a = T(g.away);
    h.gp++; a.gp++; h.pf += g.hs; h.pa += g.as; a.pf += g.as; a.pa += g.hs;
    if (g.hs > g.as) { h.w++; a.l++; h.form.push('W'); a.form.push('L'); }
    else { a.w++; h.l++; a.form.push('W'); h.form.push('L'); }
  }
  const standings = Object.values(tbl).map((t) => ({ ...t, diff: t.pf - t.pa, form: t.form.slice(-5) }))
    .sort((a, b) => b.w - a.w || b.diff - a.diff)
    .map((t, i) => ({ ...t, rank: i + 1 }));

  // ---- BHBC player + team stats from box scores ----
  const players = {}; const teamAgg = { gp: 0, pf: 0, pa: 0, w: 0, l: 0 };
  const P = (n) => (players[n] = players[n] || { name: n, gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, to: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pir: 0, pm: 0, log: [] });
  const boxGames = bhbcGames.filter((g) => g.gameId && g.played);
  console.log(`  fetching ${boxGames.length} box scores…`);
  for (const g of boxGames) {
    const box = await scrapeBox(browser, g.gameId);
    const bhbcTable = box.find((b) => isBHBC(b.teamHdr));
    if (!bhbcTable) continue;
    const oppTable = box.find((b) => !isBHBC(b.teamHdr));
    const oppName = oppTable ? norm(oppTable.teamHdr.replace(/\s*\(.*$/, '')) : (isBHBC(g.home) ? g.away : g.home);
    teamAgg.gp++; teamAgg.pf += isBHBC(g.home) ? g.hs : g.as; teamAgg.pa += isBHBC(g.home) ? g.as : g.hs;
    const won = (isBHBC(g.home) && g.hs > g.as) || (isBHBC(g.away) && g.as > g.hs);
    won ? teamAgg.w++ : teamAgg.l++;
    for (const c of bhbcTable.players) {
      const ln = playerLine(c); if (!ln.name) continue;
      const p = P(ln.name);
      p.gp++; p.min += ln.min; p.pts += ln.pts; p.reb += ln.reb; p.ast += ln.ast; p.stl += ln.stl; p.to += ln.to;
      p.tpm += ln.tp.m; p.tpa += ln.tp.a; p.ftm += ln.ft.m; p.fta += ln.ft.a; p.pir += ln.pir; p.pm += ln.pm;
      p.log.push({ date: g.date, opp: oppName, ...ln });
    }
    process.stdout.write('.');
  }
  console.log('');
  const playerList = Object.values(players).map((p) => ({
    ...p,
    ppg: p.gp ? +(p.pts / p.gp).toFixed(1) : 0, rpg: p.gp ? +(p.reb / p.gp).toFixed(1) : 0,
    apg: p.gp ? +(p.ast / p.gp).toFixed(1) : 0, mpg: p.gp ? +(p.min / p.gp).toFixed(1) : 0,
    tpp: p.tpa ? Math.round((p.tpm / p.tpa) * 100) : 0, ftp: p.fta ? Math.round((p.ftm / p.fta) * 100) : 0,
    pirpg: p.gp ? +(p.pir / p.gp).toFixed(1) : 0,
  })).sort((a, b) => b.ppg - a.ppg);

  // Team record/points from the standings row (single source of truth) so the
  // record and the scoring margin never contradict each other.
  const bhbcStand = standings.find((s) => isBHBC(s.team)) || { gp: 0, w: 0, l: 0, pf: 0, pa: 0 };
  const payload = {
    season: seasonLabel, cYear, updatedAt: new Date().toISOString(),
    team: { name: 'בני הרצליה', gp: bhbcStand.gp, w: bhbcStand.w, l: bhbcStand.l, pf: bhbcStand.pf, pa: bhbcStand.pa, ppg: bhbcStand.gp ? +(bhbcStand.pf / bhbcStand.gp).toFixed(1) : 0, oppg: bhbcStand.gp ? +(bhbcStand.pa / bhbcStand.gp).toFixed(1) : 0 },
    standings, games, players: playerList,
  };
  await page.close(); await browser.disconnect();

  console.log(`\n${seasonLabel}: ${games.length} games · ${standings.length} teams · ${playerList.length} BHBC players`);
  const bhbcRow = standings.find((s) => isBHBC(s.team));
  if (bhbcRow) console.log(`  BHBC: #${bhbcRow.rank}  ${bhbcRow.w}-${bhbcRow.l}  (${bhbcRow.pf}:${bhbcRow.pa})`);
  playerList.slice(0, 5).forEach((p) => console.log(`  ${p.name}: ${p.ppg}p ${p.rpg}r ${p.apg}a  (${p.gp}gp)`));

  if (DRY) { console.log('\n--dry: no write.'); return; }
  const supabase = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (authErr) { console.error('AUTH FAILED:', authErr.message); process.exit(1); }
  const { data: existing } = await supabase.from('store').select('key').eq('key', 'expo-bhbc-league').maybeSingle();
  const op = existing ? supabase.from('store').update({ value: payload }).eq('key', 'expo-bhbc-league') : supabase.from('store').insert({ key: 'expo-bhbc-league', value: payload });
  const { error: wErr } = await op;
  if (wErr) { console.error('WRITE FAILED:', wErr.message); process.exit(1); }
  console.log('OK — expo-bhbc-league written.');
  // Broadcast so any open BHBC zone refetches instantly (shared-sheet feel).
  try {
    const bch = supabase.channel('bhbc-live');
    await new Promise((res) => { bch.subscribe((s) => { if (s === 'SUBSCRIBED') res(); }); setTimeout(res, 4000); });
    await bch.send({ type: 'broadcast', event: 'change', payload: { src: 'league-sync' } });
    console.log('broadcast sent.');
    await new Promise((r) => setTimeout(r, 500));
  } catch { /* broadcast optional */ }
  process.exit(0);
})();
