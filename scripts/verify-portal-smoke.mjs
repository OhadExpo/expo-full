// THE ATHLETE'S SEAT, END TO END, AGAINST A REAL BUILD.
//
// Signs in as the test fixture athlete, opens the portal, starts a day, and
// refuses to pass if the athlete saw a SAVE FAILED banner, the app threw, a
// data request came back 4xx/5xx, or the portal did not render a program.
// It writes nothing: START opens the workout view; EXIT closes it.
//
//   node scripts/verify-portal-smoke.mjs                       (preview, 127.0.0.1:5199)
//   BASE=https://expo-app.co.il node scripts/verify-portal-smoke.mjs   (production)
//   EXPO_EMAIL=<athlete email> EXPO_PW=<pw> to use another seat.
//
// Prerequisite: Chrome on the debug port (see docs/DEMO-GATES.md).
import P from 'puppeteer-core';
if (!process.env.EXPO_EMAIL) process.env.EXPO_EMAIL = 'diego@diegoday.com';
const { signIn } = await import('./lib/authed-page.mjs');
const { setWidth } = await import('./lib/viewport.mjs');

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const findings = [];
const add = (kind, detail) => { findings.push({ kind, detail }); console.log(`${kind.padEnd(9)} ${detail}`); };

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const bad = [];
const other4xx = [];
pg.on('response', (r) => {
  if (r.status() < 400) return;
  const u = r.url();
  if (/\/rest\/v1\/|\/auth\/v1\/|\/functions\/v1\//.test(u)) bad.push(`${r.status()} ${r.request().method()} ${u.slice(0, 140)}`);
  else other4xx.push(`${r.status()} ${r.request().method()} ${u.slice(0, 140)}`);
});
const storeWrites = [];
// the ONE store write an athlete owns is its presence row (expo-presence-<id>); anything else is a finding
pg.on('request', (r) => { if (/\/rest\/v1\/store/.test(r.url()) && /^(POST|PATCH|PUT|DELETE)$/.test(r.method()) && !/"key":"expo-presence-/.test(String(r.postData() || ''))) storeWrites.push(`${r.method()} ${String(r.postData() || '').slice(0, 120)}`); });
const thrown = [];
pg.on('pageerror', (e) => thrown.push(String(e && e.message || e).slice(0, 160)));
pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) thrown.push('console.error: ' + m.text().slice(0, 160)); });

let covered = 0;
try {
  await setWidth(pg, 390, 844);
  await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
  const who = await signIn(pg, BASE);
  if (!who || !who.signedIn) { add('NOSEAT', `could not sign in as ${process.env.EXPO_EMAIL}: ${(who && who.note) || '?'}`); }
  else {
    await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 });
    let text = '';
    for (let i = 0; i < 40; i++) { await wait(700); text = await pg.evaluate(() => document.body.innerText || ''); if (text.replace(/\s+/g, '').length > 400) break; }
    covered++;
    if (text.replace(/\s+/g, '').length <= 400) add('BLANK', `the portal never rendered more than a splash in 28s (${text.replace(/\s+/g, '').length} chars)`);
    const banner = text.match(/SAVE FAILED[^\n]*(\n[^\n]*)?/i) || text.match(/השמירה נכשלה[^\n]*/);
    if (banner) add('BANNER', `on load: ${banner[0].replace(/\s+/g, ' ').slice(0, 140)}`);
    const startBtn = await pg.evaluate(() => { const rx = /^(AGAIN|START|שוב|התחל)$/; const b = [...document.querySelectorAll('button')].find((x) => rx.test((x.textContent || '').trim())); if (!b) return null; b.scrollIntoView({ block: 'center' }); b.click(); return (b.textContent || '').trim(); });
    if (!startBtn) add('NOPROGRAM', 'no START / AGAIN button — the portal shows no program day to open');
    else {
      await wait(2500);
      covered++;
      const after = await pg.evaluate(() => document.body.innerText || '');
      const opened = /EXIT|יציאה|Warm-Up|חימום|SET|סט/i.test(after);
      if (!opened) add('NOWORKOUT', `${startBtn} did not open the workout view`);
      const banner2 = after.match(/SAVE FAILED[^\n]*(\n[^\n]*)?/i) || after.match(/השמירה נכשלה[^\n]*/);
      if (banner2) add('BANNER', `after ${startBtn}: ${banner2[0].replace(/\s+/g, ' ').slice(0, 140)}`);
      await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /EXIT|יציאה/i.test((x.textContent || '').trim())); if (b) b.click(); });
      await wait(1200);
    }
    for (const w of storeWrites) add('STOREWRITE', `the athlete seat wrote the store table: ${w}`);
    // the seat fence's own report: a blocked write is a bug upstream, so it is a finding here
    const blockedWrites = await pg.evaluate(() => (window.__expoBlockedWrites || []).map((b) => `${b.key} (${b.why})`)).catch(() => []);
    for (const w of blockedWrites) add('BLOCKED', `the seat fence stopped a write from the athlete seat: ${w}`);
    // non-data 4xx: an asset or a function. /api/* does not exist on the vite preview, so there it is a note, not a finding.
    for (const e of other4xx) { if (/\/api\/|\/_vercel\//.test(e) && /127\.0\.0\.1|localhost/.test(BASE)) console.log(`note      ${e} (no functions or analytics on the preview)`); else add('HTTP', e); }
    for (const e of bad) add('HTTP', e);
    for (const t of thrown) add('THROWN', t);
  }
} catch (e) {
  add('ERROR', 'harness: ' + String(e.message || e).slice(0, 160));
} finally {
  await pg.close().catch(() => {});
  await ctx.close().catch(() => {});
  b.disconnect();
}
console.log(`portal smoke on ${BASE} as ${process.env.EXPO_EMAIL}: ${covered} of 2 steps reached, ${bad.length} failed data requests, ${storeWrites.length} store writes, ${thrown.length} thrown; ${findings.length ? findings.length + ' FINDING(S)' : 'clean'}`);
if (covered < 2) { console.log('FAIL: the smoke did not reach the workout view — that is not a pass'); process.exit(1); }
process.exit(findings.length ? 1 : 0);
