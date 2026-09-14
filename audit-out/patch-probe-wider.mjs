// The probe only looked at controls whose label sat in the element's OWN text
// nodes, so <button><span>SAVE</span></button> - most of the coach app - was
// never examined, and seven routes read "0 faults" without measuring anything.
// Now: any bordered box (or button/tab) under 56px tall carrying up to 42
// characters is a control, and its lines are counted across ALL descendant
// text. Every run also SELF-TESTS: a deliberately broken chip is injected and
// the measure must flag it, or the run fails loudly.
import fs from 'node:fs';
const f = 'audit-out/probe-control-wrap.mjs';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`  const lineTops = (el) => {
    const tops = new Set();
    const rects = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const rc of r.getClientRects()) { if (rc.width < 0.5) continue; tops.add(Math.round(rc.top)); rects.push(rc); }
    }
    return { lines: tops.size, rects };
  };`,
`  const lineTops = (el) => {
    const tops = new Set();
    const rects = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const rc of r.getClientRects()) { if (rc.width < 0.5) continue; tops.add(Math.round(rc.top)); rects.push(rc); }
    }
    return { lines: tops.size, rects };
  };`, 'walk all text');

rep(`    // Only leaf-ish controls: an element whose own text nodes carry the label.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).length;
    if (!own) continue;
    const key = txt + '|' + Math.round(box.x) + '|' + Math.round(box.y);`,
`    // A bordered box this small carrying this little text IS a control, whether
    // the label sits in its own text node or in a span inside it.
    const key = txt + '|' + Math.round(box.x) + '|' + Math.round(box.y);`, 'drop own-text filter');

rep(`    seen.add(key);
    const { lines, rects } = lineTops(el);`,
`    seen.add(key);
    scanned.push(key);
    const { lines, rects } = lineTops(el);`, 'count scanned');

rep(`const MEASURE = () => {
  const out = [];
  const seen = new Set();`,
`const MEASURE = () => {
  const out = [];
  const scanned = [];
  const seen = new Set();`, 'scanned array');

rep(`    out.push({ text: txt.slice(0, 40), tag: el.tagName, cls: String(el.className || '').slice(0, 26), x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height), lines, faults: faults.join(',') });
  }
  return out;
};`,
`    out.push({ text: txt.slice(0, 40), tag: el.tagName, cls: String(el.className || '').slice(0, 26), x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height), lines, faults: faults.join(',') });
  }
  out.scanned = scanned.length;
  return out;
};

// A measure that cannot fail is not a measure. Inject a chip built exactly like
// the one that reached his screen - bordered, short label, no nowrap, squeezed -
// and require the measure to flag it.
const SELFTEST = () => {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:54px;z-index:2147483647;opacity:0.01;pointer-events:none';
  const chip = document.createElement('span');
  chip.setAttribute('data-selftest', '1');
  chip.style.cssText = 'display:inline-flex;align-items:center;height:24px;box-sizing:border-box;padding:3px 7px;border:1px solid #39BDFF;font-size:8px;letter-spacing:0.18em';
  chip.textContent = '1 LOGGED';
  host.appendChild(chip);
  document.body.appendChild(host);
  return () => host.remove();
};`, 'selftest helper');

rep(`  const found = await pg.evaluate(MEASURE);`,
`  const self = await pg.evaluate(\`(\${SELFTEST.toString()})()\` && SELFTEST);
  const probe = await pg.evaluate(MEASURE);
  const caught = probe.some((x) => x.text === '1 LOGGED' && /WRAP/.test(x.faults));
  await pg.evaluate(() => { const h = document.querySelector('[data-selftest]'); if (h && h.parentElement) h.parentElement.remove(); });
  if (!caught) { console.log('SELF-TEST FAILED on ' + route + ': the injected broken chip was not flagged - the measure is not measuring'); process.exitCode = 1; }
  const found = await pg.evaluate(MEASURE);`, 'selftest run');
fs.writeFileSync(f, s);
