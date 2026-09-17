// Open (or reload) the four host pages as tabs in the persistent debug Chrome
// without stealing focus from whatever he is doing there: an existing tab is
// reloaded in place, a missing one is opened in the background.
import puppeteer from 'puppeteer-core';
const cdp = process.env.CDP || 'http://127.0.0.1:9222';
const URLS = ['http://127.0.0.1:4179/', 'http://127.0.0.1:4180/', 'http://127.0.0.1:4181/', 'http://127.0.0.1:4182/'];
const browser = await puppeteer.connect({ browserURL: cdp, defaultViewport: null });
const pages = await browser.pages();
for (const u of URLS) {
  const port = u.match(/:(\d+)\//)[1];
  const have = pages.find((p) => p.url().includes(':' + port + '/'));
  if (have) { await have.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); console.log('reloaded', u); continue; }
  // CDP Target.createTarget with background:true opens without activating.
  const cdpSession = await browser.target().createCDPSession();
  await cdpSession.send('Target.createTarget', { url: u, background: true });
  console.log('opened', u);
}
browser.disconnect();
