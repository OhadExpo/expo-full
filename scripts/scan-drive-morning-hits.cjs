const fs = require('fs');
const files = [
  'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/1c46fd96-8594-42fc-94e1-e64bdaa15280/tool-results/mcp-claude_ai_Google_Drive-search_files-1777807804643.txt',
  'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/1c46fd96-8594-42fc-94e1-e64bdaa15280/tool-results/mcp-claude_ai_Google_Drive-search_files-1777807805549.txt',
];
const HITS = [
  /baby[\s-]?squat/i, /occipital/i, /forehead.*ball|wall.*ball.*slide|ball.*slide.*wall/i,
  /bear[\s-]?pos.*scap|scap.*protract.*retract.*bear/i, /prone.*deficit.*y[\s-]?raise/i,
  /iso.*prone.*t[\s-]?raise|prone.*t[\s-]?raise/i, /supine.*deficit.*external/i,
];
for (const fp of files) {
  console.log('\n===== ' + fp.split('/').pop() + ' =====');
  const raw = fs.readFileSync(fp, 'utf8');
  let json;
  try { json = JSON.parse(raw); } catch(e) { console.log('  NOT JSON'); continue; }
  for (const file of (json.files || [])) {
    const text = (file.contentSnippet || '') + ' | ' + (file.title || '');
    const matches = HITS.filter(re => re.test(text));
    if (matches.length === 0 && file.contentSnippet) continue;
    console.log('  · ' + file.title + '  (' + file.id + ')  modified=' + file.modifiedTime);
    if (matches.length) {
      console.log('     >> matches:', matches.map(r => r.source).join(' | '));
    }
  }
}
