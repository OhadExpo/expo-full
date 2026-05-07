// Compare the title→URL maps from extracted מעקב xlsx files against the
// 22 plan exercises in Yuval's "בלוק אלפא" plan. For each plan exercise,
// look up exact + fuzzy match in each map. Print which exercises got URLs
// from where, vs. which are still empty.
const fs = require('fs');
const path = require('path');

const PLAN_TITLES = {
  'Day A': [
    'Bent-Knee SL POGO Jump',
    'Drop & Catch DB SLDL',
    'BB Back Squat',
    'BB Larsen Press',
    'ISO Wide-Grip Pull-Up + Knee Raise',
    'Hand-Supported BW Shrimp Squat',
    'Push-Up POS Hand to Alternate Foot Tap',
  ],
  'Day B': [
    'Inverted Row Drop & Catch',
    'Box Jump to SL Landing',
    'Deficit BB RDL',
    'Standing SA MID-POS OHP',
    'Forward+Reverse DB Lunge',
    'Tall-Kneeling Cable Facepull',
    'Wall-Supported Supinated DB Front-Raise',
    'SL Hip Thrust March',
  ],
  'Day C': [
    'Wall-Assisted 90/90 POS Rear Leg Heel Clicks',
    '90/90 POS Thoracic Rotation + Rear Foot Raise',
    'SL Walkout to SL Plank',
    'Squatting Alternating Knee to Floor',
    'Push-Up Drop & Catch',
    'Side-Plank Crunch',
    'Laying Elbow-Supported Knee Extension',
  ],
};

const STOP = new Set(['the','a','an','to','and','of','for','with','on','in','&','+']);
const norm = (s) => (s || '').toLowerCase()
  .replace(/[+&/().,:;'"-]/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (s) => norm(s).split(' ').filter(t => t && !STOP.has(t));
const score = (a, b) => {
  const A = new Set(toks(a)), B = new Set(toks(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return (inter / new Set([...A, ...B]).size) * 0.4 + (inter / A.size) * 0.6;
};

// Load every JSON map in scripts/meakav-out/
const dir = path.join(__dirname, 'meakav-out');
const sources = [];
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json')) continue;
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  sources.push({ file: f, source: j.source, map: j.map });
}
console.log(`loaded ${sources.length} source maps`);

for (const [day, titles] of Object.entries(PLAN_TITLES)) {
  console.log(`\n=== ${day} ===`);
  for (const t of titles) {
    let best = { score: 0 };
    for (const s of sources) {
      for (const [mapTitle, url] of Object.entries(s.map)) {
        const sc = score(t, mapTitle);
        if (sc > best.score) best = { score: sc, mapTitle, url, source: s.source };
      }
    }
    if (best.score >= 0.8) {
      console.log(`  ✓ ${t}`);
      console.log(`     match: "${best.mapTitle}" (${best.score.toFixed(2)}) ← ${best.source}`);
      console.log(`     ${best.url}`);
    } else if (best.score >= 0.5) {
      console.log(`  ? ${t}`);
      console.log(`     close:  "${best.mapTitle}" (${best.score.toFixed(2)}) ← ${best.source}`);
      console.log(`     ${best.url}`);
    } else {
      console.log(`  ✗ ${t}  — no candidate ≥0.5`);
    }
  }
}
