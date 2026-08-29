// One-shot BHBC data op (Ohad, 2026-08-21):
// 1. BACKUP expo-bhbc-roster / expo-bhbc-loads / expo-trainees to dated JSON.
// 2. Add Roy Solomon (#11, Guard, 1.88m, ISR, DOB 2008-09-20 — bhbasket.co.il/team)
//    to expo-bhbc-roster AND expo-trainees (Bnei Herzliya tag), same id in both.
// 3. Log gym ATTENDANCE (zero-load 'Lift' sessions — Ohad chose attendance only,
//    no invented minutes/RPE, ACWR untouched) + availability Full:
//    Wed 2026-08-19: DJ Burns, Amit Gershon, Amit Menachem, Daeshon Francis, Roy
//    Fri 2026-08-21: Amit Gershon, Amit Menachem, Roy
// Idempotent: skips anything already present.
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const WED = '2026-08-19', FRI = '2026-08-21';
const ROY_ID = 'tr_bh_roysolomon11';

(async () => {
  const { error: aErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aErr) throw aErr;

  const get = async (key) => (await s.from('store').select('value').eq('key', key).maybeSingle()).data?.value;
  const put = async (key, value) => { const { error } = await s.from('store').update({ value }).eq('key', key); if (error) throw error; };

  const roster = (await get('expo-bhbc-roster')) || [];
  const loads = (await get('expo-bhbc-loads')) || {};
  const trainees = (await get('expo-trainees')) || [];

  // 1. backups
  const stamp = '20260821';
  fs.writeFileSync(`scripts/_bhbc-roster-backup-${stamp}.json`, JSON.stringify(roster, null, 1));
  fs.writeFileSync(`scripts/_bhbc-loads-backup-${stamp}.json`, JSON.stringify(loads, null, 1));
  fs.writeFileSync(`scripts/_expo-trainees-backup-${stamp}b.json`, JSON.stringify(trainees, null, 1));
  console.log('backups written');

  // 2. Roy Solomon
  const roy = {
    id: ROY_ID, age: '17', dob: '2008-09-20', name: 'Roy Solomon', team: 'BHBC',
    branch: 'Bnei Herzliya', format: 'Bnei Herzliya', height: 188, heightCm: 188,
    jersey: 11, status: 'Active', position: 'Guard', nationality: 'ISR',
    injuries: '', goals: '', notes: '', createdAt: new Date().toISOString(),
  };
  if (!roster.some((t) => t.id === ROY_ID || /roy\s+solomon/i.test(t.name || ''))) {
    await put('expo-bhbc-roster', [...roster, roy]);
    console.log('roster: Roy added');
  } else console.log('roster: Roy already present — skipped');

  if (!trainees.some((t) => t.id === ROY_ID || /roy\s+solomon/i.test(t.name || ''))) {
    const royTrainee = { ...roy, email: '', phone: '', monthly: 0, package: 'Monthly', startDate: FRI, perSession: 0, lastPayment: '', monthlyPrice: '', packagePrice: '', sessionPrice: '', sessionsRemaining: 0 };
    await put('expo-trainees', [...trainees, royTrainee]);
    console.log('expo-trainees: Roy added (Bnei Herzliya tag)');
  } else console.log('expo-trainees: Roy already present — skipped');

  // 3. gym attendance
  const plan = [
    [WED, ['tr_bh_2noztwj1ly3', 'tr_bh_4djtfei1ly3', 'tr_bh_rabt2z61ly3', 'tr_daeshon', ROY_ID]],
    [FRI, ['tr_bh_4djtfei1ly3', 'tr_bh_rabt2z61ly3', ROY_ID]],
  ];
  let n = 0;
  for (const [date, ids] of plan) {
    for (const id of ids) {
      const rec = loads[id] ? { ...loads[id] } : { loads: {}, sessions: {}, readiness: {}, availability: {} };
      rec.sessions = { ...(rec.sessions || {}) };
      const day = rec.sessions[date] || [];
      if (day.some((x) => x.type === 'Lift' && x.attended)) continue;
      rec.sessions[date] = [...day, { type: 'Lift', min: 0, rpe: 0, load: 0, attended: true }];
      rec.availability = { ...(rec.availability || {}), [date]: 1 };
      loads[id] = rec; n++;
    }
  }
  if (n) { await put('expo-bhbc-loads', loads); }
  console.log(`gym attendance sessions written: ${n} (expected 8)`);

  // verify
  const r2 = await get('expo-bhbc-roster'); const l2 = await get('expo-bhbc-loads'); const t2 = await get('expo-trainees');
  console.log('VERIFY roster has Roy:', r2.some((t) => t.id === ROY_ID));
  console.log('VERIFY trainees has Roy:', t2.some((t) => t.id === ROY_ID));
  for (const [date, ids] of plan) for (const id of ids) {
    const ok = !!(l2[id] && l2[id].sessions && (l2[id].sessions[date] || []).some((x) => x.type === 'Lift' && x.attended));
    console.log(`VERIFY ${date} ${id}: ${ok}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
