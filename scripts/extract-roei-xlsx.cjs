const fs = require('fs');
const path = require('path');

const IN = 'C:\\Users\\Administrator\\.claude\\projects\\C--Users-Administrator-Desktop-expo-full\\7c5ab13f-afac-4e6c-b5c4-a21aef304b84\\tool-results\\mcp-claude_ai_Google_Drive-download_file_content-1776621415755.txt';
const OUT = path.join(__dirname, '..', 'roei-sheet.xlsx');

const raw = fs.readFileSync(IN, 'utf8');
const parsed = JSON.parse(raw);
const blocks = parsed.content || [];
console.log('content blocks:', blocks.length);
console.log('first block keys:', Object.keys(blocks[0] || {}));

// Usually MCP returns something like { type:'resource'|'text'|'image', data|text|blob, mimeType }
for (const b of blocks) {
  if (b.type === 'image' || b.mimeType || b.data || b.blob) {
    console.log('  type:', b.type, 'mimeType:', b.mimeType, 'has data:', !!b.data, 'has blob:', !!b.blob, 'has text:', !!b.text);
  }
}

const b0 = blocks[0] || {};
console.log('embeddedResource keys:', Object.keys(b0.embeddedResource || {}));
const er = b0.embeddedResource || {};
console.log('embeddedResource.resource keys:', Object.keys(er.resource || {}));
console.log('er sample:', JSON.stringify(er).slice(0, 300));

const data = (er.contents && er.contents.blob) || er.blob || (er.resource && er.resource.blob) || er.data;
if (data) {
  const buf = Buffer.from(data, 'base64');
  fs.writeFileSync(OUT, buf);
  console.log('Wrote', OUT, 'size=', buf.length);
}
