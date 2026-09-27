// THE GOOGLE RETURN, CAUGHT BEFORE ANYTHING ELSE RUNS (27.9 #346).
//
// Google sends the session back in the URL hash (#access_token=...). On 27.9
// the auth log showed a return that reached the page and was never read -
// Google OK at 19:38:27, then no /user call at all, and the login screen again;
// the retry a minute later worked. Anything that touches the URL before
// supabase-js reads it (a route rewrite, a reload, an update) loses the hash
// for good. This runs first, synchronously, and keeps a copy for two minutes;
// the app spends it only if supabase-js did not (src/auth.jsx, spendTokenHash).
// External file because the CSP forbids inline script.
(function () {
  try {
    var h = window.location.hash || '';
    if (/access_token=/.test(h) && /refresh_token=/.test(h)) {
      window.sessionStorage.setItem('expo-oauth-hash', JSON.stringify({ h: h, at: Date.now() }));
    }
  } catch (e) { /* storage blocked - supabase-js still reads the URL */ }
})();
