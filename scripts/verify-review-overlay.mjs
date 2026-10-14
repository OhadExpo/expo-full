// The review player's on-video overlay (#764): play a real clip with SKELETON + JOINT ANGLES on and measure, per frame,
// what is drawn against what MediaPipe saw. Pass = every presented frame read (no skipped frames), the drawn points
// jitter less than the raw ones, they stay ON the body (median offset from the raw point small) and do not blink.
//   node scripts/verify-review-overlay.mjs [base] [seconds]     (debug Chrome on CDP 9444; a coach seat signed in)
import P from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:5392', SECS = +(process.argv[3] || 6);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9444', defaultViewport: null, protocolTimeout: 600000 });
const pg = await b.newPage();
let fail = 0;
try {
  await pg.setViewport({ width: 1440, height: 950 }); await pg.bringToFront();
  if (process.env.CPU) { const cdp = await pg.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU }); console.log(`CPU throttled x${process.env.CPU}`); }
  await pg.goto(BASE + '/coach/review?lang=en', { waitUntil: 'domcontentloaded', timeout: 120000 }); await wait(6000);
  await pg.evaluate(() => { const c = [...document.querySelectorAll('button, a, [role="button"]')].find((e) => e.offsetParent !== null && /(→|←)/.test(e.textContent) && /review/i.test(e.textContent) && e.getBoundingClientRect().top > 120); if (c) c.click(); });
  await wait(4000);
  for (let i = 0; i < 12; i++) {
    const more = await pg.evaluate((i) => { const h = [...document.querySelectorAll('[data-ex-idx] > div')].filter((e, k, a) => e.offsetParent !== null && a.findIndex((x) => x.parentElement === e.parentElement) === k); if (!h[i]) return false; h[i].click(); return true; }, i);
    if (!more) break; await wait(1500);
    if (await pg.evaluate(() => !!document.querySelector('.fv-deck'))) break;
  }
  if (!(await pg.evaluate(() => !!document.querySelector('[data-fv="angles"]')))) { console.log('FAIL no review player with a JOINT ANGLES control on this page'); process.exit(1); }
  // JOINT ANGLES = the lines + the angles (#774)
  if (!process.env.NOOVL) await pg.evaluate(() => document.querySelector('[data-fv="angles"]').click());
  if (!process.env.NOOVL) await pg.waitForFunction(() => ['angles'].every((k) => document.querySelector(`[data-fv="${k}"]`).getAttribute('aria-pressed') === 'true'), { timeout: 120000 });
  await pg.evaluate(() => { const v = document.querySelector('video'); v.muted = true; v.currentTime = 1; window.__FV_FRAMES = 0; const tick = () => { window.__FV_FRAMES++; v.requestVideoFrameCallback(tick); }; v.requestVideoFrameCallback(tick); window.__FV_TRACE = []; window.__FV_PAINT = []; return v.play(); });
  await wait(SECS * 1000);
  const r = await pg.evaluate(() => { const v = document.querySelector('video'); v.pause(); const t = window.__FV_TRACE, pt = window.__FV_PAINT; window.__FV_TRACE = null; window.__FV_PAINT = null; return { trace: t, paint: pt, presented: window.__FV_FRAMES }; });
  const T = r.trace;
  // THE 60 FPS FEEL (#775): how often the DRAWN knee moves per second of display, and how smooth that path is
  const Pn = (r.paint || []).filter((f) => f.k);
  if (Pn.length > 10) {
    const span = (Pn[Pn.length - 1].now - Pn[0].now) / 1000;
    let moves = 0; for (let i = 1; i < Pn.length; i++) if (Pn[i].k[0] !== Pn[i - 1].k[0] || Pn[i].k[1] !== Pn[i - 1].k[1]) moves++;
    const jerk = []; for (let i = 2; i < Pn.length; i++) jerk.push(1000 * Math.hypot(Pn[i].k[0] - 2 * Pn[i - 1].k[0] + Pn[i - 2].k[0], Pn[i].k[1] - 2 * Pn[i - 1].k[1] + Pn[i - 2].k[1]));
    jerk.sort((a, b) => a - b);
    const mps = moves / span, fps = (Pn.length - 1) / span;
    console.log(`paint: ${fps.toFixed(1)} draws/s, the drawn knee moves ${mps.toFixed(1)} times/s, paint jerk median ${jerk[jerk.length >> 1].toFixed(2)} p90 ${jerk[Math.floor(jerk.length * 0.9)].toFixed(2)} (x1000 of the frame)`);
    if (mps < 40) { console.log('FAIL the drawn joints move under 40 times a second (no 60 fps feel)'); fail++; }
  } else console.log('paint: no paint samples');
  const ms = T.map((f) => f.ms).sort((x, y) => x - y);
  console.log(`frames presented ${r.presented}, read ${T.length}, detect ms median ${ms.length ? ms[ms.length >> 1].toFixed(1) : '-'} p90 ${ms.length ? ms[Math.floor(ms.length * 0.9)].toFixed(1) : '-'}`);
  // the reader runs in a worker (#775): it reads as fast as it can while the page paints at the screen's rate - so the
  // check is a reading RATE (not every presented frame) plus the paint check above
  const readRate = T.length / SECS;
  console.log(`readings ${readRate.toFixed(1)}/s`);
  if (!T.length || readRate < 12) { console.log('FAIL fewer than 12 readings a second'); fail++; }
  // jitter = median |second difference| of a joint, raw vs drawn; offset = |drawn - raw|; both x1000 of the frame
  const J = { 'L wrist': 15, 'R wrist': 16, 'L elbow': 13, 'L hip': 23, 'L knee': 25, 'R knee': 26, 'L ankle': 27, 'R ankle': 28, 'L toe': 31, 'R toe': 32 };
  const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
  const sd = (a, b2, c, k) => Math.hypot(c[k][0] - 2 * b2[k][0] + a[k][0], c[k][1] - 2 * b2[k][1] + a[k][1]);
  for (const [name, j] of Object.entries(J)) {
    const jr = [], js = [], off = [];
    for (let i = 2; i < T.length; i++) {
      const a = T[i - 2], b2 = T[i - 1], c = T[i];
      if (a.raw[j] && b2.raw[j] && c.raw[j]) jr.push(1000 * sd(a.raw, b2.raw, c.raw, j));
      if (a.sm[j] && b2.sm[j] && c.sm[j]) js.push(1000 * sd(a.sm, b2.sm, c.sm, j));
      if (c.sm[j] && c.raw[j]) off.push(1000 * Math.hypot(c.sm[j][0] - c.raw[j][0], c.sm[j][1] - c.raw[j][1]));
    }
    // ON THE BODY: the best estimate of where the joint really was is a CENTRED average of the raw points (+-2 frames:
    // it looks ahead, so it has no lag, and averages the noise out). The drawn point must sit at least as close to it
    // as the raw point does - closer means steadier AND on the body; further means it trails behind the movement.
    const dTrue = [], rTrue = [];
    for (let i = 2; i < T.length - 2; i++) {
      const win = [-2, -1, 0, 1, 2].map((k) => T[i + k].raw[j]).filter(Boolean);
      if (win.length < 5 || !T[i].sm[j]) continue;
      const tx = win.reduce((n, q) => n + q[0], 0) / 5, ty = win.reduce((n, q) => n + q[1], 0) / 5;
      dTrue.push(1000 * Math.hypot(T[i].sm[j][0] - tx, T[i].sm[j][1] - ty));
      rTrue.push(1000 * Math.hypot(T[i].raw[j][0] - tx, T[i].raw[j][1] - ty));
    }
    const blink = T.reduce((n, f, i) => n + (i && !!f.sm[j] !== !!T[i - 1].sm[j] ? 1 : 0), 0);
    const shownN = T.filter((f) => f.sm[j]).length;
    const line = `${name.padEnd(8)} jitter raw ${med(jr).toFixed(2)} drawn ${med(js).toFixed(2)} | off the true path: raw ${med(rTrue).toFixed(2)} drawn ${med(dTrue).toFixed(2)} | shown ${shownN}/${T.length} | blinks ${blink}`;
    const bad = shownN > 10 && ((js.length > 10 && med(js) > med(jr) * 0.6) || (dTrue.length > 10 && med(dTrue) > med(rTrue) * 1.1) || blink > 2);
    if (bad) fail++;
    console.log((bad ? 'FAIL ' : 'ok   ') + line);
  }
  console.log(fail ? `FAIL ${fail}` : 'PASS');
} finally { await pg.close(); b.disconnect(); }
process.exit(fail ? 1 : 0);
