// READ-ONLY reproduction of one reported bug, for the headless triage (#909, Ohad 23.10: "make some sort of autonomous
// check everytime a message like this pops up... So I will stop needing to screenshot and send you the errors").
// Opens ONE page of production as the owner in the debug Chrome, with every write refused in the browser from the very
// first request (#933): nothing but GET / HEAD / OPTIONS goes out, except the sign-in token call and RPCs on a READ-ONLY
// allowlist (a write RPC whose name says nothing - purge_trainee_data, sign_contract - is refused by default), and the
// page gets no WebSocket (realtime broadcasts cannot be intercepted). Waits for the screen to settle,
// then prints what a person would have seen: the screen text, page errors, console errors, failed or 4xx/5xx
// requests, how many writes it refused, and a screenshot path (Read it to look).
//   node scripts/repro-bug.mjs </path or https://expo-app.co.il/path> [--width 412] [--lang en|he] [--wait 25]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';

const BASE = 'https://expo-app.co.il';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const target = process.argv[2] || '';
// production only, and a path inside it - the report text is untrusted, so this script never goes anywhere else
// Git Bash rewrites a leading /coach/... into C:/Program Files/Git/coach/... - undo that; a bare coach/... gets its slash
const unmangled = target.replace(/^[A-Za-z]:\/Program Files\/Git(?=\/)/, '');
const route0 = unmangled.startsWith(BASE + '/') ? unmangled.slice(BASE.length) : unmangled;
const route = route0.startsWith('/') ? route0 : '/' + route0;
if (!/^\/[A-Za-z0-9/_\-.%?=&#]*$/.test(route)) { console.log(`refused: "${target.slice(0, 120)}" is not a path on ${BASE}`); process.exit(2); }
const W = Math.min(Math.max(parseInt(arg('--width', '412'), 10) || 412, 320), 1920);
const LANG = arg('--lang', 'en') === 'he' ? 'he' : 'en';
const WAIT = Math.min(parseInt(arg('--wait', '25'), 10) || 25, 60);
// read-only RPCs the app calls while it loads; anything else non-GET is refused (default deny)
const READ_RPC = /\/rest\/v1\/rpc\/(my_trainee|my_clubs|current_client_id|current_trainee_id|is_[a-z_]+|get_[a-z_]+|list_[a-z_]+|search_[a-z_]+)(\?|$)/;
const STORAGE_LIST = /supabase\.co\/storage\/v1\/object\/list\//;   // a POST that only lists files
const SIGN_IN = /supabase\.co\/auth\/v1\/token\?grant_type=(password|refresh_token)$/;

// ITS OWN HEADLESS BROWSER (#958, Ohad 23.10: "make sure you work in the background since every few minutes you pop open a
// new chrome tab"): it used to open its page in his debug Chrome, a window on his screen every time a report came in. It
// launches a throwaway headless Chrome now (signs in itself, nothing of his profile needed) and removes it after.
const CHROME = process.env.CHROME_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = path.join(os.tmpdir(), `expo-repro-${process.pid}`);
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: PROFILE, defaultViewport: null, protocolTimeout: 120000, args: ['--no-first-run', '--disable-gpu'] });
const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
try {
  await p.setViewport({ width: W, height: W < 1000 ? 900 : 1000, isMobile: W < 1000, hasTouch: W < 1000 });
  await p.evaluateOnNewDocument((lang) => {
    try { localStorage.setItem('expo-gate-run', '1'); (localStorage.setItem('expo-lang', lang), sessionStorage.setItem('expo-athlete-lang', lang)); } catch { /* */ }
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
    // no realtime: a WebSocket frame is a write the request filter below cannot see
    // (a socket that never opens and sends nothing - throwing here crashed the app's first render)
    window.WebSocket = class NoSocket { constructor() { this.readyState = 0; } send() {} close() { this.readyState = 3; } addEventListener() {} removeEventListener() {} };
    Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  }, LANG);
  const errs = []; const bad = []; let refused = 0;
  p.on('pageerror', (e) => errs.push('page error: ' + String(e.message).slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
  p.on('requestfailed', (r) => { const t = (r.failure() || {}).errorText || ''; if (!/BLOCKED_BY_CLIENT/.test(t)) bad.push(`FAILED ${r.method()} ${r.url().slice(0, 140)} ${t}`); });
  p.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url(); const m = r.method();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(m) && !SIGN_IN.test(u) && !READ_RPC.test(u) && !STORAGE_LIST.test(u)) { refused += 1; r.abort(); return; }
    r.continue();
  });
  await signIn(p, BASE);
  errs.length = 0; bad.length = 0;
  const t0 = Date.now();
  await p.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  let txt = '';
  for (let k = 0; k < WAIT; k++) { await new Promise((r) => setTimeout(r, 1000)); txt = await p.evaluate(() => document.body.innerText); if (k >= 3 && !/LOADING|Loading|טוען/.test(txt)) break; }
  const still = /LOADING|Loading|טוען/.test(txt);
  const dir = path.join('audit-out', 'triage'); fs.mkdirSync(dir, { recursive: true });
  const shot = path.join(dir, `repro-${Date.now()}.png`);
  await p.screenshot({ path: shot, fullPage: false });
  console.log(`opened ${BASE}${route} at ${W}px ${LANG}, owner seat, settled after ${Math.round((Date.now() - t0) / 1000)}s${still ? ' - STILL SHOWING A LOADING SCREEN' : ''}`);
  console.log(`final url: ${p.url()}`);
  console.log(`screen text:\n${txt.replace(/\n{2,}/g, '\n').slice(0, 1500)}`);
  console.log(`errors (${errs.length}):\n${errs.slice(0, 12).join('\n') || '-'}`);
  console.log(`failed / 4xx / 5xx requests (${bad.length}):\n${bad.slice(0, 12).join('\n') || '-'}`);
  console.log(`writes refused: ${refused}`);
  console.log(`screenshot: ${shot}`);
} finally {
  await ctx.close().catch(() => {}); await b.close().catch(() => {});
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* a locked file goes with the next temp clean */ }
}
