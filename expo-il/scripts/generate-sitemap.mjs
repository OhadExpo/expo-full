// Generate public/sitemap.xml from src/programs.js. Runs as the `prebuild`
// hook so the sitemap stays in sync with the catalog every deploy.
//
// Pure Node, zero deps — Vercel's build env may not have Python, so we keep
// build-time tooling on the same runtime as the app.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE = 'https://expo-il.co.il';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const srcPath = resolve(root, 'src', 'programs.js');
const outPath = resolve(root, 'public', 'sitemap.xml');

const src = readFileSync(srcPath, 'utf8');

// Capture only ids inside actual program objects — drop the example entries
// documented at the bottom (kebab-case-slug, _TEMPLATE, etc.).
const ids = [];
const re = /^\s*id:\s*'([a-z0-9-]+)',/gm;
let m;
while ((m = re.exec(src))) {
  const pid = m[1];
  if (pid.startsWith('_') || pid === 'kebab-case-slug') continue;
  ids.push(pid);
}
console.log(`found ${ids.length} program ids: ${ids.join(', ')}`);

const today = new Date().toISOString().slice(0, 10);
const urls = ['/', ...ids.map((id) => `/#/programs/${id}`)];

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
  '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
];
for (const u of urls) {
  const absUrl = BASE + u;
  lines.push('  <url>');
  lines.push(`    <loc>${absUrl}</loc>`);
  lines.push(`    <lastmod>${today}</lastmod>`);
  lines.push('    <changefreq>weekly</changefreq>');
  lines.push(`    <priority>${u === '/' ? '1.0' : '0.8'}</priority>`);
  lines.push(`    <xhtml:link rel="alternate" hreflang="he" href="${absUrl}" />`);
  lines.push(`    <xhtml:link rel="alternate" hreflang="en" href="${absUrl}" />`);
  lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${absUrl}" />`);
  lines.push('  </url>');
}
lines.push('</urlset>');

writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`wrote ${outPath} with ${urls.length} entries`);
