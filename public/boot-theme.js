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
    // LIGHT is the default first impression (Ohad 2026-08-24) — the OS
    // preference no longer decides it, only an explicit in-app choice does.
    var pref = saved || 'light';
    document.documentElement.setAttribute('data-theme', pref);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
