// harvest-new-revisions: try the Drive API through the service account FIRST.
// The moment the sheet is shared with mcp-gsheets@…, the sync stops paying
// Google's ~10s-per-export pacing and gets exact per-revision timestamps; until
// then the browser path below runs exactly as before.
import fs from 'node:fs';
const f = 'scripts/harvest-new-revisions.mjs';
let s = fs.readFileSync(f, 'utf8');
const anchor = "// ---- newest revision id + timestamps (best effort) ----";
if (!s.includes(anchor)) throw new Error('anchor');
s = s.replace(anchor, `// ---- fast path: the Drive API, if the sheet is shared with the service account ----
try {
  const { saToken, listRevisions } = await import('./drive-sa.mjs');
  const token = await saToken();
  const revs = await listRevisions(ID, token);
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const known = fs.existsSync(REVS) ? JSON.parse(fs.readFileSync(REVS, 'utf8')) : [];
  const byRev = new Map(known.map((r) => [r.rev, r]));
  for (const r of revs) byRev.set(Number(r.id), { rev: Number(r.id), endMillis: Date.parse(r.modifiedDate), iso: r.modifiedDate, users: [r.lastModifyingUserName || ''], grouped: false, exact: true });
  fs.writeFileSync(REVS, JSON.stringify([...byRev.values()].sort((a, c) => a.rev - c.rev)));
  let got = 0;
  for (const r of revs) {
    const id = Number(r.id);
    if (id <= maxOnDisk || got >= CAP) continue;
    const link = r.exportLinks && r.exportLinks[XLSX];
    if (!link) continue;
    const res = await fetch(link, { headers: { authorization: \`Bearer \${token}\` } });
    if (!res.ok) { console.log(\`r\${id}: \${res.status}\`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 2).toString('latin1') !== 'PK') continue;
    fs.writeFileSync(path.join(DIR, \`r\${id}.xlsx\`), buf); got++;
  }
  console.log(\`drive api: \${revs.length} revisions listed (newest r\${revs[revs.length - 1]?.id}), \${got} new fetched\`);
  process.exit(0);
} catch (e) {
  console.log('drive api not available (' + String(e.message || e).slice(0, 80) + ') - using the browser');
}

${anchor}`);
fs.writeFileSync(f, s);
console.log('drive-first path added');
