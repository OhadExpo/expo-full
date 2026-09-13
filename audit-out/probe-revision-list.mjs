// Every revision id of the roster sheet with its timestamp.
//
// The version-history panel asks /revisions/tiles with a per-page token. This
// opens the panel once to learn the token, then asks the same endpoint from
// page context with showDetailedRevisions=true in batches until the list ends.
// Output: audit-out/sheets/revisions.json = [{rev, endMillis, iso, users}]
//   SHEET_ID=… OUT=… node audit-out/probe-revision-list.mjs
import P from 'puppeteer-core';
import fs from 'node:fs';
const ID = process.env.SHEET_ID || '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';
const OUT = process.env.OUT || 'audit-out/sheets/revisions.json';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9225', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
let tilesUrl = null;
pg.on('request', (req) => { const u = req.url(); if (/\/revisions\/tiles\?/.test(u) && !tilesUrl) tilesUrl = u; });
await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));
await pg.keyboard.down('Control'); await pg.keyboard.down('Alt'); await pg.keyboard.down('Shift');
await pg.keyboard.press('KeyH');
await pg.keyboard.up('Shift'); await pg.keyboard.up('Alt'); await pg.keyboard.up('Control');
for (let i = 0; i < 30 && !tilesUrl; i++) await new Promise((r) => setTimeout(r, 500));
if (!tilesUrl) { console.log('no tiles request seen'); process.exit(1); }
const u = new URL(tilesUrl);
const token = u.searchParams.get('token');
const ouid = u.searchParams.get('ouid');
console.log('token captured, ouid', ouid);

const all = new Map();
const fetchBatch = (start, end) => pg.evaluate(async (id, start, end, token, ouid) => {
  const q = new URLSearchParams({ id, start: String(start), end: String(end), revisionBatchSize: '1500', showDetailedRevisions: 'true', loadType: '0', token, ouid, includes_info_params: 'true', cros_files: 'false', nded: 'false' });
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/revisions/tiles?${q}`, { credentials: 'include' });
  const t = await r.text();
  return { status: r.status, text: t.slice(0, 2_000_000) };
}, ID, start, end, token, ouid);

// Walk in windows; the endpoint returns the tiles that fall inside [start,end].
let start = 1;
const WINDOW = 300;
let lastMax = 0;
for (let guard = 0; guard < 40; guard++) {
  let res = await fetchBatch(start, start + WINDOW - 1);
  // Past the newest revision the endpoint answers 400: shrink the window to find the edge.
  let w = WINDOW;
  while (res.status === 400 && w > 1) { w = Math.floor(w / 2); res = await fetchBatch(start, start + w - 1); }
  if (res.status !== 200) { console.log('status', res.status, 'at', start, '- the list ends here'); break; }
  const body = res.text.replace(/^\)\]\}'\n?/, '');
  let j; try { j = JSON.parse(body); } catch (e) { console.log('parse failed at', start, body.slice(0, 120)); break; }
  const tiles = j.tileInfo || [];
  let maxEnd = 0;
  for (const t of tiles) {
    // A detailed tile is one revision (start===end); a grouped one is a range.
    // Either way the timestamp is attached to the END of the tile.
    for (let r = t.start; r <= t.end; r++) {
      if (!all.has(r) || t.start === t.end) all.set(r, { rev: r, endMillis: t.endMillis, iso: new Date(t.endMillis).toISOString(), users: t.users, grouped: t.start !== t.end, tileStart: t.start, tileEnd: t.end });
    }
    maxEnd = Math.max(maxEnd, t.end);
  }
  console.log(`window ${start}-${start + WINDOW - 1}: ${tiles.length} tiles, max end ${maxEnd}`);
  if (!tiles.length) { if (start > lastMax + WINDOW * 2) break; }
  lastMax = Math.max(lastMax, maxEnd);
  start += WINDOW;
  if (start > 6000) break;
}
// Second pass: a grouped tile carries one timestamp for a range; asking for
// exactly that range returns its members one by one.
const groups = new Map();
for (const v of all.values()) if (v.grouped) groups.set(v.tileStart + '-' + v.tileEnd, [v.tileStart, v.tileEnd]);
console.log('expanding', groups.size, 'grouped tiles');
let expanded = 0;
for (const [gs, ge] of groups.values()) {
  const res = await fetchBatch(gs, ge);
  if (res.status !== 200) continue;
  let j; try { j = JSON.parse(res.text.replace(/^\)\]\}'\n?/, '')); } catch { continue; }
  for (const t of (j.tileInfo || [])) if (t.start === t.end) { all.set(t.start, { rev: t.start, endMillis: t.endMillis, iso: new Date(t.endMillis).toISOString(), users: t.users, grouped: false, tileStart: t.start, tileEnd: t.end }); expanded++; }
}
console.log('expanded to single revisions:', expanded);
const list = [...all.values()].sort((a, b2) => a.rev - b2.rev);
fs.writeFileSync(OUT, JSON.stringify(list, null, 0));
console.log('revisions', list.length, 'min', list[0]?.rev, 'max', list[list.length - 1]?.rev, 'newest', list[list.length - 1]?.iso, 'grouped', list.filter((x) => x.grouped).length);
await pg.close();
b.disconnect();
