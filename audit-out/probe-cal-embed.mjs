// Can a signed-in browser read a SUBSCRIBED calendar's events without anyone
// sharing anything? Try the paths Google itself serves to that browser.
//   node audit-out/probe-cal-embed.mjs
import P from 'puppeteer-core';
const ID = process.env.CAL || 'c_96a2ea9f1242d53540e3ae9d3c10d78dc274a394cc03d0c012e12019573433b4@group.calendar.google.com';
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 300000 });
const cdpB = await b.target().createCDPSession();
await cdpB.send('Target.createTarget', { url: 'about:blank#expo-calprobe', background: true });
const target = await b.waitForTarget((t) => t.type() === 'page' && t.url().endsWith('#expo-calprobe'), { timeout: 20000 });
const pg = await target.page();
await pg.setViewport({ width: 1400, height: 1000 });
const enc = encodeURIComponent(ID);
const tries = [
  ['embed AGENDA', `https://calendar.google.com/calendar/embed?src=${enc}&ctz=Asia%2FJerusalem&mode=AGENDA&dates=20260901%2F20261231`],
  ['embed MONTH', `https://calendar.google.com/calendar/embed?src=${enc}&ctz=Asia%2FJerusalem&mode=MONTH`],
  ['htmlembed', `https://calendar.google.com/calendar/htmlembed?src=${enc}&ctz=Asia%2FJerusalem&mode=AGENDA`],
];
for (const [name, url] of tries) {
  try {
    const res = await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(6000);
    const info = await pg.evaluate(() => {
      const t = (document.body.innerText || '').replace(/\s+/g, ' ');
      const frames = [...document.querySelectorAll('iframe')].length;
      return { len: t.length, head: t.slice(0, 260), frames, title: document.title };
    });
    // The agenda renders inside the page; count anything that looks like his titles.
    const hits = await pg.evaluate(() => {
      const t = document.body.innerText || '';
      return { bb: (t.match(/\bBB\b/g) || []).length, shoot: (t.match(/hootaround/g) || []).length, scrim: (t.match(/crimmage/g) || []).length, weight: (t.match(/eight ?[Rr]oom/g) || []).length };
    });
    console.log(`${name}: http=${res && res.status()} title="${info.title}" text=${info.len} iframes=${info.frames} hits=${JSON.stringify(hits)}`);
    console.log('   ' + info.head.slice(0, 200));
  } catch (e) { console.log(`${name}: ERR ${String(e.message || e).slice(0, 90)}`); }
}
await pg.screenshot({ path: 'audit-out/cal-embed.png' });
await pg.close();
b.disconnect();
