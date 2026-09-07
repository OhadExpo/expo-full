// Read his sheet through the signed-in debug Chrome. The Drive connector and
// the service account cannot see these files; the browser he is logged into can.
//
// Two things that do NOT work and cost time if retried: fetch() from inside the
// editor page (blocked), and navigating to the CSV export (Chrome downloads it,
// so the navigation aborts). This lets the download happen, into a folder of
// our own, and reads the file off disk.
import fs from 'node:fs';
import path from 'node:path';
import P from 'puppeteer-core';

const ID = process.env.SHEET || '1sv3MyrRsmHkV5tdBkhtk55mxreGCoSIxC-HnCOmBNa0';
const OUT = path.resolve('audit-out/bhbc-sheet');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });

await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await wait(9000);
// Tab name AND gid: the gid lives on the tab element id, so the names and the
// numbers cannot drift apart.
const tabs = await pg.evaluate(() => [...document.querySelectorAll('.docs-sheet-tab')].map((e) => ({
  name: ((e.querySelector('.docs-sheet-tab-name') || {}).textContent || '').trim(),
  id: e.id || '',
})));
console.log('TABS: ' + JSON.stringify(tabs));

const before = new Set(fs.readdirSync(OUT));
const gids = (process.env.GIDS || '1565508632').split(',');
for (const gid of gids) {
  await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${gid}`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 30; i++) {
    await wait(700);
    const now = fs.readdirSync(OUT).filter((f) => !before.has(f) && !f.endsWith('.crdownload'));
    if (now.length) {
      const src = path.join(OUT, now[0]);
      const dst = path.join(OUT, `gid-${gid}.csv`);
      fs.renameSync(src, dst);
      before.add(path.basename(dst));
      const csv = fs.readFileSync(dst, 'utf8');
      console.log(`\ngid ${gid}: ${csv.length} chars -> ${dst}`);
      console.log(csv.split(String.fromCharCode(10)).slice(0, Number(process.env.LINES || 45)).join(String.fromCharCode(10)));
      break;
    }
    if (i === 29) console.log(`gid ${gid}: no file appeared`);
  }
}
await pg.close();
b.disconnect();
