// #35 DEEP AUDIT — repeated, multi-persona, real-seat verification of the
// private live-sync channels. Run before deploying to production.
//
// Covers what a single happy-path test misses:
//   * multiple REAL personas: solo athlete, BOTH members of a couple, staff
//   * authorization AND denial, read AND write
//   * bidirectional delivery (coach->athlete and athlete->coach)
//   * JWT refresh mid-session — after a token refresh the socket must still be
//     authorized, otherwise live-sync silently dies ~1h into a training day
//   * repeated rounds, to surface the setAuth/subscribe race rather than
//     getting one lucky pass
//
// Read-only: joins channels and sends ephemeral broadcasts. Writes no rows.
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PW = '1234';

const ROUNDS = Number(process.env.ROUNDS || 5);

let pass = 0, fail = 0;
const failures = [];
function check(label, got, want) {
  if (got === want) { pass++; return true; }
  fail++; failures.push(`${label}: got ${got}, wanted ${want}`);
  return false;
}

async function seat(email) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  await sb.realtime.setAuth();
  return sb;
}

function join(sb, topic, ms = 15000) {
  return new Promise((resolve) => {
    const ch = sb.channel(topic, { config: { private: true, broadcast: { self: false } } });
    let settled = false;
    const done = (v) => {
      if (settled) return; settled = true;
      clearTimeout(timer);
      setTimeout(() => { try { sb.removeChannel(ch); } catch {} }, 0);
      resolve(v);
    };
    const timer = setTimeout(() => done('TIMEOUT'), ms);
    ch.subscribe((st) => {
      if (st === 'SUBSCRIBED') done('OK');
      else if (st === 'CHANNEL_ERROR') done('DENIED');
      else if (st === 'TIMED_OUT') done('TIMEOUT');
    });
  });
}

// Open a channel and keep it, so we can send/receive on it.
function open(sb, topic, onMsg, ms = 15000) {
  return new Promise((resolve) => {
    const ch = sb.channel(topic, { config: { private: true, broadcast: { self: false } } });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, ms);
    if (onMsg) ch.on('broadcast', { event: 'athlete-set' }, ({ payload }) => onMsg(payload));
    ch.subscribe((st) => {
      if (settled) return;
      if (st === 'SUBSCRIBED') { settled = true; clearTimeout(timer); resolve(ch); }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { settled = true; clearTimeout(timer); resolve(null); }
    });
  });
}

function waitFor(predicate, ms = 12000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (predicate()) { clearInterval(iv); resolve(true); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); resolve(false); }
    }, 150);
  });
}

(async () => {
  console.log(`ROUNDS=${ROUNDS}\n`);

  // Resolve the couple's two member emails + parent id from the live roster.
  const probe = await seat('ohadyproductions@gmail.com');
  const COUPLE_PARENT = 'tr_moshe_dana';
  const COUPLE_A = 'mtini30@gmail.com';      // member __0
  const COUPLE_B = 'danina.ronen@gmail.com'; // member __1
  const DIEGO = 'diego@diegoday.com';
  const DIEGO_TID = 'tr_diego';
  const OTHER_TID = 'tr_ayelet';

  for (let r = 1; r <= ROUNDS; r++) {
    process.stdout.write(`round ${r}/${ROUNDS} ... `);

    const diego = await seat(DIEGO);
    const coach = await seat('ohadyproductions@gmail.com');

    // --- authorization matrix, real joins ---
    check('athlete joins own', await join(diego, `gym-set:${DIEGO_TID}`), 'OK');
    check('athlete denied other', await join(diego, `gym-set:${OTHER_TID}`), 'DENIED');
    check('athlete denied gym-session', await join(diego, 'gym-session'), 'DENIED');
    check('athlete reads portal-sync', await join(diego, 'portal-sync'), 'OK');
    check('coach joins athlete', await join(coach, `gym-set:${DIEGO_TID}`), 'OK');
    check('coach joins gym-session', await join(coach, 'gym-session'), 'OK');

    // --- couple: both members authorized on the shared parent + sub topics ---
    const m0 = await seat(COUPLE_A);
    const m1 = await seat(COUPLE_B);
    check('couple A parent', await join(m0, `gym-set:${COUPLE_PARENT}`), 'OK');
    check('couple A sub0', await join(m0, `gym-set:${COUPLE_PARENT}__0`), 'OK');
    check('couple B sub1', await join(m1, `gym-set:${COUPLE_PARENT}__1`), 'OK');
    check('couple A denied outsider', await join(m0, `gym-set:${DIEGO_TID}`), 'DENIED');
    check('couple B denied gym-session', await join(m1, 'gym-session'), 'DENIED');

    // --- bidirectional delivery on a private topic ---
    let gotAtAthlete = null, gotAtCoach = null;
    const aCh = await open(diego, `gym-set:${DIEGO_TID}`, (p) => { if (p && p.probe === 'c2a') gotAtAthlete = p; });
    const cCh = await open(coach, `gym-set:${DIEGO_TID}`, (p) => { if (p && p.probe === 'a2c') gotAtCoach = p; });
    check('athlete channel open', !!aCh, true);
    check('coach channel open', !!cCh, true);
    if (aCh && cCh) {
      await new Promise(r2 => setTimeout(r2, 500));
      cCh.send({ type: 'broadcast', event: 'athlete-set', payload: { probe: 'c2a', traineeId: DIEGO_TID } });
      check('coach -> athlete delivered', await waitFor(() => !!gotAtAthlete), true);
      aCh.send({ type: 'broadcast', event: 'athlete-set', payload: { probe: 'a2c', traineeId: DIEGO_TID } });
      check('athlete -> coach delivered', await waitFor(() => !!gotAtCoach), true);

      // --- JWT REFRESH mid-session: the real-world 1h expiry ---
      const { data: rs, error: rErr } = await diego.auth.refreshSession();
      check('athlete token refreshed', !rErr && !!rs?.session, true);
      await diego.realtime.setAuth();
      await new Promise(r2 => setTimeout(r2, 800));
      gotAtAthlete = null;
      cCh.send({ type: 'broadcast', event: 'athlete-set', payload: { probe: 'c2a', traineeId: DIEGO_TID, after: 'refresh' } });
      check('delivery survives token refresh', await waitFor(() => !!gotAtAthlete), true);
    }

    for (const sb of [diego, coach, m0, m1]) { try { await sb.auth.signOut(); } catch {} }
    console.log('done');
  }

  try { await probe.auth.signOut(); } catch {}

  console.log(`\n================ RESULT ================`);
  console.log(`assertions: ${pass + fail}   passed: ${pass}   failed: ${fail}`);
  if (failures.length) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
  else console.log('ALL CLEAN');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
