// Design tokens — kept minimal and self-contained so expo-il can be
// deployed independently of the main expo-full app. Aligned with the main
// app's palette so a future switch into the same brand stays consistent.

export const C = {
  bg: '#0a0a0b',
  sf: '#111114',
  sf2: '#16161b',
  sf3: '#1c1c22',
  bd: '#26262d',
  bd2: '#2e2e36',
  tx: '#ffffff',
  tm: '#a1a1ab',
  td: '#6b6b75',
  ac: '#3BA0FF',
  acD: '#0d2438',
  ac2: '#39BDFF',
  gn: '#28d95b',
  gnD: '#0e2a16',
  or: '#ff9c44',
  rd: '#ff5e5e',
  rdD: '#3a1a1a',
};

export const FN = "'JetBrains Mono', ui-monospace, monospace";
export const FB = "'DM Sans', system-ui, sans-serif";

// Single source of truth for outbound contact links — Ohad swaps in real
// values when the site goes live.
export const CONTACT = {
  // International format, digits only — wa.me requires no '+' or spaces.
  whatsapp: '972500000000',
  // Bit personal-pay link. Bit doesn't expose stable per-payment URLs from
  // a website yet, so we pass the user through WhatsApp and quote the Bit
  // phone in the message.
  bitPhone: '050-000-0000',
  email: 'ohadyproductions@gmail.com',
  instagram: 'https://www.instagram.com/',
};

// Build a wa.me link with a pre-filled buy message. Caller passes the
// localised text (built from the i18n 'wa.buy.tmpl' key).
export function buyOnWhatsApp(program, text) {
  const fallback = `Hi Ohad, I want to buy "${program.title}" (${program.id}).`;
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text || fallback)}`;
}
