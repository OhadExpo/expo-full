// Build a title -> video map from ALL downloaded Drive sheets.
//
// The earlier library backfill used scripts/omer-video-map.json, which was built
// from one athlete's workbooks. The full set of 18 sheets holds ~2,300
// hyperlinked video cells, so most of the library's remaining blanks may already
// have a link somewhere in Ohad's own sheets.
//
// Takes titles from BOTH day exercise rows and warm-up blocks, since a warm-up
// entry is a real exercise too.
//
// Usage: node scripts/build-video-map-from-sheets.cjs <sheetsDir> [out.json]
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { parseWorkbook } = require('./reconcile-sheet-vs-app.cjs');

const DIR = process.argv[2];
const OUT = process.argv[3] || 'scripts/sheet-video-map.json';

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const norm = (t) => clean(t).toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
const stripRx = (t) => clean(t).replace(/\s*\([^)]*\)\s*$/, '');   // "Title (1x10 E)" -> "Title"
const fixUrl = (u) => String(u).trim().replace(/&amp;/g, '&')
  .replace(/^https?:\/\/\.?youtube\.com/i, 'https://www.youtube.com')
  .replace(/^http:\/\//i, 'https://');
const isVideo = (u) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(u);

const map = {};
let cells = 0, files = 0;
const add = (title, url) => {
  const t = norm(stripRx(title));
  const u = fixUrl(url);
  if (!t || t.length < 4 || !isVideo(u)) return;
  cells++;
  if (!map[t]) map[t] = u;
};

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.xlsx'))) {
  files++;
  const p = path.join(DIR, f);
  // Day rows + warm-ups, straight from the shared parser.
  try {
    for (const b of parseWorkbook(p)) {
      for (const w of b.warmup || []) if (w.url) add(w.title, w.url);
      for (const d of b.days || []) for (const r of d.rows || []) {
        if (r.url) add(r.title, r.url);
        if (r.urlAlt) add(r.title, r.urlAlt);
      }
    }
  } catch (e) { console.log('parse failed', f, e.message); }

  // Belt and braces: any hyperlinked cell whose neighbour reads like a title.
  const wb = XLSX.readFile(p);
  for (const tab of wb.SheetNames) {
    const ws = wb.Sheets[tab];
    for (const addr of Object.keys(ws)) {
      if (addr[0] === '!') continue;
      const c = ws[addr];
      if (!c || !c.l || !c.l.Target || !isVideo(fixUrl(c.l.Target))) continue;
      const label = clean(c.v);
      // The cell's own text is the title when it is not just an index number.
      if (label && !/^\d+[a-z]?$/i.test(label)) add(label, c.l.Target);
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify(map, null, 2));
console.log(`sheets read: ${files} | video cells accepted: ${cells} | distinct titles: ${Object.keys(map).length}`);
console.log('wrote', OUT);
