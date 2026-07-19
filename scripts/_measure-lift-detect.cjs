// #19 baseline measurement — how well does the CURRENT title-regex classifier
// (repCounter.detectChannels) cover the real 1472-exercise library?
//
// The number that matters is the blind-knee fallback rate: detectChannels()
// returns knee for ANY title it doesn't recognise, so those exercises get their
// reps counted off the knee angle regardless of what the movement actually is.
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

// Mirror of src/repCounter.js CHANNEL_RULES (kept in sync manually for this probe).
const CHANNEL_RULES = [
  { kind: 'none',  rx: /\b(hold|plank|l[-\s]?sit|dead[-\s]?hang|hanging|carry|farmer|iso|iso[-\s]?metric|wall[-\s]?sit|bear[-\s]?crawl|position|stretch|breath|scap)\b/i },
  { kind: 'hip',   rx: /\b(hip[-\s]?thrust|glute[-\s]?bridge|deadlift|\bdl\b|rdl|romanian|hinge|good[-\s]?morning|jefferson|clean|snatch|swing|kettlebell\s*swing|crab|reverse[-\s]?tabletop)\b/i },
  { kind: 'knee',  rx: /\b(squat|lunge|step[-\s]?up|split[-\s]?squat|rfess|bulgarian|pistol|leg[-\s]?press|leg[-\s]?extension|leg[-\s]?curl|jump|bounce|goblet|thruster|pogo)\b/i },
  { kind: 'elbow', rx: /\b(press|bench|push[-\s]?up|ohp|row|pull[-\s]?up|chin[-\s]?up|pulldown|curl|extension|tricep|skull|dip|pushdown|pullover|hammer)\b/i },
  { kind: 'sho',   rx: /\b(fly|flye|raise|lateral|front[-\s]?raise|rear[-\s]?delt)\b/i },
];
const detect = (title) => {
  const t = String(title || '');
  for (const r of CHANNEL_RULES) if (r.rx.test(t)) return { kind: r.kind, matched: true };
  return { kind: 'knee', matched: false };  // <-- blind fallback
};

(async () => {
  const sb = createClient(URL, KEY);
  const { error } = await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (error) throw new Error(error.message);
  const { data, error: e2 } = await sb.from('store').select('value').eq('key', 'expo-exercises').single();
  if (e2) throw new Error(e2.message);

  const list = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  const counts = {}; const unmatched = [];
  let withTax = 0;
  for (const ex of list) {
    const title = ex.title || ex.name || '';
    if (!title) continue;
    const r = detect(title);
    counts[r.kind] = (counts[r.kind] || 0) + 1;
    if ((ex.movementPattern || '').trim()) withTax++;
    if (!r.matched) unmatched.push(title);
  }
  const total = list.length;
  console.log(`library exercises: ${total}`);
  console.log(`with movementPattern taxonomy: ${withTax}  (${(withTax / total * 100).toFixed(1)}%)`);
  console.log('\ncurrent classifier distribution:');
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(6)} ${String(v).padStart(5)}  ${(v / total * 100).toFixed(1)}%`);
  }
  console.log(`\nBLIND KNEE FALLBACK (title matched nothing): ${unmatched.length}  (${(unmatched.length / total * 100).toFixed(1)}%)`);
  console.log('\nsample of unclassified titles:');
  unmatched.slice(0, 40).forEach(t => console.log('  - ' + t));
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
