// urlState.js - EVERY SURFACE HAS ITS OWN URL (14.10 #770, Ohad: "make sure we have distinct url lines for every single
// different pop up, page, or expo/bhbc/marketing/demo platforms" + "unique and always using the terminology of the
// website (like expo/athletes which is perfect)").
//
// One mechanism for every page, tab, pop-up and sheet: a piece of UI state is written into the path, read back on
// load, and followed on Back / Forward - the pattern the BHBC zone's tabs already proved (27.9).
//
//   const [open, setOpen] = useState(() => fromPath(location.pathname));
//   useUrlSync(open, setOpen, { toPath: (v) => (v ? `${base}/history` : base), fromPath });
//
// toPath(value) -> the path this state lives at (null = leave the URL alone; { path, replace } = replace, not push). fromPath(pathname) -> the state a URL
// means. Opening something PUSHES (Back closes it); a change that is not a new place (the first sync) REPLACES.
import { useEffect, useRef } from 'react';

const UNSET = Symbol('unset');
export function useUrlSync(value, setValue, { toPath, fromPath, replace = false } = {}) {
  const last = useRef(UNSET);   // the value last synced; a re-run with the same value (React StrictMode runs mount
                                 // effects twice in dev) must not act - its second run read as a CLOSE and erased a link
  useEffect(() => {
    if (typeof window === 'undefined' || !toPath) return;
    const got = toPath(value), isObj = !!got && typeof got === 'object', want = isObj ? got.path : got;
    if (last.current !== UNSET && Object.is(last.current, value)) return;
    const isFirst = last.current === UNSET; last.current = value;
    if (!want || window.location.pathname === want) return;
    // the first sync never CLOSES: a link straight to a pop-up mounts with the state still empty, and the page's own
    // read of the URL opens it on the next render - closing here would erase the link before it is read
    if (isFirst && isObj && got.replace) return;
    // an OPEN keeps a deeper tail that lives under it (/player/<id>/game/<date> stays when the player sheet opens)
    if (!isObj && window.location.pathname.startsWith(want + '/')) return;
    const url = want + window.location.search + window.location.hash;
    // { path, swap: true }: the same place, said differently (a pop-up opened ON another one) - no new entry, no step back
    // (an entry this hook opened stays OURS under its new path, so the stack's close still steps back over it)
    if (isObj && got.swap) { const st0 = window.history.state; window.history.replaceState(st0 && st0.urlOpened ? { ...st0, urlOpened: want } : st0, '', url); return; }
    // a CLOSE ({ path, replace: true }): if this hook opened the entry, step back to where it was opened from (no
    // duplicate entry, Back does not reopen it); otherwise (opened from a typed / shared URL) replace it
    if (isObj && got.replace && !isFirst) {   // (a plain string has a .replace METHOD - test the object, not the key)
      const st = window.history.state;
      if (st && st.urlOpened === window.location.pathname) { window.history.back(); return; }
      window.history.replaceState(window.history.state, '', url); return;
    }
    if (replace || isFirst) window.history.replaceState(window.history.state, '', url);
    else window.history.pushState({ urlOpened: want }, '', url);
  }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the LATEST setValue / fromPath, not the first render's (pre-deploy review 14.10: a zone entered on Overview kept the
  // Overview fromPath, so Back between Schedule views did nothing; lists empty at mount never reopened an item on Forward)
  const fns = useRef({ setValue, fromPath }); fns.current = { setValue, fromPath };
  useEffect(() => {
    if (typeof window === 'undefined' || !fromPath) return undefined;
    const onPop = () => { const f = fns.current; if (f.fromPath) f.setValue(f.fromPath(window.location.pathname)); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
}

// a URL word from a label: 'Full History' -> 'full-history' (the site's own words, never an internal key)
export const urlWord = (s) => String(s || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// the segment after a base path: segmentAfter('/coach/athletes/abc/history', '/coach/athletes/abc') -> 'history'
export function segmentAfter(pathname, base) {
  const p = String(pathname || '').replace(/\/+$/, ''), b = String(base || '').replace(/\/+$/, '');
  if (!p.startsWith(b + '/')) return null;
  return p.slice(b.length + 1).split('/')[0] || null;
}

// A pop-up / sheet that is open or closed: open = `${base}/${word}`, closed = `${base}`. `value` may be any truthy
// payload (an id): then the URL is `${base}/${word}/${id}` and fromPath returns the id. Back closes it.
export function useUrlFlag(value, setValue, base, word, { withId = false } = {}) {
  useUrlSync(value, setValue, {
    toPath: (v) => (!base ? null : v ? `${base}/${word}${withId && v !== true ? `/${encodeURIComponent(v)}` : ''}` : (typeof window !== 'undefined' && segmentAfter(window.location.pathname, base) === word ? { path: base, replace: true } : null)),
    fromPath: (p) => urlFlagFromPath(p, base, word, withId),
  });
}
export function urlFlagFromPath(p, base, word, withId = false) {
  if (!base || segmentAfter(p, base) !== word) return withId ? null : false;
  if (!withId) return true;
  const rest = String(p).replace(/\/+$/, '').slice(String(base).replace(/\/+$/, '').length + word.length + 2);
  return rest ? decodeURIComponent(rest.split('/')[0]) : true;
}
