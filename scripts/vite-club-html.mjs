// THE CLUB'S OWN PAGE SHELL (#891, Ohad 22.10: "bnei hertzeliya websites needs to have its own icon on chrome and
// everywhere" / "currently is still shows expo's"). public/boot-theme.js and src/clubBrand.js brand a club page once
// JavaScript runs; a link PREVIEW (WhatsApp, iMessage, Telegram, Slack) never runs it and read EXPO's title, text and
// image off index.html. After the build this writes dist/bhbc.html: the SAME app shell (same bundle) with the club's
// title, share card, tab icons, home-screen icon, manifest and theme colour in the HTML itself. vercel.json serves it
// for /bhbc/* and /coach/bhbc/*. Every swap must land - a template change that misses one fails the build, so the club
// page never silently ships half EXPO.
import fs from 'node:fs';
import path from 'node:path';
import { ALL_DEMO_CLUBS } from '../src/clubs/demoClubs.js';

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

// A DEMO CLUB'S SHELL (team version #904): dist/club-<id>.html, served for /demo/club/<id>/* (vercel.json). Its title,
// share card and tab icon are the club's (scripts/gen-club-assets.mjs makes the files); the manifest stays EXPO's.
export const DEMO_SHELL_CLUBS = ALL_DEMO_CLUBS.map((d) => d.club);
export function demoClubHtml(html, c) {
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const title = esc(`${c.short} · Performance & S&C`);
  const desc = esc(c.sport === 'soccer' ? 'Football club performance office: availability, readiness, medical, sessions and matches - demo' : 'Basketball club performance office: availability, readiness, medical, sessions and games - demo');
  const url = `https://expo-app.co.il${c.routeBase}`, img = `https://expo-app.co.il/clubs/${c.id}-og.png`, icon = `/clubs/${c.id}-crest.svg`;
  const swaps = [
    [/<title>[^<]*<\/title>/, `<title>${title}</title>`],
    [/(<meta name="theme-color" content=")[^"]*/, `$1${c.palette.header}`],
    [/(<meta property="og:site_name" content=")[^"]*/, `$1${esc(c.short)}`],
    [/(<meta property="og:title" content=")[^"]*/, `$1${title}`],
    [/(<meta property="og:description" content=")[^"]*/, `$1${desc}`],
    [/(<meta property="og:url" content=")[^"]*/, `$1${url}`],
    [/(<meta property="og:image" content=")[^"]*/, `$1${img}`],
    [/(<meta name="twitter:title" content=")[^"]*/, `$1${title}`],
    [/(<meta name="twitter:description" content=")[^"]*/, `$1${desc}`],
    [/(<meta name="twitter:image" content=")[^"]*/, `$1${img}`],
    [/href="\/favicon\.ico"/g, `href="${icon}"`],
    [/href="\/favicon-16x16\.png"/, `href="${icon}"`],
    [/href="\/favicon-32x32\.png"/, `href="${icon}"`],
    [/href="\/favicon-48x48\.png"/, `href="${icon}"`],
    [/<\/head>/, '<meta name="robots" content="noindex, nofollow">\n</head>'],
  ];
  const missed = [];
  for (const [re, to] of swaps) { if (!re.test(html)) missed.push(String(re)); html = html.replace(re, to); re.lastIndex = 0; }
  if (missed.length) throw new Error(`club-${c.id}.html: ${missed.length} swap(s) found nothing in index.html - ${missed.join(' | ')}`);
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
      for (const c of DEMO_SHELL_CLUBS) fs.writeFileSync(path.join(outDir, `club-${c.id}.html`), demoClubHtml(fs.readFileSync(src, 'utf8'), c));
    },
  };
}
