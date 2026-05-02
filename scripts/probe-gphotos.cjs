// Probe a Google Photos share page to see if we can extract a direct media URL.
// Tries https://photos.app.goo.gl/<id> → follows redirects → reads HTML.
const URL_TO_PROBE = process.argv[2] || 'https://photos.app.goo.gl/e8YpU45PvYc5D51e9';

(async () => {
  const r = await fetch(URL_TO_PROBE, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  console.log('status:', r.status, 'final url:', r.url);
  const html = await r.text();
  console.log('html length:', html.length);

  // Common patterns for the direct media URL in a Google Photos share page.
  const patterns = [
    /"(https:\/\/(?:lh3|video)\.googleusercontent\.com\/[^"\\]+?=m\d+)"/g,
    /"(https:\/\/(?:lh3|video)\.googleusercontent\.com\/[^"\\]+?)"/g,
    /(https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9_\-=\/]+)/g,
  ];
  for (const p of patterns) {
    const matches = [...html.matchAll(p)].map(m => m[1]);
    const uniq = [...new Set(matches)].slice(0, 8);
    console.log('\npattern', p.source.slice(0, 60), '→', uniq.length, 'matches');
    uniq.forEach(u => console.log('  ', u.slice(0, 200)));
    if (uniq.length) break;
  }

  // Also dump the og:video / og:image meta tags
  const og = [...html.matchAll(/<meta[^>]+(?:property|name)="(og:[a-z:]+)"[^>]+content="([^"]+)"/gi)];
  console.log('\nog meta tags:');
  og.slice(0, 12).forEach(m => console.log('  ', m[1], '=>', m[2].slice(0, 180)));
})().catch(e => console.error('FAIL', e));
