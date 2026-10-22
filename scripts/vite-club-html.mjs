// THE CLUB'S OWN PAGE SHELL (#891, Ohad 22.10: "bnei hertzeliya websites needs to have its own icon on chrome and
// everywhere" / "currently is still shows expo's"). public/boot-theme.js and src/clubBrand.js brand a club page once
// JavaScript runs; a link PREVIEW (WhatsApp, iMessage, Telegram, Slack) never runs it and read EXPO's title, text and
// image off index.html. After the build this writes dist/bhbc.html: the SAME app shell (same bundle) with the club's
// title, share card, tab icons, home-screen icon, manifest and theme colour in the HTML itself. vercel.json serves it
// for /bhbc/* and /coach/bhbc/*. Every swap must land - a template change that misses one fails the build, so the club
// page never silently ships half EXPO.
import fs from 'node:fs';
import path from 'node:path';

const SWAPS = [
  [/<title>[^<]*<\/title>/, '<title>Bnei Herzliya</title>'],
  [/(<meta name="theme-color" content=")[^"]*/, '$1#14294F'],
  [/(<meta name="apple-mobile-web-app-title" content=")[^"]*/, '$1Bnei Herzliya'],
  [/(<meta property="og:site_name" content=")[^"]*/, '$1Bnei Herzliya'],
  [/(<meta property="og:title" content=")[^"]*/, '$1Bnei Herzliya'],
  [/(<meta property="og:description" content=")[^"]*/, '$1Bnei Herzliya Basketball Club · Performance &amp; S&amp;C'],
  [/(<meta property="og:url" content=")[^"]*/, '$1https://expo-app.co.il/bhbc'],
  [/(<meta property="og:image" content=")[^"]*/, '$1https://expo-app.co.il/bhbc-og.png'],
  [/(<meta name="twitter:title" content=")[^"]*/, '$1Bnei Herzliya'],
  [/(<meta name="twitter:description" content=")[^"]*/, '$1Bnei Herzliya Basketball Club · Performance &amp; S&amp;C'],
  [/(<meta name="twitter:image" content=")[^"]*/, '$1https://expo-app.co.il/bhbc-og.png'],
  [/(<link rel="manifest" href=")\/manifest\.webmanifest/, '$1/bhbc.webmanifest'],
  [/href="\/icon-180\.png"/g, 'href="/bhbc-icon-180.png"'],
  [/href="\/favicon\.ico"/g, 'href="/bhbc-favicon.ico"'],
  [/href="\/favicon-16x16\.png"/, 'href="/bhbc-favicon-16.png"'],
  [/href="\/favicon-32x32\.png"/, 'href="/bhbc-favicon-32.png"'],
  [/href="\/favicon-48x48\.png"/, 'href="/bhbc-favicon-48.png"'],
  [/href="\/icon-192\.png"/, 'href="/bhbc-icon-192.png"'],
  [/href="\/icon-512\.png"/, 'href="/bhbc-icon-512.png"'],
];

export function clubHtml(html) {
  const missed = [];
  for (const [re, to] of SWAPS) { if (!re.test(html)) missed.push(String(re)); html = html.replace(re, to); re.lastIndex = 0; }
  if (missed.length) throw new Error(`bhbc.html: ${missed.length} swap(s) found nothing in index.html - ${missed.join(' | ')}`);
  return html;
}

export default function clubHtmlPlugin() {
  let outDir = 'dist';
  return {
    name: 'expo-club-html',
    apply: 'build',
    enforce: 'post',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    closeBundle() {
      const src = path.join(outDir, 'index.html');
      if (!fs.existsSync(src)) return;
      fs.writeFileSync(path.join(outDir, 'bhbc.html'), clubHtml(fs.readFileSync(src, 'utf8')));
    },
  };
}
