// Serve the morning recap on its OWN port, so it opens on localhost in Chrome.
//
// It cannot be served from the app's dev server: that origin registers a
// service worker whose navigation fallback returns index.html, so /_recap.html
// came back as the portal chooser even though the bytes were right. A separate
// port is a separate origin with no service worker, so the page is just the
// page.
//
//   node scripts/serve-recap.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.argv[2] || 4179);
const FILE = path.resolve('audit-out/recap.html');

if (!fs.existsSync(FILE)) {
  console.log('No recap yet. Build it first:  node scripts/build-recap.mjs');
  process.exit(1);
}

http.createServer((req, res) => {
  // One page, whatever the path - a recap has nothing else to serve, and this
  // way a stray /favicon.ico cannot 404 into the console.
  if (/favicon/.test(req.url || '')) { res.writeHead(204).end(); return; }
  const html = fs.readFileSync(FILE);          // re-read per request, so a
  res.writeHead(200, {                          // rebuild shows on refresh
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(html);
}).listen(PORT, '127.0.0.1', () => {
  const kb = (fs.statSync(FILE).size / 1048576).toFixed(1);
  console.log(`recap (${kb} MB) served at  http://127.0.0.1:${PORT}/`);
  console.log('re-run build-recap.mjs and refresh to update it.');
});
