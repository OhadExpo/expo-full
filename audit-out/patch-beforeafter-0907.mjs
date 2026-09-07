import fs from 'node:fs';
const f = 'scripts/build-before-after.mjs';
let s = fs.readFileSync(f, 'utf8');
const rep = (from, to) => { if (s.split(from).length - 1 !== 1) throw new Error('match count != 1: ' + from.slice(0, 60)); s = s.split(from).join(to); };
// Four pairs from 2026-09-07, each undoing exactly the lines that fixed it.
rep(`  {
    id: 'coach-offline',`, `  {
    id: 'tasks-autobody',
    title: 'Tasks, in Hebrew · the auto-task bodies stayed English',
    file: 'src/TasksV8View.jsx',
    undo: [["return readLang() === 'he' ? localiseAutoBody(core) : core;", 'return core;']],
    url: APP + '/coach/tasks', w: 1400, h: 900, auth: true, appLang: 'he',
    crop: [0, 60, 1400, 560],
  },
  {
    id: 'dashboard-dashes',
    title: 'Dashboard, no signal · the KPIs read zero, not "unknown"',
    file: 'src/DashboardView.jsx',
    undo: [['const unknown = (rows) => !online && (!Array.isArray(rows) || rows.length === 0);', 'const unknown = () => false;']],
    url: APP + '/coach', w: 1400, h: 900, auth: true, cutBackend: true,
    crop: [0, 60, 1400, 360],
  },
  {
    id: 'roster-offline',
    title: 'Athletes, no signal · the roster was empty',
    file: 'src/useSupaStore.js',
    undo: [['rosterOk = !!em && TRAINER_EMAILS.includes(em);', 'rosterOk = false;']],
    url: APP + '/coach/athletes', w: 1400, h: 900, auth: true, cutBackend: true,
    crop: [0, 60, 1400, 520],
  },
  {
    id: 'bw-bidi',
    title: 'Athlete, in Hebrew · the bodyweight unit split from its number',
    file: 'src/ClientPortal.jsx',
    undo: [['<span dir="ltr" style={{unicodeBidi:\'isolate\'}}>{lb}KG</span>', '{lb}KG']],
    url: APP + '/athlete', w: 390, h: 844, athlete: true, appLang: 'he', clickText: 'משקל',
    crop: [0, 0, 390, 420],
  },
  {
    id: 'coach-offline',`);
// A generic click-through: the first button/tab whose text is exactly this.
rep(`    for (let k = 0; k < 60; k++) {
      await wait(400);`, `    if (job.clickText) {
      await wait(4000);
      await pg.evaluate((t) => {
        const el = [...document.querySelectorAll('button,a,[role=tab],[role=button]')].find((e) => (e.textContent || '').trim() === t);
        if (el) el.click();
      }, job.clickText);
      await wait(2500);
    }
    for (let k = 0; k < 60; k++) {
      await wait(400);`);
fs.writeFileSync(f, s);
console.log('builder patched: 4 pairs + clickText');
