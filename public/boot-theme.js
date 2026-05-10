// Boot script — applies theme synchronously before paint.
// External file (not inline) because the CSP forbids unsafe-inline scripts.
(function () {
  try {
    // ?theme=soft / ?theme=accent / ?theme=cream — temporary preview
    // variants. Auto-persist so the auth redirect doesn't drop them.
    var qs = (window.location.search || '');
    var draftMatch = qs.match(/theme=([A-H])/i);
    var ssDraft = null;
    try { ssDraft = sessionStorage.getItem('expo-theme-preview'); } catch (e) {}
    var draft = draftMatch ? draftMatch[1].toUpperCase() : (['A','B','C','D','E','F','G','H'].indexOf(ssDraft) !== -1 ? ssDraft : null);
    if (draft) {
      try { sessionStorage.setItem('expo-theme-preview', draft); } catch (e) {}
      document.documentElement.setAttribute('data-theme', draft);
      return;
    }
    var saved = localStorage.getItem('expo-theme');
    if (saved !== 'light' && saved !== 'dark') saved = null;
    var pref = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', pref);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
