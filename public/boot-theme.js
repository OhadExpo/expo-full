// Boot script — applies theme synchronously before paint.
// External file (not inline) because the CSP forbids unsafe-inline scripts.
(function () {
  try {
    var saved = localStorage.getItem('expo-theme');
    var pref = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', pref);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
