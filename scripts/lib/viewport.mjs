// Set a page's viewport RELIABLY on the attached debug Chrome.
//
// WHY THIS EXISTS. Measured 2026-09-02 on this machine:
//   - `page.setViewport()` is silently IGNORED when the browser is connected
//     with `defaultViewport: null`. Asking for 1500 returned innerWidth 2000;
//     asking for 470 returned 627. Every measurement taken that way describes a
//     width nobody was looking at, and a sweep run that way reads green while
//     the screen is broken.
//   - Resizing the real OS window over CDP works, but CLAMPS at the physical
//     screen — 1500 came back as 1267 — so it cannot reach the widths the app
//     is designed for.
//   - `emulate()` forces the metrics override and hits the requested width
//     exactly, but ONLY with `isMobile: true`.
//
// So emulate is the mechanism at every width. `isMobile` is a metrics flag, not
// a device claim: touch and the phone user-agent are attached only below the
// phone breakpoint, so a desktop measurement gets a desktop UA and no touch.
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function setWidth(pg, W, H = 1000) {
  const phone = W <= 620;
  await pg.emulate({
    viewport: { width: W, height: H, isMobile: true, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 },
    userAgent: phone ? IPHONE : DESKTOP,
  });
  // about:blank has no <meta name="viewport">, so under isMobile the layout
  // viewport falls back to 980px no matter what was asked for. Checking there
  // proves nothing - assert only once a real document is loaded.
  const blank = await pg.evaluate(() => location.href.startsWith('about:'));
  if (blank) return W;
  let got = 0;
  for (let i = 0; i < 4; i++) {
    got = await pg.evaluate(() => innerWidth);
    if (got === W) return got;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`viewport did not take: asked ${W}, got ${got}`);
}
