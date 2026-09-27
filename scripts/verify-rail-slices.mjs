// NO MENU ITEM IS EVER SLICED BY A RAIL'S EDGE.
//
// Ohad, 27.9, about the top menus: a word cut in half at the edge of a
// horizontally scrolling rail, or half-hidden behind the logo/crest that sits
// beside it, reads as broken - and the ACTIVE item must always be whole. The
// app already scrolls the active tab into view (App.jsx coachNavRef effect,
// BhbcView navRef effect, `scroll-padding-inline` on .hdr-rail); this gate
// proves the result instead of trusting the intent.
//
// WHAT IS A RAIL
//   - the named ones: EXPO coach top rail (.hdr-rail / nav.hdr-scroll), BHBC
//     `.bhbc-hdr-tabs`, the /demo coach rail ([role=tablist]), the athlete
//     portal nav (.pv-scroll), and
//   - ANY element with overflow-x auto/scroll whose items (button, a[href],
//     [role=tab|menuitem|link]) sit at most 3 levels below it and mostly on one
//     row. Nested rails that hold the same items are judged once (innermost).
//
// WHAT IT CHECKS, per item, against the rail's VISIBLE box (the intersection of
// every clipping ancestor - overflow != visible - and the viewport's width):
//   SLICED    the item is neither fully inside nor fully outside (1px
//             tolerance). The item is measured by what it PAINTS: its text
//             glyphs (Range rects) + icons, plus its border box only when it
//             draws a border or a background - so transparent padding cut at an
//             edge is not a slice, a cut word or a cut active outline is.
//   COVERED   the item is inside but elementFromPoint at the text's centre, or
//             2px in from either end of its text, lands on something that is
//             not the item, its descendant or its ancestor (a crest or logo
//             pinned over the rail, a sibling overlapping it).
//   ACTIVE    the active item (aria-current, aria-selected="true", or a class
//             token ending in active/selected/current) is not fully visible.
//
// WHEN: AT REST - after load and after scroll positions stop moving (the app's
// smooth scrollIntoView has finished) - and again after each role="tab" item
// in a rail is clicked (once per rail per language x width), which is the app
// scrolling a NEW active item into view.
//
//   node scripts/verify-rail-slices.mjs                   (local preview :5199)
//   WIDTHS=390 LANGS=he ONLY=bhbc node scripts/verify-rail-slices.mjs
//   BASE=https://expo-app.co.il node scripts/verify-rail-slices.mjs
import { runSweep, waitScrollIdle, wait } from './lib/gate-sweep.mjs';

const TOL = Number(process.env.TOL || 1);
const MAX_TAB_CLICKS = Number(process.env.MAX_TAB_CLICKS || 8);
const walked = new Set();   // `${lang}@${width}|${railKey}` - walk each rail's tabs once per seat

// Installed into the page; self-contained (serialised by puppeteer).
function installProbe(TOL) {
  const ITEM_SEL = 'button, a[href], [role="tab"], [role="menuitem"], [role="link"]';
  const NAMED = ['.hdr-rail', 'nav.hdr-scroll', '.bhbc-hdr-tabs', '.pv-scroll', '[role="tablist"]'];
  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const transparent = (c) => !c || c === 'transparent' || /rgba\(\d+,\s*\d+,\s*\d+,\s*0\)/.test(c);
  const paints = (el) => {
    const cs = getComputedStyle(el);
    if (!transparent(cs.backgroundColor) || cs.backgroundImage !== 'none') return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none' && !transparent(cs['border' + s + 'Color']));
  };
  const desc = (el) => {
    if (!el) return '?';
    const cls = [...(el.classList || [])].slice(0, 2).map((c) => '.' + c).join('');
    const role = el.getAttribute && el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '';
    const t = ((el.textContent || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ')).slice(0, 24);
    return el.tagName.toLowerCase() + cls + role + (t ? ` "${t}"` : '');
  };
  const isActive = (el) => {
    const ac = el.getAttribute('aria-current');
    if (ac && ac !== 'false') return true;
    if (el.getAttribute('aria-selected') === 'true') return true;
    return [...el.classList].some((c) => /^(active|selected|current)$/i.test(c.split(/[-_]/).pop()) && !/^in/i.test(c.split(/[-_]/).pop()));
  };
  const union = (rects) => {
    const rs = rects.filter((r) => r.width > 0 && r.height > 0);
    if (!rs.length) return null;
    return { left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)), top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)) };
  };
  const textRects = (el) => {
    const out = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      if (!n.nodeValue.trim() || !n.parentElement || !shown(n.parentElement)) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0 && r.height > 0) out.push(r);
    }
    return out;
  };
  // What the eye sees of an item: glyphs + icons, + the box if it paints one.
  const extent = (el) => {
    const tr = textRects(el);
    const icons = [...el.querySelectorAll('svg, img, canvas')].filter(shown).map((x) => x.getBoundingClientRect());
    const parts = tr.concat(icons);
    if (paints(el)) parts.push(el.getBoundingClientRect());
    for (const d of el.querySelectorAll('*')) if (shown(d) && paints(d)) parts.push(d.getBoundingClientRect());
    return { ext: union(parts) || el.getBoundingClientRect(), text: union(tr) };
  };
  const clipBox = (el) => {
    let L = 0, R = innerWidth, T = -1e9, B = 1e9;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if (cs.overflowX !== 'visible') { const l = r.left + n.clientLeft; L = Math.max(L, l); R = Math.min(R, l + n.clientWidth); }
      // a clip-path inset() hides its edges as surely as an overflow box
      const cp = /^inset\(([^)]*)\)/.exec(cs.clipPath || '');
      if (cp) {
        const v = cp[1].split(/\s+/).map((x) => parseFloat(x) || 0);
        const [top, right = top, bottom = top, left = right] = v;
        L = Math.max(L, r.left + left); R = Math.min(R, r.right - right);
        T = Math.max(T, r.top + top); B = Math.min(B, r.bottom - bottom);
      }
      if (cs.overflowY !== 'visible') { const t = r.top + n.clientTop; T = Math.max(T, t); B = Math.min(B, t + n.clientHeight); }
      if (cs.position === 'fixed') break;   // nothing above a fixed box clips it
    }
    // OPAQUE PLATES ARE EDGES TOO. A pinned crest plate or an end plate that the
    // page marks [data-rail-occluder] paints over the rail's end: what you SEE
    // stops at the plate, so the visible box stops there. A tab entirely
    // behind the plate is "outside" (hidden whole - fine); a tab half behind
    // it is SLICED (the plate itself is measured, not trusted).
    const rr = el.getBoundingClientRect();
    // plates can sit side by side (the crest, then a plate covering a tab's
    // overlap next to it): repeat until the edges stop moving, so DOM order
    // does not decide which plates count
    const occ = [...document.querySelectorAll('[data-rail-occluder]')].map((o) => o.getBoundingClientRect())
      .filter((b) => b.width >= 1 && b.bottom > rr.top && b.top < rr.bottom);
    for (let moved = true, guard = 0; moved && guard < 10; guard++) {
      moved = false;
      for (const b of occ) {
        if (b.left <= L + 1 && b.right > L + 0.5) { L = b.right; moved = true; }
        if (b.right >= R - 1 && b.left < R - 0.5) { R = b.left; moved = true; }
      }
    }
    return { L, R, T, B };
  };
  const findRails = () => {
    const cand = new Map();   // el -> named?
    for (const s of NAMED) for (const e of document.querySelectorAll(s)) cand.set(e, true);
    for (const e of document.querySelectorAll('body *')) {
      if (cand.has(e)) continue;
      const ox = getComputedStyle(e).overflowX;
      if (ox === 'auto' || ox === 'scroll') cand.set(e, false);
    }
    const rails = [];
    for (const [el, named] of cand) {
      if (!shown(el)) continue;
      if (el.querySelector('table, tr, [role=row]')) continue;
      const items = [...el.querySelectorAll(ITEM_SEL)].filter((i) => {
        if (!shown(i)) return false;
        const outer = i.parentElement && i.parentElement.closest(ITEM_SEL);
        if (outer && el.contains(outer)) return false;   // an item inside an item is part of it
        if (!named) { let d = 0; for (let p = i.parentElement; p && p !== el; p = p.parentElement) d++; if (d > 2) return false; }
        return i.getBoundingClientRect().height <= 80;
      });
      if (items.length < 2 || items.length > 60) continue;
      // One row: most items share a vertical centre.
      const mids = items.map((i) => { const r = i.getBoundingClientRect(); return r.top + r.height / 2; });
      const best = Math.max(...mids.map((m) => mids.filter((x) => Math.abs(x - m) <= 6).length));
      if (best < Math.max(2, Math.ceil(items.length * 0.6))) continue;
      rails.push({ el, named, items });
    }
    // The same items reached through a wrapper and its scroller: judge once, innermost.
    const bySig = new Map();
    for (const r of rails) {
      const sig = r.items.length + ':' + r.items.map((i) => (i.textContent || '').trim()).join('|');
      const prev = bySig.get(sig);
      if (!prev || prev.el.contains(r.el)) bySig.set(sig, r);
    }
    const out = [...bySig.values()];
    const seen = {};
    for (const r of out) { const d = desc(r.el).replace(/ ".*$/, ''); seen[d] = (seen[d] || 0) + 1; r.key = d + '#' + seen[d]; }
    return out;
  };

  window.__railProbe = {
    measure(phase) {
      const failures = [];
      let items = 0;
      const rails = findRails();
      for (const rail of rails) {
        const box = clipBox(rail.el);
        const rd = rail.key + ` [${rail.items.length} items]`;
        for (const it of rail.items) {
          items++;
          const { ext, text } = extent(it);
          const active = isActive(it);
          const inside = ext.left >= box.L - TOL && ext.right <= box.R + TOL && ext.top >= box.T - TOL && ext.bottom <= box.B + TOL;
          const outside = ext.right <= box.L + TOL || ext.left >= box.R - TOL || ext.bottom <= box.T + TOL || ext.top >= box.B - TOL;
          const name = (it.textContent || it.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28);
          if (!inside && !outside) {
            const cut = [];
            if (ext.left < box.L - TOL) cut.push(`${(box.L - ext.left).toFixed(1)}px hidden past the left edge`);
            if (ext.right > box.R + TOL) cut.push(`${(ext.right - box.R).toFixed(1)}px hidden past the right edge`);
            if (ext.top < box.T - TOL) cut.push(`${(box.T - ext.top).toFixed(1)}px hidden above`);
            if (ext.bottom > box.B + TOL) cut.push(`${(ext.bottom - box.B).toFixed(1)}px hidden below`);
            failures.push({ key: `${rail.key}|${name}|SLICED`, what: `${active ? 'ACTIVE ' : ''}SLICED  ${rd}  "${name}"`, detail: `${cut.join(', ')} (rail visible ${box.L.toFixed(1)}..${box.R.toFixed(1)}, item ${ext.left.toFixed(1)}..${ext.right.toFixed(1)}) [${phase}]` });
            continue;
          }
          if (outside) {
            if (active) failures.push({ key: `${rail.key}|${name}|ACTIVE-OFF`, what: `ACTIVE OFF-SCREEN  ${rd}  "${name}"`, detail: `the active item is entirely outside the rail (visible ${box.L.toFixed(1)}..${box.R.toFixed(1)}, item ${ext.left.toFixed(1)}..${ext.right.toFixed(1)}) [${phase}]` });
            continue;
          }
          // Inside: is the text actually what you see there?
          const t = text || ext;
          const y = (t.top + t.bottom) / 2;
          const xs = [(t.left + t.right) / 2];
          if (t.right - t.left > 6) xs.push(t.left + 2, t.right - 2);
          for (const x of xs) {
            if (y < 0 || y >= innerHeight || x < 0 || x >= innerWidth) continue;   // off the viewport vertically: cannot hit-test
            const hit = document.elementFromPoint(x, y);
            if (!hit || it === hit || it.contains(hit) || hit.contains(it)) continue;
            failures.push({ key: `${rail.key}|${name}|COVERED`, what: `${active ? 'ACTIVE ' : ''}COVERED  ${rd}  "${name}"`, detail: `at (${x.toFixed(0)},${y.toFixed(0)}) the top element is ${desc(hit)}, not the item [${phase}]` });
            break;
          }
        }
      }
      return { items, rails: rails.length, failures, tabs: rails.map((r) => ({ key: r.key, tabs: r.items.filter((i) => i.getAttribute('role') === 'tab').map((i) => (i.textContent || '').trim()).filter(Boolean) })) };
    },
    clickTab(key, text) {
      const rail = findRails().find((r) => r.key === key);
      if (!rail) return false;
      const it = rail.items.find((i) => i.getAttribute('role') === 'tab' && (i.textContent || '').trim() === text);
      if (!it) return false;
      it.click();
      return true;
    },
  };
  return true;
}

await runSweep({
  name: 'RAIL-SLICES',
  async measure(pg, meta) {
    const install = () => pg.evaluate(installProbe, TOL);
    await install();
    const rest = await pg.evaluate(() => window.__railProbe.measure('at rest'));
    let elements = rest.items;
    const all = [...rest.failures];
    // The app scrolling a NEW active item into view: click each tab of each rail.
    for (const r of rest.tabs) {
      const k = `${meta.lang}@${meta.width}|${meta.route.split('/').slice(0, 3).join('/')}|${r.key}`;
      if (!r.tabs.length || walked.has(k)) continue;
      walked.add(k);
      for (const text of r.tabs.slice(0, MAX_TAB_CLICKS)) {
        await install();
        const ok = await pg.evaluate((key, t) => window.__railProbe.clickTab(key, t), r.key, text).catch(() => false);
        if (!ok) continue;
        await wait(700);
        await waitScrollIdle(pg);
        await install();
        const m = await pg.evaluate((ph) => window.__railProbe.measure(ph), `after clicking "${text}"`);
        elements += m.items;
        all.push(...m.failures);
      }
    }
    // One finding per item per kind; the phases it was seen in go in the detail.
    const byKey = new Map();
    for (const f of all) {
      const prev = byKey.get(f.key);
      if (!prev) byKey.set(f.key, { ...f, n: 1 });
      else prev.n++;
    }
    const failures = [...byKey.values()].map((f) => ({ what: f.what, detail: f.detail + (f.n > 1 ? ` (+${f.n - 1} more state${f.n > 2 ? 's' : ''})` : '') }));
    return { elements, failures };
  },
});
