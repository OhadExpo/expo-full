// A WORKOUT LEFT HALF-WAY GETS ONE NUDGE (16.10 #815, Ohad: "make sure people save the workout ... a notification").
//
// The logger mirrors a started workout to workout_drafts; saving the workout deletes the row (a trigger on
// client_workouts, so a workout finished offline or on another device clears it too). A row the server has not seen
// change for 3 hours is a workout he walked away from. This sends ONE push for it - "you stopped in the middle of
// Day A, it is saved, carry on where you left off" - and never twice for the same workout (resuming and leaving again
// does not re-nudge it).
//
// Rules: untouched 3h+ by the SERVER's clock (updated_at is stamped by a trigger, never by the phone), changed within
// the last 48h (an old one is history, not a reminder), not between 21:00 and 09:00 Israel time, never the sandbox seat
// (this reads public.workout_drafts only). The row is CLAIMED (nudged_at set where it is still null) before the push,
// so two runs can never both send. It goes to the person who logged it (by_email) - a couple shares one record.
// Runs from the daemon every 20 minutes; sends through /api/push/send as the owner (the path the coach's messages use).
//
//   node scripts/nudge-open-workouts.mjs            (dry run: prints who would get one, claims nothing)
//   node scripts/nudge-open-workouts.mjs --send
import { ownerClient, readStore } from './lib/store-client.mjs';

const SEND = process.argv.includes('--send');
// testing only: --only <client_id> limits it to one athlete, --any-hour lifts the quiet hours (both together, on the test client)
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const ANY_HOUR = process.argv.includes('--any-hour') && !!ONLY;
const IDLE_MS = 3 * 3600e3, MAX_AGE_MS = 48 * 3600e3;
const hourIL = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
if (SEND && !ANY_HOUR && (hourIL < 9 || hourIL >= 21)) { console.log(`open workouts: quiet hours (${hourIL}:00 in Israel) - nothing sent`); process.exit(0); }

const s = await ownerClient();
const now = Date.now();
const { data: rows, error } = await s.from('workout_drafts').select('id,client_id,plan_name,day_name,week,done_sets,total_sets,updated_at,by_email')
  .is('nudged_at', null).lt('updated_at', new Date(now - IDLE_MS).toISOString()).gt('updated_at', new Date(now - MAX_AGE_MS).toISOString());
if (error) { console.log('open workouts: read failed - ' + error.message); await s.auth.signOut({ scope: 'local' }); process.exit(1); }
if (ONLY) rows.splice(0, rows.length, ...rows.filter((r) => r.client_id === ONLY));
if (!rows.length) { await s.auth.signOut({ scope: 'local' }); process.exit(0); }

const trainees = (await readStore(s, 'expo-trainees')) || [];
// who gets it: the person who logged it; an older row without one falls back to the record's email when it has ONE
// (a couple's record with two is skipped - better no nudge than the partner's)
const emailsOf = (t) => [t.email, ...((t.members || []).map((m) => m && m.email))].flat().filter(Boolean).map((e) => String(e).trim().toLowerCase());
const emailOf = (r) => {
  const t = trainees.find((x) => x && x.id === String(r.client_id).replace(/__\d+$/, ''));
  if (!t) return null;
  // by_email is set by the server from the signed-in token; it must also be one of THIS athlete's own emails
  if (r.by_email) return emailsOf(t).includes(String(r.by_email).toLowerCase()) ? String(r.by_email).toLowerCase() : null;
  const e = Array.isArray(t.email) ? (t.email.length === 1 ? t.email[0] : null) : t.email;
  return String(e || '').trim().toLowerCase() || null;
};
const { data: sess } = await s.auth.getSession();
const token = sess && sess.session && sess.session.access_token;

const I = (x) => String.fromCharCode(0x2068) + x + String.fromCharCode(0x2069);   // a Latin day name / a number inside a Hebrew line
let sent = 0;
for (const r of rows) {
  const to = emailOf(r);
  const sets = r.done_sets > 0 ? ` (${I(r.done_sets + '/' + r.total_sets)} סטים)` : '';
  const body = `עצרת באמצע ${I(String(r.day_name || '').slice(0, 40))}${sets}. האימון שמור, אפשר להמשיך מאיפה שהפסקת.`;
  if (!SEND) { console.log(`would nudge ${r.client_id} (${to ? 'has an email' : 'NO EMAIL - would be closed unsent'}): ${body}`); continue; }
  // claim it first: only the run that flips nudged_at from null sends (a row with no email is closed the same way,
  // so it is not retried every 20 minutes)
  const { data: claimed } = await s.from('workout_drafts').update({ nudged_at: new Date().toISOString() }).eq('id', r.id).is('nudged_at', null).select('id');
  if (!claimed || !claimed.length) continue;
  if (!to) { console.log(`open workouts: no email for ${r.client_id} - closed unsent`); continue; }
  const res = await fetch('https://expo-app.co.il/api/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ toEmail: to, title: 'EXPO', body, url: '/athlete/program', tag: 'open-workout' }),
    signal: AbortSignal.timeout(15000),
  }).catch((e) => ({ ok: false, status: e.name || 'error' }));
  if (res.ok) sent++;
  console.log(`open workouts: ${r.client_id} ${r.day_name} -> push ${res.status}`);
}
if (SEND && sent) console.log(`open workouts: ${sent} nudge${sent === 1 ? '' : 's'} sent`);
await s.auth.signOut({ scope: 'local' });
