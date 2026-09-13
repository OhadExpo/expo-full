// Share a sheet with the gsheets service account as VIEWER, through the
// signed-in harvest Chrome (his own account, his own service account).
// Screenshots each step so the dialog can be read, not guessed.
//   SHEET_ID=… STEP=open|type|send node audit-out/probe-share-with-sa.mjs
import P from 'puppeteer-core';
const ID = process.env.SHEET_ID || '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';
const SA = 'mcp-gsheets@expo-music-495221.iam.gserviceaccount.com';
const STEP = process.env.STEP || 'open';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9227', defaultViewport: null, protocolTimeout: 180000 });
const pages = await b.pages();
let pg = pages.find((p) => p.url().includes(ID));
if (!pg) { pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 1000 }); await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await wait(6000); }
const shot = (n) => pg.screenshot({ path: `audit-out/share-${n}.png` });
const texts = () => pg.evaluate(() => [...document.querySelectorAll('[role="dialog"] button, [role="dialog"] [role="combobox"], [role="dialog"] input, [role="dialog"] [role="option"], [role="dialog"] [role="checkbox"]')].map((e) => `${e.tagName}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''}: ${(e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0, 60)}`));

if (STEP === 'open') {
  const clicked = await pg.evaluate(() => { const b2 = [...document.querySelectorAll('div[role="button"],button')].find((x) => /^share$/i.test((x.getAttribute('aria-label') || '').split('.')[0].trim()) || /^\s*share\s*$/i.test(x.textContent || '')); if (b2) { b2.click(); return b2.getAttribute('aria-label') || b2.textContent; } return null; });
  console.log('clicked share:', clicked);
  await wait(3500);
  await shot('open');
  console.log(JSON.stringify(await texts(), null, 0).slice(0, 1500));
} else if (STEP === 'type') {
  await pg.keyboard.type(SA, { delay: 20 });
  await wait(2500);
  await shot('typed');
  await pg.keyboard.press('Enter');
  await wait(2500);
  await shot('added');
  console.log(JSON.stringify(await texts(), null, 0).slice(0, 2000));
} else if (STEP === 'role') {
  // Open the role dropdown (Editor by default) and pick Viewer.
  const opened = await pg.evaluate(() => { const b2 = [...document.querySelectorAll('[role="dialog"] [role="combobox"], [role="dialog"] div[role="button"]')].find((x) => /editor/i.test(x.textContent || '') || /editor/i.test(x.getAttribute('aria-label') || '')); if (b2) { b2.click(); return (b2.textContent || b2.getAttribute('aria-label')).trim().slice(0, 40); } return null; });
  console.log('opened role menu from:', opened);
  await wait(1500);
  const picked = await pg.evaluate(() => { const o = [...document.querySelectorAll('[role="option"],[role="menuitem"],[role="menuitemradio"]')].find((x) => /^\s*viewer\s*$/i.test(x.textContent || '')); if (o) { o.click(); return true; } return false; });
  console.log('picked viewer:', picked);
  await wait(1500);
  await shot('role');
  console.log(JSON.stringify(await texts(), null, 0).slice(0, 2000));
} else if (STEP === 'notify') {
  const un = await pg.evaluate(() => { const c = [...document.querySelectorAll('[role="dialog"] [role="checkbox"]')].find((x) => /notify/i.test((x.getAttribute('aria-label') || '') + (x.parentElement && x.parentElement.textContent || ''))); if (!c) return 'no checkbox'; const was = c.getAttribute('aria-checked'); if (was === 'true') c.click(); return `was ${was}`; });
  console.log('notify checkbox:', un);
  await wait(1200);
  await shot('notify');
} else if (STEP === 'send') {
  const sent = await pg.evaluate(() => { const b2 = [...document.querySelectorAll('[role="dialog"] button')].find((x) => /^\s*(send|share|done)\s*$/i.test(x.textContent || '')); if (b2) { const t = b2.textContent.trim(); b2.click(); return t; } return null; });
  console.log('pressed:', sent);
  await wait(4000);
  await shot('sent');
  console.log(JSON.stringify(await texts(), null, 0).slice(0, 800));
} else if (STEP === 'close') {
  await pg.keyboard.press('Escape'); await wait(800); await pg.close();
}
b.disconnect();
