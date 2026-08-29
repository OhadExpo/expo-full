// Remove NON-EXERCISE entries from the library (set/rep numbers, superset
// markers, warmup/%/RPE notes, backoff prefixes, tempo notes) — the entries
// Ohad flagged as "not even real exercises" (2026-08-21). KEEPS the two real
// combo exercises ("DB ... Superset" pairings). Full dated backup written
// first; plan rows that referenced deleted entries become unresolved and land
// in the coach Matching queue, which is the designed funnel for fixing them.
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

function junkReason(title) {
  const t = String(title || '').trim();
  if (!t) return 'empty title';
  if (/^DB .+Superset$/i.test(t)) return null; // real combo exercises — keep
  if (/^[\d\s,.*x×+\-–/%@()]+$/.test(t)) return 'pure set/rep numbers';
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
  const { error: aErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aErr) throw aErr;
  const { data: exRow, error } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  if (error) throw error;
  const library = exRow.value;
  fs.writeFileSync('scripts/_expo-exercises-backup-20260821.json', JSON.stringify(library, null, 1));
  console.log('backup: scripts/_expo-exercises-backup-20260821.json (' + library.length + ' entries)');

  const removed = [];
  const kept = library.filter((ex) => {
    const r = junkReason(ex.title);
    if (r) { removed.push({ id: ex.id, title: ex.title, reason: r }); return false; }
    return true;
  });
  removed.forEach((r) => console.log('DELETE  [' + r.reason + ']  "' + r.title + '"'));
  console.log(`\nremoving ${removed.length}, keeping ${kept.length}`);
  const { error: uErr } = await s.from('store').update({ value: kept }).eq('key', 'expo-exercises');
  if (uErr) throw uErr;
  const { data: v } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  console.log('VERIFY new library size:', v.value.length, '| junk remaining:', v.value.filter((ex) => junkReason(ex.title)).length);
  fs.writeFileSync('scripts/_library-junk-removed-20260821.json', JSON.stringify(removed, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
