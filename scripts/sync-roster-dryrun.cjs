// DRY RUN ONLY — reads the live roster, matches the Google-Sheet client tracker
// (as of 01.07.2026), and prints the proposed changes to monthly / perSession /
// lastPayment. WRITES NOTHING. Owner auth required (RLS blocks anon reads).
//
// Run: node scripts/sync-roster-dryrun.cjs
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

// DD.MM.YYYY -> YYYY-MM-DD
const iso = (d) => { const m = d.match(/(\d{2})\.(\d{2})\.(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

// Sheet rows. price=null means "not a plain monthly/session price" (block-based
// or a split that the single numeric field can't hold) -> flagged, not written.
const SHEET = [
  // --- Monthly clients (מחיר לחודש) ---
  { name: 'עמית יהודאי',       kind: 'monthly', date: '01.06.2026', price: 500, raw: '500 ש"ח + 1 אתלטיקה', note: 'plus 1 athletics session' },
  { name: 'רון יונקר',         kind: 'monthly', date: '29.05.2026', price: null, raw: 'עד בלוק #17 (כולל)' },
  { name: 'דיאגו דיי',         kind: 'monthly', date: '12.02.2026', price: 800, raw: '800 ש"ח' },
  { name: 'טל סיאונוב',        kind: 'monthly', date: '06.04.2026', price: 600, raw: '600 ש"ח' },
  { name: 'רועי הצבי',         kind: 'monthly', date: '30.09.2025', price: null, raw: 'עד בלוק #28' },
  // --- Per-session clients (מחיר לאימון אישי) ---
  { name: 'איילת קזצב',        kind: 'session', date: '17.06.2026', price: 200, raw: '200 ש"ח' },
  { name: 'משה ודנה טיני',     kind: 'session', date: '22.06.2026', price: null, raw: '200/175 ש"ח', note: 'couple split — single perSession field cannot hold both' },
  { name: 'מיה וחילק יניב',    kind: 'session', date: '06.06.2026', price: 250, raw: '250 ש"ח' },
  { name: 'נטע ותום רונן',     kind: 'session', date: '01.07.2026', price: null, raw: '250/200 ש"ח', note: 'couple split' },
  { name: 'לימור ודניאל ספן',  kind: 'session', date: '28.01.2026', price: null, raw: '300/200 ש"ח', note: 'couple split' },
  { name: 'אילן כרמלי',        kind: 'session', date: '26.06.2026', price: null, raw: '250/175 ש"ח', note: 'split price — unclear which applies' },
  { name: 'עומר שדה',          kind: 'session', date: '23.06.2026', price: 175, raw: '175 ש"ח' },
];

const norm = (x) => (x || '').replace(/\s+/g, ' ').trim();
// Sheet-name -> app trainee id, for names that don't string-match.
const ALIAS = { 'דיאגו דיי': 'tr_diego', 'מיה וחילק יניב': 'tr_miya_hilk' };

(async () => {
  const { error: authErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (authErr) { console.error('AUTH FAILED:', authErr.message); process.exit(1); }

  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  console.log('Loaded', trainees.length, 'trainees.\n');

  const byName = new Map(trainees.map(t => [norm(t.name), t]));
  const byId = new Map(trainees.map(t => [t.id, t]));
  const findT = (name) => (ALIAS[name] && byId.get(ALIAS[name]))
    || byName.get(norm(name))
    || trainees.find(t => norm(t.name).includes(norm(name)) || norm(name).includes(norm(t.name)));

  const changes = [], flags = [];
  for (const row of SHEET) {
    const t = findT(row.name);
    if (!t) { flags.push(`❓ NOT FOUND in app: "${row.name}" (${row.raw})`); continue; }
    const couple = Array.isArray(t.members) && t.members.length === 2;
    const priceField = row.kind === 'monthly' ? 'monthly' : 'perSession';
    const newDate = iso(row.date);
    const curDate = t.lastPayment || '(none / derived from payments)';
    const lines = [];

    // Last payment (field is only a *fallback* when no "Paid" payment rows exist)
    if (newDate && newDate !== t.lastPayment) lines.push(`  lastPayment: ${curDate}  ->  ${newDate}`);

    // Price
    if (row.price == null) {
      flags.push(`⚠️  ${t.name}: price NOT written — ${row.raw}${couple ? ' [couple: no per-member price field]' : ''}`);
    } else if ((t[priceField] || 0) !== row.price) {
      lines.push(`  ${priceField}: ${t[priceField] || '(none)'}  ->  ${row.price}${row.note ? '   // ' + row.note : ''}`);
    }
    if (couple) flags.push(`ℹ️  ${t.name}: couple — lastPayment/price are stored once for the pair, not per member.`);
    if (lines.length) changes.push(`✏️  ${t.name} (id ${t.id})\n${lines.join('\n')}`);
  }

  console.log('===== PROPOSED CHANGES (nothing written) =====\n');
  console.log(changes.length ? changes.join('\n\n') : '(no field changes)');
  console.log('\n===== FLAGS / NEED A DECISION =====\n');
  console.log(flags.length ? flags.join('\n') : '(none)');
  console.log('\nNote: "lastPayment" only shows in the UI when a trainee has NO "Paid" payment rows; otherwise the newest Paid row wins.');
})().catch(e => console.error(e));
