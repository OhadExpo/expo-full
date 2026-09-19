// THE THREE PUBLIC PAGES WERE BEING SWEPT AS BLANKS.
//
// docs/SURFACES.md writes them as `/book/<slug>`, `/p/<token>` and
// `/sign/<token>`. Every gate builds its route list with a regex that stops at
// the `<`, so what they actually visited was `/book/`, `/p/` and `/sign/` -
// and each of those components begins `if (!slug) return;`. The page renders
// nothing, the gate finds no bad element, and it prints OK.
//
// That is the 18.9 failure again (a zero must say what it measured): three
// PUBLIC, unauthenticated surfaces - the ones a prospective client is sent to -
// have never once been measured, and every sweep said clean.
//
// So: resolve REAL targets from the database, and never visit the bare form.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Parsed by hand, no regex. This repo is driven from Git Bash, whose heredocs
// eat backslashes at every nesting level; a pattern written as \s that arrives
// as s matches nothing, and the helper then reports "not found" for a constant
// that is sitting right there. Measured twice on 19.9 before I stopped using
// regexes in files written from the shell.
const readConst = (name) => {
  const src = readFileSync('src/supabase.js', 'utf8');
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    const i = line.indexOf(name);
    if (i < 0) continue;
    const eq = line.indexOf('=', i + name.length);
    if (eq < 0) continue;
    const rest = line.slice(eq + 1).trim();
    const q = rest[0];
    if (q !== "'" && q !== '"') continue;
    const end = rest.indexOf(q, 1);
    if (end > 1) return rest.slice(1, end);
  }
  return null;
};

// The slug-less forms a manifest regex produces. Anything still in this list
// after substitution must be DROPPED, never visited bare.
export const BARE_PUBLIC = ['/book/', '/p/', '/sign/'];

export async function publicRouteTargets() {
  const out = { routes: [], skipped: [] };
  let s;
  try {
    const url = readConst('SUPA_URL') || readConst('SUPABASE_URL');
    const key = readConst('SUPA_PUBLISHABLE_KEY') || readConst('SUPABASE_ANON_KEY');
    if (!url || !key) { out.skipped.push('could not read the url/key out of src/supabase.js'); return out; }
    s = createClient(url, key);
    await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  } catch (e) {
    out.skipped.push('supabase unreachable: ' + String(e.message || e).slice(0, 80));
    return out;
  }

  const { data: bk } = await s.from('coach_booking_settings').select('slug').limit(1);
  if (bk && bk.length) out.routes.push('/book/' + bk[0].slug);
  else out.skipped.push('/book/<slug> - coach_booking_settings is EMPTY, so there is no booking page in existence to measure (that is revenue blocker 2, not a gate bug)');

  const { data: sh } = await s.from('program_shares').select('token').limit(1);
  if (sh && sh.length) out.routes.push('/p/' + sh[0].token);
  else out.skipped.push('/p/<token> - no program_shares row');

  // The contracts table has been renamed before, so probe instead of assuming.
  let signed = false;
  for (const t of ['athlete_contracts', 'coach_contracts', 'contracts']) {
    const { data, error } = await s.from(t).select('token').limit(1);
    if (!error && data && data.length) { out.routes.push('/sign/' + data[0].token); signed = true; break; }
  }
  if (!signed) out.skipped.push('/sign/<token> - no contract row in athlete_contracts / coach_contracts / contracts');

  return out;
}

// A route that paints almost nothing is not a clean route, it is an unmeasured
// one. Callers print this beside their zero.
export const MIN_RENDERED_CHARS = 120;
