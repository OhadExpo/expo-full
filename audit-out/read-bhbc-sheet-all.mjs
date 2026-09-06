// Every month tab of his availability sheet.
//
// Three dead ends, recorded so nobody pays for them twice:
//   - fetch() from inside the editor page is blocked
//   - navigating to the CSV export aborts (Chrome downloads it)
//   - clicking a tab does NOT update location.hash reliably, so reading gids
//     off the tab strip returned the SAME gid five times and downloaded one
//     tab under five names
// What works: gviz addressed by SHEET NAME, with downloads allowed into a
// folder of our own.
import fs from 'node:fs';
import path from 'node:path';
import P from 'puppeteer-core';

const ID = process.env.SHEET || '1sv3MyrRsmHkV5tdBkhtk55mxreGCoSIxC-HnCOmBNa0';
const OUT = path.resolve('audit-out/bhbc-sheet');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });

await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await wait(9000);
const names = await pg.evaluate(() => [...document.querySelectorAll('.docs-sheet-tab-name')].map((e) => e.textContent.trim()));
console.log('TABS: ' + JSON.stringify(names));

const before = new Set(fs.readdirSync(OUT));
for (const name of names) {
  const dst = path.join(OUT, `${name}.csv`);
  const url = `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  let got = false;
  for (let i = 0; i < 30; i++) {
    await wait(700);
    const now = fs.readdirSync(OUT).filter((f) => !before.has(f) && !f.endsWith('.crdownload'));
    if (now.length) {
      fs.renameSync(path.join(OUT, now[0]), dst);
      before.add(path.basename(dst));
      const csv = fs.readFileSync(dst, 'utf8');
      const first = csv.split(String.fromCharCode(10))[0].slice(0, 90);
      console.log(`${name.padEnd(11)} ${String(csv.split(String.fromCharCode(10)).length).padStart(3)} rows  ${String(csv.length).padStart(6)} chars  | ${first}`);
      got = true;
      break;
    }
  }
  if (!got) console.log(`${name}: nothing downloaded`);
}
await pg.close();
b.disconnect();
