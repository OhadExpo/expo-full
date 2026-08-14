// Fixture tests for src/reflexPVT.js (REFLEX — PVT reaction-time CNS readiness).
import { analyzeReflex, reflexReadiness } from '../src/reflexPVT.js';

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} — got ${JSON.stringify(got)}`); } };

console.log('REFLEX — PVT reaction-time engine');

// 1) clean sharp set (~260ms, no lapses)
const sharp = analyzeReflex([250, 265, 240, 275, 255, 260, 245, 270, 258, 262]);
ok('sharp meanRT ~258', sharp.ok && Math.abs(sharp.meanRT - 258) <= 6, sharp.ok ? sharp.meanRT : sharp.reason);
ok('sharp no lapses', sharp.ok && sharp.lapses === 0, sharp.lapses);
ok('fastest10 <= mean', sharp.ok && sharp.fastest10 <= sharp.meanRT, sharp);

// 2) false starts excluded (values < 100ms)
const fs = analyzeReflex([40, 60, 250, 260, 270, 255, 265]);
ok('false starts counted', fs.ok && fs.falseStarts === 2, fs.falseStarts);
ok('false starts excluded from mean', fs.ok && fs.meanRT >= 250, fs.ok ? fs.meanRT : fs.reason);

// 3) lapses (>500ms) counted + hard-gate to suppressed
const lapsy = analyzeReflex([260, 540, 600, 700, 280, 270]);
ok('lapses counted', lapsy.ok && lapsy.lapses === 3, lapsy.lapses);
ok('>=3 lapses → suppressed', lapsy.ok && lapsy.readiness.band === 'suppressed', lapsy.readiness);

// 4) ceiling excludes distraction (>3s dropped)
const dist = analyzeReflex([260, 250, 270, 9000]);
ok('distraction dropped', dist.ok && dist.nValid === 3, dist.nValid);

// 5) readiness bands vs baseline (higher RT = worse)
const base = { meanRT: 260, sd: 20 };
ok('slow → suppressed', reflexReadiness({ meanRT: 300, lapses: 0 }, base).band === 'suppressed', reflexReadiness({ meanRT: 300, lapses: 0 }, base));
ok('normal → ready', reflexReadiness({ meanRT: 262, lapses: 0 }, base).band === 'ready', reflexReadiness({ meanRT: 262, lapses: 0 }, base));
ok('fast → primed', reflexReadiness({ meanRT: 235, lapses: 0 }, base).band === 'primed', reflexReadiness({ meanRT: 235, lapses: 0 }, base));
ok('no baseline → baseline band', reflexReadiness({ meanRT: 260, lapses: 0 }, null).band === 'baseline', reflexReadiness({ meanRT: 260, lapses: 0 }, null));
ok('lapses override baseline-absent', reflexReadiness({ meanRT: 260, lapses: 4 }, null).band === 'suppressed', 'lapse-gate');

// 6) too few / all false starts → clean fail
ok('too few → ok:false', analyzeReflex([250, 260]).ok === false, 'few');
ok('all false starts → refused', analyzeReflex([30, 40, 50, 60]).ok === false, 'allfs');

console.log(`\nREFLEX: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
