// THE TWICE-DAILY SYNC KEEPS THE REVISION HISTORY CURRENT.
//
// Ohad (2026-09-13): "make sure it keeps getting updated forever twice a day"
// + "re-run every history field". The one-off harvest fetched the past; this
// fetches only what is NEW since the last run, through the same signed-in
// Chrome the sync already uses, so the per-client timeline never falls behind
// the sheet again.
//
// Two steps: learn the newest revision id (the version-history panel's own
// /revisions/tiles call, captured once), then export every id above the
// highest file on disk. Nothing is re-downloaded; a run with nothing new costs
// one page load. The harvester is resumable, so an interrupted run continues.
//
//   node scripts/harvest-new-revisions.mjs        (CDP defaults to 9222)
import P from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ID = process.env.SHEET_ID || '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';
const DIR = path.resolve(process.env.REV_DIR || 'audit-out/sheets/rev');
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const REVS = path.resolve('audit-out/sheets/revisions.json');
const CAP = Number(process.env.MAX_NEW || 60); // per run; the next run takes the rest

const onDisk = fs.readdirSync(DIR).map((f) => f.match(/^r(\d+)\.xlsx$/)).filter(Boolean).map((m) => Number(m[1]));
const maxOnDisk = onDisk.length ? Math.max(...onDisk) : 0;

// ---- newest revision id + timestamps for the new ones ----
const b = await P.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 180000 });
const pg = await b.newPage();
let tilesUrl = null;
pg.on('request', (req) => { const u = req.url(); if (/\/revisions\/tiles\?/.test(u) && !tilesUrl) tilesUrl = u; });
await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));
await pg.keyboard.down('Control'); await pg.keyboard.down('Alt'); await pg.keyboard.down('Shift');
await pg.keyboard.press('KeyH');
await pg.keyboard.up('Shift'); await pg.keyboard.up('Alt'); await pg.keyboard.up('Control');
for (let i = 0; i < 40 && !tilesUrl; i++) await new Promise((r) => setTimeout(r, 500));
let newest = null;
const known = fs.existsSync(REVS) ? JSON.parse(fs.readFileSync(REVS, 'utf8')) : [];
const byRev = new Map(known.map((r) => [r.rev, r]));
if (tilesUrl) {
  const u = new URL(tilesUrl);
  const token = u.searchParams.get('token'), ouid = u.searchParams.get('ouid');
  const fetchTiles = (start, end) => pg.evaluate(async (id, start, end, token, ouid) => {
    const q = new URLSearchParams({ id, start: String(start), end: String(end), revisionBatchSize: '1500', showDetailedRevisions: 'true', loadType: '0', token, ouid, includes_info_params: 'true', cros_files: 'false', nded: 'false' });
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/revisions/tiles?${q}`, { credentials: 'include' });
    return { status: r.status, text: (await r.text()).slice(0, 2_000_000) };
  }, ID, start, end, token, ouid);
  // Walk forward from the last known id in windows; shrink at the edge.
  let start = Math.max(1, (known.length ? known[known.length - 1].rev : maxOnDisk) - 50);
  for (let guard = 0; guard < 20; guard++) {
    let w = 300, res = await fetchTiles(start, start + w - 1);
    while (res.status === 400 && w > 1) { w = Math.floor(w / 2); res = await fetchTiles(start, start + w - 1); }
    if (res.status !== 200) break;
    let j; try { j = JSON.parse(res.text.replace(/^\)\]\}'\n?/, '')); } catch { break; }
    const tiles = j.tileInfo || [];
    if (!tiles.length) break;
    for (const t of tiles) for (let r = t.start; r <= t.end; r++) if (!byRev.has(r) || t.start === t.end) byRev.set(r, { rev: r, endMillis: t.endMillis, iso: new Date(t.endMillis).toISOString(), users: t.users, grouped: t.start !== t.end, tileStart: t.start, tileEnd: t.end });
    newest = Math.max(newest || 0, ...tiles.map((t) => t.end));
    start += w;
  }
  fs.writeFileSync(REVS, JSON.stringify([...byRev.values()].sort((a, c) => a.rev - c.rev)));
}
await pg.close();
b.disconnect();
console.log(`newest revision listed: ${newest ?? 'unknown'} · highest on disk: r${maxOnDisk}`);

// The tiles list lags the newest edits by a few days (the panel groups them
// later), so also probe a short run past whichever is higher; a missing id
// costs three seconds and nothing else.
const top = Math.max(newest || 0, maxOnDisk) + 25;
const want = [];
for (let r = maxOnDisk + 1; r <= top && want.length < CAP; r++) want.push(r);
if (!want.length) { console.log('nothing new to fetch'); process.exit(0); }
console.log(`fetching r${want[0]}..r${want[want.length - 1]} (${want.length})`);
const res = spawnSync(process.execPath, ['scripts/harvest-roster-revisions.mjs', '1', want.join(',')], { stdio: 'inherit', env: { ...process.env, CDP, REV_DIR: DIR, SHEET_ID: ID, MAX_REV: String(top) } });
process.exit(res.status || 0);
