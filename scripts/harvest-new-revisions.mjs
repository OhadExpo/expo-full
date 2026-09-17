// THE TWICE-DAILY SYNC KEEPS THE REVISION HISTORY CURRENT.
//
// Ohad (2026-09-13): "make sure it keeps getting updated forever twice a day"
// + "re-run every history field". The one-off harvest fetched the past; this
// fetches only what is NEW since the last run, through the same signed-in
// Chrome the sync already uses, so the per-client timeline never falls behind
// the sheet again.
//
// Two steps: try to learn the newest revision id and timestamps from the
// version-history panel's own /revisions/tiles call (best effort - in a
// background tab the panel may not open), then export every id above the
// highest file on disk, probing upward in batches of 25 until a batch yields
// nothing. Nothing is re-downloaded; a run with nothing new costs one page
// load and one batch of misses (~75s). The harvester is resumable.
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
const CAP = Number(process.env.MAX_NEW || 120); // per run; the next run takes the rest

const onDiskIds = () => fs.readdirSync(DIR).map((f) => f.match(/^r(\d+)\.xlsx$/)).filter(Boolean).map((m) => Number(m[1]));
const maxOnDisk = Math.max(0, ...onDiskIds());

// ---- fast path: the Drive API, if the sheet is shared with the service account ----
try {
  const { saToken, listRevisions } = await import('./drive-sa.mjs');
  const token = await saToken();
  const revs = await listRevisions(ID, token);
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const known = fs.existsSync(REVS) ? JSON.parse(fs.readFileSync(REVS, 'utf8')) : [];
  const byRev = new Map(known.map((r) => [r.rev, r]));
  for (const r of revs) byRev.set(Number(r.id), { rev: Number(r.id), endMillis: Date.parse(r.modifiedDate), iso: r.modifiedDate, users: [r.lastModifyingUserName || ''], grouped: false, exact: true });
  fs.writeFileSync(REVS, JSON.stringify([...byRev.values()].sort((a, c) => a.rev - c.rev)));
  let got = 0;
  for (const r of revs) {
    const id = Number(r.id);
    if (id <= maxOnDisk || got >= CAP) continue;
    const link = r.exportLinks && r.exportLinks[XLSX];
    if (!link) continue;
    const res = await fetch(link, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) { console.log(`r${id}: ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 2).toString('latin1') !== 'PK') continue;
    fs.writeFileSync(path.join(DIR, `r${id}.xlsx`), buf); got++;
  }
  console.log(`drive api: ${revs.length} revisions listed (newest r${revs[revs.length - 1]?.id}), ${got} new fetched`);
  process.exit(0);
} catch (e) {
  console.log('drive api not available (' + String(e.message || e).slice(0, 80) + ') - using the browser');
}

// ---- newest revision id + timestamps (best effort) ----
const b = await P.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 180000 });
// A BACKGROUND tab: this runs inside his own Chrome twice a day and must not
// steal the window from whatever he is doing there.
const cdpB = await b.target().createCDPSession();
await cdpB.send('Target.createTarget', { url: 'about:blank#expo-sync', background: true });
const target = await b.waitForTarget((t) => t.type() === 'page' && t.url().endsWith('#expo-sync'), { timeout: 15000 });
const pg = await target.page();
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

// ---- the exports: probe upward until a batch finds nothing ----
let fetchedTotal = 0;
for (let round = 0; round < 8 && fetchedTotal < CAP; round++) {
  const hi = Math.max(0, ...onDiskIds());
  const want = [];
  for (let r = hi + 1; r <= hi + 25; r++) want.push(r);
  console.log(`probing r${want[0]}..r${want[want.length - 1]}`);
  const res = spawnSync(process.execPath, ['scripts/harvest-roster-revisions.mjs', '1', want.join(',')], { encoding: 'utf8', env: { ...process.env, CDP, REV_DIR: DIR, SHEET_ID: ID, MAX_REV: String(hi + 25) } });
  const out = res.stdout || '';
  const m = out.match(/done: (\d+) fetched/);
  const got = m ? Number(m[1]) : 0;
  for (const l of out.split(/\r?\n/)) if (/done:|wanted|not reachable/.test(l)) console.log('  ' + l);
  fetchedTotal += got;
  if (!got) break;
}
console.log(`new revisions fetched this run: ${fetchedTotal}`);
