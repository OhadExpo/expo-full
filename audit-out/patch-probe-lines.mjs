// "lines" cannot be "distinct rect tops": a 13px name and a 10px badge sitting
// side by side on ONE row have different tops, and the probe called that a
// wrap - thirteen false alarms on the dashboard. Two runs of text are on the
// same line when they OVERLAP vertically; cluster by overlap and count the
// clusters. That is what the eye does.
import fs from 'node:fs';
const f = 'audit-out/probe-control-wrap.mjs';
let s = fs.readFileSync(f, 'utf8');
const a = `  const lineTops = (el) => {
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
  };`;
const b = `  const lineTops = (el) => {
    const rects = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const rc of r.getClientRects()) { if (rc.width < 0.5 || rc.height < 0.5) continue; rects.push(rc); }
    }
    // Same line = vertical overlap of at least half the shorter run.
    const bands = [];
    for (const rc of [...rects].sort((x, y) => x.top - y.top)) {
      const band = bands.find((bd) => {
        const ov = Math.min(bd.bottom, rc.bottom) - Math.max(bd.top, rc.top);
        return ov >= Math.min(bd.bottom - bd.top, rc.height) * 0.5;
      });
      if (band) { band.top = Math.min(band.top, rc.top); band.bottom = Math.max(band.bottom, rc.bottom); }
      else bands.push({ top: rc.top, bottom: rc.bottom });
    }
    return { lines: bands.length, rects };
  };`;
if (s.split(a).length !== 2) throw new Error('lineTops anchor');
s = s.replace(a, b);
fs.writeFileSync(f, s);
console.log('ok overlap clustering');
