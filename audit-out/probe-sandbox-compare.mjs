// The public sandbox (/try), walked to step 4 with two clips, photographed:
// proves the review's shared transport bar reached the demo (parity, 09-11).
//   CDP=http://127.0.0.1:9224 MSYS_NO_PATHCONV=1 node audit-out/probe-sandbox-compare.mjs [base] [clip]
import P from 'puppeteer-core';
import path from 'node:path';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const CLIP = path.resolve(process.argv[3] || 'test-clips/clip08.mp4');
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9224', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
await pg.setViewport({ width: 1400, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (re) => pg.evaluate((rx) => new RegExp(rx).test(document.body.innerText), re);
const until = async (re, ms) => { for (let t = 0; t < ms; t += 500) { if (await has(re)) return true; await wait(500); } return false; };
const steps = [];
// ?embed=1 skips the portal landing (the real portal in demo mode) and opens
// the exercise picker, whose CONTINUE → UPLOAD is step 1 → 2.
await pg.goto(BASE + '/try?embed=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
steps.push('picker: ' + await until('CONTINUE → UPLOAD', 30000));
const picked = await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => /CONTINUE → UPLOAD/.test(e.textContent)); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
if (!picked) throw new Error('no CONTINUE → UPLOAD button');
await pg.mouse.click(picked.x, picked.y);
steps.push('upload step: ' + await until('CLICK OR DROP A CLIP', 15000));
let input = await pg.$('input[type="file"]');
await input.uploadFile(CLIP);
steps.push('analyze step: ' + await until('COMPARE WITH ANOTHER CLIP', 180000));
await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => /COMPARE WITH ANOTHER CLIP/.test(e.textContent)); el?.scrollIntoView({ block: 'center' }); });
const cmp = await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => /COMPARE WITH ANOTHER CLIP/.test(e.textContent)); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await pg.mouse.click(cmp.x, cmp.y);
steps.push('compare step: ' + await until('CLICK TO LOAD A SECOND CLIP', 15000));
input = await pg.$('input[type="file"]');
await input.uploadFile(CLIP);
steps.push('bar: ' + await until('PLAY BOTH|PAUSE', 60000));
await wait(4000);
await pg.evaluate(() => { const el = [...document.querySelectorAll('[role="toolbar"]')][0]; el?.scrollIntoView({ block: 'center' }); });
await wait(500);
await pg.screenshot({ path: 'audit-out/sandbox-compare.png' });
console.log(steps.join(' | '));
console.log('shot: audit-out/sandbox-compare.png');
await ctx.close(); b.disconnect();
