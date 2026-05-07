// One-shot: extract base64 PNG exports from src/theme.js into /public/logos/
// and rewrite the exports as URL strings. Idempotent — safe to re-run.
const fs   = require('fs');
const path = require('path');

const THEME = path.join(__dirname, '..', 'src', 'theme.js');
const OUT   = path.join(__dirname, '..', 'public', 'logos');
fs.mkdirSync(OUT, { recursive: true });

const NAMES = {
  EXPO_LOGO:     'expo-logo.png',
  EXPO_LOGO_LG:  'expo-logo-lg.png',
  EXPO_LOGO_NAV: 'expo-logo-nav.png',
  EXPO_ICON_LG:  'expo-icon-lg.png',
};

let src = fs.readFileSync(THEME, 'utf8');
let total = 0;

for (const [name, file] of Object.entries(NAMES)) {
  const re = new RegExp(`(export const ${name}\\s*=\\s*)"data:image\\/png;base64,([^"]+)";`);
  const m  = src.match(re);
  if (!m) {
    console.log(`skip ${name} — already extracted or not found`);
    continue;
  }
  const buf = Buffer.from(m[2], 'base64');
  fs.writeFileSync(path.join(OUT, file), buf);
  src = src.replace(re, `$1"/logos/${file}";`);
  total += buf.length;
  console.log(`extracted ${name} → /logos/${file} (${buf.length} bytes)`);
}

fs.writeFileSync(THEME, src);
console.log(`done. ${total} bytes moved out of theme.js into /public/logos/`);
