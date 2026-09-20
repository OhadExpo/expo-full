// BREAK TEST FOR THE OCD SWEEP.
//
// On a real zone screen six of the nine rules report zero. A zero from a rule
// that has never been shown to fire is not evidence of anything — that exact
// mistake has cost two rebuilds today alone (a gate that measured a 645px
// window five times while labelling it 390/414/484/768/1280, and a clipping
// gate built on Range.getClientRects(), which is clipped BY overflow:hidden and
// so could never see the overflow it existed to find).
//
// So: plant one defect of each class on a blank page and require the probe to
// report it. Any rule that stays silent here is blind, and its zero on the real
// sweep means nothing.
//
//   node scripts/ocd-breaktest.mjs
import P from 'puppeteer-core';
import { PROBE } from './lib/ocd-probe.mjs';

// Each case: the kind it must report, and the HTML that should trigger it.
// Kept deliberately crude — the point is to trip the rule, not to look real.
const CASES = [
  ['SIDEWAYS', '<div style="width:900px;height:40px;background:#333">wide</div>'],
  ['CLIPPED', '<div style="width:60px;overflow:hidden;white-space:nowrap;font:16px monospace">ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>'],
  ['OFFSCREEN', '<div style="position:absolute;left:340px;top:200px;width:200px;height:30px;background:#444">pokes out</div>'],
  ['TINYTAP', '<button style="width:20px;height:20px">x</button>'],
  ['COLLIDE', '<div style="position:relative;height:40px"><span style="position:absolute;left:10px;top:10px">alpha</span><span style="position:absolute;left:14px;top:12px">beta</span></div>'],
  ['RAGGED', '<div style="width:300px"><div style="margin-left:0">one</div><div style="margin-left:20px">two</div><div style="margin-left:40px">three</div></div>'],
  ['UNEVEN', '<div style="display:flex;align-items:flex-start"><span style="height:20px;display:inline-block">a</span><span style="height:44px;display:inline-block">b</span></div>'],
  ['ORPHAN', '<div style="display:grid;grid-template-columns:repeat(3,100px)"><i>1</i><i>2</i><i>3</i><i>4</i></div>'],
  ['EDGEFLIP', '<div style="width:300px;position:relative;height:90px">'
    + '<div style="position:absolute;left:0;top:0;width:80px">aa</div>'
    + '<div style="position:absolute;left:0;top:24px;width:80px">bb</div>'
    + '<div style="position:absolute;right:0;top:48px;width:80px">cc</div></div>'],
];

const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const page = await b.newPage();
let blind = 0, ok = 0;
try {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const [kind, html] of CASES) {
    await page.goto('about:blank');
    // THE VIEWPORT META IS NOT OPTIONAL HERE.
    // Without it, isMobile emulation falls back to Chrome's 980px layout
    // viewport, so the page is 980 wide however narrow the device is. The
    // first run of this break test called SIDEWAYS and OFFSCREEN blind for
    // exactly that reason: a planted 900px block FITS in 980, and an element
    // at x=540 is nowhere near the edge. Both rules were correct; the harness
    // was lying to them. The real app carries this meta tag.
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;font-family:sans-serif">${html}</body></html>`);
    await new Promise((r) => setTimeout(r, 250));
    const res = await page.evaluate(PROBE);
    if (Math.abs(res.vw - 390) > 3) { console.log(`  ABORT ${kind}: the test page is ${res.vw}px wide, not 390 — the harness is wrong, not the rule`); blind++; continue; }
    const hit = res.findings.filter((f) => f.kind === kind);
    if (hit.length) { ok++; console.log(`  ok    ${kind.padEnd(10)} fired — ${hit[0].detail}`); }
    else { blind++; console.log(`  BLIND ${kind.padEnd(10)} planted the defect and the rule said nothing. Saw: ${res.findings.map((f) => f.kind).join(',') || '(nothing)'}`); }
  }
  // AND THE OTHER HALF OF A BREAK TEST: a clean page must be clean, or every
  // rule is just noise and the sweep's findings mean nothing either.
  await page.goto('about:blank');
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;font-family:sans-serif"><div style="padding:16px"><p style="margin:0 0 12px">one</p><p style="margin:0">two</p></div></body></html>');
  await new Promise((r) => setTimeout(r, 250));
  const clean = await page.evaluate(PROBE);
  console.log(`\n  clean page: ${clean.findings.length} finding(s)` + (clean.findings.length ? ' <-- FALSE POSITIVES: ' + clean.findings.map((f) => `${f.kind}(${f.detail})`).join(', ') : ''));
  if (clean.findings.length) blind++;
} catch (e) { console.log('ERROR', e.message); process.exitCode = 1; }
finally { await page.close().catch(() => {}); b.disconnect(); }

console.log(`\n${ok} of ${CASES.length} rules proven to fire, ${blind} problem(s)`);
if (blind) process.exitCode = 1;
