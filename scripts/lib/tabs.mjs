// WALK THE TABS, OR HALF OF EVERY SCREEN IS NEVER MEASURED.
//
// A page-load sweep sees one tab and reports the other five as clean. That is
// how six clipping findings hid on BHBC Schedule and Medical until the gates
// started walking tabs (2026-09-01).
//
// The first version of that walk hard-coded the six BHBC tab NAMES, so the
// athlete portal's six tabs - PROGRAM / BW / MEAL LOG / HISTORY / PRS /
// MESSAGES, the surface his ATHLETES live on - were still never walked. The
// discriminator is `role="tab"`, which the app now sets on every real tab
// strip, with the BHBC names kept as a fallback for anything not yet marked.
//
// One exception matters: the Exercises hub sub-tabs are also role="tab" but
// they NAVIGATE (navTo changes the route). Measuring the page they land on and
// filing it under the route we started from would be a lie, and they are
// separate entries in SURFACES.md that get swept on their own anyway. So a tab
// whose click changes location.href is dropped, and the caller is returned to
// where it was.
const NAMED = /^(overview|roster|schedule|medical|sessions|games)$/i;

export const listTabs = (page) => page.evaluate((namedSrc) => {
  const named = new RegExp(namedSrc, 'i');
  const out = [];
  for (const el of document.querySelectorAll('button,[role="tab"]')) {
    const t = (el.textContent || '').trim();
    if (!t || t.length > 24) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (!(el.getAttribute('role') === 'tab' || named.test(t))) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}, NAMED.source);

// Clicks the tab and reports whether we are still on the same screen.
// Returns 'ok' | 'navigated' | 'missing'.
export const clickTab = async (page, label, settleMs = 2500) => {
  const before = await page.evaluate(() => location.href);
  const hit = await page.evaluate((l) => {
    const el = [...document.querySelectorAll('button,[role="tab"]')]
      .find((x) => (x.textContent || '').trim() === l);
    if (!el) return false;
    el.click();
    return true;
  }, label);
  if (!hit) return 'missing';
  await new Promise((r) => setTimeout(r, settleMs));
  const after = await page.evaluate(() => location.href);
  return after === before ? 'ok' : 'navigated';
};
