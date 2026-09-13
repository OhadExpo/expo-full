// Can the harvest Chrome (a copy of the signed-in profile, port 9225) read the
// roster sheet, and what is its newest revision number today?
//   node audit-out/probe-revision-max.mjs
import P from 'puppeteer-core';
const ID = process.env.SHEET_ID || '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9225', defaultViewport: null, protocolTimeout: 120000 });
const pg = await b.newPage();
await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
console.log('title:', await pg.title());
console.log('url:', pg.url().slice(0, 80));
// The version-history panel's data endpoint lists the revisions the UI shows.
// Fetched in page context, same origin, so the body is readable.
const info = await pg.evaluate(async (id) => {
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/revisions/tiles?id=${id}&start=1&showDetailedRevisions=false&filterNamed=false&token=&includes_info_params=true`, { credentials: 'include' });
    const t = await r.text();
    return { status: r.status, head: t.slice(0, 300) };
  } catch (e) { return { err: String(e) }; }
}, ID);
console.log(JSON.stringify(info).slice(0, 600));
await pg.close();
b.disconnect();
