// Is the branch's Vercel preview reachable from a signed-in profile, and on
// which bundle? One tab, read-only, closed after.
//   CDP=http://127.0.0.1:9222 node audit-out/peek-preview.mjs
import P from 'puppeteer-core';
const URL = process.argv[2] || 'https://expo-full-git-bhbc-hebrew-ohadyproductions-4644s-projects.vercel.app/login';
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null });
const pg = await b.newPage();
try {
  await pg.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 8000));
  const info = await pg.evaluate(() => ({ url: location.href, title: document.title, chunk: ([...document.scripts].map((s) => s.src).find((s) => /assets\/index-/.test(s)) || '').replace(/^.*\/assets\//, ''), text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120) }));
  console.log(JSON.stringify(info));
} finally {
  await pg.close().catch(() => {});
  b.disconnect();
}
