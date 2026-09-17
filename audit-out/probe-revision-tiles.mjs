// The revision list WITH TIMESTAMPS: open the sheet's version-history panel in
// the harvest Chrome and capture the "revisions/tiles" request the panel makes
// (it needs a per-page token, so it cannot be built by hand). Saves the raw
// body to audit-out/sheets/revisions-tiles.txt and a parsed summary.
//   node audit-out/probe-revision-tiles.mjs
import P from 'puppeteer-core';
import fs from 'node:fs';
const ID = process.env.SHEET_ID || '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';
const OUT = process.env.OUT || 'audit-out/sheets/revisions-tiles.txt';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9225', defaultViewport: null, protocolTimeout: 180000 });
const pg = await b.newPage();
const bodies = [];
pg.on('response', async (res) => {
  const u = res.url();
  if (/\/revisions\/(tiles|load|show)/.test(u)) {
    try { const t = await res.text(); bodies.push({ url: u, status: res.status(), text: t }); console.log('captured', res.status(), u.slice(0, 140), t.length, 'chars'); } catch (e) { console.log('capture failed', String(e).slice(0, 80)); }
  }
});
await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));
console.log('title:', await pg.title());
// File → Version history → See version history = Ctrl+Alt+Shift+H
await pg.keyboard.down('Control'); await pg.keyboard.down('Alt'); await pg.keyboard.down('Shift');
await pg.keyboard.press('KeyH');
await pg.keyboard.up('Shift'); await pg.keyboard.up('Alt'); await pg.keyboard.up('Control');
await new Promise((r) => setTimeout(r, 12000));
if (!bodies.length) {
  // Fall back to the URL form with the panel's own hash route.
  await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/edit#revisions`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 12000));
}
console.log('captured bodies:', bodies.length);
fs.writeFileSync(OUT, bodies.map((x) => `### ${x.status} ${x.url}\n${x.text}`).join('\n\n'));
console.log('saved', OUT);
await pg.screenshot({ path: 'audit-out/sheets/revision-panel.png' });
await pg.close();
b.disconnect();
