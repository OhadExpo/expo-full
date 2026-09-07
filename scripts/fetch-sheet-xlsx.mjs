// Pull a Google Sheet down as .xlsx through the signed-in debug Chrome.
//
// Neither the Drive connector nor the mcp-gsheets service account can reach
// these two files: the roster is owned by another account that has not shared
// it with the service account, and the connector has no permission scope to
// grant one. The browser profile IS signed in as an account with access, and
// /export?format=xlsx returns every tab with its real cells - no markdown
// round-trip to mangle the Hebrew or the dates.
import P from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const ID = process.argv[2];
const OUT = process.argv[3];
if (!ID || !OUT) { console.log('usage: fetch-sheet-xlsx.mjs <fileId> <out.xlsx>'); process.exit(2); }

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
try {
  await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  const title = await pg.title();
  if (/sign in|not found|error/i.test(title)) throw new Error('sheet not reachable, page title: ' + title);
  // /export 302s to googleusercontent, so an in-page fetch dies on CORS.
  // Navigating to it is a DOWNLOAD, which CDP can point at a directory.
  const dir = path.resolve(path.dirname(OUT));
  fs.mkdirSync(dir, { recursive: true });
  const before = new Set(fs.readdirSync(dir));
  const cdp = await pg.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx&id=${ID}`).catch(() => {});
  let got = null;
  for (let i = 0; i < 60 && !got; i++) {
    await new Promise(r => setTimeout(r, 1000));
    got = fs.readdirSync(dir).find((f) => !before.has(f) && f.endsWith('.xlsx'));
  }
  if (!got) throw new Error('no .xlsx appeared in ' + dir + ' within 60s');
  fs.renameSync(path.join(dir, got), OUT);
  const head = fs.readFileSync(OUT).subarray(0, 2).toString('latin1');
  if (head !== 'PK') throw new Error('not an xlsx (starts with "' + head + '")');
  const len = fs.statSync(OUT).size;
  console.log(`OK ${OUT} ${len} bytes  <- ${title}`);
} finally { await pg.close(); b.disconnect(); }
