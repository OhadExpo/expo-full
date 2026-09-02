// READ HIS PRICING SHEET. REPORT ONLY WHAT IT ACTUALLY SAYS.
//
// Ohad: "in expo > revenue should be always updated from <sheet> automatically
// each day, twice. i should always see updated information."
//
// WHAT THE SHEET ACTUALLY IS. Not a revenue ledger - a roster with prices, in
// two sections:
//
//   מתאמני חד"כ    #, name, last payment date, sessions performed, price/session
//   מתאמני אונליין  #, name, last payment date, price per month
//
// and the money columns are FREE TEXT written for a human:
//
//   "200 ש\"ח"                a clean number
//   "200/175 ש\"ח"            two prices - personal / couple
//   "עד בלוק #17 (כולל)"      prepaid through a block, no number at all
//   "1 אישי, 3 זוגי"          sessions performed, personal + couple, as prose
//
// So a single "monthly revenue" number cannot be derived from this sheet
// without inventing a rule he never stated - which price applies to which
// session, what a prepaid block is worth per month, how a couple splits. This
// script therefore READS and REPORTS. It writes nothing anywhere.
//
// Two things every row gets: what was read, and whether it was UNAMBIGUOUS.
// Anything that needs a human decision is listed as such rather than guessed,
// because his standing rule on data is blank over wrong.
//
//   node scripts/sync-revenue-sheet.mjs [gid]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ID = '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';
const GID = process.argv[2] || '1803423381';
const OUT = path.resolve('audit-out/sheet');

// --- fetch ------------------------------------------------------------------
// The service account (mcp-gsheets@...) has NO access to this spreadsheet, and
// three other routes fail: navigating to /export aborts because a CSV is a
// download not a page; an in-page fetch is refused by the docs.google.com CSP;
// and replaying the profile's cookies from Node lands on the sign-in page.
// Allowing the download over CDP, from the already signed-in profile, works.
//
// It is deliberately NOT the automation path - see the note this prints at the
// end. A scheduled job cannot borrow a logged-in browser.
async function fetchCsv() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
  const page = await browser.newPage();
  try {
    const client = await page.target().createCDPSession();
    await client.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: OUT, eventsEnabled: true });
    const before = new Set(fs.readdirSync(OUT));
    await page.goto(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${GID}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    for (let i = 0; i < 20; i++) {
      const fresh = fs.readdirSync(OUT).filter((f) => !before.has(f));
      if (fresh.length) {
        const p = path.join(OUT, fresh[0]);
        const txt = fs.readFileSync(p, 'utf8');
        if (txt.length > 40) { fs.renameSync(p, path.join(OUT, `revenue-${GID}.csv`)); return txt; }
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    throw new Error('the export never landed - is the debug Chrome signed into his Google account?');
  } finally {
    await page.close().catch(() => {});
    browser.disconnect();
  }
}

// --- parse ------------------------------------------------------------------
const splitCsvLine = (line) => {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; continue; }
    if (c === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
};

// A price is only a number when the cell is ONE number. "200/175" is two prices
// for two different things and "עד בלוק #17" is not a price at all.
const readPrice = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return { value: null, why: 'empty' };
  // A NUMBER IS NOT A PRICE. "עד בלוק #17 (כולל)" means prepaid through block
  // 17, and reading 17 as ₪17 is inventing money out of a block number - which
  // this did, for two athletes, until the currency was required. A price has to
  // carry ש"ח or ₪, or be nothing but digits.
  const hasCurrency = /ש"?ח|₪/.test(s);
  const bareNumber = /^[\d,\s.]+$/.test(s);
  if (!hasCurrency && !bareNumber) return { value: null, why: 'not a price — ' + s };
  const nums = s.match(/\d[\d,]*/g) || [];
  if (nums.length === 0) return { value: null, why: 'no number — ' + s };
  if (nums.length > 1) return { value: null, why: 'more than one price — ' + s };
  return { value: Number(nums[0].replace(/,/g, '')), why: null };
};

const parse = (csv) => {
  const rows = csv.split(/\r?\n/).map(splitCsvLine);
  const sections = [];
  let cur = null;
  for (const r of rows) {
    const joined = r.join('').trim();
    if (!joined) continue;
    const title = r.find((c) => /מתאמני/.test(c));
    if (title) { cur = { title: title.trim(), header: null, rows: [] }; sections.push(cur); continue; }
    if (!cur) continue;
    if (r.some((c) => /שם מלא/.test(c))) { cur.header = r.slice(1); continue; }
    if (/עודכן לאחרונה/.test(joined)) { cur.updated = joined.replace(/^.*?-\s*/, ''); continue; }
    const cells = r.slice(1);
    if (!cells[0] || !cells[1]) continue;
    cur.rows.push(cells);
  }
  return sections;
};

// --- run --------------------------------------------------------------------
const csv = await fetchCsv();
const sections = parse(csv);

let clean = 0; let needsHuman = 0;
for (const s of sections) {
  console.log('\n' + s.title + (s.updated ? '   (sheet says last updated ' + s.updated + ')' : ''));
  console.log('  ' + (s.header || []).join(' | '));
  for (const r of s.rows) {
    const hdr = s.header || [];
    const priceIdx = hdr.findIndex((c) => /מחיר/.test(c));
    const name = r[1];
    const lastPaid = r[2] || '';
    const priceCell = priceIdx >= 0 ? r[priceIdx] : r[r.length - 1];
    const p = readPrice(priceCell);
    if (p.value != null) { clean++; console.log('  ok    ' + name.padEnd(22) + ' last paid ' + lastPaid.padEnd(12) + ' ₪' + p.value); }
    else { needsHuman++; console.log('  ASK   ' + name.padEnd(22) + ' last paid ' + lastPaid.padEnd(12) + ' ' + p.why); }
  }
}

console.log('\n' + clean + ' row(s) carry ONE unambiguous price. ' + needsHuman + ' need a decision from him.');
console.log('\nNothing was written. This sheet is a roster with prices, not a ledger:');
console.log('  * a couple\'s cell holds two prices ("200/175") and the sheet does not say');
console.log('    which applies to which session;');
console.log('  * some rows are prepaid through a block ("עד בלוק #17"), with no monthly value;');
console.log('  * "sessions performed" is prose ("1 אישי, 3 זוגי"), not a count.');
console.log('  Turning that into one revenue number needs rules only he can give.');
console.log('\nFOR THE TWICE-DAILY SYNC he asked for, one of these is needed - a');
console.log('scheduled job cannot borrow a signed-in browser the way this script does:');
console.log('  A) share the sheet with mcp-gsheets@expo-music-495221.iam.gserviceaccount.com');
console.log('     (Viewer is enough), or');
console.log('  B) File > Share > Publish to web > this tab > CSV, which gives a URL any');
console.log('     cron job can read with no credentials at all.');
