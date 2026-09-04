// A BEFORE/AFTER pair for the printed block.
//
// The route-based pairs photograph a URL; this one has to produce a PDF, so it
// gets its own script: revert the print layout, export a real block through the
// real menu, render page 5, restore, export again, render again.
//
// Page 5 is chosen deliberately - it is the page that carried nothing but
// "DAY 2" before, with no athlete, no block and no page number, and 71% of it
// blank. It is the clearest single frame of what changed.
//
//   node scripts/build-pdf-pair.mjs [planId]
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const PLAN = process.argv[2] || 'plan_ur240a8rtqnmo91es11';
const OUT = 'audit-out/beforeafter';
const CSS = 'src/themes.css';
const JSX = 'src/PlansView.jsx';
fs.mkdirSync(OUT, { recursive: true });

// Exactly the two things that made a printed day a full, identified page.
const UNDO_CSS = [
  ['min-height: 266mm;', 'min-height: 0;'],
  ['.plan-print .pp-day-first { min-height: 232mm; }', ''],
];
const UNDO_JSX = [
  // An INLINE display:none, not the hidden attribute - .pp-day-foot is
  // display:flex in the print stylesheet, and that beats [hidden].
  ['<div className="pp-day-foot">', '<div className="pp-day-foot" style={{ display: "none" }}>'],
];

const render = (pdf, png) => {
  const r = spawnSync('python', ['-c', `
import fitz, sys
d = fitz.open(sys.argv[1])
i = min(4, d.page_count - 1)
d[i].get_pixmap(dpi=110).save(sys.argv[2])
print('page', i + 1, 'of', d.page_count)
`, pdf, png], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  return ((r.stdout || '') + (r.stderr || '')).trim();
};

const exportPdf = (out) => {
  const r = spawnSync('node', ['scripts/export-plan-pdf.mjs', PLAN, out],
    { encoding: 'utf8', timeout: 300000 });
  const t = (r.stdout || '') + (r.stderr || '');
  if (!fs.existsSync(out)) throw new Error('export produced no pdf: ' + t.slice(-160));
  return t.split('\n').find((l) => l.startsWith('OK ')) || 'exported';
};

const css0 = fs.readFileSync(CSS, 'utf8');
const jsx0 = fs.readFileSync(JSX, 'utf8');
try {
  let css = css0, jsx = jsx0;
  for (const [a, b] of UNDO_CSS) {
    if (!css.includes(a)) throw new Error('css anchor missing: ' + a.slice(0, 40));
    css = css.replace(a, b);
  }
  for (const [a, b] of UNDO_JSX) {
    if (!jsx.includes(a)) throw new Error('jsx anchor missing: ' + a.slice(0, 40));
    jsx = jsx.replace(a, b);
  }
  fs.writeFileSync(CSS, css);
  fs.writeFileSync(JSX, jsx);
  await new Promise((r) => setTimeout(r, 7000));
  console.log('before: ' + exportPdf('audit-out/_pdf-before.pdf'));
  console.log('        ' + render('audit-out/_pdf-before.pdf', `${OUT}/pdf-page-before.png`));

  fs.writeFileSync(CSS, css0);
  fs.writeFileSync(JSX, jsx0);
  await new Promise((r) => setTimeout(r, 7000));
  console.log('after : ' + exportPdf('audit-out/_pdf-after.pdf'));
  console.log('        ' + render('audit-out/_pdf-after.pdf', `${OUT}/pdf-page-after.png`));
} finally {
  // Unconditional. A reverted print layout must never survive this script.
  if (fs.readFileSync(CSS, 'utf8') !== css0) { fs.writeFileSync(CSS, css0); console.log('restored ' + CSS); }
  if (fs.readFileSync(JSX, 'utf8') !== jsx0) { fs.writeFileSync(JSX, jsx0); console.log('restored ' + JSX); }
  for (const f of ['audit-out/_pdf-before.pdf', 'audit-out/_pdf-after.pdf']) fs.rmSync(f, { force: true });
}

// Add it to the pair index the recap reads. No crop: a printed page IS the
// frame, and cropping it would hide the emptiness that is the point.
const idxPath = `${OUT}/index.json`;
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')).filter((x) => x.id !== 'pdf-page');
idx.push({ id: 'pdf-page', title: 'Printed block, page 5 · no athlete, no block, no page number', w: 0, crop: null });
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));
console.log(`\nindexed ${idx.length} pair(s)`);
