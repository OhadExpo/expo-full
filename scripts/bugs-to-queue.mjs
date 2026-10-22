// EVERY BUG REPORT LANDS ON CLAUDE'S QUEUE (#887, Ohad 22.10: "bug report system needs be so much better, efficient,
// and self-solving"). The in-app report said "fix queued" and nothing queued anything: bug_reports was read only when
// someone opened /coach/bugs, and on 22.10 it held zero rows. The daemon runs this every 20 minutes:
//   - reads OPEN reports newer than the last run (owner seat, read-only on the table),
//   - groups them by fingerprint (an auto-captured error carries one; a typed report groups by its own text),
//   - appends ONE queue line per group to QUEUE-LIVE.md with a ready repro: route, seat, release, count, the trail of
//     what the user did, the first stack frame - so the next session starts from evidence, not from "what happened?",
//   - pushes Ohad's phone for a report a PERSON typed (auto-captured errors only go to the queue - no 3 a.m. noise).
// State (last seen created_at) lives beside the queue. Idempotent: a re-run with nothing new writes nothing.
//   node scripts/bugs-to-queue.mjs [--dry]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ownerClient } from './lib/store-client.mjs';
import { pushOwner } from './db-watchdog.mjs';

const DRY = process.argv.includes('--dry');
const QDIR = path.join(os.homedir(), 'expo-private-backups', 'queue');
const QUEUE = path.join(QDIR, 'QUEUE-LIVE.md');
const STATE = path.join(QDIR, '.bugs-to-queue.json');
const say = (m) => console.log(`[bugs-to-queue] ${m}`);

let state = { since: new Date(Date.now() - 7 * 86400000).toISOString() };
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { /* first run: the last 7 days */ }

const s = await ownerClient();
try {
  const { data: rows, error } = await s.from('bug_reports').select('id, created_at, status, role, reporter_email, url, description, context')
    .gt('created_at', state.since).neq('status', 'fixed').order('created_at', { ascending: true }).limit(200);
  if (error) { say(`read failed: ${error.message}`); process.exit(1); }
  if (!rows.length) { say('nothing new'); process.exit(0); }

  const groups = new Map();
  for (const r of rows) {
    const c = r.context || {};
    const key = c.fingerprint || `typed: ${String(r.description).replace(/\s+/g, ' ').slice(0, 120)}`;
    const g = groups.get(key) || { key, rows: [] }; g.rows.push(r); groups.set(key, g);
  }
  const stamp = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '.').replace(',', '');
  const lines = [];
  let typed = 0;
  for (const g of groups.values()) {
    const last = g.rows[g.rows.length - 1]; const c = last.context || {};
    const auto = c.auto === true;
    if (!auto) typed += 1;
    const route = String(last.url || '').replace(/^https?:\/\/[^/]+/, '') || '?';
    const seats = [...new Set(g.rows.map((r) => r.role || 'anon'))].join('/');
    const trail = (c.trail || []).slice(-8).map((t) => `${t.kind}:${t.what}`).join(' > ');
    const frame = String(c.stack || '').split('\n').find((l) => /\/assets\/|\/src\//.test(l)) || '';
    lines.push(`- [ ] BUG ${last.id.slice(0, 8)} (${stamp}, ${auto ? 'AUTO-CAPTURED' : 'REPORTED by a ' + seats}) x${g.rows.length} on ${route} - "${String(last.description).replace(/\s+/g, ' ').slice(0, 200)}" | release ${c.release || c.bundle || '?'} | ${c.viewport ? c.viewport.w + 'x' + c.viewport.h : '?'} ${c.theme || ''} ${c.locale || ''}${trail ? ` | trail: ${trail}` : ''}${frame ? ` | at ${frame.trim().slice(0, 160)}` : ''} | /coach/bugs, ids ${g.rows.map((r) => r.id.slice(0, 8)).join(',')}`);
  }
  say(`${rows.length} new report(s) in ${groups.size} group(s), ${typed} typed by a person`);
  if (DRY) { lines.forEach((l) => console.log(l)); process.exit(0); }
  fs.appendFileSync(QUEUE, `${lines.join('\n')}\n`);
  fs.writeFileSync(STATE, JSON.stringify({ since: rows[rows.length - 1].created_at, at: new Date().toISOString() }));
  if (typed) await pushOwner(say, 'EXPO: bug reported', `${typed} new report${typed === 1 ? '' : 's'} - queued for the next session. /coach/bugs`);
} finally {
  await s.auth.signOut({ scope: 'local' });
}
