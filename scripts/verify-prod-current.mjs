// Is production actually serving what the current tree builds?
//
// WHY THIS EXISTS. Prod sat frozen for days while every push "succeeded".
// Nothing in git, and nothing in a local build, can tell you that — the only
// honest check is to compare a hashed chunk on the live site against the one
// this tree produces.
//
// Two traps this deliberately avoids:
//
//   1. A 200 on an asset URL proves nothing. The SPA rewrite answers ANY path
//      with index.html, so a missing chunk still returns 200 with
//      content-type text/html. This checks the content type and the size.
//   2. The interesting chunks are lazy-loaded, and some are lazy-loaded FROM
//      another lazy chunk. A one-level scan of index.html never reaches
//      ShotAnalyzer, which hangs off ReviewToolsView. This walks the graph.
//
// Run after a deploy:  node scripts/verify-prod-current.mjs [chunkPrefix]
import fs from 'node:fs';

const BASE = process.env.PROD_BASE || 'https://expo-app.co.il';
const PREFIX = process.argv[2] || 'ShotAnalyzer';

const localDir = 'dist/assets';
if (!fs.existsSync(localDir)) {
  console.log('No dist/ — run `npm run build` first. Nothing was compared.');
  process.exit(2);
}
const local = fs.readdirSync(localDir).find((f) => f.startsWith(PREFIX + '-') && f.endsWith('.js'));
if (!local) {
  console.log(`No local chunk starting with "${PREFIX}-" in dist/assets. Nothing was compared.`);
  process.exit(2);
}

async function findChunk() {
  const html = await fetch(`${BASE}/?cb=${Math.floor(Date.now() / 1000)}`, { cache: 'no-store' }).then((r) => r.text());
  const seen = new Set();
  let frontier = [...html.matchAll(/\/assets\/([A-Za-z0-9_.-]+\.js)/g)].map((m) => m[1]);
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const next = new Set();
    for (const f of frontier) {
      if (seen.has(f)) continue;
      seen.add(f);
      if (f.startsWith(PREFIX + '-')) return f;
      let js = '';
      try { js = await fetch(`${BASE}/assets/${f}`, { cache: 'no-store' }).then((r) => r.text()); } catch { continue; }
      for (const m of js.matchAll(/["'`.\/]([A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,}\.js)["'`]/g)) next.add(m[1]);
    }
    frontier = [...next];
    const hit = frontier.find((f) => f.startsWith(PREFIX + '-'));
    if (hit) return hit;
  }
  return null;
}

const remote = await findChunk();
console.log(`local : ${local}`);
console.log(`prod  : ${remote || '(not reachable in the chunk graph)'}`);

if (!remote) {
  console.log('\nCould not find the chunk on prod. Either the deploy has not landed or the graph changed.');
  process.exit(1);
}

// Confirm it is really JS and not the SPA fallback pretending to be one.
const res = await fetch(`${BASE}/assets/${remote}`, { cache: 'no-store' });
const type = res.headers.get('content-type') || '';
const body = await res.text();
if (!/javascript/i.test(type)) {
  console.log(`\nProd served content-type "${type}" for that chunk — that is the SPA fallback, not the file.`);
  process.exit(1);
}

if (remote === local) {
  console.log(`\nPROD IS CURRENT — same chunk, ${Math.round(body.length / 1024)} KB of JavaScript.`);
  process.exit(0);
}
console.log('\nPROD IS BEHIND — it serves a different build of this chunk.');
console.log('If a push just landed, wait and re-run. If it stays behind, check that');
console.log('`npm ci` can install the committed package.json + lockfile:');
console.log('  node scripts/verify-lockfile-sync.mjs');
process.exit(1);
