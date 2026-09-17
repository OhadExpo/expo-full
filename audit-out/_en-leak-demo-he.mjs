// Rendered English on the PUBLIC coach demo in Hebrew: every top tab and every dropdown item,
// expandables opened. Mock data only. Output: C:/Users/ADMINI~1/AppData/Local/Temp/claude/en_leak_demo.txt
import P from 'puppeteer-core';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/en_leak_demo.txt';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 900 });
await pg.goto(`${BASE}/demo/coach?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(6000);

const collect = () => pg.evaluate(() => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const s = t.nodeValue.trim();
    if (!s || s.length > 70 || /[\u0590-\u05FF]/.test(s) || !/[A-Za-z]{3,}/.test(s)) continue;
    const el = t.parentElement; if (!el || !el.offsetParent) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0 || el.closest('[aria-hidden="true"],input,textarea,select,code,pre')) continue;
    out.push(`${cs.textTransform === 'uppercase' ? 'UP ' : '   '}<${el.tagName.toLowerCase()}> ${s}`);
  }
  for (const e of document.querySelectorAll('[title],[placeholder],[aria-label]')) {
    if (!e.offsetParent) continue;
    for (const a of ['title', 'placeholder', 'aria-label']) {
      const v = (e.getAttribute(a) || '').trim();
      if (v && !/[\u0590-\u05FF]/.test(v) && /[A-Za-z]{3,}/.test(v) && v.length <= 90) out.push(`   @${a}: ${v}`);
    }
  }
  return out;
});
const expand = () => pg.evaluate(() => { let n = 0; for (const e of [...document.querySelectorAll('[aria-expanded="false"]')].filter((x) => x.offsetParent && !x.closest('nav,header')).slice(0, 30)) { e.click(); n++; } return n; });
const navLabels = () => pg.evaluate(() => [...document.querySelectorAll('nav button, header button')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim()).filter(Boolean));
const clickNav = (label) => pg.evaluate((l) => { const el = [...document.querySelectorAll('nav button, header button')].find((e) => (e.innerText || '').trim() === l && e.offsetParent); if (el) { el.click(); return true; } return false; }, label);
const menuItems = () => pg.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button, .nav-dropdown button')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim()).filter(Boolean));
const clickMenu = (label) => pg.evaluate((l) => { const el = [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button, .nav-dropdown button')].find((e) => (e.innerText || '').trim() === l && e.offsetParent); if (el) el.click(); }, label);

const seen = new Set(); const report = [];
const record = async (name) => {
  await wait(2000); const opened = await expand(); await wait(900);
  const fresh = (await collect()).filter((x) => !seen.has(x) && seen.add(x));
  report.push(`\n### ${name} (expanded ${opened}, new ${fresh.length})`, ...fresh);
};
const tops = await navLabels();
for (const t of tops) {
  if (/^EN$|^עב$|יציאה|Sign/.test(t)) continue;
  await clickNav(t); await wait(700);
  const items = await menuItems();
  if (!items.length) {
    await record(t);
    // in-page sub-tabs (e.g. ATHLETES: list / programs / exercises): a short button strip near the top
    const subs = await pg.evaluate(() => {
      const strips = [...document.querySelectorAll('main div, div')].filter((d) => { const bs = [...d.children].filter((c) => c.tagName === 'BUTTON' && c.offsetParent); const r = d.getBoundingClientRect(); return bs.length >= 2 && bs.length === d.children.length && r.top > 40 && r.top < 260 && bs.every((x) => (x.innerText || '').trim().split(/\s+/).length <= 3 && !/\d/.test(x.innerText || '')); });
      return strips.length ? [...strips[0].children].map((c) => (c.innerText || '').trim()) : [];
    });
    for (const sb of subs.slice(1)) {
      await pg.evaluate((l) => { const el = [...document.querySelectorAll('button')].find((e) => e.offsetParent && (e.innerText || '').trim() === l); if (el) el.click(); }, sb);
      await record(`${t} → ${sb}`);
    }
    continue;
  }
  await pg.keyboard.press('Escape');
  for (const it of items) { await clickNav(t); await wait(600); await clickMenu(it); await record(`${t} → ${it}`); }
}
fs.writeFileSync(OUT, report.join('\n'));
console.log('tops', tops.length, 'unique', seen.size);
await pg.close(); b.disconnect();
