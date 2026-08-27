// Git Bash (MSYS) rewrites any argument that looks like a unix absolute path
// into a Windows path before node ever sees it: "/login" arrives as
// "C:/Program Files/Git/login", and "/10%20of%2011.mp4" as
// "C:/Program Files/Git/10%20of%2011.mp4".
//
// That is not a cosmetic annoyance. It cost two real measurements tonight - a
// four-route theme sweep that reported "Cannot navigate to invalid URL" and
// three shot captures that reported "Could not read that video" - both of which
// look exactly like the thing under test is broken rather than the shell having
// eaten the argument.
//
// Callers should not have to remember MSYS_NO_PATHCONV=1, so undo it here.
export function unmangleArg(a) {
  if (typeof a !== 'string' || !/^[A-Za-z]:/.test(a)) return a;
  const fwd = a.split(String.fromCharCode(92)).join('/');
  const cut = fwd.indexOf('/Git/');
  return cut >= 0 ? fwd.slice(cut + 4) : a;
}
