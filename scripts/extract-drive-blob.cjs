// Decode a Drive MCP download (JSON with embedded base64 blob) to a real xlsx file.
// Usage: node scripts/extract-drive-blob.cjs <input.json> <output.xlsx>
const fs = require('fs');

const [,, src, dst] = process.argv;
if (!src || !dst) { console.error('usage: extract-drive-blob.cjs <input.json> <output.xlsx>'); process.exit(1); }

const text = fs.readFileSync(src, 'utf8');
// Blob is JSON-embedded: {"content":[{"embeddedResource":{"contents":{"blob":"...base64..."}}}]}
// Extract via streaming substring rather than JSON.parse to avoid loading multi-MB into a JS string then re-alloc.
const start = text.indexOf('"blob":"');
if (start < 0) { console.error('no blob field'); process.exit(1); }
const from = start + '"blob":"'.length;
const end = text.indexOf('"', from);
if (end < 0) { console.error('unterminated blob'); process.exit(1); }
const b64 = text.slice(from, end);
const buf = Buffer.from(b64, 'base64');
fs.writeFileSync(dst, buf);
console.log(`Wrote ${buf.length} bytes -> ${dst}`);
