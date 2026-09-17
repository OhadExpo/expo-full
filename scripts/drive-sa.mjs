// Google Drive through the gsheets service account (no browser, no throttle).
//
// The signed-in-Chrome export is paced by Google at ~10s per revision, which
// puts a 2,600-revision history at seven hours. The Drive API has no such
// pacing, and Drive v2's revisions.list returns, for a native Sheet, every
// revision WITH its modifiedDate and per-revision exportLinks - both the
// timestamp and the bytes in one place. The service account only needs the
// sheet shared with it as a viewer.
//
//   node scripts/drive-sa.mjs list <fileId>          revisions with dates
//   node scripts/drive-sa.mjs harvest <fileId> <dir> [max]   export every revision as xlsx
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'C:/Users/Administrator/.claude/secrets/gsheets-sa.json';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function saToken(scope = 'https://www.googleapis.com/auth/drive.readonly') {
  const k = JSON.parse(fs.readFileSync(KEY, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: k.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), k.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('token: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

export async function listRevisions(fileId, token) {
  const out = [];
  let pageToken = null;
  do {
    const u = new URL(`https://www.googleapis.com/drive/v2/files/${fileId}/revisions`);
    u.searchParams.set('maxResults', '1000');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const r = await fetch(u, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`revisions.list ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    out.push(...(j.items || []));
    pageToken = j.nextPageToken || null;
  } while (pageToken);
  return out;
}

const [cmd, fileId, dirArg, maxArg] = process.argv.slice(2);
if (cmd) {
  const token = await saToken();
  if (cmd === 'list') {
    const revs = await listRevisions(fileId, token);
    console.log(`${revs.length} revisions; first ${revs[0]?.id} ${revs[0]?.modifiedDate} · last ${revs[revs.length - 1]?.id} ${revs[revs.length - 1]?.modifiedDate}`);
    console.log('export link present:', !!(revs[0] && revs[0].exportLinks && revs[0].exportLinks[XLSX]));
    const out = process.env.OUT; if (out) fs.writeFileSync(out, JSON.stringify(revs.map((r) => ({ rev: Number(r.id), iso: r.modifiedDate, user: r.lastModifyingUserName || null })), null, 0));
  } else if (cmd === 'harvest') {
    const dir = path.resolve(dirArg || 'audit-out/sheets/rev');
    fs.mkdirSync(dir, { recursive: true });
    const revs = await listRevisions(fileId, token);
    const max = Number(maxArg || 1e9);
    let ok = 0, skip = 0, fail = 0, t = token, issued = Date.now();
    const t0 = Date.now();
    for (const rv of revs) {
      const id = Number(rv.id);
      if (id > max) continue;
      const f = path.join(dir, `r${id}.xlsx`);
      if (fs.existsSync(f)) { skip++; continue; }
      const link = rv.exportLinks && rv.exportLinks[XLSX];
      if (!link) { fail++; continue; }
      if (Date.now() - issued > 50 * 60 * 1000) { t = await saToken(); issued = Date.now(); }
      let r = await fetch(link, { headers: { authorization: `Bearer ${t}` } });
      if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 4000)); r = await fetch(link, { headers: { authorization: `Bearer ${t}` } }); }
      if (!r.ok) { fail++; console.log(`r${id}: ${r.status}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.subarray(0, 2).toString('latin1') !== 'PK') { fail++; continue; }
      fs.writeFileSync(f, buf); ok++;
      if (ok % 100 === 0) console.log(`  ${ok} fetched, ${((Date.now() - t0) / ok / 1000).toFixed(2)}s each`);
    }
    console.log(`done: ${ok} fetched, ${skip} already on disk, ${fail} failed, of ${revs.length} listed`);
  }
}
