// EVERY CALENDAR HE CAN SEE, EXPORTED BY HIS OWN BROWSER.
//
// Ohad (2026-09-14): "figure it out that's not a good answer. you need to find
// a way on your own" - about the club calendar, which he only READS, so he
// cannot share it with a service account and cannot see a secret iCal address
// for it.
//
// He does not have to. Google Calendar has the same trick the sheets have: a
// signed-in browser can ask for an EXPORT of every calendar in the user's list
// - owned and subscribed alike - as one zip of .ics files:
//
//     https://calendar.google.com/calendar/exporticalzip
//
// It is a navigation that DOWNLOADS, exactly like /export?format=xlsx, so CDP
// points it at a folder and the file lands. No sharing, no new credentials, no
// API key, nobody to ask. The tab is opened in the BACKGROUND of his own
// Chrome so a twice-daily run never steals the window.
//
//   node scripts/fetch-calendars-zip.mjs [outDir]
//     → <outDir>/calendars.zip and one .ics per calendar beside it
import P from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = path.resolve(process.argv[2] || 'audit-out/sheets/cal');
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
fs.mkdirSync(OUT, { recursive: true });

const b = await P.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 300000 });
const cdpB = await b.target().createCDPSession();
await cdpB.send('Target.createTarget', { url: 'about:blank#expo-cal', background: true });
const target = await b.waitForTarget((t) => t.type() === 'page' && t.url().endsWith('#expo-cal'), { timeout: 20000 });
const pg = await target.page();
try {
  const before = new Set(fs.readdirSync(OUT));
  const cdp = await pg.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });
  pg.goto('https://calendar.google.com/calendar/exporticalzip').catch(() => {});
  let got = null;
  for (let i = 0; i < 120 && !got; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    got = fs.readdirSync(OUT).find((f) => !before.has(f) && /\.zip$/i.test(f) && !/\.crdownload$/i.test(f));
  }
  if (!got) throw new Error('no .zip appeared in ' + OUT + ' within 120s (is the profile signed in?)');
  const zip = path.join(OUT, 'calendars.zip');
  if (path.join(OUT, got) !== zip) { fs.rmSync(zip, { force: true }); fs.renameSync(path.join(OUT, got), zip); }
  const head = fs.readFileSync(zip).subarray(0, 2).toString('latin1');
  if (head !== 'PK') throw new Error('not a zip (starts with "' + head + '") - the export probably returned a sign-in page');
  // Expand with PowerShell so no dependency is added for one unzip.
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${OUT}' -Force`], { stdio: 'ignore' });
  const ics = fs.readdirSync(OUT).filter((f) => f.endsWith('.ics'));
  console.log(`OK ${zip} ${fs.statSync(zip).size} bytes → ${ics.length} calendars`);
  for (const f of ics) {
    const t = fs.readFileSync(path.join(OUT, f), 'utf8');
    const n = t.split('BEGIN:VEVENT').length - 1;
    const name = (t.match(/^X-WR-CALNAME:(.*)$/m) || [])[1] || '';
    console.log(`   ${f}  ${n} events  ${name.trim()}`);
  }
} finally { await pg.close(); b.disconnect(); }
