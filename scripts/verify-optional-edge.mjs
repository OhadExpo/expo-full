// AN OPTIONAL LINE IS NEVER AT THE EDGE OF A CARD'S TEXT.
//
// Ohad, 27.9 (his words): "if sometimes it doesn't appear (like some players
// have no injuries and no injury line) the sometimes transparent line is never
// at a edge of a text box". A list of cards where SOME items carry an extra
// line (an injury, a note, a last lift) must place that line in the MIDDLE of
// the item's text: when it is absent, the space it leaves (or the shift it
// causes) must not show up as a gap above the first line or below the last
// one. That was the 27.9 BHBC phone card fix - "injury in the middle, last lift
// on the bottom line" - and this gate keeps it true everywhere.
//
// WHAT IS A LIST: >= 3 visible siblings sharing a class token (e.g.
// .bhbc-load-row, roster cards, medical rows, history rows, dashboard cards),
// or - for class-less React output - sharing tag + inline style once colours
// are stripped (tr/li are grouped by tag). Items 12..600px tall only.
// Each list is ALSO judged column by column: the same child / grandchild of
// every item (e.g. `.bhbc-load-row > :nth-child(2)`, the phone card's text
// stack) is a list of its own, because the text box is often one column of the
// row and another column's text would otherwise mask a moved line.
//
// LINES: every visible text node's Range rects inside the item, merged into
// horizontal BANDS (rects that overlap vertically by more than half the
// smaller one are one line - so a two-column card row is one line).
//
// THE RULE: the item(s) with the most lines are the TEMPLATE. An item with
// fewer lines is judged against the template(s):
//   top     its first line must START within 2px of where the template's
//           first line starts, measured from the item's top.
//   bottom  its last line must END within 2px of where the template's last
//           line ends, measured from the item's top - OR, if the item is
//           simply shorter because the line collapsed, the space under its
//           last line must match the template's within 2px (no gap was left
//           behind at the edge, the card just closed up).
//   STRICT=1 drops that "closed up" allowance and applies the literal
//   relative-to-top rule to the bottom as well.
// An item passes if it matches ANY template (templates may differ by wrap).
// An item is only judged against a template whose line heights contain its
// own as a subsequence - i.e. it plausibly LACKS a line of that template
// rather than being a different kind of card that shares a class.
//
//   node scripts/verify-optional-edge.mjs                 (local preview :5199)
//   STRICT=1 WIDTHS=390 ONLY=bhbc node scripts/verify-optional-edge.mjs
//   BASE=https://expo-app.co.il node scripts/verify-optional-edge.mjs
import { runSweep } from './lib/gate-sweep.mjs';

const TOL = Number(process.env.TOL || 2);
const STRICT = process.env.STRICT === '1';

function measureLists(args) {
  const { TOL, STRICT } = args;
  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const styleKey = (el) => (el.getAttribute('style') || '').split(';').map((d) => d.trim()).filter((d) => d && !/^(color|background|background-color|border-color|border-[a-z]+-color|opacity|box-shadow|outline|outline-color|cursor|transition)\s*:/i.test(d)).sort().join(';');
  // Visible text lines of an item, as bands relative to the item's top.
  const bands = (item) => {
    const top = item.getBoundingClientRect().top;
    const rects = [];
    const tw = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const pe = n.parentElement;
      if (!pe || !shown(pe)) continue;
      const pcs = getComputedStyle(pe);
      if (pcs.opacity === '0' || /rgba\(\d+,\s*\d+,\s*\d+,\s*0\)|transparent/.test(pcs.color)) continue;   // a transparent line is not ink
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) rects.push({ t: r.top - top, b: r.bottom - top });
    }
    rects.sort((a, c) => a.t - c.t);
    const out = [];
    for (const r of rects) {
      const last = out[out.length - 1];
      if (last) {
        const ov = Math.min(last.b, r.b) - Math.max(last.t, r.t);
        if (ov > Math.min(last.b - last.t, r.b - r.t) / 2) { last.t = Math.min(last.t, r.t); last.b = Math.max(last.b, r.b); continue; }
      }
      out.push({ ...r });
    }
    return out;
  };
  const desc = (el) => el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => '.' + c).join('');
  const snippet = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32);

  // Groups of like siblings.
  const groups = [];
  const seenSets = new Set();
  const ids = new Map();
  const pid = (el) => { if (!ids.has(el)) ids.set(el, ids.size); return ids.get(el); };
  // The same set of members reached two ways (two class tokens, a row and its
  // only child): judge once.
  const addGroup = (gdesc, items) => {
    const key = items.map(pid).join(',');
    if (seenSets.has(key)) return;
    seenSets.add(key);
    groups.push({ gdesc, items: items.slice(0, 200) });
  };
  for (const parent of document.querySelectorAll('body, body *')) {
    if (parent.children.length < 3 || parent.closest('svg')) continue;
    const buckets = new Map();
    for (const ch of parent.children) {
      const tag = ch.tagName.toLowerCase();
      if (/^(script|style|svg|br|hr|option|template)$/.test(tag)) continue;
      const keys = [];
      for (const c of ch.classList) keys.push('c:' + c);
      if (!ch.classList.length) {
        const sk = styleKey(ch);
        if (sk || /^(tr|li)$/.test(tag)) keys.push('s:' + tag + '|' + sk);
      }
      for (const k of keys) { if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(ch); }
    }
    for (const [k, members] of buckets) {
      const items = members.filter((m) => { if (!shown(m)) return false; const h = m.getBoundingClientRect().height; return h >= 12 && h <= 600; });
      if (items.length < 3) continue;
      const gdesc = k.startsWith('c:') ? `${parent.tagName.toLowerCase()} > .${k.slice(2)}` : `${parent.tagName.toLowerCase()} > ${k.slice(2).split('|')[0]}[style]`;
      addGroup(gdesc, items);
      // THE TEXT BOX IS OFTEN A COLUMN OF THE ROW, NOT THE ROW. On the BHBC
      // phone card the name / position / injury / last-lift stack is the row's
      // SECOND child, and the MED button label in the next column sits on the
      // same bottom line - measured over the whole row it would hide a moved
      // line. So the same child (and grandchild) of every item is judged as a
      // list of its own: `.bhbc-load-row > :nth-child(2)`.
      const paths = new Set();
      for (const it of items) for (let i = 0; i < Math.min(it.children.length, 12); i++) {
        paths.add(String(i));
        const c = it.children[i];
        for (let j = 0; j < Math.min(c.children.length, 12); j++) paths.add(i + '.' + j);
      }
      for (const path of paths) {
        const idx = path.split('.').map(Number);
        const sub = items.map((it) => idx.reduce((el, i) => (el && el.children[i]) || null, it)).filter((el) => el && shown(el));
        if (sub.length < 3) continue;
        addGroup(`${gdesc} > ${idx.map((i) => `:nth-child(${i + 1})`).join(' > ')}`, sub);
      }
    }
  }

  let measured = 0;
  const fails = [];
  for (const g of groups) {
    const data = g.items.map((it) => {
      const r = it.getBoundingClientRect();
      const bs = bands(it);
      return { it, h: r.height, bs };
    }).filter((d) => d.bs.length);
    if (data.length < 3) continue;
    measured += data.length;
    const max = Math.max(...data.map((d) => d.bs.length));
    const templates = data.filter((d) => d.bs.length === max);
    if (templates.length === data.length) continue;
    const gdesc = g.gdesc;
    const groupFails = [];
    for (const d of data) {
      if (d.bs.length === max) continue;
      const first = d.bs[0], last = d.bs[d.bs.length - 1];
      let best = null;
      // Only a template this item could be MISSING lines from: its line heights
      // (font sizes, in effect) must be a subsequence of the template's. Two
      // cards that merely share a class but hold different things are not a
      // missing-line case and are not judged.
      const hs = d.bs.map((x) => x.b - x.t);
      const fits = (t) => { let j = 0; for (const x of t.bs) { if (j < hs.length && Math.abs((x.b - x.t) - hs[j]) <= 1.5) j++; } return j === hs.length; };
      for (const t of templates) {
        if (!fits(t)) continue;
        const tf = t.bs[0], tl = t.bs[t.bs.length - 1];
        const dTop = first.t - tf.t;
        const dBot = last.b - tl.b;
        const insetItem = d.h - last.b, insetT = t.h - tl.b;
        const topOk = Math.abs(dTop) <= TOL;
        const botOk = Math.abs(dBot) <= TOL || (!STRICT && Math.abs(insetItem - insetT) <= TOL);
        const score = (topOk ? 0 : Math.abs(dTop)) + (botOk ? 0 : Math.abs(dBot));
        if (!best || score < best.score) best = { score, topOk, botOk, dTop, dBot, insetItem, insetT, t };
        if (topOk && botOk) break;
      }
      if (!best) continue;   // not comparable to any template
      if (best.topOk && best.botOk) continue;
      const where = [];
      if (!best.topOk) where.push(`first line starts ${Math.abs(best.dTop).toFixed(1)}px ${best.dTop > 0 ? 'LOWER' : 'HIGHER'} than the template's (a gap at the TOP edge)`);
      if (!best.botOk) where.push(`last line ends ${Math.abs(best.dBot).toFixed(1)}px ${best.dBot < 0 ? 'HIGHER' : 'LOWER'} than the template's; space under it ${best.insetItem.toFixed(1)}px vs ${best.insetT.toFixed(1)}px (a gap at the BOTTOM edge)`);
      groupFails.push({ item: snippet(d.it), lines: d.bs.length, max, where: where.join('; '), tmpl: snippet(best.t.it), idx: g.items.indexOf(d.it) });
    }
    if (!groupFails.length) continue;
    for (const f of groupFails.slice(0, 5)) {
      fails.push({ what: `OPTIONAL LINE AT AN EDGE  ${gdesc}  item #${f.idx + 1} "${f.item}"`, detail: `${f.lines} of ${f.max} lines: ${f.where}. Template: "${f.tmpl}"${groupFails.length > 5 ? ` (+${groupFails.length - 5} more items in this list)` : ''}` });
    }
  }
  return { measured, groups: groups.length, fails };
}

await runSweep({
  name: 'OPTIONAL-EDGE',
  async measure(pg) {
    const res = await pg.evaluate(measureLists, { TOL, STRICT });
    return { elements: res.measured, failures: res.fails };
  },
});
