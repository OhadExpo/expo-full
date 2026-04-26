// Generate per-program OG card PNGs (1200×630) into public/og/.
// Each program in src/programs.js gets its own social preview so when the
// /programs/<id> URL is shared on WhatsApp / IG / Twitter the recipient sees
// the program's title, audience, price, and EXPO mark — not a generic cover.
//
// Composition is SVG → PNG via sharp (libvips + librsvg + harfbuzz). English
// renders cleanly. Hebrew also renders correctly thanks to fribidi, but I keep
// the cards English-only because OG previews are typically scraped once and
// cached — having one canonical card per program is more reliable than trying
// to localise the preview.
//
// Runs as part of the postbuild hook (after generate-program-pages.mjs) so
// the per-program HTML pages can reference og:image=/og/<id>.png.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const srcPath = resolve(root, 'src', 'programs.js');
const outDir = resolve(root, 'public', 'og');
const heroLogoPath = resolve(root, 'public', 'expo-hero-logo.png');

function parsePrograms(src) {
  const programs = [];
  const blockRe = /\{\s*id:\s*'([a-z0-9-]+)',[\s\S]*?\n\s*\},/g;
  let m;
  while ((m = blockRe.exec(src))) {
    const id = m[1];
    if (id.startsWith('_') || id === 'kebab-case-slug') continue;
    const block = m[0];
    const grab = (key) => {
      const re = new RegExp(`${key}:\\s*'((?:\\\\.|[^'])*)'`);
      const mm = re.exec(block);
      return mm ? mm[1].replace(/\\'/g, "'") : '';
    };
    const grabNum = (key) => {
      const re = new RegExp(`${key}:\\s*(\\d+)`);
      const mm = re.exec(block);
      return mm ? Number(mm[1]) : null;
    };
    programs.push({
      id,
      tag: grab('tag'),
      title: grab('title'),
      audience: grab('audience'),
      duration: grab('duration'),
      price: grabNum('price'),
      currency: grab('currency') || 'NIS',
    });
  }
  return programs;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Wrap title text by character count — librsvg has no automatic wrap.
function wrapTitle(title, perLine = 22) {
  const words = title.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);  // never more than 2 lines for the OG card
}

function buildSvg(p) {
  const W = 1200, H = 630;
  const titleLines = wrapTitle(p.title, 22);
  const titleStartY = titleLines.length === 1 ? 320 : 280;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="100%" stop-color="#0a0a14"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#39BDFF" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#39BDFF" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="200" fill="url(#glow)"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="#39BDFF" stroke-width="1" stroke-opacity="0.3" rx="20"/>

  <!-- Top tag chip -->
  <rect x="80" y="100" width="${(p.tag.length * 14) + 40}" height="44" fill="#39BDFF" fill-opacity="0.12" stroke="#39BDFF" stroke-opacity="0.4" stroke-width="1" rx="22"/>
  <text x="${100}" y="129" font-family="sans-serif" font-size="18" font-weight="700" letter-spacing="3" fill="#39BDFF">${escapeXml(p.tag.toUpperCase())}</text>

  <!-- Title (1-2 lines) -->
  ${titleLines.map((line, i) => `
  <text x="80" y="${titleStartY + i * 80}" font-family="sans-serif" font-size="68" font-weight="800" fill="#f0f0f4" letter-spacing="-1">${escapeXml(line)}</text>`).join('')}

  <!-- Audience line -->
  <text x="80" y="${titleStartY + titleLines.length * 80 + 20}" font-family="sans-serif" font-size="26" font-weight="400" fill="#7a7a88">${escapeXml(p.audience)}</text>

  <!-- Bottom-left: duration -->
  <text x="80" y="${H - 80}" font-family="sans-serif" font-size="20" font-weight="600" letter-spacing="2" fill="#444450">${escapeXml(p.duration.toUpperCase())}</text>

  <!-- Bottom-right: price -->
  <text x="${W - 80}" y="${H - 95}" text-anchor="end" font-family="sans-serif" font-size="14" font-weight="700" letter-spacing="3" fill="#444450">PRICE</text>
  <text x="${W - 80}" y="${H - 50}" text-anchor="end" font-family="sans-serif" font-size="56" font-weight="800" fill="#f0f0f4">${p.price} <tspan font-size="28" font-weight="600" fill="#7a7a88">${escapeXml(p.currency)}</tspan></text>

  <!-- EXPO wordmark in top-right corner -->
  <text x="${W - 80}" y="135" text-anchor="end" font-family="sans-serif" font-size="42" font-weight="800" letter-spacing="-1" fill="#f0f0f4">EXPO</text>
  <polygon points="${W - 178},78 ${W - 158},58 ${W - 138},78" fill="#39BDFF"/>
</svg>`;
}

function buildHomeSvg() {
  const W = 1200, H = 630;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="100%" stop-color="#0a0a14"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#39BDFF" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#39BDFF" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="240" fill="url(#glow)"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="#39BDFF" stroke-width="1" stroke-opacity="0.3" rx="20"/>

  <!-- Centered EXPO mark with chevron -->
  <polygon points="540,135 600,75 660,135" fill="#39BDFF"/>
  <text x="${W / 2}" y="225" text-anchor="middle" font-family="sans-serif" font-size="92" font-weight="800" letter-spacing="-1" fill="#f0f0f4">EXPO</text>

  <!-- Tagline -->
  <text x="${W / 2}" y="330" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" letter-spacing="6" fill="#39BDFF">PROGRAMMED TRAINING</text>

  <!-- Headline -->
  <text x="${W / 2}" y="430" text-anchor="middle" font-family="sans-serif" font-size="58" font-weight="800" fill="#f0f0f4" letter-spacing="-1">Programs that actually work</text>

  <!-- Subline -->
  <text x="${W / 2}" y="490" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="400" fill="#7a7a88">Block-periodised templates by Ohad · expo-il.co.il</text>

  <!-- Bottom social-proof strip -->
  <text x="${W / 2}" y="${H - 65}" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" letter-spacing="3" fill="#444450">20+ PRIVATE CLIENTS  ·  90+ PROGRAMS  ·  500+ EXERCISES</text>
</svg>`;
}

async function main() {
  if (!existsSync(srcPath)) {
    console.error('missing programs.js');
    process.exit(1);
  }
  const programs = parsePrograms(readFileSync(srcPath, 'utf8'));
  if (programs.length === 0) {
    console.error('no programs parsed');
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  // Per-program cards.
  for (const p of programs) {
    const svg = Buffer.from(buildSvg(p));
    const out = resolve(outDir, `${p.id}.png`);
    await sharp(svg).png({ quality: 90, compressionLevel: 9 }).toFile(out);
    const stat = readFileSync(out).length;
    console.log(`  ${p.id.padEnd(28)} ${(stat / 1024).toFixed(1)} KB`);
  }
  // Home card — replaces public/og-cover.png so the apex shares with the
  // same visual ruling as the per-program cards.
  const homeSvg = Buffer.from(buildHomeSvg());
  const homeOut = resolve(root, 'public', 'og-cover.png');
  await sharp(homeSvg).png({ quality: 90, compressionLevel: 9 }).toFile(homeOut);
  const homeStat = readFileSync(homeOut).length;
  console.log(`  ${'(home)'.padEnd(28)} ${(homeStat / 1024).toFixed(1)} KB`);
  console.log(`\nwrote ${programs.length} program OG cards + 1 home OG card`);
}

main().catch((e) => { console.error(e); process.exit(3); });
