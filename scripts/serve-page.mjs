// Serve one page of my own making on its own port, with the app's fonts.
//
// Own port on purpose: the app's dev-server origin registers a service worker
// whose navigation fallback returns index.html, so a page served from there
// comes back as the portal chooser even when the bytes on disk are right.
//
//   node scripts/serve-page.mjs audit-out/bhbc-replan.html 4180
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(process.argv[2] || 'audit-out/bhbc-replan.html');
const PORT = Number(process.argv[3] || 4180);
if (!fs.existsSync(FILE)) { console.log('no such page: ' + FILE); process.exit(1); }

const TYPES = { '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css' };

http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (/favicon/.test(url)) { res.writeHead(204).end(); return; }
  // Fonts and images come out of public/ so the page looks like the product.
  if (url !== '/' && !url.endsWith('.html')) {
    const p = path.resolve('public' + url);
    if (p.startsWith(path.resolve('public')) && fs.existsSync(p) && fs.statSync(p).isFile()) {
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(fs.readFileSync(p));
      return;
    }
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(FILE));            // re-read per request: rebuild, refresh
}).listen(PORT, '127.0.0.1', () => {
  console.log(`${path.basename(FILE)} served at  http://127.0.0.1:${PORT}/`);
});
