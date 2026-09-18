// WHO IS ACTUALLY USING THE CLUB ZONE, AND WHAT DID THEY CHANGE.
//
// Ohad, 17.9: "in bhbc: only for me: add another tab that allows me to see who
// logged in and when lately, and who updated what and when. so i know what
// coaches and pt's work with the app, and update it constantly".
//
// Two facts, one trail. Every entry is {at, by, kind, what}:
//   at    ISO timestamp of the ACTION, not of the session being logged — the
//         session rows already carry their own date, and reading those back as
//         activity would have said a coach "worked" on the day of the practice
//         he typed up a week later.
//   by    the signed-in person's email (the zone already threads `currentUser`
//         through every write for the `by` stamp on a session).
//   kind  'open' when someone enters the zone, otherwise the area touched.
//   what  one short line, already readable — no ids to resolve later.
//
// It lives in the shared `store` table under `expo-bhbc-activity`, so it
// inherits the same RLS as every other club key and needs no new table. The
// list is capped: this is a recent-activity feed, not an audit archive, and an
// unbounded array in a JSON blob would grow until it slowed every club load.
export const ACTIVITY_KEY = 'expo-bhbc-activity';
export const ACTIVITY_CAP = 400;

/** Newest first, capped, and never two identical lines from one person inside a minute. */
export function appendActivity(list, entry) {
  const now = entry.at || new Date().toISOString();
  const e = { at: now, by: entry.by || null, kind: entry.kind || 'edit', what: String(entry.what || '').slice(0, 160) };
  const prev = Array.isArray(list) ? list : [];
  // A zone that re-mounts (a tab switch, a refresh) must not print "opened the
  // club zone" five times in a row.
  const dup = prev.find((x) => x && x.by === e.by && x.kind === e.kind && x.what === e.what
    && Math.abs(new Date(now) - new Date(x.at)) < 60000);
  if (dup) return prev;
  return [e, ...prev].slice(0, ACTIVITY_CAP);
}

/** "today 14:32" / "yesterday 09:05" / "12 Sep 18:40" — the coach reads a time, not an ISO string. */
export function whenText(iso, he = false, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return (he ? 'היום' : 'today') + ' ' + hh;
  if (diff === 1) return (he ? 'אתמול' : 'yesterday') + ' ' + hh;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_HE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
  return d.getDate() + ' ' + (he ? MON_HE : MON)[d.getMonth()] + ' ' + hh;
}

/** The people seen in the window, newest first, with their last action. */
export function peopleSeen(list, days = 30, now = new Date()) {
  const cut = now.getTime() - days * 86400000;
  const seen = new Map();
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || !e.by) continue;
    const t = new Date(e.at).getTime();
    if (!(t >= cut)) continue;
    const cur = seen.get(e.by);
    if (!cur || t > cur.t) seen.set(e.by, { t, at: e.at, what: e.what, kind: e.kind, n: (cur ? cur.n : 0) + 1 });
    else cur.n += 1;
  }
  return [...seen.entries()].map(([by, v]) => ({ by, ...v })).sort((a, b) => b.t - a.t);
}
