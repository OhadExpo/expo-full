// Revisions newer than the version-history panel lists (r2551+) have no
// timestamp, so their attendance events were dropped for want of a date.
// Extrapolate from the average spacing of the last 200 listed revisions,
// capped at now, and mark anything dated that way as low confidence.
import fs from 'node:fs';
const rep = (f, a, b, l) => { let s = fs.readFileSync(f, 'utf8'); const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); fs.writeFileSync(f, s.replace(a, b)); console.log('ok', l); };

rep('scripts/parse-roster-timeline.py',
`    def iso(rev):
        x = revs.get(rev)
        return x['iso'] if x else None`,
`    # Revisions above the newest listed one get an EXTRAPOLATED time: the
    # average spacing of the last 200 listed revisions, capped at now. Marked
    # approximate downstream (derive checks whether revisions.json has the id).
    known = sorted(revs)
    step_ms = None
    if len(known) > 200:
        a, b = revs[known[-200]], revs[known[-1]]
        step_ms = (b['endMillis'] - a['endMillis']) / 200.0
    now_ms = datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000

    def iso(rev):
        x = revs.get(rev)
        if x:
            return x['iso']
        if rev is None or not known or rev < known[-1] or step_ms is None:
            return None
        ms = min(now_ms, revs[known[-1]]['endMillis'] + (rev - known[-1]) * step_ms)
        return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')`, 'parser extrapolates');

rep('scripts/derive-payments.mjs',
`      out.sessions.push({ count: cur.total - prev.total, by: delta, between: [dateOf(prev.last_iso), dateOf(run.first_iso)], at_rev: run.first_rev, from: prev.text, to: cur.text });`,
`      out.sessions.push({ count: cur.total - prev.total, by: delta, between: [dateOf(prev.last_iso), dateOf(run.first_iso)], at_rev: run.first_rev, from: prev.text, to: cur.text, approx: !REVS[run.first_rev] });`, 'derive flags approx');

rep('scripts/import-revenue-timeline.mjs',
`      recorded_from: sess.between[0], recorded_to: sess.between[1], amount_method: 'attendance', confidence: sess.between[0] === sess.between[1] ? 'high' : 'medium',`,
`      recorded_from: sess.between[0], recorded_to: sess.between[1], amount_method: 'attendance', confidence: sess.approx ? 'low' : (sess.between[0] === sess.between[1] ? 'high' : 'medium'),`, 'import confidence');
