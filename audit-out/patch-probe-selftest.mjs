// Tidy the probe's self-test wiring and report how many controls were scanned,
// so "0 faults" can never again mean "nothing was measured".
import fs from 'node:fs';
const f = 'audit-out/probe-control-wrap.mjs';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep('  out.scanned = scanned.length;\n  return out;', '  return { items: out, scanned: scanned.length };', 'return shape');

rep('  const self = await pg.evaluate(`(${SELFTEST.toString()})()` && SELFTEST);\n  const probe = await pg.evaluate(MEASURE);\n  const caught = probe.some((x) => x.text === \'1 LOGGED\' && /WRAP/.test(x.faults));',
    '  await pg.evaluate(SELFTEST);\n  const probe = await pg.evaluate(MEASURE);\n  const caught = probe.items.some((x) => x.text === \'1 LOGGED\' && /WRAP/.test(x.faults));', 'selftest call');

rep('  const found = await pg.evaluate(MEASURE);\n  for (const f of found) all.push({ route, w: W, seat: SEAT, ...f });\n  console.log(`${route.padEnd(22)} ${String(found.length).padStart(3)} faulty control(s)`);',
    '  const res = await pg.evaluate(MEASURE);\n  const found = res.items;\n  for (const f of found) all.push({ route, w: W, seat: SEAT, ...f });\n  console.log(`${route.padEnd(22)} ${String(res.scanned).padStart(4)} scanned · ${String(found.length).padStart(3)} faulty`);', 'report scanned');
fs.writeFileSync(f, s);
