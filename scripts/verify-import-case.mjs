// Windows is case-insensitive; Vercel's Linux builders are not. An import whose
// case does not match the file on disk builds fine here and fails there — which
// looks exactly like a deploy that never lands.
import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'expo-il/src'];
const files = [];
function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|dist|\.git/.test(e.name)) walk(f); }
    else if (/\.(js|jsx|ts|tsx|css)$/.test(e.name)) files.push(f);
  }
}
roots.forEach(walk);

// Real on-disk names per directory, so we can compare case exactly.
const listing = new Map();
const realNames = (dir) => {
  if (!listing.has(dir)) {
    try { listing.set(dir, fs.readdirSync(dir)); } catch { listing.set(dir, []); }
  }
  return listing.get(dir);
};

const bad = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const dir = path.dirname(f);
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
    const spec = m[1];
    const base = path.resolve(dir, spec);
    // Try the extensions Vite resolves.
    const cands = ['', '.js', '.jsx', '.ts', '.tsx', '.css', '/index.js', '/index.jsx'];
    let resolved = null;
    for (const ext of cands) {
      const p = base + ext;
      if (fs.existsSync(p) && fs.statSync(p).isFile()) { resolved = p; break; }
    }
    if (!resolved) { bad.push({ f, spec, why: 'does not resolve at all' }); continue; }
    const d = path.dirname(resolved);
    const want = path.basename(resolved);
    if (!realNames(d).includes(want)) {
      const actual = realNames(d).find((n) => n.toLowerCase() === want.toLowerCase());
      bad.push({ f, spec, why: `case mismatch — disk has "${actual}", import wants "${want}"` });
    }
  }
}

console.log(`IMPORT CASE — ${files.length} files scanned`);
for (const b of bad) console.log(`  ✗ ${b.f}: '${b.spec}' — ${b.why}`);
console.log(bad.length ? `\n${bad.length} import(s) that build on Windows and fail on Linux.` : '\n✓ every relative import matches the on-disk case.');
process.exit(bad.length ? 1 : 0);
