// Extract EVERY finding + verify verdict from the platform-audit workflow
// journal into a durable markdown doc in the repo (Ohad's #1 rule: no
// information gets lost — the journal lives in a session-scoped folder).
// node scripts/_extract-audit-findings.mjs
import fs from 'fs';
import path from 'path';

const JOURNAL = process.argv[2] || 'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/1b998d45-0533-4d88-921c-50467a82acaf/subagents/workflows/wf_2c638fa6-63e/journal.jsonl';
const OUT = 'docs/platform-audit-2026-08-22.md';

const findings = []; const verdicts = [];
for (const line of fs.readFileSync(JOURNAL, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let d; try { d = JSON.parse(line); } catch { continue; }
  if (d.type !== 'result') continue;
  const r = d.result || d.value || {};
  if (Array.isArray(r.findings)) findings.push(...r.findings.map((f) => ({ ...f, agentId: d.agentId })));
  if (Array.isArray(r.verdicts)) verdicts.push(...r.verdicts);
}
const verdictOf = (title) => verdicts.find((v) => v.title === title) || null;

const bySev = { critical: 0, high: 1, medium: 2, low: 3 };
findings.sort((a, b) => (bySev[a.severity] ?? 9) - (bySev[b.severity] ?? 9) || String(a.file).localeCompare(String(b.file)));

const lines = [];
lines.push('# EXPO platform bug audit — 2026-08-22');
lines.push('');
lines.push('Durable extract of the 12-subsystem audit workflow (run `wf_2c638fa6-63e`). Every candidate finding below came from an agent that READ the cited file; a "verified" tag means an adversarial verifier re-traced it in code and could not refute it. Findings without a tag were never verified (the verify phase was cut short by session limits) — treat them as unconfirmed leads, not facts.');
lines.push('');
lines.push(`Totals: **${findings.length} findings**, ${verdicts.filter((v) => v.real).length} verified real, ${verdicts.filter((v) => !v.real).length} verified-and-refuted, ${findings.length - verdicts.length} unverified.`);
lines.push('');
const counts = {};
for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
lines.push(`By severity: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')}`);
lines.push('');
lines.push('> Fixed-and-deployed items are marked ✅ FIXED with the commit. See memory `project_platform_bug_audit_2026_08_22.md` for the resume plan.');
lines.push('');

let n = 0;
for (const f of findings) {
  n++;
  const v = verdictOf(f.title);
  const tag = v ? (v.real ? '**[VERIFIED REAL]**' : '**[REFUTED on verify]**') : '_[unverified]_';
  lines.push(`## ${n}. [${String(f.severity || '?').toUpperCase()}] ${f.title} ${tag}`);
  lines.push('');
  lines.push(`**Where:** \`${f.file}:${f.line}\``);
  lines.push('');
  lines.push(`**Evidence:** ${String(f.evidence || '').replace(/\n/g, ' ')}`);
  lines.push('');
  lines.push(`**Failure scenario:** ${String(f.scenario || '').replace(/\n/g, ' ')}`);
  lines.push('');
  if (f.fix) { lines.push(`**Proposed fix:** ${String(f.fix).replace(/\n/g, ' ')}`); lines.push(''); }
  if (v && v.why) { lines.push(`**Verifier:** ${String(v.why).replace(/\n/g, ' ')}`); lines.push(''); }
  lines.push('---');
  lines.push('');
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`wrote ${OUT} — ${findings.length} findings, ${verdicts.length} verdicts (${verdicts.filter((v) => v.real).length} real)`);
