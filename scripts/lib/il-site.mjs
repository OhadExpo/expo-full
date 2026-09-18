// il-site.mjs — prove that what answers on the marketing port IS the marketing
// site, and say exactly how to start it when it is not.
//
// 2026-09-18, twice in one afternoon: verify-marketing-site reported
// "0 findings, 18 combinations" against a DEAD port, and then again while port
// 5174 was serving EXPO-FULL rather than expo-il. `npx vite` resolves the
// repo-root config from inside expo-il/ if the shell's cwd slips, and the old
// identity check accepted "/expo-il/ appears in the HTML" - which the coach app
// satisfies, because it links to expo-il.co.il.
//
// Every marketing gate asks this first, so none of them can measure the wrong
// site again, and all four say the same thing about how to fix it.
export const IL_START = [
  'Start the marketing site from inside expo-il:',
  '    cd expo-il && node ../node_modules/vite/bin/vite.js . --port 5174 --strictPort --host 127.0.0.1',
  '`npx vite` from the repo root serves EXPO-FULL on 5174 and the gate then measures the wrong site.',
].join('\n');

/**
 * @returns {Promise<{ok: true, progs: string[]} | {ok: false, why: string}>}
 */
export async function assertMarketingSite(pg, base) {
  try {
    await pg.goto(base + '/#/online', { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    return { ok: false, why: 'nothing is answering at ' + base + ' (' + String(e.message || e).slice(0, 80) + ').' };
  }
  await new Promise((r) => setTimeout(r, 5000));
  const id = await pg.evaluate(() => ({
    title: document.title || '',
    progs: [...new Set([...document.querySelectorAll('a[href*="#/programs/"]')]
      .map((a) => (a.getAttribute('href') || '').split('#/programs/')[1]).filter(Boolean))],
    // The coach app's own links. The marketing site has none of these.
    appOnly: !!document.querySelector('a[href="/coach"], a[href="/demo/coach"], a[href="/login"]'),
  }));
  if (!id.progs.length || id.appOnly) {
    return { ok: false, why: base + ' is not serving the marketing site (title "' + id.title + '", '
      + id.progs.length + ' program links' + (id.appOnly ? ", and it has the app's /login|/coach links" : '') + ').' };
  }
  return { ok: true, progs: id.progs };
}
