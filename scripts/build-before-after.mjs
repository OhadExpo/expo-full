// BEFORE / AFTER pairs for the recap.
//
// Ohad: "i want more before and after pictures and less words".
//
// A commit message can claim a fix; a pair of pictures shows it. There is no
// stored "before", so each one is REPRODUCED: revert exactly the lines that
// fixed it, shoot the same view at the same width, restore, shoot again. The
// restore is unconditional - it runs even if the shot throws - because leaving
// a reverted fix in the tree would be far worse than having no picture.
//
//   node scripts/build-before-after.mjs [id...]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const APP = 'http://127.0.0.1:5199';
const IL = 'http://127.0.0.1:5174';
const OUT = 'audit-out/beforeafter';
fs.mkdirSync(OUT, { recursive: true });

// Each pair names the file to touch, the exact edit that UNDOES the fix, and
// the view to photograph. `crop` is [x, y, w, h] on the captured image.
const PAIRS = [
  {
    id: 'marketing-slash',
    title: 'Marketing · a Hebrew list ran outside its card',
    file: 'expo-il/src/App.jsx',
    undo: [['<span><SlashBreak text={h} /></span>', '<span>{h}</span>']],
    url: IL + '/#/programs/foundation-12', w: 900, h: 900, lang: 'he',
    crop: [0, 355, 900, 130],
  },
  {
    id: 'exercises-table',
    title: 'Exercises · the header read "SECONDAR MEDIA"',
    file: 'src/ExercisesView.jsx',
    undo: [['@media (min-width: 701px) and (max-width: 1200px) {', '@media (min-width: 99990px) and (max-width: 99999px) {']],
    url: APP + '/coach/exercises', w: 900, h: 620, auth: true,
    // The header row is the whole point of this one.
    crop: [0, 395, 900, 120],
  },
  {
    id: 'intake-email',
    title: 'Intake · the email hung outside the card on a phone',
    // That fix had TWO halves and a "before" must undo both: without the
    // themes.css rule the buttons still drop to their own line, the text gets
    // the full card, and it wraps fine - so undoing only the overflow-wrap
    // produced a "before" that was already fixed.
    file: 'src/IntakeView.jsx',
    also: ['src/themes.css'],
    undo: [["marginTop: 4, overflowWrap: 'anywhere' }}>", 'marginTop: 4 }}>']],
    alsoUndo: [['.iv-sub-main { flex: 1 1 100% !important; }', '']],
    url: APP + '/coach/intake', w: 390, h: 800, auth: true,
    // The submission row, not the banner above it.
    crop: [0, 360, 390, 190],
  },
  {
    id: 'bhbc-history',
    title: 'BHBC player popup · Full history had no card',
    file: 'src/BhbcView.jsx',
    undo: [['<span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: \'0.08em\', textTransform: \'uppercase\', color: C.tx }}>Full history</span>',
            '<span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: \'0.12em\', textTransform: \'uppercase\', color: C.tm }}>Full history</span>']],
    url: APP + '/coach/bhbc', w: 1500, h: 1100, auth: true, bhbcPlayer: true,
    crop: [410, 520, 700, 420],
  },
];

const only = process.argv.slice(2);
const jobs = only.length ? PAIRS.filter((p) => only.includes(p.id)) : PAIRS;

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(job, label) {
  const pg = await b.newPage();
  try {
    if (job.lang) await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-il-lang', l); } catch (e) {} }, job.lang);
    if (job.auth) {
      // authed-page.signIn RETURNS EARLY when a session already exists, so after
      // any athlete-seat run it silently keeps that seat and a "coach" URL
      // renders the portal instead. That is exactly how the exercises pair came
      // back showing an athlete's programme. Clear first, then sign in, then
      // refuse to shoot if this is not the coach.
      await pg.goto(APP + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
      await A.signIn(pg, APP);
      const isCoach = await pg.evaluate(() => /dashboard|athletes|billing/i.test(document.body.innerText.slice(0, 600)));
      if (!isCoach) throw new Error('not on the coach seat after sign-in');
    }
    await setWidth(pg, job.w, job.h);
    await pg.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let k = 0; k < 60; k++) {
      await wait(400);
      if (await pg.evaluate(() => document.querySelectorAll('*').length > 300
        && !/^\s*loading/i.test(document.body.innerText.trim()))) break;
    }
    await wait(2500);
    await pg.evaluate(() => {
      const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || ''));
      if (x) x.click();
    });
    if (job.bhbcPlayer) {
      await pg.evaluate(() => {
        const t = [...document.querySelectorAll('.bhbc-tab')].find((e) => /^roster$/i.test((e.textContent || '').trim()));
        if (t) t.click();
      });
      await wait(3000);
      await pg.evaluate(() => {
        const c = [...document.querySelectorAll('.bhbc-card')].find((e) => /#\d+/.test(e.textContent || ''));
        if (c) c.click();
      });
      await wait(3000);
    }
    await wait(1200);
    const f = path.join(OUT, `${job.id}-${label}.png`);
    await pg.screenshot({ path: f });
    return f;
  } finally { await pg.close().catch(() => {}); }
}

for (const job of jobs) {
  const src = fs.readFileSync(job.file, 'utf8');
  const src2 = job.also ? fs.readFileSync(job.also[0], 'utf8') : null;
  let broke = true;
  try {
    let mod = src;
    for (const [from, to] of job.undo) {
      if (!mod.includes(from)) { console.log(`SKIP ${job.id}: anchor not found in ${job.file}`); broke = false; break; }
      mod = mod.replace(from, to);
    }
    if (!broke) continue;
    fs.writeFileSync(job.file, mod);
    if (src2) {
      let m2 = src2;
      for (const [from, to] of (job.alsoUndo || [])) m2 = m2.replace(from, to);
      fs.writeFileSync(job.also[0], m2);
    }
    await wait(6000);                       // let the dev server pick it up
    await shoot(job, 'before');
    fs.writeFileSync(job.file, src);        // RESTORE before the after-shot
    if (src2) fs.writeFileSync(job.also[0], src2);
    broke = false;
    await wait(6000);
    await shoot(job, 'after');
    console.log(`ok   ${job.id}`);
  } catch (e) {
    console.log(`FAIL ${job.id}: ${String(e.message || e).slice(0, 90)}`);
  } finally {
    // Unconditional: a reverted fix must never survive this script.
    if (fs.readFileSync(job.file, 'utf8') !== src) {
      fs.writeFileSync(job.file, src);
      console.log(`     restored ${job.file}`);
    }
    if (src2 && fs.readFileSync(job.also[0], 'utf8') !== src2) {
      fs.writeFileSync(job.also[0], src2);
      console.log(`     restored ${job.also[0]}`);
    }
  }
}

// Record what was produced so the recap can pick it up.
const made = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
// Index EVERY pair on disk, not just this run's - otherwise running one id
// wipes the others out of the recap.
const index = PAIRS.map((j) => ({ id: j.id, title: j.title, w: j.w, crop: j.crop }))
  .filter((j) => made.includes(j.id + '-before.png') && made.includes(j.id + '-after.png'));
fs.writeFileSync('audit-out/beforeafter/index.json', JSON.stringify(index, null, 1));
console.log(`\n${index.length} pair(s) -> ${OUT}`);
b.disconnect();
