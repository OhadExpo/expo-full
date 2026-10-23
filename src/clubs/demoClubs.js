// THE DEMO CLUBS (team version #904). GALIL and SHARON are fictional - no real club, crest or player - and are what
// /demo/club shows anyone; a prospect's own demo (NETANYA, in clubs.js) is listed here too but never shown there.
import { NETANYA } from './clubs.js';
import { CREST_GALIL, CREST_SHARON } from './crests.js';   // #968 generated badges (scripts/gen-club-crests.py)

// basketball: BC Galil, purple and gold
export const GALIL = {
  id: 'galil',
  sport: 'basketball',
  name: 'BC Galil', nameHe: 'מועדון הכדורסל גליל',
  short: 'BC Galil', shortHe: 'גליל',
  wordmark: 'BC GALIL', wordmarkHe: 'כדורסל גליל',
  reportPrefix: 'GALIL',
  medicalBy: 'S&C + physio', medicalByHe: 'כושר + פיזיו',
  venue: 'Galil Arena', venueHe: 'היכל הגליל',
  crestW: CREST_GALIL,
  crest: CREST_GALIL,
  matchRe: /גליל|galil/i,
  palette: {
    primary: '#3B2366', primaryDeep: '#2E1A47', header: '#1E1030',
    accent: '#F2B705', accentDeep: '#D19E00',
    onAccent: '#1E1030',
    accentText: '#7A5A00', accentTextDark: '#F2B705', accentOnPage: '#6B4F00',
    homeDark: '#C4B5FD', stripDark: '#3B2366',
    hair: '59,35,102', hairDark: '196,181,253', accentRgb: '242,183,5',
    accentInk: 'var(--bhbc-orange-text, #7A5A00)',
  },
  league: { name: 'Liga Leumit', nameHe: 'הליגה הלאומית' },
  routeBase: '/demo/club/galil',
  demo: true,
};

// soccer: FC Sharon, green and white

export const SHARON = {
  id: 'sharon',
  sport: 'soccer',
  name: 'FC Sharon', nameHe: 'מועדון הכדורגל אף.סי. שרון',
  short: 'FC Sharon', shortHe: 'אף.סי. שרון',
  wordmark: 'FC SHARON', wordmarkHe: 'אף.סי. שרון',
  reportPrefix: 'FC SHARON',
  medicalBy: 'S&C + physio', medicalByHe: 'כושר + פיזיו',
  venue: 'Sharon Stadium', venueHe: 'אצטדיון השרון',
  crestW: CREST_SHARON,
  crest: CREST_SHARON,
  matchRe: /שרון|sharon/i,
  palette: {
    primary: '#0F3D2E', primaryDeep: '#0B2E22', header: '#08241B',
    accent: '#1E9E5A', accentDeep: '#17824A',
    onAccent: '#fff',
    accentText: '#147A43', accentTextDark: '#5FD394', accentOnPage: '#106A39',
    homeDark: '#8FD9B0', stripDark: '#0F3D2E',
    hair: '15,61,46', hairDark: '143,217,176', accentRgb: '30,158,90',
    accentInk: 'var(--bhbc-orange-text, #147A43)',
  },
  league: { name: 'Liga Leumit', nameHe: 'הליגה הלאומית' },
  routeBase: '/demo/club/sharon',
  demo: true,
};

// EVERY DEMO CLUB, ONE LIST (the route, the HTML shell + share card, the asset generator, the sweeps read it). A new
// club = a record above (or in clubs.js) + one line here + its two rewrites in vercel.json; docs/team-version.md.
// listed: shown on /demo/club. A prospect's own demo is never listed - it is shared by link.
export const ALL_DEMO_CLUBS = [
  { club: NETANYA, listed: false },
  { club: GALIL, listed: true },
  { club: SHARON, listed: true },
];
export const demoClubBySlug = (slug) => (ALL_DEMO_CLUBS.find((d) => d.club.id === slug) || {}).club || null;
