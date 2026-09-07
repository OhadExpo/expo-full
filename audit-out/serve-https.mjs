// Serve dist/ over HTTPS on the LAN IP so the service worker actually
// registers (the app skips it on 127.0.0.1, and a browser refuses one over
// plain HTTP). Self-signed: pair it with a Chrome launched with
// --ignore-certificate-errors. SPA fallback like Vercel's.
//   node audit-out/serve-https.mjs [port]
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
const PORT = Number(process.argv[2] || 4443);
const ROOT = path.resolve('dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.txt': 'text/plain' };
https.createServer({ key: fs.readFileSync('audit-out/tls/key.pem'), cert: fs.readFileSync('audit-out/tls/cert.pem') }, (req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  let p = path.join(ROOT, u);
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    // Only a NAVIGATION falls back to the shell. A missing script or API path
    // (Vercel's /_vercel/insights beacon, /api/*) gets a 404 as it would on
    // Vercel; serving index.html there made the browser parse HTML as JS and
    // the athlete gate reported three phantom page errors.
    if (/\.[a-z0-9]{2,5}$/i.test(u) || /^\/(api|_vercel)\//.test(u)) { res.writeHead(404); res.end(); return; }
    p = path.join(ROOT, 'index.html');
  }
  const ext = path.extname(p).toLowerCase();
  const immutable = /\/assets\//.test(u);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'service-worker-allowed': '/' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, '0.0.0.0', () => console.log(`https://10.100.102.49:${PORT}  <- dist/ (self-signed)`));
