// #35 verification — real-seat test of PRIVATE live-sync channels.
//
// The risk this guards against: if Realtime Authorization denies a join that
// used to work, live-sync silently dies for real athletes mid-workout. So we
// test the ACTUAL join, with REAL logins, against the REAL policy — not a
// simulation.
//
// Cases:
//   1. athlete joins own topic            → must SUBSCRIBE
//   2. athlete joins ANOTHER athlete's    → must be DENIED (the vulnerability)
//   3. athlete joins coach-only gym-session → must be DENIED
//   4. coach joins any athlete topic      → must SUBSCRIBE
//   5. coach joins gym-session            → must SUBSCRIBE
//   6. coach → athlete message actually DELIVERS on a private channel
//      (proves authorization didn't just permit the join but also the traffic)
//
// Read-only: joins channels and sends one ephemeral broadcast. Writes no rows.
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const OWNER = ['ohadyproductions@gmail.com', '1234'];
const DIEGO = ['diego@diegoday.com', '1234'];

async function signedIn([email, password]) {
  const sb = createClient(URL, KEY);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  await sb.realtime.setAuth();
  return sb;
}

// Join a private channel, resolve with the terminal status.
function join(sb, topic, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const ch = sb.channel(topic, { config: { private: true, broadcast: { self: false } } });
    let settled = false;
    // Tear down on a LATER tick: removeChannel() inside the subscribe callback
    // re-enters phoenix's channel.leave() and blows the stack. Also: do not
    // treat CLOSED as a result — it's the echo of our own teardown.
    const done = (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      setTimeout(() => { try { sb.removeChannel(ch); } catch {} }, 0);
      resolve(status);
    };
    const timer = setTimeout(() => done('TIMEOUT'), timeoutMs);
    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') done('SUBSCRIBED');
      else if (status === 'CHANNEL_ERROR') done('DENIED' + (err ? ` (${err.message})` : ''));
      else if (status === 'TIMED_OUT') done('TIMED_OUT');
    });
  });
}

const mark = (actual, expected) => (actual === expected ? 'PASS' : `**FAIL** (wanted ${expected})`);

(async () => {
  const coach = await signedIn(OWNER);
  const athlete = await signedIn(DIEGO);

  console.log('--- athlete seat (Diego) ---');
  const a1 = await join(athlete, 'gym-set:tr_diego');
  console.log(`1. own topic .................. ${a1}  ${mark(a1, 'SUBSCRIBED')}`);
  const a2 = await join(athlete, 'gym-set:tr_ayelet');
  console.log(`2. another athlete's topic .... ${a2}  ${a2.startsWith('DENIED') ? 'PASS' : '**FAIL** (wanted DENIED)'}`);
  const a3 = await join(athlete, 'gym-session');
  console.log(`3. coach-only gym-session ..... ${a3}  ${a3.startsWith('DENIED') ? 'PASS' : '**FAIL** (wanted DENIED)'}`);

  console.log('\n--- coach seat (owner) ---');
  const c1 = await join(coach, 'gym-set:tr_diego');
  console.log(`4. athlete topic .............. ${c1}  ${mark(c1, 'SUBSCRIBED')}`);
  const c2 = await join(coach, 'gym-session');
  console.log(`5. gym-session ................ ${c2}  ${mark(c2, 'SUBSCRIBED')}`);

  // 6. End-to-end: coach broadcasts a set edit, athlete must receive it.
  console.log('\n--- end-to-end delivery on a private channel ---');
  const delivered = await new Promise((resolve) => {
    const aCh = athlete.channel('gym-set:tr_diego', { config: { private: true, broadcast: { self: false } } });
    const timer = setTimeout(() => resolve(false), 15000);
    aCh.on('broadcast', { event: 'athlete-set' }, ({ payload }) => {
      if (payload?.probe === 'expo-35') { clearTimeout(timer); resolve(true); }
    });
    aCh.subscribe(async (st) => {
      if (st !== 'SUBSCRIBED') return;
      const cCh = coach.channel('gym-set:tr_diego', { config: { private: true, broadcast: { self: false } } });
      cCh.subscribe(async (st2) => {
        if (st2 !== 'SUBSCRIBED') return;
        await new Promise(r => setTimeout(r, 400));
        cCh.send({ type: 'broadcast', event: 'athlete-set', payload: { probe: 'expo-35', traineeId: 'tr_diego' } });
      });
    });
  });
  console.log(`6. coach → athlete delivery ... ${delivered ? 'DELIVERED' : 'NOT DELIVERED'}  ${delivered ? 'PASS' : '**FAIL**'}`);

  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
