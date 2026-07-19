// #19 — NEW vs OLD name classifier over the real 1472-exercise library.
// Loads the actual src/liftDetect.js (no mirrored copy that can drift).
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

// liftDetect.js is an ES module importing from repCounter.js. Rather than add a
// build step, strip the imports/exports and eval both together — the pieces we
// need here (taxonomy + title lexicon) don't touch the pose helpers.
function loadDetector() {
  const p = path.join(__dirname, '..', 'src', 'liftDetect.js');
  let src = fs.readFileSync(p, 'utf8');
  src = src.replace(/^import[^;]+;/gm, '').replace(/^export\s+/gm, '');
  const shim = `const medianFilter=(x)=>x, findPeaks=()=>[], isReal=(x)=>x!=null&&Number.isFinite(x);`;
  const mod = {};
  new Function('module', 'exports', `${shim}\n${src}\nmodule.exports={channelFromTaxonomy,channelFromTitle,CHANNELS};`)(mod, mod);
  return mod.exports;
}

const OLD_RULES = [
  { kind: 'none',  rx: /\b(hold|plank|l[-\s]?sit|dead[-\s]?hang|hanging|carry|farmer|iso|iso[-\s]?metric|wall[-\s]?sit|bear[-\s]?crawl|position|stretch|breath|scap)\b/i },
  { kind: 'hip',   rx: /\b(hip[-\s]?thrust|glute[-\s]?bridge|deadlift|\bdl\b|rdl|romanian|hinge|good[-\s]?morning|jefferson|clean|snatch|swing|kettlebell\s*swing|crab|reverse[-\s]?tabletop)\b/i },
  { kind: 'knee',  rx: /\b(squat|lunge|step[-\s]?up|split[-\s]?squat|rfess|bulgarian|pistol|leg[-\s]?press|leg[-\s]?extension|leg[-\s]?curl|jump|bounce|goblet|thruster|pogo)\b/i },
  { kind: 'elbow', rx: /\b(press|bench|push[-\s]?up|ohp|row|pull[-\s]?up|chin[-\s]?up|pulldown|curl|extension|tricep|skull|dip|pushdown|pullover|hammer)\b/i },
  { kind: 'sho',   rx: /\b(fly|flye|raise|lateral|front[-\s]?raise|rear[-\s]?delt)\b/i },
];
const oldDetect = (title) => {
  for (const r of OLD_RULES) if (r.rx.test(String(title || ''))) return { kind: r.kind, matched: true };
  return { kind: 'knee', matched: false };
};

(async () => {
  const { channelFromTaxonomy, channelFromTitle } = loadDetector();
  const sb = createClient(URL, KEY);
  const { error } = await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (error) throw new Error(error.message);
  const { data, error: e2 } = await sb.from('store').select('value').eq('key', 'expo-exercises').single();
  if (e2) throw new Error(e2.message);
  const list = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;

  let oldBlind = 0, newUnknown = 0, changed = 0, viaTax = 0;
  const dist = {};
  const stillUnknown = [];
  const rescued = [];

  for (const ex of list) {
    const title = ex.title || ex.name || '';
    if (!title) continue;
    const o = oldDetect(title);
    const tax = channelFromTaxonomy(ex);
    const nw = tax || channelFromTitle(title);
    if (tax) viaTax++;
    if (!o.matched) oldBlind++;
    if (!nw) { newUnknown++; stillUnknown.push(title); }
    else {
      dist[nw.kind] = (dist[nw.kind] || 0) + 1;
      if (!o.matched) rescued.push(`${nw.kind.padEnd(5)} <- ${title}`);
      else if (nw.kind !== o.kind) changed++;
    }
  }

  const total = list.length;
  console.log(`library exercises: ${total}\n`);
  console.log(`OLD blind-knee fallback : ${oldBlind}  (${(oldBlind / total * 100).toFixed(1)}%)`);
  console.log(`NEW honest "unknown"    : ${newUnknown}  (${(newUnknown / total * 100).toFixed(1)}%)`);
  console.log(`  -> rescued from blind knee: ${rescued.length}`);
  console.log(`  -> resolved via taxonomy  : ${viaTax}`);
  console.log(`  -> reclassified (old matched, new differs): ${changed}`);
  console.log('\nNEW distribution:');
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(6)} ${String(v).padStart(5)}  ${(v / total * 100).toFixed(1)}%`);
  }
  console.log('\nsample RESCUED (were silently counted on knee):');
  rescued.slice(0, 30).forEach(r => console.log('  ' + r));
  console.log(`\nstill unknown (${stillUnknown.length}) — these now offer manual override instead of a wrong guess:`);
  stillUnknown.slice(0, 25).forEach(t => console.log('  - ' + t));
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
