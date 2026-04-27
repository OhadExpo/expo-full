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
      // Hebrew variants — optional. Empty string falls back to English at
      // render time so the card always has something to show.
      tagHe: grab('tagHe'),
      titleHe: grab('titleHe'),
      audienceHe: grab('audienceHe'),
      durationHe: grab('durationHe'),
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

// Build the bilingual OG card. Hebrew title sits at the right, English title
// underneath in a smaller weight. WhatsApp/IG audience reads Hebrew first
// (the site default); English keeps the program name searchable.
//
// `lang` controls which language drives the layout:
//   'bilingual' — Hebrew large + English small (used for the canonical card)
//   'he'        — Hebrew only, RTL right-aligned (used for /he share previews)
//   'en'        — English only (legacy, kept for backward compat)
function buildSvg(p, lang = 'bilingual') {
  const W = 1200, H = 630;
  const hasHebrew = !!p.titleHe;
  const useHebrewLayout = (lang === 'he' || lang === 'bilingual') && hasHebrew;
  const titleLines = wrapTitle(p.title, 22);

  if (useHebrewLayout) {
    const titleHeLines = wrapTitle(p.titleHe, 18);
    const tagHe = p.tagHe || p.tag;
    const audienceHe = p.audienceHe || p.audience;
    const durationHe = p.durationHe || p.duration;
    // Right-anchored layout. Hebrew strings are rendered with direction="rtl"
    // + text-anchor="end" so harfbuzz/fribidi shape the glyphs correctly.
    const heBlockStartY = titleHeLines.length === 1 ? 280 : 240;
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

  <!-- Top-right Hebrew tag chip -->
  <rect x="${W - 80 - (tagHe.length * 18 + 40)}" y="100" width="${tagHe.length * 18 + 40}" height="44" fill="#39BDFF" fill-opacity="0.12" stroke="#39BDFF" stroke-opacity="0.4" stroke-width="1" rx="22"/>
  <text x="${W - 100}" y="131" text-anchor="end" direction="rtl" font-family="sans-serif" font-size="20" font-weight="700" letter-spacing="2" fill="#39BDFF">${escapeXml(tagHe)}</text>

  <!-- Hebrew title (1-2 lines, right-anchored) -->
  ${titleHeLines.map((line, i) => `
  <text x="${W - 80}" y="${heBlockStartY + i * 88}" text-anchor="end" direction="rtl" font-family="sans-serif" font-size="76" font-weight="800" fill="#f0f0f4" letter-spacing="-1">${escapeXml(line)}</text>`).join('')}

  <!-- Hebrew audience line -->
  <text x="${W - 80}" y="${heBlockStartY + titleHeLines.length * 88 + 20}" text-anchor="end" direction="rtl" font-family="sans-serif" font-size="28" font-weight="400" fill="#9a9aa8">${escapeXml(audienceHe)}</text>

  <!-- English title smaller below for searchability + LTR audiences -->
  <text x="${W - 80}" y="${heBlockStartY + titleHeLines.length * 88 + 70}" text-anchor="end" font-family="sans-serif" font-size="22" font-weight="600" letter-spacing="1" fill="#666674">${escapeXml(p.title)}</text>

  <!-- Bottom-right: duration in Hebrew -->
  <text x="${W - 80}" y="${H - 80}" text-anchor="end" direction="rtl" font-family="sans-serif" font-size="22" font-weight="600" letter-spacing="1" fill="#666674">${escapeXml(durationHe)}</text>

  <!-- Bottom-left: price -->
  <text x="80" y="${H - 95}" font-family="sans-serif" font-size="14" font-weight="700" letter-spacing="3" fill="#444450">מחיר · PRICE</text>
  <text x="80" y="${H - 50}" font-family="sans-serif" font-size="56" font-weight="800" fill="#f0f0f4">₪${p.price}</text>

  <!-- EXPO wordmark in top-left corner -->
  <polygon points="80,78 100,58 120,78" fill="#39BDFF"/>
  <text x="140" y="106" font-family="sans-serif" font-size="42" font-weight="800" letter-spacing="-1" fill="#f0f0f4">EXPO</text>
</svg>`;
  }

  // Fallback: English-only layout (original).
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

  <rect x="80" y="100" width="${(p.tag.length * 14) + 40}" height="44" fill="#39BDFF" fill-opacity="0.12" stroke="#39BDFF" stroke-opacity="0.4" stroke-width="1" rx="22"/>
  <text x="${100}" y="129" font-family="sans-serif" font-size="18" font-weight="700" letter-spacing="3" fill="#39BDFF">${escapeXml(p.tag.toUpperCase())}</text>

  ${titleLines.map((line, i) => `
  <text x="80" y="${titleStartY + i * 80}" font-family="sans-serif" font-size="68" font-weight="800" fill="#f0f0f4" letter-spacing="-1">${escapeXml(line)}</text>`).join('')}

  <text x="80" y="${titleStartY + titleLines.length * 80 + 20}" font-family="sans-serif" font-size="26" font-weight="400" fill="#7a7a88">${escapeXml(p.audience)}</text>

  <text x="80" y="${H - 80}" font-family="sans-serif" font-size="20" font-weight="600" letter-spacing="2" fill="#444450">${escapeXml(p.duration.toUpperCase())}</text>

  <text x="${W - 80}" y="${H - 95}" text-anchor="end" font-family="sans-serif" font-size="14" font-weight="700" letter-spacing="3" fill="#444450">PRICE</text>
  <text x="${W - 80}" y="${H - 50}" text-anchor="end" font-family="sans-serif" font-size="56" font-weight="800" fill="#f0f0f4">${p.price} <tspan font-size="28" font-weight="600" fill="#7a7a88">${escapeXml(p.currency)}</tspan></text>

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
  // Canonical card (.png) uses the bilingual layout when Hebrew strings are
  // present, English-only otherwise. We also emit a `_he.png` variant for
  // cases where a future per-locale share URL wants Hebrew-only chrome.
  for (const p of programs) {
    const svg = Buffer.from(buildSvg(p, 'bilingual'));
    const out = resolve(outDir, `${p.id}.png`);
    await sharp(svg).png({ quality: 90, compressionLevel: 9 }).toFile(out);
    const stat = readFileSync(out).length;
    console.log(`  ${p.id.padEnd(28)} ${(stat / 1024).toFixed(1)} KB`);
    if (p.titleHe) {
      const heSvg = Buffer.from(buildSvg(p, 'he'));
      const heOut = resolve(outDir, `${p.id}_he.png`);
      await sharp(heSvg).png({ quality: 90, compressionLevel: 9 }).toFile(heOut);
      const heStat = readFileSync(heOut).length;
      console.log(`  ${(p.id + '_he').padEnd(28)} ${(heStat / 1024).toFixed(1)} KB`);
    }
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
