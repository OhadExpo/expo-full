// A DRIFT THAT IS EXACTLY A MIGRATION HEALS ITSELF (#963, 23.10, Ohad: "Why is this not automatically fixed?" - the
// 20:40 page was a function added by a committed Phase B migration whose baseline nobody regenerated).
// The daemon runs this every 5 minutes. It reads the live policy / function / RLS manifest and the baseline in
// health_rls_baseline (both as the owner). When they differ, every difference must be explained by a migration file
// COMMITTED in this repo (git HEAD - a file on disk that was never committed explains nothing):
//   function / policy / table ADDED or CHANGED  ->  a committed migration that creates it
//   ... REMOVED                                  ->  a committed migration that drops it
// All explained -> the baseline is set to the live manifest, with the migration files named as the reason. Anything
// unexplained is left alone and logged: the health cron pages after 15 minutes, as a drift should.
//   node scripts/rls-drift-heal.mjs [--dry]
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerClient } from './lib/store-client.mjs';

const DRY = process.argv.includes('--dry');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// the same canonical form as api/cron/athlete-health.js and scripts/regen-rls-baseline.cjs - the hashes must agree
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function diffManifest(base, live) {
  const out = [];
  const index = (arr, keyFn) => new Map((arr || []).map((e) => [keyFn(e), stableStringify(e)]));
  const compare = (kind, b0, l0, keyFn) => {
    const b = index(b0, keyFn), l = index(l0, keyFn);
    for (const k of b.keys()) { if (!l.has(k)) out.push({ kind, op: 'REMOVED', key: k }); else if (l.get(k) !== b.get(k)) out.push({ kind, op: 'CHANGED', key: k }); }
    for (const k of l.keys()) if (!b.has(k)) out.push({ kind, op: 'ADDED', key: k });
  };
  compare('policy', base.policies, live.policies, (e) => `${e.s}.${e.t}.${e.p}`);
  compare('function', base.functions, live.functions, (e) => e.f);
  compare('rls', base.rls, live.rls, (e) => e.t);
  return out;
}
// every committed migration, lower-cased, with its file name
function committedMigrations() {
  const ls = spawnSync('git', ['ls-tree', '--name-only', 'HEAD', 'supabase/migrations/'], { cwd: REPO, encoding: 'utf8', windowsHide: true }).stdout || '';
  return ls.split('\n').filter((f) => f.endsWith('.sql')).map((f) => ({ file: path.basename(f), sql: (spawnSync('git', ['show', `HEAD:${f}`], { cwd: REPO, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 }).stdout || '').toLowerCase().replace(/"/g, '') }));
}
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function explain(d, migs) {
  const name = d.kind === 'function' ? d.key.split('(')[0] : d.kind === 'policy' ? d.key.split('.').slice(2).join('.') : d.key.split('.').pop();
  const table = d.kind === 'policy' ? d.key.split('.')[1] : null;
  // the policy's OWN schema (#973: three storage.objects policies paged him as 'not explained' - the pattern knew public. only)
  const schema = d.kind === 'policy' ? esc(String(d.key.split('.')[0] || 'public').toLowerCase()) : 'public';
  const n = esc(String(name).toLowerCase());
  const re = d.op === 'REMOVED'
    ? (d.kind === 'function' ? new RegExp(`drop\\s+function\\s+(if\\s+exists\\s+)?(public\\.)?${n}\\b`) : d.kind === 'policy' ? new RegExp(`drop\\s+policy\\s+(if\\s+exists\\s+)?${n}\\b`) : new RegExp(`drop\\s+table\\s+(if\\s+exists\\s+)?(public\\.)?${n}\\b`))
    : (d.kind === 'function' ? new RegExp(`function\\s+(public\\.)?${n}\\s*\\(`) : d.kind === 'policy' ? new RegExp(`policy\\s+${n}\\s+on\\s+(${schema}\\.)?${esc(String(table || '').toLowerCase())}\\b`) : new RegExp(`table\\s+(if\\s+not\\s+exists\\s+)?(public\\.)?${n}\\b`));
  const hit = migs.find((m) => re.test(m.sql));
  return hit ? hit.file : null;
}

const s = await ownerClient();
try {
  const [lv, bs] = await Promise.all([s.rpc('health_rls_manifest_owner'), s.rpc('health_rls_baseline_owner')]);
  if (lv.error || !lv.data) { console.log(`rls heal: no live manifest (${lv.error ? lv.error.message : 'null'})`); process.exit(0); }
  if (bs.error || !bs.data) { console.log(`rls heal: no database baseline yet (${bs.error ? bs.error.message : 'empty'}) - run regen-rls-baseline.cjs`); process.exit(0); }
  const live = lv.data;
  const liveHash = createHash('sha256').update(stableStringify(live)).digest('hex');
  if (liveHash === bs.data.hash) process.exit(0);   // in step: say nothing
  const diffs = diffManifest(bs.data.manifest, live);
  const migs = committedMigrations();
  const why = diffs.map((d) => ({ d, file: explain(d, migs) }));
  const lost = why.filter((w) => !w.file);
  const line = (w) => `${w.d.kind} ${w.d.op}: ${w.d.key}`;
  if (lost.length) {
    console.log(`rls heal: ${diffs.length} change(s), ${lost.length} NOT explained by a committed migration - left for the health page: ${lost.slice(0, 6).map(line).join(' | ')}`);
    process.exitCode = 1;
  } else {
    const files = [...new Set(why.map((w) => w.file))];
    const reason = `healer: ${diffs.length} change(s) explained by ${files.join(', ')} - ${why.slice(0, 6).map(line).join(' | ')}`.slice(0, 900);
    if (DRY) { console.log(`rls heal (dry): would accept - ${reason}`); process.exit(0); }
    const { error } = await s.rpc('health_rls_baseline_set', { p_hash: liveHash, p_manifest: live, p_reason: reason });
    console.log(error ? `rls heal: baseline write FAILED ${error.message}` : `rls heal: baseline accepted - ${reason}`);
    if (error) process.exitCode = 1;
  }
} finally {
  await s.auth.signOut({ scope: 'local' });
}
