// A DEMO CLUB'S OWN TAB ICON AND SHARE CARD (team version #904). A link to /demo/club/<slug> sent on WhatsApp is read
// by a preview bot that never runs JavaScript, so the club's name, crest and card must be files the HTML shell points at
// (scripts/vite-club-html.mjs writes the shells). This writes, per demo club:
//   public/clubs/<id>-crest.svg   the generated crest (tab icon)
//   public/clubs/<id>-og.png      1200x630 share card (rendered in the debug Chrome)
// Run after changing a demo club's colours or name:  node scripts/gen-club-assets.mjs
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { ALL_DEMO_CLUBS } from '../src/clubs/demoClubs.js';

const CLUBS = ALL_DEMO_CLUBS.map((d) => d.club);
fs.mkdirSync('public/clubs', { recursive: true });
const svgOf = (dataUri) => decodeURIComponent(dataUri.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
const font = fs.readFileSync('public/fonts/Nord-Bold.woff2').toString('base64');

const br = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const ctx = await br.createBrowserContext(); const p = await ctx.newPage();
await p.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
for (const c of CLUBS) {
  fs.writeFileSync(`public/clubs/${c.id}-crest.svg`, svgOf(c.crestW));
  const P = c.palette;
  await p.setContent(`<!doctype html><html><head><style>
    @font-face{font-family:Nord;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:700}
    html,body{margin:0;width:1200px;height:630px;background:${P.primaryDeep};font-family:Nord,Arial,sans-serif;color:#fff;overflow:hidden}
    .wrap{position:absolute;inset:0;display:flex;align-items:center;gap:56px;padding:0 90px;border-bottom:18px solid ${P.accent}}
    img{width:230px;height:auto}
    .k{font-size:22px;letter-spacing:.18em;color:${P.accent};margin-bottom:18px}
    .n{font-size:64px;line-height:1.05;letter-spacing:.02em}
    .s{font-size:26px;letter-spacing:.08em;opacity:.85;margin-top:22px}
  </style></head><body><div class="wrap"><img src="${c.crestW}"><div>
    <div class="k">EXPO TEAMS · ${c.sport === 'soccer' ? 'FOOTBALL' : 'BASKETBALL'}</div>
    <div class="n">${c.wordmark}</div>
    <div class="s">PERFORMANCE · S&amp;C · MEDICAL</div>
  </div></div></body></html>`, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  fs.writeFileSync(`public/clubs/${c.id}-og.png`, await p.screenshot({ type: 'png' }));
  console.log('wrote', c.id);
}
await ctx.close(); br.disconnect();
