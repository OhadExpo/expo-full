// copyGuard.js — site-wide content protection.
//
// Blocks copy (Ctrl/Cmd+C, selection→copy) and the right-click context menu
// EVERYWHERE on every surface (coach / client portal / demo / marketing),
// EXCEPT inside an explicitly-allowed zone: the program editor, which marks its
// root with `data-allow-copy` so Ohad can copy/paste while building programs.
//
// Ohad 2026-06-29: "make sure I cannot copy anywhere on any platform, or
// right-click — except for when I'm editing/creating a program (coach)."
//
// Notes / scope:
//   - Selection is still allowed (so text stays readable); only the COPY of a
//     selection and the context menu are suppressed.
//   - `cut` is also blocked for completeness (it's a copy vector).
//   - navigator.clipboard.writeText() does NOT fire a 'copy' event, so any
//     legitimate in-app "copy link" button that uses the async Clipboard API
//     keeps working — only user-initiated copy + execCommand('copy') are caught.
//   - Installed once at startup (main.jsx), before React renders, via a
//     capture-phase document listener so it runs ahead of any component handler.

function inAllowedZone(target) {
  let el = target;
  while (el && el.nodeType === 1) {
    if (el.getAttribute && el.getAttribute('data-allow-copy') !== null) return true;
    el = el.parentElement;
  }
  return false;
}

export function installCopyGuard() {
  if (typeof document === 'undefined') return;
  const block = (e) => {
    if (inAllowedZone(e.target)) return; // program editor — let it through
    e.preventDefault();
  };
  // Capture phase so the guard wins even if a child stops propagation.
  document.addEventListener('contextmenu', block, true);
  document.addEventListener('copy', block, true);
  document.addEventListener('cut', block, true);

  // Disable TEXT SELECTION site-wide too (Ohad: "not be able to select or copy
  // any text … except editing/creating programs"). Form fields stay selectable
  // so data entry still works, and the program editor (data-allow-copy) opts
  // fully back in. -webkit-touch-callout:none kills the iOS long-press save menu.
  const style = document.createElement('style');
  style.id = 'expo-copy-guard';
  style.textContent = [
    'body{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;-webkit-touch-callout:none}',
    'input,textarea,select,[contenteditable="true"],[contenteditable="true"] *,',
    '[data-allow-copy],[data-allow-copy] *{-webkit-user-select:text;-moz-user-select:text;-ms-user-select:text;user-select:text;-webkit-touch-callout:default}',
  ].join('');
  (document.head || document.documentElement).appendChild(style);
}
