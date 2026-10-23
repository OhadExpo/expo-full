// THE REAL DEMO CLUBS' ARTWORK (#971, Ohad 24.10: "Use the real logos for the demos. Current seasons logo ... Both logos
// and icons ... Everywhere where they need to appear (chrome top included)"). Their crests are their own artwork, so
// they never enter this PUBLIC repo: the source files sit in ~/expo-private-backups/club-logos/<slug>/ (sourced and
// dated there) and this script writes, per club, to the public storage bucket club-assets/<slug>/:
//   crest.png       the crest for light surfaces (transparent)
//   crest-dark.png  the crest for dark surfaces (a white-disc version where the crest's own colour vanishes on dark)
//   icon.png        192x192, the browser tab / home-screen icon (the dark version, centred, transparent)
//   og.png          1200x630 share card (rendered in the off-screen Chrome, in the zone's colours)
// It signs in as the owner (the bucket's write policy is owner-only) and prints the public URLs with ?v=<stamp>.
//   node scripts/gen-real-club-assets.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import puppeteer from 'puppeteer-core';
import { ownerClient } from './lib/store-client.mjs';
const SUPA_URL = process.env.EXPO_SUPABASE_URL || 'https://gtcbfglttoiyfsnfbhdy.supabase.co';

const SRC = path.join(os.homedir(), 'expo-private-backups', 'club-logos');
const CLUBS = [
  { slug: 'galil-elyon', light: 'galil-elyon/galil-elyon_crest_960_transparent.png', dark: 'galil-elyon/galil-elyon_crest_960_transparent.png', wordmark: 'HAPOEL GALIL ELYON', sport: 'BASKETBALL', bg: '#0F2742', accent: '#D92B23' },
  { slug: 'kfar-saba', light: 'kfar-saba/kfar-saba_crest.png', dark: 'kfar-saba/kfar-saba_crest_white-disc.png', wordmark: 'HAPOEL KFAR SABA', sport: 'FOOTBALL', bg: '#0F3322', accent: '#2E9B5F' },
  { slug: 'netanya', light: 'netanya/netanya_crest.png', dark: 'netanya/netanya_crest.png', wordmark: 'ELITZUR NETANYA', sport: 'BASKETBALL', bg: '#121212', accent: '#FFC20E' },
];
const stamp = Date.now().toString(36);
const s = await ownerClient();
const put = async (key, buf) => {
  const { error } = await s.storage.from('club-assets').upload(key, buf, { contentType: 'image/png', upsert: true, cacheControl: '31536000' });
  if (error) throw new Error(`${key}: ${error.message}`);
  return `${SUPA_URL}/storage/v1/object/public/club-assets/${key}?v=${stamp}`;
};
const font = fs.readFileSync('public/fonts/Nord-Bold.woff2').toString('base64');
const br = await puppeteer.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9444', defaultViewport: null });
const ctx = await br.createBrowserContext(); const p = await ctx.newPage();
await p.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
const out = {};
try {
  for (const c of CLUBS) {
    const light = await sharp(path.join(SRC, c.light)).trim().resize({ height: 512, withoutEnlargement: true }).png().toBuffer();
    const dark = await sharp(path.join(SRC, c.dark)).trim().resize({ height: 512, withoutEnlargement: true }).png().toBuffer();
    const icon = await sharp(dark).resize(176, 176, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await p.setContent(`<!doctype html><html><head><style>
      @font-face{font-family:Nord;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:700}
      html,body{margin:0;width:1200px;height:630px;background:${c.bg};font-family:Nord,Arial,sans-serif;color:#fff;overflow:hidden}
      .wrap{position:absolute;inset:0;display:flex;align-items:center;gap:60px;padding:0 90px;border-bottom:18px solid ${c.accent}}
      img{height:300px;width:auto;max-width:330px;object-fit:contain}
      .k{font-size:22px;letter-spacing:.18em;color:${c.accent};margin-bottom:18px}
      .n{font-size:60px;line-height:1.05;letter-spacing:.02em}
      .s{font-size:26px;letter-spacing:.08em;opacity:.85;margin-top:22px}
    </style></head><body><div class="wrap"><img src="data:image/png;base64,${dark.toString('base64')}"><div>
      <div class="k">EXPO TEAMS · ${c.sport}</div><div class="n">${c.wordmark}</div><div class="s">PERFORMANCE · S&amp;C · MEDICAL</div>
    </div></div></body></html>`, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    const og = await p.screenshot({ type: 'png' });
    fs.mkdirSync(path.join(SRC, c.slug, 'out'), { recursive: true });
    fs.writeFileSync(path.join(SRC, c.slug, 'out', 'og.png'), og);
    out[c.slug] = { crest: await put(`${c.slug}/crest.png`, light), crestDark: await put(`${c.slug}/crest-dark.png`, dark), icon: await put(`${c.slug}/icon.png`, icon), og: await put(`${c.slug}/og.png`, og) };
    console.log('uploaded', c.slug);
  }
} finally { await ctx.close(); br.disconnect(); await s.auth.signOut({ scope: 'local' }); }
console.log(JSON.stringify(out, null, 1));
