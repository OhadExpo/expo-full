// Writes docs/row-coherence.md — every place where an exercise's NAME, its
// VIDEO and its NOTES disagree, at both plan-row and library level, with the
// evidence for each so Ohad can rule on it quickly.
const { execFileSync } = require('child_process');
const fs = require('fs');
const run = (f, args) => { try { return execFileSync('node', [f, ...args], { encoding: 'utf8', timeout: 600000 }); } catch (e) { return String(e.stdout || e.message); } };
const SP = process.argv[2] || '.';
const rows = run('scripts/audit-row-coherence.cjs', ['--json', SP + '/coherence.json']);
const libr = run('scripts/audit-library-cue-coherence.cjs', ['--json', SP + '/libcue.json']);
const F = JSON.parse(fs.readFileSync(SP + '/coherence.json', 'utf8'));
const md = [];
md.push('# Do the name, the video and the notes agree?\n');
md.push('Ohad: "go over every single exercise in every single block, any day, any row… make sure the note matches the url and both match the exercise name."\n');
md.push('This does not judge the text. It uses the library as a dictionary and asks a factual question: does this row\'s video (or its notes) belong to a DIFFERENT library exercise than its name does? Anything a clip or cue block shares with several exercises is ambiguous and never flagged, and pure phrasing differences ("Walking DB Lunge" vs "DB Walking Lunge") are excluded by token overlap.\n');
md.push('## Plan rows\n```\n' + rows.split('\n').slice(0, 12).join('\n') + '\n```\n');
const sec = (k, title) => {
  if (!F[k] || !F[k].length) return;
  md.push(`### ${title} (${F[k].length})\n`);
  F[k].forEach((x) => md.push('- ' + x.split('\n').map((l) => l.trim()).join(' — ')));
  md.push('');
};
sec('videoVsCueDisagree', 'The video and the notes describe different exercises');
sec('cueBelongsElsewhere', 'The NOTES are another exercise\'s cues');
sec('videoBelongsElsewhere', 'The VIDEO is another exercise\'s clip');
md.push('## Library\n```\n' + libr.split('\n').slice(0, 40).join('\n') + '\n```\n');
md.push('## Not auto-fixed, deliberately\n');
md.push('Cues are Ohad\'s writing. Rewriting them is his call, not a script\'s — so this reports and does not touch them.\n');
fs.writeFileSync('docs/row-coherence.md', md.join('\n'));
console.log('wrote docs/row-coherence.md');
