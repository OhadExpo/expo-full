// PRINT A BLOCK THE WAY THE COACH DOES, AND KEEP THE PDF.
//
// The export has no PDF library - it renders a print sheet into the page and
// lets the browser's own typesetter and PDF writer do the work. So the only
// honest way to judge it is to drive the same path: open the block in the
// editor, let the print stylesheet apply, and take the PDF Chrome itself
// produces. printToPDF uses the print media exactly as the Save-as-PDF dialog
// would, which is why this is a real check and not a screenshot of a preview.
//
//   node scripts/export-plan-pdf.mjs [planId] [out.pdf]
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const OUT = process.argv[3] || 'audit-out/plan.pdf';

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
// A silent failure to mount is almost always a render error or a refused save,
// and both say so in the console.
pg.on('console', (m) => { if (/error|warn/i.test(m.type())) console.log('  [console:' + m.type() + '] ' + m.text().slice(0, 220)); });
pg.on('pageerror', (e) => console.log('  [pageerror] ' + String(e.message).slice(0, 300)));
await A.signIn(pg, BASE);

let planId = process.argv[2];
if (!planId) {
  // Straight from the database, not by scraping the page: it is one query, it
  // cannot time out behind a heavy render, and picking the block with the most
  // days is deliberate - a template that reads well on four days and 27
  // exercises reads well on two.
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co',
    'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  // The block lives in a jsonb `data` column, not in top-level columns.
  const { data, error } = await sb.from('plans').select('id,name,data,trainee_id').limit(400);
  if (error) { console.log('cannot list plans:', error.message); process.exit(2); }
  const best = (data || [])
    .map((p) => { const days = Array.isArray(p.data?.days) ? p.data.days : []; return { ...p, n: days.length,
      ex: days.reduce((a, d) => a + ((d.exercises || d.ex || []).length), 0) }; })
    .sort((a, b) => b.ex - a.ex)[0];
  if (!best) { console.log('no plans found'); process.exit(2); }
  planId = best.id;
  console.log(`picked "${best.name}" - ${best.n} days, ${best.ex} exercises`);
}

console.log('planId:', planId);
await pg.goto(`${BASE}/coach/programs/${planId}`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 12000));

// The sheet is mounted ONLY while the print dialog is open, so this drives the
// real menu path - MORE > Export PDF - rather than reaching into React state.
// window.print is stubbed first: it is synchronous and opens an OS dialog that
// blocks CDP entirely. Everything before it is unchanged, including the
// autosave flush, so what gets measured is what the coach gets.
await pg.evaluate(() => { window.print = () => { window.__printed = true; }; });
// The editor is a heavy route and a fixed wait is a guess; poll for the button
// that has to exist before anything can be clicked.
let haveMore = false;
for (let i = 0; i < 40 && !haveMore; i++) {
  haveMore = await pg.evaluate(() => !!document.querySelector('[aria-label="More program actions"]'));
  if (!haveMore) await new Promise((r) => setTimeout(r, 1000));
}
const clicked = await pg.evaluate(() => {
  const more = document.querySelector('[aria-label="More program actions"]');
  if (!more) return 'no MORE button';
  more.click();
  return 'menu opened';
});
console.log(clicked);
await new Promise((r) => setTimeout(r, 900));
const picked = await pg.evaluate(() => {
  const it = [...document.querySelectorAll('button,[role="menuitem"],div')]
    .find((e) => (e.textContent || '').trim() === 'Export PDF');
  if (!it) return 'no Export PDF item';
  it.click();
  return 'clicked Export PDF';
});
console.log(picked);
// The export flushes the draft to Supabase before it mounts anything.
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await pg.evaluate(() => !!document.querySelector('.plan-print'))) break;
}
if (!(await pg.evaluate(() => !!document.querySelector('.plan-print')))) {
  console.log('FAILED: the print sheet never mounted');
  await pg.close(); b.disconnect(); process.exit(1);
}
await pg.emulateMediaType('print');
await new Promise((r) => setTimeout(r, 1200));
const pdf = await pg.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true,
  margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } });
fs.writeFileSync(OUT, pdf);
console.log(`OK ${OUT} ${pdf.length} bytes`);

// So a checker can compare the PDF against the block it was made from, rather
// than against a second guess at which block that was.
if (process.env.PLAN_JSON_OUT) {
  const { createClient: cc } = await import('@supabase/supabase-js');
  const sb2 = cc('https://gtcbfglttoiyfsnfbhdy.supabase.co',
    'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
  await sb2.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: row } = await sb2.from('plans').select('name,data,trainee_id').eq('id', planId).maybeSingle();
  const { data: st } = await sb2.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const tid = String(row?.trainee_id || '').split('__')[0];
  const t = (st?.value || []).find((x) => x && x.id === tid);
  fs.writeFileSync(process.env.PLAN_JSON_OUT, JSON.stringify(
    { ...(row?.data || {}), name: row?.name || '', athleteName: t ? t.name : '' }, null, 1));
  console.log('plan json -> ' + process.env.PLAN_JSON_OUT);
}

// What the sheet actually contains, so a silently empty PDF cannot pass.
const facts = await pg.evaluate(() => {
  const root = document.querySelector('.plan-print');
  if (!root) return { err: 'no .plan-print in the document' };
  return {
    days: root.querySelectorAll('.pp-day').length,
    breaks: root.querySelectorAll('.pp-day-break').length,
    exercises: root.querySelectorAll('.pp-ex').length,
    cues: root.querySelectorAll('.pp-ex-cue').length,
    metaStrips: root.querySelectorAll('.pp-ex-meta').length,
    weekChips: root.querySelectorAll('.pp-weeks').length,
    supersets: root.querySelectorAll('.pp-ss').length,
    logo: !!root.querySelector('.pp-logo'),
    title: (root.querySelector('.pp-title')||{}).textContent,
  };
});
console.log(JSON.stringify(facts, null, 1));
await pg.close(); b.disconnect();
