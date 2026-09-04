// DO THE COACH SCREENS RUN CLEAN, NOT JUST LOOK RIGHT?
//
// The route sweep measures pixels - clipped text, sideways scroll. It says
// nothing about whether a screen threw, logged an error, or fired a request
// that came back 500. A page can be pixel-perfect and broken underneath, and
// that is the half nothing here was checking.
//
// This opens every coach route from the manifest and fails on:
//   * an uncaught page error
//   * a console error
//   * a request that failed or returned 4xx/5xx
//
// Read-only: it opens routes and clicks nothing that commits.
//
//   node scripts/verify-coach-health.mjs [width] [route...]
import fs from 'node:fs';
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const W = Number(process.argv[2] || 1500);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/coach[a-z0-9/-]*)`/gi)].map((m) => m[1]))]
      .filter((r) => !/:|\/$/.test(r));
  } catch { return ['/coach', '/coach/athletes']; }
};
const ROUTES = process.argv.length > 3 ? process.argv.slice(3) : routesFromManifest();

const found = [];
let phase = 'startup';
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();

pg.on('pageerror', (e) => found.push(`[${phase}] page error: ${String(e.message).slice(0, 140)}`));
pg.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/i.test(t)) return;          // the request hook names the URL
  if (/preloaded using link preload/i.test(t)) return;      // a font hint, not an error
  found.push(`[${phase}] console: ${t.slice(0, 140)}`);
});
pg.on('requestfailed', (r) => {
  const u = r.url();
  const why = r.failure()?.errorText || '?';
  if (/analytics|vitals|favicon|sentry/i.test(u)) return;
  // Media cancelled by navigating on is not a failure - see the athlete gate.
  if (/ERR_ABORTED/.test(why) && /\/storage\/v1\/object\/.*\.(mp4|mov|webm|m4a|jpe?g|png|webp)(\?|$)/i.test(u)) return;
  found.push(`[${phase}] request failed: ${u.slice(0, 100)} (${why})`);
});
pg.on('response', (r) => {
  const s = r.status();
  if (s < 400) return;
  const u = r.url();
  if (/analytics|vitals|favicon/i.test(u)) return;
  if (s === 406) return;                                    // empty single() from PostgREST
  // storageUrl asks for a signed URL first and falls back to the public one
  // while the buckets are public; documented in storageUrl.js.
  if (s === 400 && /\/storage\/v1\/object\/sign\//.test(u)) return;
  found.push(`[${phase}] HTTP ${s}: ${u.slice(0, 100)}`);
});

try {
  phase = 'sign-in';
  await A.signIn(pg, BASE);
  await setWidth(pg, W, 1000);
  for (const route of ROUTES) {
    phase = route;
    const before = found.length;
    await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => {
      found.push(`[${phase}] navigation failed: ${String(e.message).slice(0, 60)}`);
    });
    // Poll for a rendered screen rather than guessing a wait.
    for (let k = 0; k < 50; k++) {
      await wait(400);
      if (await pg.evaluate(() => document.querySelectorAll('*').length > 400
        && !/^\s*loading/i.test(document.body.innerText.trim()))) break;
    }
    await wait(2500);
    const n = found.length - before;
    console.log(`${n ? 'FAIL' : 'ok  '} ${route.padEnd(28)} ${n ? n + ' problem(s)' : ''}`);
  }
} catch (e) {
  found.push(`[${phase}] threw: ${String(e.message || e).slice(0, 140)}`);
} finally {
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
const uniq = [...new Set(found)];
for (const f of uniq.slice(0, 25)) console.log('  ' + f);
console.log(uniq.length ? `\n${uniq.length} problem(s) across ${ROUTES.length} coach routes`
                        : `\n0 - all ${ROUTES.length} coach routes run clean`);
process.exit(uniq.length ? 1 : 0);
