// THE DEMO CLUBS (team version #904). REAL clubs since 24.10 (#971, Ohad: "Use the real logos for the demos. Current
// seasons logo ... Make it perfect like bhbc" + "All real you choose"): Hapoel Galil Elyon (basketball, Winner League) and
// Hapoel Kfar Saba (football, Liga Leumit) are what /demo/club shows; a prospect's own demo (NETANYA, in clubs.js) is
// listed here too but never shown there. Every PLAYER, number and injury in a demo is generated - the banner says so.
// The crests are the clubs' own artwork and never enter this public repo: they live in the club-assets bucket
// (scripts/gen-real-club-assets.mjs; sources and dates in ~/expo-private-backups/club-logos/).
import { NETANYA } from './clubs.js';

// basketball: Hapoel Galil Elyon - red and blue (from the crest), Kfar Blum hall
export const GALIL_ELYON = {
  id: 'galil-elyon',
  sport: 'basketball',
  name: 'Hapoel Galil Elyon', nameHe: 'הפועל גליל עליון',
  short: 'Hapoel Galil Elyon', shortHe: 'הפועל גליל עליון',
  wordmark: 'GALIL ELYON', wordmarkHe: 'גליל עליון',
  reportPrefix: 'GALIL ELYON',
  medicalBy: 'S&C + physio', medicalByHe: 'כושר + פיזיו',
  venue: 'Kfar Blum Hall', venueHe: 'אולם פיס כפר בלום',
  crest: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/galil-elyon/crest.png?v=mvllse9j',
  crestW: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/galil-elyon/crest-dark.png?v=mvllse9j',
  icon: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/galil-elyon/icon.png?v=mvllse9j',
  og: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/galil-elyon/og.png?v=mvllse9j',
  matchRe: /גליל עליון|galil el[iy]on/i,
  palette: {
    primary: '#1F4A7A', primaryDeep: '#173A61', header: '#0F2742',
    accent: '#D92B23', accentDeep: '#B5221C',
    onAccent: '#FFFFFF',
    accentText: '#A61E18', accentTextDark: '#FF7A70', accentOnPage: '#9C1C16',
    homeDark: '#9EC1EA', stripDark: '#1F4A7A',
    hair: '31,74,122', hairDark: '158,193,234', accentRgb: '217,43,35',
    accentInk: 'var(--bhbc-orange-text, #A61E18)',
  },
  league: { name: 'Winner League', nameHe: 'ליגת העל' },
  routeBase: '/demo/club/galil-elyon',
  demo: true,
};

// football: Hapoel Kfar Saba - green (from the crest), Levita Stadium
export const KFAR_SABA = {
  id: 'kfar-saba',
  sport: 'soccer',
  name: 'Hapoel Kfar Saba', nameHe: 'הפועל כפר סבא',
  short: 'Hapoel Kfar Saba', shortHe: 'הפועל כפר סבא',
  wordmark: 'KFAR SABA', wordmarkHe: 'הפועל כפר סבא',
  reportPrefix: 'KFAR SABA',
  medicalBy: 'S&C + physio', medicalByHe: 'כושר + פיזיו',
  venue: 'Levita Stadium', venueHe: 'אצטדיון לויטה',
  crest: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/kfar-saba/crest.png?v=mvllse9j',
  crestW: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/kfar-saba/crest-dark.png?v=mvllse9j',
  icon: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/kfar-saba/icon.png?v=mvllse9j',
  og: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/kfar-saba/og.png?v=mvllse9j',
  matchRe: /כפר סבא|kfar saba/i,
  palette: {
    primary: '#216845', primaryDeep: '#1A5537', header: '#0F3322',
    accent: '#2E9B5F', accentDeep: '#257F4D',
    onAccent: '#FFFFFF',
    accentText: '#1D6B41', accentTextDark: '#6FD39A', accentOnPage: '#1A5F3A',
    homeDark: '#9FE0BB', stripDark: '#216845',
    hair: '33,104,69', hairDark: '159,224,187', accentRgb: '46,155,95',
    accentInk: 'var(--bhbc-orange-text, #1D6B41)',
  },
  league: { name: 'Liga Leumit', nameHe: 'הליגה הלאומית' },
  routeBase: '/demo/club/kfar-saba',
  demo: true,
};

// EVERY DEMO CLUB, ONE LIST (the route, the HTML shell + share card, the asset generator, the sweeps read it). A new
// club = a record above (or in clubs.js) + one line here + its two rewrites in vercel.json; docs/team-version.md.
// listed: shown on /demo/club. A prospect's own demo is never listed - it is shared by link.
export const ALL_DEMO_CLUBS = [
  { club: NETANYA, listed: false },
  { club: GALIL_ELYON, listed: true },
  { club: KFAR_SABA, listed: true },
];
const OLD_SLUGS = { galil: 'galil-elyon', sharon: 'kfar-saba' };   // the fictional clubs' slugs until 24.10
export const demoClubBySlug = (slug) => (ALL_DEMO_CLUBS.find((d) => d.club.id === (OLD_SLUGS[slug] || slug)) || {}).club || null;
