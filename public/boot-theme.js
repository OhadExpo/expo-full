// Boot script — applies theme synchronously before paint.
// External file (not inline) because the CSP forbids unsafe-inline scripts.
(function () {
  try {
    // ?theme=soft / ?theme=accent / ?theme=cream — temporary preview
    // variants. Auto-persist so the auth redirect doesn't drop them.
    var qs = (window.location.search || '');
    var draftMatch = qs.match(/theme=(lightA|lightB|light|dark|5b|[1-6]|W)/i);
    var ssDraft = null;
    try { ssDraft = sessionStorage.getItem('expo-theme-preview'); } catch (e) {}
    var VALID = ['lightA','lightB','light','dark','1','2','3','4','5','5b','6','W'];
    var draft = draftMatch ? draftMatch[1] : (VALID.indexOf(ssDraft) !== -1 ? ssDraft : null);
    if (draft) {
      try { sessionStorage.setItem('expo-theme-preview', draft); } catch (e) {}
      document.documentElement.setAttribute('data-theme', draft);
      return;
    }
    var saved = localStorage.getItem('expo-theme');
    if (saved !== 'light' && saved !== 'dark') saved = null;

    // THE LOGIN FLASH. Ohad: "when i first log in to expo/bhbc there's sometimes
    // glitches with light/dark mode."
    //
    // useTheme reads user_metadata.theme_pref from Supabase on mount and applies
    // it if it differs from what is on screen. That is a NETWORK round-trip, so
    // it lands hundreds of ms after the page is already painted - the page
    // visibly flips. It only happens when the local and remote values disagree,
    // which is a first login on this device or a toggle made on another one.
    // Hence "sometimes": the sync also writes localStorage, so the NEXT load
    // agrees and the flash does not repeat.
    //
    // The session is already in localStorage, and user_metadata rides along in
    // it, so the remote preference can be read HERE, synchronously, before the
    // first paint - no network, and the value useTheme would have applied
    // anyway. Any failure falls through to the local value below.
    var remote = null;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || !/^sb-.*-auth-token$/.test(k)) continue;
        var raw = localStorage.getItem(k);
        if (!raw) continue;
        // supabase-js v2 may store the session base64-prefixed.
        if (raw.indexOf('base64-') === 0) raw = atob(raw.slice(7));
        var sess = JSON.parse(raw);
        var u = sess && (sess.user || (sess.currentSession && sess.currentSession.user));
        var t = u && u.user_metadata && u.user_metadata.theme_pref;
        if (t === 'light' || t === 'dark') { remote = t; break; }
      }
    } catch (e) { /* corrupt or absent session - use the local value */ }
    if (remote) {
      document.documentElement.setAttribute('data-theme', remote);
      try { localStorage.setItem('expo-theme', remote); } catch (e) {}
      return;
    }
    // LIGHT is the default first impression (Ohad 2026-08-24) — the OS
    // preference no longer decides it, only an explicit in-app choice does.
    var pref = saved || 'light';
    document.documentElement.setAttribute('data-theme', pref);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
