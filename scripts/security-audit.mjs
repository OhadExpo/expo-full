// SECURITY AUDIT — one runner, many named checks.
//
// Ohad, 17.9: "45-50 full audits and fixes for security. make all of our
// platforms bulletproof for bugs, hacks, mistakes, and breakdown. keep our
// stuff private and perfect."
//
// Every check is named, independent, and prints PASS / FAIL with the evidence
// that decided it. Static checks read the source and the built bundle; the
// anon checks talk to the live REST API with nothing but the publishable key,
// which is exactly what an attacker has. Deeper seat-by-seat RLS lives in the
// existing gates (verify-revenue-private, verify-athlete-no-backend,
// verify-pt-no-backend, verify-bhbc-write-scope, verify-shared-device) and this
// runner calls them so one command covers the ground.
//
//   node scripts/security-audit.mjs            # static + anon
//   node scripts/security-audit.mjs --gates    # also run the seat gates (slow)
//   node scripts/security-audit.mjs --static   # no network — this runs in the build
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const ANON = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const results = [];
const check = (id, title, fn) => results.push({ id, title, fn });

// ---------- helpers ----------
const readDir = (dir, exts) => {
  const out = [];
  const walk = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.git|dist|coverage/.test(e.name)) walk(p); }
      else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
    }
  };
  walk(dir);
  return out;
};
const SRC = () => readDir(path.join(ROOT, 'src'), ['.js', '.jsx']);
const SITE = () => readDir(path.join(ROOT, 'expo-il', 'src'), ['.js', '.jsx']);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
// A finding has to be CODE. A comment describing a hazard is not the hazard,
// and an audit that cannot tell them apart trains you to ignore it — so
// comments are blanked (length-preserving, so line numbers stay true).
const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const grepFiles = (files, re, opts) => {
  const raw = !!(opts && opts.raw);
  const hits = [];
  for (const f of files) {
    let t = '';
    try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const body = raw ? t : stripComments(t);
    body.split('\n').forEach((line, i) => { if (re.test(line)) hits.push(rel(f) + ':' + (i + 1) + '  ' + line.trim().slice(0, 120)); });
  }
  return hits;
};
// The Hebrew dictionary is data, not code: it necessarily holds the WORD
// "password" as a key to be translated.
const SRC_NO_DICT = () => SRC().filter((f) => !/[\\/](i18n|bhbcHe|shotI18n)\.js$/.test(f));
const distFiles = () => readDir(path.join(ROOT, 'dist'), ['.js', '.mjs', '.html', '.json']);
const vercel = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const headerMap = (cfg) => Object.fromEntries(((cfg.headers && cfg.headers[0] && cfg.headers[0].headers) || []).map((h) => [h.key.toLowerCase(), h.value]));
const anon = async (pathname, init = {}) => {
  const r = await fetch(SUPA_URL + '/rest/v1/' + pathname, {
    ...init,
    headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  let body = null;
  try { body = await r.json(); } catch { /* empty body */ }
  return { status: r.status, body };
};
// "Denied" for an anon read = an error status, or an empty set (RLS filtered it).
const anonReadDenied = async (table) => {
  const { status, body } = await anon(table + '?select=*&limit=3');
  if (status >= 400) return { ok: true, why: 'HTTP ' + status + ' ' + ((body && body.code) || '') };
  if (Array.isArray(body) && body.length === 0) return { ok: true, why: 'HTTP 200, 0 rows (RLS filtered)' };
  return { ok: false, why: 'HTTP ' + status + ' returned ' + (Array.isArray(body) ? body.length : '?') + ' row(s): ' + JSON.stringify(body).slice(0, 160) };
};
const anonWriteDenied = async (table, row) => {
  const { status, body } = await anon(table, { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } });
  if (status >= 400) return { ok: true, why: 'HTTP ' + status + ' ' + ((body && body.code) || '') };
  return { ok: false, why: 'HTTP ' + status + ' WROTE A ROW: ' + JSON.stringify(body).slice(0, 160) };
};

// ---------- secrets, keys and the built bundle ----------
check('S01', 'no service_role key anywhere in src/', () => {
  const h = grepFiles(SRC(), /service_role/);
  return { ok: h.length === 0, why: h.length ? h.join('\n') : 'none' };
});
check('S02', 'no service_role key in the built bundle', () => {
  const h = grepFiles(distFiles(), /service_role/);
  return { ok: h.length === 0, why: h.length ? h.slice(0, 3).join('\n') : 'dist clean' };
});
check('S03', 'the shipped Supabase key is a publishable key, not a JWT', () => {
  const t = fs.readFileSync(path.join(ROOT, 'src', 'supabase.js'), 'utf8');
  const jwt = /eyJ[A-Za-z0-9_-]{20,}\./.test(t);
  return { ok: !jwt && /sb_publishable_/.test(t), why: jwt ? 'a JWT-shaped key is in the client' : 'sb_publishable_' };
});
check('S04', 'no private keys or provider secrets in the bundle', () => {
  const h = grepFiles(distFiles(), /BEGIN (RSA |EC )?PRIVATE KEY|sk-[A-Za-z0-9]{24,}|xoxb-[0-9A-Za-z-]{10,}|AKIA[0-9A-Z]{16}/);
  return { ok: h.length === 0, why: h.length ? h.slice(0, 3).join('\n') : 'none' };
});
check('S05', '.env files are not tracked by git', () => {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  const bad = out.split('\n').filter((f) => /(^|\/)\.env(\.|$)/.test(f));
  return { ok: bad.length === 0, why: bad.length ? bad.join(', ') : 'none tracked' };
});
check('S06', 'no password literal in shipped source', () => {
  const h = grepFiles(SRC_NO_DICT(), /password\s*[:=]\s*['"][^'"]{3,}['"]/i)
    .filter((l) => !/placeholder|type=|autoComplete|'password'|"password"/i.test(l));
  return { ok: h.length === 0, why: h.length ? h.join('\n') : 'none' };
});
check('S07', 'no eval() or new Function() in shipped source', () => {
  const h = grepFiles([...SRC(), ...SITE()], /(^|[^.\w])eval\s*\(|new\s+Function\s*\(/);
  return { ok: h.length === 0, why: h.length ? h.join('\n') : 'none' };
});
// The only allowed raw-HTML write is the marketing site's JSON-LD block, and
// only while it escapes the three characters that could close the tag. Any
// other use, or that one without the escape, is a finding.
check('S08', 'raw HTML is written only as escaped JSON-LD', () => {
  const h = grepFiles([...SRC(), ...SITE()], /dangerouslySetInnerHTML/);
  const bad = h.filter((l) => !(/JSON\.stringify/.test(l) && /u003c/.test(l) && /u003e/.test(l)));
  return { ok: bad.length === 0, why: bad.length ? bad.join('\n') : (h.length ? h.length + ' escaped JSON-LD block(s), nothing else' : 'none') };
});
check('S09', 'no javascript: or data: URL literal in an href', () => {
  const h = grepFiles([...SRC(), ...SITE()], /href\s*=\s*["'`]\s*(javascript|data):/i);
  return { ok: h.length === 0, why: h.length ? h.join('\n') : 'none' };
});
check('S10', 'every target="_blank" carries rel=noopener', () => {
  const bad = [];
  for (const f of [...SRC(), ...SITE()]) {
    const t = fs.readFileSync(f, 'utf8');
    const re = /<a\b[^>]*target\s*=\s*["'{]?_blank[^>]*>/g;
    let m;
    while ((m = re.exec(t))) { if (!/rel\s*=\s*["'][^"']*noopener/.test(m[0])) bad.push(rel(f) + '  ' + m[0].slice(0, 110)); }
  }
  return { ok: bad.length === 0, why: bad.length ? bad.join('\n') : 'all tagged' };
});
check('S11', 'no postMessage to a wildcard origin', () => {
  const h = grepFiles([...SRC(), ...SITE()], /postMessage\s*\([^)]*,\s*['"`]\*['"`]/);
  return { ok: h.length === 0, why: h.length ? h.join('\n') : 'none' };
});
check('S12', 'no plaintext http:// endpoint in shipped source', () => {
  const h = grepFiles([...SRC(), ...SITE()], /["'`]http:\/\/(?!localhost|127\.0\.0\.1)/);
  return { ok: h.length === 0, why: h.length ? h.join('\n') : 'none' };
});
check('S13', 'no Math.random() minting a token or secret', () => {
  const h = grepFiles(SRC(), /(token|secret|nonce)\w*\s*=\s*[^;\n]*Math\.random/i);
  return { ok: h.length === 0, why: h.length ? h.join('\n') : 'none' };
});
check('S14', 'the URL sanitiser exists for external hrefs', () => {
  const t = fs.readFileSync(path.join(ROOT, 'src', 'VideoEmbed.jsx'), 'utf8');
  const ok = /export const safeUrl/.test(t);
  return { ok, why: ok ? 'safeUrl exported' : 'safeUrl missing' };
});

// ---------- transport, headers, CSP ----------
check('S15', 'HSTS is set with a long max-age', () => {
  const h = headerMap(vercel())['strict-transport-security'] || '';
  return { ok: /max-age=\d{7,}/.test(h), why: h || 'missing' };
});
check('S16', 'X-Content-Type-Options: nosniff', () => {
  const h = headerMap(vercel())['x-content-type-options'] || '';
  return { ok: h === 'nosniff', why: h || 'missing' };
});
check('S17', 'clickjacking is blocked (X-Frame-Options + frame-ancestors)', () => {
  const m = headerMap(vercel());
  const xfo = m['x-frame-options'] || '';
  const csp = m['content-security-policy'] || '';
  const fa = /frame-ancestors ([^;]+)/.exec(csp);
  return { ok: /SAMEORIGIN|DENY/i.test(xfo) && !!fa, why: xfo + ' | frame-ancestors ' + ((fa && fa[1]) || 'missing') };
});
check('S18', 'Referrer-Policy does not leak full URLs cross-origin', () => {
  const h = headerMap(vercel())['referrer-policy'] || '';
  return { ok: /strict-origin|no-referrer|same-origin/.test(h), why: h || 'missing' };
});
check('S19', 'CSP script-src has no unsafe-inline / unsafe-eval', () => {
  const csp = headerMap(vercel())['content-security-policy'] || '';
  const s = (/script-src ([^;]+)/.exec(csp) || [])[1] || '';
  const bad = /'unsafe-inline'|'unsafe-eval'/.test(s);
  return { ok: !!s && !bad, why: s || 'script-src missing' };
});
check('S20', "CSP pins object-src 'none' and base-uri 'self'", () => {
  const csp = headerMap(vercel())['content-security-policy'] || '';
  return { ok: /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp), why: csp ? 'checked' : 'no CSP' };
});
check('S21', 'CSP connect-src is an allow-list, not *', () => {
  const csp = headerMap(vercel())['content-security-policy'] || '';
  const c = (/connect-src ([^;]+)/.exec(csp) || [])[1] || '';
  return { ok: !!c && !/\*(\s|$)/.test(c), why: c || 'missing' };
});
check('S22', 'the marketing site carries the same header set', () => {
  const p = path.join(ROOT, 'expo-il', 'vercel.json');
  if (!fs.existsSync(p)) return { ok: false, why: 'expo-il/vercel.json missing' };
  const m = headerMap(JSON.parse(fs.readFileSync(p, 'utf8')));
  const need = ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy'];
  const missing = need.filter((k) => !m[k]);
  return { ok: missing.length === 0, why: missing.length ? 'missing: ' + missing.join(', ') : 'all present' };
});

// ---------- privacy of the repo and of the device ----------
check('S23', 'the public repo tracks no athlete data backup', () => {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const bad = out.filter((f) => /backup.*\.json$|_backup|expo-trainees.*\.json$/i.test(f));
  return { ok: bad.length === 0, why: bad.length ? bad.slice(0, 5).join(', ') : 'none tracked' };
});
check('S24', 'no console log of a session, token or password', () => {
  // A message that merely contains the word is fine; a VARIABLE is not.
  const h = grepFiles(SRC(), /console\.(log|info|warn|error)\([^)]*[^'"`\w](session|access_token|refresh_token|password)\s*[,)\.]/i);
  return { ok: h.length === 0, why: h.length ? h.join('\n') : 'none' };
});
// Google's tokeninfo endpoint takes the token as a query parameter and offers
// no header form; that is Google's own short-lived token going to Google over
// TLS, and it is excluded on purpose. What must never happen is OUR Supabase
// session turning up in a URL.
check('S25', 'no Supabase session token is ever put into a URL', () => {
  const h = grepFiles(SRC(), /[?&](access_token|refresh_token|apikey)=\$\{/)
    .filter((l) => !/oauth2\.googleapis\.com|googleapis\.com\/oauth2/.test(l));
  return { ok: h.length === 0, why: h.length ? h.join('\n') : 'none' };
});
check('S26', 'sign-out purges the device BEFORE the network call', () => {
  const t = stripComments(fs.readFileSync(path.join(ROOT, 'src', 'auth.jsx'), 'utf8'));
  const i = t.indexOf('const signOut');
  const seg = t.slice(i, i + 2400);
  const purge = seg.indexOf('purgeLocalCaches()');
  const net = seg.indexOf('supabase.auth.signOut()');
  return { ok: purge > -1 && net > -1 && purge < net, why: (purge > -1 && purge < net) ? 'purge precedes the round trip' : 'the network call runs first' };
});
check('S27', 'personal snapshots are latched off while signed out', () => {
  const t = fs.readFileSync(path.join(ROOT, 'src', 'auth.jsx'), 'utf8');
  return { ok: /setSnapshotsAllowed\(!!s\)/.test(t) && /setSnapshotsAllowed\(false\)/.test(t), why: 'setSnapshotsAllowed both ways' };
});
check('S28', 'the service worker caches no Supabase response', () => {
  const p = path.join(ROOT, 'src', 'sw.js');
  if (!fs.existsSync(p)) return { ok: true, why: 'no custom sw.js' };
  const t = fs.readFileSync(p, 'utf8');
  const caches = /supabase\.co[^\n]*cache|CacheFirst[^\n]*supabase|StaleWhileRevalidate[^\n]*supabase/i.test(t);
  return { ok: !caches, why: caches ? 'a Supabase route is cached' : 'no Supabase route cached' };
});
check('S29', 'uploads are size-guarded before they leave the device', () => {
  const h = grepFiles(SRC(), /\.size\s*>\s*\d|MAX_(FILE|UPLOAD|CLIP)/i);
  return { ok: h.length > 0, why: h.length ? h.length + ' size guard(s)' : 'no size guard found' };
});
check('S30', 'copy-guard is still installed site-wide', () => {
  const p = path.join(ROOT, 'src', 'copyGuard.js');
  return { ok: fs.existsSync(p), why: fs.existsSync(p) ? 'copyGuard.js present' : 'missing' };
});

// ---------- the live API with nothing but the public key ----------
const staticOnly = process.argv.includes('--static');
const PRIVATE_TABLES = staticOnly ? [] : ['trainees', 'plans', 'client_workouts', 'store', 'coach_notes',
  'revenue_sheet_event', 'revenue_month_total', 'bit_payment_requests', 'bhbc_medical',
  'bhbc_roster', 'bhbc_loads', 'form_videos'];
PRIVATE_TABLES.forEach((t, i) => {
  check('A' + String(i + 1).padStart(2, '0'), 'anon cannot read ' + t, () => anonReadDenied(t));
});
if (!staticOnly) {
  check('A13', 'anon cannot insert a trainee', () => anonWriteDenied('trainees', { name: '__sec_audit__' }));
  check('A14', 'anon cannot insert into store', () => anonWriteDenied('store', { key: '__sec_audit__', value: {} }));
  check('A15', 'anon cannot reach auth users through a view', async () => {
    const { status, body } = await anon('users?select=*&limit=1');
    return { ok: status >= 400, why: 'HTTP ' + status + ' ' + JSON.stringify(body).slice(0, 120) };
  });
}

// ---------- the seat gates that already exist ----------
const GATES = [
  ['G01', 'revenue tables are invisible from five seats', 'verify-revenue-private.mjs'],
  ['G02', 'the athlete seat has no back-end reach', 'verify-athlete-no-backend.mjs'],
  ['G03', 'the club PT seat has no back-end reach', 'verify-pt-no-backend.mjs'],
  ['G04', 'club coaches write only inside their scope', 'verify-bhbc-write-scope.mjs'],
  ['G05', 'a shared device leaves nothing behind', 'verify-shared-device.mjs'],
];
const runGates = process.argv.includes('--gates');
for (const [id, title, file] of GATES) {
  check(id, title, () => {
    if (!runGates) return { skip: true, why: 'pass --gates to run (slow, needs the browser)' };
    if (!fs.existsSync(path.join(ROOT, 'scripts', file))) return { ok: false, why: file + ' is missing' };
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', file)], { cwd: ROOT, stdio: 'pipe', timeout: 900000 });
      return { ok: true, why: 'gate passed' };
    } catch (e) {
      return { ok: false, why: String(e.stdout || e.message).split('\n').slice(-6).join(' | ').slice(0, 300) };
    }
  });
}

// ---------- run ----------
let pass = 0; let fail = 0; let skip = 0;
const failures = [];
console.log('SECURITY AUDIT — ' + results.length + ' checks\n');
for (const { id, title, fn } of results) {
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, why: 'threw: ' + String(e.message || e).slice(0, 160) }; }
  if (r.skip) { skip++; console.log('  SKIP  ' + id + '  ' + title + '  — ' + r.why); continue; }
  if (r.ok) { pass++; console.log('  PASS  ' + id + '  ' + title); }
  else { fail++; failures.push(id + '  ' + title + '\n        ' + r.why); console.log('  FAIL  ' + id + '  ' + title + '\n        ' + r.why); }
}
console.log('\n' + pass + ' passed · ' + fail + ' failed · ' + skip + ' skipped  (of ' + results.length + ')');
process.exit(fail ? 1 : 0);
