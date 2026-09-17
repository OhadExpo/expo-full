// The club-zone coverage probe clicked tabs by class, and the ACTIVE tab has no
// class (BhbcView drops it on the selected one), so the tab the page opened on
// - Overview - was never measured. Measure whatever is active before the loop.
import fs from 'node:fs';
const f = 'audit-out/probe-bhbc-coverage.mjs';
let s = fs.readFileSync(f, 'utf8');
const anchor = 'const nTabs = await pg.evaluate(() => document.querySelectorAll(".bhbc-tab").length);';
if (!s.includes(anchor)) throw new Error('anchor');
const block = `{
  const out = await pg.evaluate(() => {
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    const words = (document.body.innerText || "").match(/[A-Za-z][A-Za-z-]{2,}/g) || [];
    return { name: (active && active.textContent || "(active)").trim(), heb: /[֐-׿]/.test(document.body.innerText || ""), words, len: (document.body.innerText||"").length };
  });
  console.log(out.name.padEnd(10) + " he=" + out.heb + "  " + out.len + " chars  " + out.words.length + " latin words  (the tab the page opened on)");
  if (process.env.VERBOSE) { const c = new Map(); for (const w of out.words) c.set(w, (c.get(w) || 0) + 1); console.log("    " + [...c.entries()].sort((x, y) => y[1] - x[1]).map(([w, n]) => w + "(" + n + ")").join(" ")); }
  for (const w of out.words) seen.set(w, (seen.get(w) || 0) + 1);
}
`;
s = s.replace(anchor, block + anchor);
// Per-tab word lists when VERBOSE, so the list is actionable per screen.
const perTab = 'console.log(name.padEnd(10) + " he=" + out.heb + "  " + out.len + " chars  " + out.words.length + " latin words");';
if (!s.includes(perTab)) throw new Error('perTab');
s = s.replace(perTab, perTab + `
  if (process.env.VERBOSE) { const c = new Map(); for (const w of out.words) c.set(w, (c.get(w) || 0) + 1); console.log("    " + [...c.entries()].sort((x, y) => y[1] - x[1]).map(([w, n]) => w + "(" + n + ")").join(" ")); }`);
fs.writeFileSync(f, s);
console.log('patched');
