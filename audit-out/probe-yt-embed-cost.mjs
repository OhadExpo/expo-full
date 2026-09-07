// What does ONE YouTube embed cost before the athlete taps anything, versus
// the tap-to-play facade? Measured in a bare page so no seat is touched and
// nothing is written. Same video id Diego's block opens first.
//
// Page-level request events, not a top-frame CDP session: the YouTube iframe
// runs in its own renderer and a CDP session on the top frame never sees a
// byte of it (the first version of this probe reported "1 request, 0 KB" for
// the whole player). Sizes are decoded body bytes - an upper bound on the
// wire - because that is what the response exposes across a frame boundary.
//   node audit-out/probe-yt-embed-cost.mjs [videoId]
import P from 'puppeteer-core';
const ID = process.argv[2] || 'KGyVfgh0fhk';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null });

async function cost(label, html) {
  const pg = await b.newPage();
  const cdp = await pg.target().createCDPSession();
  await cdp.send('Network.clearBrowserCache');
  const list = [];
  const t0 = Date.now();
  pg.on('requestfinished', async (req) => {
    const url = req.url();
    if (/^(about|data):/.test(url)) return;
    let bytes = 0;
    try { const res = req.response(); if (res) { const cl = Number(res.headers()['content-length']); bytes = Number.isFinite(cl) && cl > 0 ? cl : (await res.buffer()).length; } } catch { /* opaque */ }
    list.push({ url, bytes, at: Date.now() - t0, type: req.resourceType() });
  });
  await pg.goto('about:blank');
  await pg.setContent(html);
  await wait(12000);
  const kb = Math.round(list.reduce((a, r) => a + r.bytes, 0) / 1024);
  const last = list.length ? Math.max(...list.map((r) => r.at)) : 0;
  const hosts = {};
  for (const r of list) { let h = 'other'; try { h = new URL(r.url).hostname; } catch { /* ignore */ } hosts[h] = (hosts[h] || 0) + Math.round(r.bytes / 1024); }
  console.log(`${label.padEnd(8)} ${String(list.length).padStart(3)} requests  ${String(kb).padStart(5)} KB (decoded)  last byte at +${last}ms   ${JSON.stringify(hosts)}`);
  await pg.close();
  return { label, requests: list.length, kb, lastMs: last, hosts };
}
const a = await cost('iframe', `<!doctype html><body style="margin:0;background:#000"><div style="width:390px;aspect-ratio:16/9"><iframe src="https://www.youtube.com/embed/${ID}" style="width:100%;height:100%;border:none" allowfullscreen></iframe></div></body>`);
const c = await cost('facade', `<!doctype html><body style="margin:0;background:#000"><div style="width:390px;aspect-ratio:16/9"><img src="https://i.ytimg.com/vi/${ID}/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover"></div></body>`);
const fs = await import('node:fs');
fs.mkdirSync('audit-out/perf', { recursive: true });
fs.writeFileSync('audit-out/perf/yt-embed-cost.json', JSON.stringify({ id: ID, at: new Date().toISOString(), iframe: a, facade: c }, null, 2));
b.disconnect();
