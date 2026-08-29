// INVESTIGATION AUDIT (read-only): every plan row whose TITLE looks like a
// set/rep prescription / note / marker instead of an exercise. For each, print
// the athlete, plan, day, row position, the row's own set/rep/rest fields, and
// the neighbouring rows — to determine whether the sheet import wrote notes/
// prescriptions in as exercise rows (and what the correct fix per class is).
// node scripts/_audit-trash-rows.cjs
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

function trashReason(title) {
  const t = String(title || '').trim();
  if (!t) return 'empty';
  if (/^DB .+Superset$/i.test(t)) return null;
  if (/^[\d\s,.*x×+\-–/%@()]+$/.test(t)) return 'set/rep numbers';
  if (/superset|חסר תרגיל|super exercies|super exercise/i.test(t)) return 'superset marker';
  if (/warm.?up set|% of (day|last)|of last (week|block)|last week|next week/i.test(t)) return 'warmup/% note';
  if (/\brpe\s*\d/i.test(t)) return 'RPE note';
  if (/^backoff set/i.test(t)) return 'backoff prefix';
  if (/last\/extra|extra for \d/i.test(t)) return 'set-count note';
  if (/^\d[\d\s,.*x×\-–/+%@]*\s+\d+\s*second (down|up|pause)/i.test(t)) return 'tempo prescription';
  if (/^[\^]+.*[\^]+$/.test(t)) return 'marker';
  if (/^\d+ handed/i.test(t)) return 'instruction note';
  if (/^\d+(\s*[-–]\s*\d+)?\s*(sec|second|seconds|min|minutes)\b/i.test(t) && !/sprint|run|jog|hold|plank|iso|hang|carry|bike|row|jump|skip/i.test(t)) return 'time note';
  return null;
}
const rowTitle = (e) => (e ? String(e.title || e.t || '').trim() : '');
const rowSR = (e) => e ? `sets=${e.sets ?? e.s ?? '—'} reps=${e.reps ?? e.r ?? '—'} rest=${e.rest ?? '—'} load=${e.load ?? e.w ?? '—'}` : '';

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: tr } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const names = new Map((tr?.value || []).map((t) => [t.id, t.name]));
  const { data: plans, error } = await s.from('plans').select('id,name,trainee_id,data');
  if (error) throw error;

  let total = 0; const byReason = {}; const findings = [];
  for (const p of plans) {
    const days = (p.data && p.data.days) || [];
    days.forEach((d, di) => {
      const list = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
      list.forEach((e, ei) => {
        const t = rowTitle(e);
        const reason = trashReason(t);
        if (!reason) return;
        total++; byReason[reason] = (byReason[reason] || 0) + 1;
        findings.push({
          athlete: names.get(p.trainee_id) || p.trainee_id || '(unassigned)',
          plan: p.name, day: d.name || d.n || `Day ${di + 1}`, pos: `${ei + 1}/${list.length}`,
          title: t, reason, self: rowSR(e),
          prev: rowTitle(list[ei - 1]) || '(first row)', next: rowTitle(list[ei + 1]) || '(last row)',
          notes: String(e.notes || e.n || '').slice(0, 60),
        });
      });
    });
  }
  console.log(`TRASH-TITLED PLAN ROWS: ${total} across ${plans.length} plans\n`);
  Object.entries(byReason).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(4), k));
  console.log('\n=== every row, with context ===');
  for (const f of findings) {
    console.log(`\n"${f.title}"  [${f.reason}]  — ${f.athlete} · ${f.plan} · ${f.day} · row ${f.pos}`);
    console.log(`   self: ${f.self}${f.notes ? `  notes:"${f.notes}"` : ''}`);
    console.log(`   prev: "${f.prev}"   next: "${f.next}"`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
