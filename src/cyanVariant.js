// Light-mode cyan-intensity variants — gated on `?cyan=` URL param so Ohad
// can compare options side-by-side on prod without 4 deploys. Once he picks
// a winner, the chosen variants get baked in unconditionally and this file
// can be removed.
//
// URLs:
//   /coach/dashboard               — baseline (current light theme)
//   /coach/dashboard?cyan=cards    — 1px cyan top-edge on every Card
//   /coach/dashboard?cyan=labels   — small all-caps tile labels → cyan
//   /coach/dashboard?cyan=icons    — cyan glyph before section headers
//   /coach/dashboard?cyan=all      — all three combined
//   /coach/dashboard?cyan=cards,labels — comma-separated mix

const VALID = ['cards', 'labels', 'icons'];

function readActive() {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = new URLSearchParams(window.location.search).get('cyan');
    if (!raw) return new Set();
    if (raw === 'all') return new Set(VALID);
    return new Set(raw.split(',').map(s => s.trim()).filter(s => VALID.includes(s)));
  } catch { return new Set(); }
}

export const cyanActive = readActive();
export const hasCyan = (key) => cyanActive.has(key);

// Sync to <body data-cyan-labels="1"> for the CSS-driven label variant so
// themes.css can target every small uppercase label with a single rule
// instead of every individual JSX site. Runs once at module load — the
// URL is fixed for the lifetime of the page (changing it triggers a
// navigation + reload).
if (typeof document !== 'undefined') {
  const apply = () => {
    for (const v of VALID) {
      if (cyanActive.has(v)) document.body?.setAttribute(`data-cyan-${v}`, '1');
    }
  };
  if (document.body) apply();
  else document.addEventListener('DOMContentLoaded', apply, { once: true });
}
