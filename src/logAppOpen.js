// RECORD THAT SOMEONE OPENED THE APP.
//
// Ohad, 22.9, trying to reconstruct a player's missed lifts: "check on expo logs
// when did he use the app and fill it." There were no such logs.
//
// appendActivity() — the only usage trail EXPO had — is called from exactly one
// place, BhbcView, which is the club zone: a coach surface. So in the whole
// history of the product not one athlete open had ever been recorded. The list
// held 23 entries against a cap of 400, and every single author was the owner.
// The question could not be answered, and the sessions had to be inferred from
// what the rest of the squad did that day.
//
// This is the smallest thing that makes it answerable next time: one row per
// open, written by the client, readable by the coach.
//
// THROTTLED, because a tab switch or a refresh is not a new visit. One row per
// hour per device; the marker is per-origin localStorage, so two devices are
// two rows, which is the truth.
//
// The email comes from the SESSION, and the RLS policy re-derives it from the
// JWT rather than trusting the payload — nobody can write a team-mate's trail.
// Failure is silent on purpose: a logging insert must never be the reason an
// athlete cannot see their programme.
import { supabase } from './supabase';

const MARK = 'expo-app-open-mark';
const HOUR = 60 * 60 * 1000;

export async function logAppOpen(surface) {
  try {
    const last = Number(localStorage.getItem(MARK) || 0);
    if (Number.isFinite(last) && Date.now() - last < HOUR) return false;
  } catch (e) { /* private mode — fall through and log it */ }

  try {
    const { data } = await supabase.auth.getSession();
    const email = data?.session?.user?.email;
    if (!email) return false;
    await supabase.from('athlete_app_opens').insert({
      email,
      surface: surface || null,
      // 200 chars is what the lead-capture audit already keeps, and it is enough
      // to tell a phone from a desktop without storing a fingerprint.
      user_agent: String((typeof navigator !== 'undefined' && navigator.userAgent) || '').slice(0, 200),
    });
    try { localStorage.setItem(MARK, String(Date.now())); } catch (e) { /* private mode */ }
    return true;
  } catch (e) {
    return false;
  }
}

export default logAppOpen;
