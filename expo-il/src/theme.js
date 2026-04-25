// Design tokens — kept identical to the coach side (src/theme.js) so the
// landing page reads as the same product, just with a different page body.
// Whenever we adjust the coach palette, mirror the change here.

export const C = {
  bg: '#000000',
  sf: '#0a0a0c',
  sf2: '#111114',
  sf3: '#18181c',

  bd: '#1e1e24',
  bd2: '#2a2a32',

  tx: '#f0f0f4',
  tm: '#7a7a88',
  td: '#444450',

  ac: '#39BDFF',
  acD: 'rgba(57,189,255,0.10)',
  ac4D: 'rgba(57,189,255,0.30)',

  rd: '#FF4757',
  rdD: 'rgba(255,71,87,0.12)',
  gn: '#2ED573',
  gnD: 'rgba(46,213,115,0.12)',
  or: '#FFA502',
  orD: 'rgba(255,165,2,0.12)',
};

// All three roles point at Nord — same as the coach side. The fallback chain
// keeps us readable while the woff2 files stream in.
export const FN = "'Nord', 'DM Sans', sans-serif";
export const FB = "'Nord', 'DM Sans', sans-serif";
export const FH = "'Nord', 'DM Sans', sans-serif";

// Single source of truth for outbound contact links — Ohad swaps in real
// values when the site goes live.
export const CONTACT = {
  // International format, digits only — wa.me requires no '+' or spaces.
  whatsapp: '972548124381',
  // Bit personal-pay link. Bit doesn't expose stable per-payment URLs from
  // a website yet, so we pass the user through WhatsApp and quote the Bit
  // phone in the message.
  bitPhone: '054-812-4381',
  email: 'ohadyproductions@gmail.com',
  instagram: 'https://www.instagram.com/ohadaptable/',
};

// Build a wa.me link with a pre-filled buy message. Caller passes the
// localised text (built from the i18n 'wa.buy.tmpl' key).
export function buyOnWhatsApp(program, text) {
  const fallback = `Hi Ohad, I want to buy "${program.title}" (${program.id}).`;
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text || fallback)}`;
}
