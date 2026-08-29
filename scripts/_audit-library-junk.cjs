// Audit the exercise library for NON-EXERCISE entries — set/rep prescriptions,
// warmup notes, superset markers, RPE instructions — that were imported as if
// they were exercises. READ-ONLY: reports candidates + whether any plan row
// references them (by id or title). Deletion is a separate, explicitly-approved
// step. node scripts/_audit-library-junk.cjs
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9֐-׿ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Junk classifiers — each returns a reason string or null.
function classify(title) {
  const t = String(title || '').trim();
  const n = norm(t);
  if (!t) return 'empty title';
  if (/^[\d\s,.*x×+\-–/%@()]+$/.test(t)) return 'pure set/rep numbers';           // "5*3", "3,3,1", "8-10*3"
  if (/superset|חסר תרגיל|super exercies|super exercise/i.test(t)) return 'superset marker';
  if (/warm.?up set|% of (day|last)|of last (week|block)/i.test(t)) return 'warmup/percent note';
  if (/\brpe\s*\d/i.test(t)) return 'RPE instruction';
  if (/^backoff set/i.test(t)) return 'backoff-set prefix';
  if (/^\d+(\s*[-–]\s*\d+)?\s*(sec|second|seconds|min|minutes)\b/i.test(t) && !/sprint|run|jog|hold|plank|iso|hang|carry|bike|row/i.test(t)) return 'tempo/time note';
  if (/last\/extra|extra for \d/i.test(t)) return 'set-count note';
  if (/^\d[\d\s,.*x×\-–/+%@]*\s+\d+\s*second (down|up|pause)/i.test(t)) return 'tempo prescription';
  if (/^[\^]+.*[\^]+$/.test(t)) return 'caret marker';
  if (/^\d+ handed/i.test(t)) return 'instruction note';
  return null;
}

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: exRow, error: e1 } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  if (e1) throw e1;
  const library = exRow.value;
  const { data: plans, error: e2 } = await s.from('plans').select('id,name,data');
  if (e2) throw e2;

  // Index plan references: by exerciseId and by normalized title.
  const refById = new Map(); const refByTitle = new Map();
  for (const p of plans) {
    const days = (p.data && p.data.days) || [];
    for (const d of days) {
      const list = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
      for (const e of list) {
        const id = e.exerciseId || e.eid; if (id) refById.set(id, (refById.get(id) || 0) + 1);
        const tn = norm(e.title || e.t); if (tn) refByTitle.set(tn, (refByTitle.get(tn) || 0) + 1);
      }
    }
  }

  const junk = [];
  for (const ex of library) {
    const reason = classify(ex.title);
    if (!reason) continue;
    const refs = (refById.get(ex.id) || 0) + 0;
    const titleRefs = refByTitle.get(norm(ex.title)) || 0;
    junk.push({ id: ex.id, title: ex.title, reason, idRefs: refs, titleRefs, hasVideo: !!ex.videoLink, hasCues: !!(ex.cues || ex.notes) });
  }
  junk.sort((a, b) => (b.idRefs + b.titleRefs) - (a.idRefs + a.titleRefs));
  console.log(`library size: ${library.length}, junk candidates: ${junk.length}\n`);
  const byReason = {};
  for (const j of junk) byReason[j.reason] = (byReason[j.reason] || 0) + 1;
  Object.entries(byReason).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(4), k));
  console.log('\n=== candidates (idRefs = plan rows linked by id, titleRefs = rows with same title) ===');
  for (const j of junk) console.log(`${String(j.idRefs).padStart(3)} id / ${String(j.titleRefs).padStart(3)} title  [${j.reason}]  "${j.title}"${j.hasVideo ? ' ▶' : ''}${j.hasCues ? ' ✎' : ''}`);
  const unref = junk.filter((j) => j.idRefs === 0 && j.titleRefs === 0);
  console.log(`\nunreferenced (safe to delete after backup): ${unref.length} / ${junk.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
