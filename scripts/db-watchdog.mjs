// THE DATABASE NEVER STAYS DOWN (4.10 #543). Ohad, after a 17-minute outage
// (10:47-11:04, an athlete in the middle of a workout): "no way shit like this
// ever happens" / "make sure shit like this is never open".
//
// What happened: the database ran out of its 60 connection slots (realtime kept
// asking for more under load); the API, sign-in and live updates all hung while
// Supabase's status page said everything was fine. A project restart fixed it.
//
// This watchdog runs inside the always-on daemon (sync-revenue-daemon.mjs) on the
// daemon host. Every minute it asks the database a trivial question through the
// public API. It acts ONLY on today's exact signature:
//   - the Supabase gateway answers (so this PC is online and Supabase is up), but
//   - a database-backed read does not answer in 12 s,
//   - for 3 checks in a row (3 minutes).
// Then it ALERTS Ohad (push to his phone, repeated every 5 minutes while down) and,
// when the database answers again, tells him how long it was down. It does NOT
// restart anything: an unattended restart of production is his decision (the
// auto-restart was refused by the safety review on 4.10). Logged to the daemon log.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';   // the public publishable key
const FAILS_TO_ACT = 3;

const timed = async (url, ms, opts = {}) => {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  const t0 = Date.now();
  try { const r = await fetch(url, { ...opts, signal: ctl.signal }); return { ok: true, status: r.status, ms: Date.now() - t0 }; }
  catch (e) { return { ok: false, err: e.name === 'AbortError' ? 'timeout' : (e.message || String(e)), ms: Date.now() - t0 }; }
  finally { clearTimeout(t); }
};

// gateway up + db down = act; gateway down = this PC or Supabase is offline = do nothing
export async function probeOnce() {
  const gate = await timed(`${SB}/rest/v1/`, 8000, { headers: { apikey: KEY } });
  const db = await timed(`${SB}/rest/v1/store?select=key&limit=1`, 12000, { headers: { apikey: KEY } });
  const dbOk = db.ok && db.status >= 200 && db.status < 300;
  return { gatewayUp: gate.ok, dbOk, detail: `gateway ${gate.ok ? gate.status : gate.err} ${gate.ms}ms · db ${db.ok ? db.status : db.err} ${db.ms}ms` };
}

export async function pushOwner(say, title, body) {
  try {
    const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.owner.local');
    const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
    const { createClient } = await import('@supabase/supabase-js');
    const s = createClient(SB, KEY, { auth: { persistSession: false } });
    const { data, error } = await s.auth.signInWithPassword({ email: env.EXPO_OWNER_EMAIL, password: env.EXPO_OWNER_PW });
    if (error) { say('watchdog: push sign-in failed - ' + error.message); return; }
    const r = await timed('https://expo-app.co.il/api/push/send', 15000, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ toEmail: env.EXPO_OWNER_EMAIL, title, body, url: '/coach/dashboard', tag: 'db-watchdog' }) });
    say(`watchdog: push to owner -> ${r.ok ? r.status : r.err}`);
    await s.auth.signOut({ scope: 'local' });   // LOCAL only - a bare signOut logs him out everywhere
  } catch (e) { say('watchdog: push failed - ' + (e.message || e)); }
}

export function startDbWatch(say, stateFile, deps = {}) {
  const probe = deps.probe || probeOnce, push = deps.push || pushOwner, now = deps.now || (() => Date.now());
  const load = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } };
  const save = (st) => { try { fs.writeFileSync(stateFile, JSON.stringify(st)); } catch { /* best effort */ } };
  let fails = 0, downSince = 0, busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      const p = await probe();
      if (p.dbOk) {
        if (fails > 0) say(`watchdog: database answering again (${p.detail})`);
        const st = load();
        if (st.pendingNotice) {
          const mins = Math.round((now() - st.pendingNotice.downSince) / 60000);
          await push(say, 'EXPO: database was down', `The database stopped answering at ${st.pendingNotice.at} for ~${mins} min; it is answering again now.`);
          delete st.pendingNotice; save(st);
        }
        fails = 0; downSince = 0;
        return;
      }
      if (!p.gatewayUp) { say(`watchdog: gateway unreachable - this PC or Supabase is offline, not acting (${p.detail})`); return; }
      fails++; if (!downSince) downSince = now();
      say(`watchdog: database NOT answering ${fails}/${FAILS_TO_ACT} (${p.detail})`);
      const st = load();
      if (!st.pendingNotice) { st.pendingNotice = { downSince, at: new Date(downSince).toTimeString().slice(0, 5) }; save(st); }
      if (fails === FAILS_TO_ACT) {
        // tell him NOW (the push service lives on Vercel; it may not reach his
        // phone while the database is down - it is retried every minute below)
        await push(say, 'EXPO: database is not answering', `Since ${st.pendingNotice.at} - ${fails} minutes. Supabase dashboard -> Project Settings -> Restart project.`);
      } else if (fails > FAILS_TO_ACT && fails % 5 === 0) {
        await push(say, 'EXPO: database still down', `Down since ${st.pendingNotice.at} (${fails} min). Restart it from the Supabase dashboard.`);
      }
    } catch (e) { say('watchdog: tick error ' + (e.message || e)); }
    finally { busy = false; }
  };
  if (deps.manual) return tick;   // tests drive the ticks
  setInterval(tick, 60 * 1000);
  tick();
  say('watchdog: started (probe every 60 s; after 3 straight minutes of a down database it alerts Ohad - it never restarts anything itself)');
}
