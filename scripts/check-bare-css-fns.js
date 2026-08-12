#!/usr/bin/env node
// Build guard: scans src/ for bare CSS-function calls in JS context
// (rgba/rgb/hsl/hsla/var) — i.e. calls NOT inside quoted strings or
// backtick template literals. Exits 1 if any found.
//
// Why: the CSS-vars refactor introduced a class of bugs where strings
// like \`${C.ac}HEX\` got rewritten to bare rgba(...) JS expressions,
// which the JS engine treats as undefined function calls. Result was
// a black-screen ReferenceError on render. This guard runs in CI so
// we catch any reintroduction before deploy.
//
// Usage:  node scripts/check-bare-css-fns.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');

// CSS function names that a bug-rewrite could leave bare in JS context.
// rgba/rgb are the historical ones from the bug; hsl/hsla added defensively.
// `var()` is excluded because it's a frequent legitimate intermediate value
// in computed-style code (e.g. getPropertyValue('--c-ac')).
const FN_RE = /\b(rgba|rgb|hsla|hsl)\(\s*\d/g;

/**
 * Walk a JS/JSX source string. For each match of FN_RE, decide if it's
 * inside a string/template-literal-text or in JS context. JS-context
 * matches are bugs.
 */
function findBareCalls(src, content) {
  const errors = [];
  let sq = false, dq = false;
  let bqDepth = 0, teDepth = 0;
  let line = 1, col = 0;
  let i = 0;
  const n = content.length;

  while (i < n) {
    const ch = content[i];
    const prev = i > 0 ? content[i - 1] : '';
    if (ch === '\n') { line++; col = 0; }
    else col++;

    // Inside template-literal text mode (backtick > template-expr depth)
    const inText = bqDepth > teDepth;
    if (inText) {
      if (prev !== '\\' && ch === '$' && content[i + 1] === '{') {
        teDepth++; i += 2; col++; continue;
      }
      if (prev !== '\\' && ch === '`') { bqDepth--; i++; continue; }
      i++; continue;
    }

    // JS or template-expr context. Track strings.
    if (prev !== '\\') {
      if (!dq && ch === "'") {
        // A contraction/possessive apostrophe in JSX TEXT (word'word — "it's",
        // "don't", "athlete's") is not a JS string delimiter. Toggling `sq` on
        // it desyncs the whole scan so every later quoted rgba('...') string is
        // mis-flagged as a bare call. A real JS single-quote opener/closer is
        // never sandwiched between two letters (it sits after `:( ,=[|&` etc.
        // and before string content, or after `)'"` and before `,;)` etc.).
        const next = i + 1 < n ? content[i + 1] : '';
        const inWordApostrophe = /[A-Za-z]/.test(prev) && /[A-Za-z]/.test(next);
        if (!inWordApostrophe) sq = !sq;
        i++; continue;
      }
      if (!sq && ch === '"') { dq = !dq; i++; continue; }
      if (!sq && !dq && ch === '`') { bqDepth++; i++; continue; }
    }
    if (sq || dq) { i++; continue; }

    // Track template-expr close
    if (ch === '}' && teDepth > 0) { teDepth--; i++; continue; }

    // Skip JS comments
    if (ch === '/' && content[i + 1] === '/') {
      while (i < n && content[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && content[i + 1] === '*') {
      const end = content.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }

    // We're in JS context — check for bare CSS function call here.
    FN_RE.lastIndex = i;
    const m = FN_RE.exec(content);
    if (m && m.index === i) {
      // Confirm it's a genuine BARE expression, not a false positive. The state
      // machine above can desync on apostrophes/quotes inside JSX text and then
      // misread a quoted rgba('...') as JS context. A real bare call (the bug:
      // a template got rewritten to a bare `rgba(...)`) always sits in JS
      // expression position — the nearest non-space char before it is an
      // introducer (`: , = ( [ ? | &` …). It is NEVER a quote (inside a string),
      // a word char (part of an identifier like `myrgba`), or `.`. Suppressing
      // on those can only drop false positives, never a real bare call.
      let j = m.index - 1;
      while (j >= 0 && (content[j] === ' ' || content[j] === '\t')) j--;
      const near = j >= 0 ? content[j] : '';
      const insideStringOrWord = near === "'" || near === '"' || near === '`' || /[A-Za-z0-9_$.]/.test(near);
      if (!insideStringOrWord) {
        // Compute line for the match position
        let l = 1, c = 0;
        for (let k = 0; k < m.index; k++) {
          if (content[k] === '\n') { l++; c = 0; } else c++;
        }
        errors.push({ src, line: l, col: c, snippet: content.slice(m.index, Math.min(m.index + 60, n)) });
      }
      i = m.index + m[0].length;
      continue;
    }

    i++;
  }
  return errors;
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.isFile() && /\.(jsx?|tsx?)$/.test(ent.name)) files.push(p);
  }
  return files;
}

// Exported so the detection logic can be unit-tested directly (see
// scripts/verify-check-bare-css-fns.mjs) without this CLI scanning src/.
export { findBareCalls };

function main() {
  const files = walk(SRC);
  const allErrors = [];
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const rel = path.relative(path.join(__dirname, '..'), f);
    for (const e of findBareCalls(rel, content)) allErrors.push(e);
  }

  if (allErrors.length === 0) {
    console.log(`✓ check-bare-css-fns: scanned ${files.length} files, no bare CSS-function calls in JS context`);
    process.exit(0);
  }

  console.error(`✗ check-bare-css-fns: found ${allErrors.length} bare CSS-function calls (would crash with ReferenceError on render):\n`);
  for (const e of allErrors) {
    console.error(`  ${e.src}:${e.line}:${e.col}  ${e.snippet.split('\n')[0]}`);
  }
  console.error('\nQuote them as strings (e.g., `borderColor: \'rgba(...)\'`) or move them inside a backtick template literal.');
  process.exit(1);
}

// Run the scan only when invoked directly (node scripts/check-bare-css-fns.js),
// not when imported by the unit test.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
