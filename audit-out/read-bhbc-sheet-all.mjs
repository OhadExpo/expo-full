// Every month tab of his availability sheet, as a TRUE csv export.
//
// Five dead ends, recorded so nobody pays for them twice:
//   - fetch() from inside the editor page is blocked
//   - navigating to the CSV export aborts (Chrome downloads it) - so downloads
//     are allowed into a folder of our own and read off disk
//   - reading a tab's gid off the tab element gives an internal id, not a gid
//   - gviz addressed by SHEET NAME downloads, but it is LOSSY on this file:
//     August came back with almost every cell empty because the sheet is full
//     of merged cells. `headers=0` does not help. Never trust gviz here.
//   - clicking a tab with .click() alone does NOT always switch it: one run
//     read February's gid for all five tabs and overwrote every file with the
//     same month. The gids below were read from location.href after a real
//     mousedown/mouseup/click, and they are pinned here so a bad click can
//     never silently produce five copies of one tab again.
//
// If he adds a month, click its tab in the browser, copy the gid out of the
// URL, and add it here.
import fs from 'node:fs';
import path from 'node:path';
import P from 'puppeteer-core';

const ID = process.env.SHEET || '1sv3MyrRsmHkV5tdBkhtk55mxreGCoSIxC-HnCOmBNa0';
const GIDS = {
  August: '1565508632',
  September: '536717987',
  October: '1828409130',
  January: '1985844099',
  February: '1343858464',
};
const OUT = path.resolve('audit-out/bhbc-sheet');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });

const before = new Set(fs.readdirSync(OUT));
const seen = new Map();
for (const [name, gid] of Object.entries(GIDS)) {
  const dst = path.join(OUT, `${name}.csv`);
  await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${gid}`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  let got = false;
  for (let i = 0; i < 30; i++) {
    await wait(700);
    const now = fs.readdirSync(OUT).filter((f) => !before.has(f) && !f.endsWith('.crdownload'));
    if (now.length) {
      if (fs.existsSync(dst)) fs.rmSync(dst);
      fs.renameSync(path.join(OUT, now[0]), dst);
      before.add(path.basename(dst));
      const csv = fs.readFileSync(dst, 'utf8');
      // Two tabs with identical content mean the gids are wrong, not that he
      // duplicated a month. Say so rather than leaving five copies on disk.
      const sig = csv.length + ':' + csv.slice(0, 120);
      if (seen.has(sig)) console.log(`!! ${name} is byte-identical to ${seen.get(sig)} - check the gid`);
      seen.set(sig, name);
      console.log(`${name.padEnd(11)} gid ${gid.padEnd(11)} ${String(csv.split(String.fromCharCode(10)).length).padStart(3)} rows  ${String(csv.length).padStart(6)} chars`);
      got = true;
      break;
    }
  }
  if (!got) console.log(`${name}: nothing downloaded`);
}
await pg.close();
b.disconnect();
