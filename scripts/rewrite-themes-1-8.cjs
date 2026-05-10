const fs = require('fs');
const path = 'C:/Users/Administrator/Desktop/expo-full/src/themes.css';
let src = fs.readFileSync(path, 'utf8');
const i = src.indexOf('/* ========== DRAFT VARIANTS');
const endMarker = '/* ========== /DRAFT VARIANTS ========== */';
const j = src.indexOf(endMarker);
if (i < 0 || j < 0) { console.error('markers not found', i, j); process.exit(1); }
const before = src.slice(0, i);
const after = src.slice(j + endMarker.length);

const cardBd = 'rgba(57,189,255,0.30)';
const bdAlt = 'rgba(57,189,255,0.45)';

function variant(num, comment, vars) {
  const lines = [];
  lines.push(`[data-theme="${num}"] {`);
  lines.push(`  /* ${comment} */`);
  for (const [k, v] of Object.entries(vars)) {
    lines.push(`  ${k}: ${v};`);
  }
  lines.push(`}`);
  return lines.join('\n');
}

const sevColors = {
  '--c-rd': '#DC2626',  '--c-rdD': 'rgba(220,38,38,0.10)',
  '--c-gn': '#16A34A',  '--c-gnD': 'rgba(22,163,74,0.10)',
  '--c-or': '#EA580C',  '--c-orD': 'rgba(234,88,12,0.10)',
  '--c-pu': '#7C3AED',  '--c-puD': 'rgba(124,58,237,0.10)',
};

function mk(num, comment, bg, sf, sf2, sf3, shadow, scrim, cardShadow) {
  return variant(num, comment, {
    '--c-bg': bg,
    '--c-sf': sf,
    '--c-sf2': sf2,
    '--c-sf3': sf3,
    '--c-bd': cardBd,
    '--c-bd2': bdAlt,
    '--c-tx': '#0E0F12',
    '--c-tm': '#4B5563',
    '--c-td': '#9CA3AF',
    '--c-ac': '#39BDFF',
    '--c-acH': '#0E8FD3',
    '--c-acText': '#0A78B0',
    '--c-acSurface': '#39BDFF',
    '--c-acOnSurface': '#0E0F12',
    '--c-cardBd': cardBd,
    ...sevColors,
    '--c-scrim': scrim,
    '--c-shadow': shadow,
    '--c-cardShadow': cardShadow,
  });
}

const block = `/* ========== DRAFT VARIANTS (preview only, ?theme= URL switch) ==========
 * Eight light-mode variants — every one preserves the EXPO dark-mode
 * UI: same Card layout, same cyan-30% hairline border, same accent
 * positions, same severity colors, same JetBrains Mono numbers, same
 * sharp corners. The ONLY axis that varies is the lightness/tint of
 * the page bg and the card surface relationship. Cyan = BSG #39BDFF
 * exactly. All bgs are white, gray, or cyan.
 *
 *   ?theme=1 — pure white bg + pure white cards
 *   ?theme=2 — pure white bg + cards a hair darker
 *   ?theme=3 — soft gray bg + white cards (lift via lightness)
 *   ?theme=4 — cool blue-gray bg + white cards
 *   ?theme=5 — cyan-whisper bg + white cards
 *   ?theme=6 — pale cyan bg + white cards
 *   ?theme=7 — vivid BSG cyan bg + white cards
 *   ?theme=8 — mid gray bg + white cards (cards LIFT clearly)
 *
 * Common to all 8 (the EXPO signature):
 *   --c-cardBd: rgba(57,189,255,0.30)   — cyan-30% hairline (same as dark)
 *   --c-ac: #39BDFF                     — brand accent for big numbers + DASHBOARD pill
 *   --c-tx near-black                   — body text
 *   sharp corners, JetBrains Mono numbers
 */

${mk('1', 'Pure white — cards same color as bg, defined entirely by cyan-30% hairline + tiny shadow. Most literal mirror of dark.',
  '#FFFFFF', '#FFFFFF', '#FAFAFA', '#F4F4F5',
  'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.45)',
  '0 1px 2px rgba(0,0,0,0.04)')}

${mk('2', 'Pure white bg, cards a hair darker (#FAFAFA). Inverted dark-mode cue (cards darker, not lighter).',
  '#FFFFFF', '#FAFAFA', '#F4F4F5', '#E4E4E7',
  'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.45)',
  '0 1px 2px rgba(0,0,0,0.03)')}

${mk('3', 'Soft gray bg + white cards. Cards LIFT off page via brightness (mirrors dark mode lift).',
  '#F4F4F5', '#FFFFFF', '#FAFAFA', '#F4F4F5',
  'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.45)',
  '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)')}

${mk('4', 'Cool blue-gray bg + white cards. Bg picks up a subtle cool tint matching the brand cyan family.',
  '#F0F4F8', '#FFFFFF', '#F4F8FB', '#E5EBF2',
  'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.45)',
  '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)')}

${mk('5', 'Cyan-whisper bg + white cards. Bg is barely-visible cyan tint. Reads as gray-cyan family, brand whispers.',
  '#F4FBFF', '#FFFFFF', '#ECF7FF', '#DBF0FF',
  'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.45)',
  '0 1px 2px rgba(57,189,255,0.10), 0 4px 12px rgba(57,189,255,0.08)')}

${mk('6', 'Pale cyan bg + white cards. Bg visibly carries the brand. Same hairline. Reads as light-mode-with-the-cyan-kept.',
  '#DCF2FF', '#FFFFFF', '#ECF7FF', '#BBE5FF',
  'rgba(57,189,255,0.10)', 'rgba(0,0,0,0.45)',
  '0 1px 2px rgba(57,189,255,0.10), 0 4px 12px rgba(57,189,255,0.12)')}

${mk('7', 'Vivid BSG cyan bg + white cards. Brand-loud canvas. Cards lift via shadow alone; cyan-30% hairline still draws the EXPO mark.',
  '#39BDFF', '#FFFFFF', '#F4F8FB', '#E0E4EA',
  'rgba(0,26,44,0.10)', 'rgba(0,26,44,0.45)',
  '0 1px 2px rgba(0,26,44,0.08), 0 8px 24px rgba(0,26,44,0.10)')}

${mk('8', 'Mid gray bg + white cards. Cards LIFT clearly (most pronounced surface contrast). Reads office/clinical.',
  '#E5E7EB', '#FFFFFF', '#F4F4F5', '#E4E4E7',
  'rgba(0,0,0,0.10)', 'rgba(0,0,0,0.45)',
  '0 1px 2px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)')}
`;

const out = before + block + endMarker + after;
fs.writeFileSync(path, out, 'utf8');
console.log('OK', out.length, 'bytes');
