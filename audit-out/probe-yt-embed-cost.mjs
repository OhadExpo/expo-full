// What does ONE YouTube embed cost before the athlete taps anything, versus
// the tap-to-play facade? Measured in a bare page so no seat is touched and
// nothing is written. Same video id Yuval's block opens first.
//   node audit-out/probe-yt-embed-cost.mjs [videoId]
import P from 'puppeteer-core';
const ID = process.argv[2] || 'vdioRdJEZtk';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null });

async function cost(label, html) {
  const pg = await b.newPage();
  const cdp = await pg.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, t0: e.timestamp, bytes: 0 }));
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.t1 = e.timestamp; } });
  await pg.goto('about:blank');
  const t0 = Date.now();
  await pg.setContent(html);
  await wait(12000);
  const list = [...reqs.values()].filter((r) => !/^about:|^data:/.test(r.url));
  const done = list.filter((r) => r.t1);
  const span = done.length ? Math.round((Math.max(...done.map((r) => r.t1)) - Math.min(...list.map((r) => r.t0))) * 1000) : 0;
  const kb = Math.round(list.reduce((a, r) => a + r.bytes, 0) / 1024);
  const hosts = {};
  for (const r of list) { const h = new URL(r.url).hostname; hosts[h] = (hosts[h] || 0) + Math.round(r.bytes / 1024); }
  console.log(`${label.padEnd(8)} ${String(list.length).padStart(3)} requests  ${String(kb).padStart(5)} KB  last byte at +${span}ms   ${JSON.stringify(hosts)}`);
  await pg.close();
  void t0;
}
await cost('iframe', `<!doctype html><body style="margin:0;background:#000"><div style="width:390px;aspect-ratio:16/9"><iframe src="https://www.youtube.com/embed/${ID}" style="width:100%;height:100%;border:none" allowfullscreen></iframe></div></body>`);
await cost('facade', `<!doctype html><body style="margin:0;background:#000"><div style="width:390px;aspect-ratio:16/9"><img src="https://i.ytimg.com/vi/${ID}/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover"></div></body>`);
b.disconnect();
