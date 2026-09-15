// Physical → logical styles across the marketing site, so the Hebrew (RTL)
// layout is the exact mirror of the English one instead of "mostly".
//
// Sibling of ../../scripts/codemod-logical-css.mjs (the coach app). The site
// styles almost everything inline (style={{ }}) plus a few <style>{`...`}</style>
// template literals per view, so this handles both shapes:
//
//   inline:  marginLeft → marginInlineStart, marginRight → marginInlineEnd,
//            paddingLeft/Right → paddingInlineStart/End,
//            borderLeft* / borderRight* → borderInlineStart* / borderInlineEnd*,
//            textAlign 'left'/'right' → 'start'/'end'
//   css:     margin-left → margin-inline-start, padding-right → padding-inline-end,
//            border-left(-width|-color|-style) → border-inline-start(...),
//            text-align: left|right → start|end
//
// Deliberately NOT touched:
//   - left: / right: (absolute positioning) — never rewritten, in either shape.
//   - a style object that also sets direction: 'ltr' (or an element with
//     dir="ltr") — those are LTR by design (the phone mockup, numeric stats).
//   - a CSS rule whose selector is direction-specific ([dir="rtl"], :dir(rtl),
//     html[dir=...]) or whose body sets direction: — an override stays physical.
//
//   node scripts/codemod-logical-css.mjs --dry   (counts per file, no writes)
//   node scripts/codemod-logical-css.mjs         (rewrite in place)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY = process.argv.includes('--dry');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

// ---- inline (camelCase) rules -------------------------------------------
const INLINE = [
  [/\bmarginLeft\b/g, 'marginInlineStart'],
  [/\bmarginRight\b/g, 'marginInlineEnd'],
  [/\bpaddingLeft\b/g, 'paddingInlineStart'],
  [/\bpaddingRight\b/g, 'paddingInlineEnd'],
  [/\bborderLeft(?=[A-Z]|\b)/g, 'borderInlineStart'],
  [/\bborderRight(?=[A-Z]|\b)/g, 'borderInlineEnd'],
  [/\btextAlign:\s*'left'/g, "textAlign: 'start'"],
  [/\btextAlign:\s*"left"/g, 'textAlign: "start"'],
  [/\btextAlign:\s*'right'/g, "textAlign: 'end'"],
  [/\btextAlign:\s*"right"/g, 'textAlign: "end"'],
];
const LTR_OBJ = /\bdirection:\s*['"]ltr['"]/;
const LTR_ATTR = /\bdir=["']ltr["']/;

// ---- CSS (kebab) rules, for <style>{`...`}</style> blocks and .css files --
const CSS = [
  [/\bmargin-left(?=\s*:)/g, 'margin-inline-start'],
  [/\bmargin-right(?=\s*:)/g, 'margin-inline-end'],
  [/\bpadding-left(?=\s*:)/g, 'padding-inline-start'],
  [/\bpadding-right(?=\s*:)/g, 'padding-inline-end'],
  [/\bborder-left(?=(-width|-color|-style)?\s*:)/g, 'border-inline-start'],
  [/\bborder-right(?=(-width|-color|-style)?\s*:)/g, 'border-inline-end'],
  [/\btext-align\s*:\s*left\b/g, 'text-align: start'],
  [/\btext-align\s*:\s*right\b/g, 'text-align: end'],
];
const DIR_SELECTOR = /\[dir\s*=|:dir\(/;
const DIR_DECL = /\bdirection\s*:/;

// Is the match at `idx` inside a style object / element that is LTR by design?
// Walk back to the nearest `{{` (the style prop) and forward to its `}}`; if
// that object sets direction:'ltr', or the opening tag carries dir="ltr", skip.
function inLtrBlock(src, idx) {
  const open = src.lastIndexOf('{{', idx);
  if (open < 0) return false;
  const close = src.indexOf('}}', idx);
  if (close < 0) return false;
  const obj = src.slice(open, close + 2);
  if (LTR_OBJ.test(obj)) return true;
  const tagStart = src.lastIndexOf('<', open);
  if (tagStart >= 0 && LTR_ATTR.test(src.slice(tagStart, open))) return true;
  return false;
}

// A match that sits in a // comment (e.g. "logical (was marginRight)") is prose.
function inLineComment(src, idx) {
  const lineStart = src.lastIndexOf('\n', idx) + 1;
  return src.slice(lineStart, idx).includes('//');
}

function rewriteInline(src) {
  let n = 0;
  let out = src;
  for (const [re, to] of INLINE) {
    out = out.replace(re, (m, offset, whole) => {
      if (inLineComment(whole, offset) || inLtrBlock(whole, offset)) return m;
      n++;
      return to;
    });
  }
  return [out, n];
}

// Rewrite one CSS text. Rules are split on `}`; a rule whose selector is
// direction-specific or whose body sets direction: is left as-is. Nested
// @media blocks are handled by treating `{` inside a selector as the start of
// the inner rule (the @media line itself has no declarations to rewrite).
function rewriteCss(css) {
  let n = 0;
  const out = css.replace(/([^{}]*)\{([^{}]*)\}/g, (whole, selector, body) => {
    if (DIR_SELECTOR.test(selector) || DIR_DECL.test(body)) return whole;
    let b = body;
    for (const [re, to] of CSS) b = b.replace(re, () => { n++; return to; });
    return `${selector}{${b}}`;
  });
  return [out, n];
}

// <style>{`...`}</style> blocks inside JSX.
function rewriteStyleLiterals(src) {
  let n = 0;
  const out = src.replace(/(<style[^>]*>\s*\{`)([\s\S]*?)(`\}\s*<\/style>)/g, (m, a, css, z) => {
    const [c, k] = rewriteCss(css);
    n += k;
    return a + c + z;
  });
  return [out, n];
}

function looksLikeJsx(text) {
  return /<[A-Z][\w.]*[\s/>]|<\/?[a-z][\w-]*[\s>]/.test(text);
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(jsx|js|css)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

let total = 0;
const perFile = [];
for (const p of walk(SRC)) {
  const before = fs.readFileSync(p, 'utf8');
  let after = before;
  let inline = 0, css = 0;
  if (p.endsWith('.css')) {
    [after, css] = rewriteCss(after);
  } else {
    if (p.endsWith('.js') && !looksLikeJsx(before)) continue;
    [after, inline] = rewriteInline(after);
    [after, css] = rewriteStyleLiterals(after);
  }
  const n = inline + css;
  if (n) {
    perFile.push([path.relative(ROOT, p), inline, css]);
    total += n;
    if (!DRY) fs.writeFileSync(p, after);
  }
}
perFile.sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
for (const [f, i, c] of perFile) console.log(String(i + c).padStart(4), f, `(inline ${i}, css ${c})`);
console.log(`${total} replacements in ${perFile.length} files${DRY ? ' (dry)' : ''}`);
