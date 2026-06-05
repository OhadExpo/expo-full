#!/usr/bin/env node
// SURFACE-COMPLETENESS GATE.
//
// Why this exists: across the 2026-06 audit marathon, "review every page"
// kept missing pages because surfaces were enumerated from memory. This gate
// makes that impossible. It parses the ACTUAL routers, derives the full set of
// user-reachable surfaces, and asserts every one is documented in
// docs/SURFACES.md. A route that exists in code but not in the manifest fails
// the build (and therefore the Vercel deploy) with the missing surface named.
//
// Rule for humans/agents: when you add/rename a route or coach tab, add the
// matching token to docs/SURFACES.md in the same commit. Do not weaken this
// gate to make a deploy pass — update the manifest.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const app = read('src/App.jsx');
const expoIl = read('expo-il/src/App.jsx');
const manifest = read('docs/SURFACES.md');

const missing = [];
const seen = new Set();
const require_ = (token, label) => {
  const key = token.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  // Match the token as a path/word in the manifest, tolerant of surrounding
  // punctuation (table cells, code spans, slashes).
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Trailing boundary allows '/' so a documented dynamic route (`/book/<slug>`)
  // satisfies the bare code token (`/book`). '/p' still can't match '/programs'
  // because the char after must be '/', a non-word char, or end — never a letter.
  const re = new RegExp(`(^|[^\\w/-])${esc}(/|[^\\w/-]|$)`, 'm');
  if (!re.test(manifest)) missing.push(`${label}: ${token}`);
};

// --- expo-app coach tabs: pull the canonical tabMap object literal ---
const tabMapMatch = app.match(/const tabMap\s*=\s*\{([^}]*)\}/);
if (!tabMapMatch) {
  console.error('check-surfaces: could not locate coach tabMap in src/App.jsx — update this script.');
  process.exit(2);
}
const tabKeys = [...tabMapMatch[1].matchAll(/([a-zA-Z'-]+)\s*:/g)]
  .map((m) => m[1].replace(/'/g, ''))
  .filter(Boolean);
for (const k of tabKeys) require_(`/coach/${k}`, 'coach tab');

// --- expo-app public/auth-edge routes: path === '/x' and path.startsWith('/x') ---
const appRoutes = new Set();
for (const m of app.matchAll(/path\s*===\s*'(\/[a-z][\w/-]*)'/g)) appRoutes.add(m[1]);
for (const m of app.matchAll(/path\.startsWith\('(\/[a-z][\w/-]*)'/g)) appRoutes.add(m[1]);
// Normalise dynamic prefixes to their documented root (e.g. /book/ -> /book).
const norm = (r) => r.replace(/\/$/, '');
for (const r of appRoutes) {
  const n = norm(r);
  if (!n || n === '/coach' || n === '/athlete') continue; // umbrella prefixes
  require_(n, 'app route');
}
require_('/athlete', 'app route');
require_('/coach', 'app route');

// --- expo-il hash views: h === 'x' inside parseHash ---
for (const m of expoIl.matchAll(/h\s*===\s*'([a-z][\w-]*)'/g)) require_(`#/${m[1]}`, 'expo-il view');

if (missing.length) {
  console.error('\n✗ SURFACE GATE FAILED — these live routes are NOT in docs/SURFACES.md:\n');
  for (const m of missing) console.error('  • ' + m);
  console.error('\nAdd each to docs/SURFACES.md (same commit) so audits can never miss them.\n');
  process.exit(1);
}
console.log(`✓ surface gate: ${seen.size} routes/tabs all present in docs/SURFACES.md`);
