// THE CLUBS (team version, #904 - Ohad 23.10: "bhbc will be a team version to be sold to each israeli sport team").
//
// One record per club the zone can wear. The zone (BhbcView) was built for Bnei Herzliya, so HERZLIYA holds today's
// exact values - every colour, word and path below is what the zone hard-wired before this file existed, and the zone
// falls back to it when no club is passed. A new club is a new record here: colours, crest, names, venue, sport.
//
// PALETTE ROLES (not colours): primary = structure (header, strips, HOME), accent = the action colour (buttons, game
// days, AWAY). A club whose accent is light (yellow) sets onAccent dark and accentInk to the text token, so text never
// sits in yellow on white.
//
// Public repo: no third-party crest is committed. A club without its own crest file gets a generated one (crestSvg).

const HERZLIYA_PALETTE = {
  primary: '#1E3D74', primaryDeep: '#14294F', header: '#0E1C38',
  accent: '#F26A2B', accentDeep: '#D9541A',
  onAccent: '#fff',
  // accent as TEXT: light page / dark page / on the bare page ground (#883)
  accentText: '#B4441A', accentTextDark: '#F0955F', accentOnPage: '#9E3A10',
  // HOME ink on a dark page; strips in the dark theme
  homeDark: '#7FA9E8', stripDark: '#1E3D74',
  // hairlines (rgb triplets)
  hair: '30,61,116', hairDark: '126,162,220', accentRgb: '242,106,43',
  // accent used directly as text (Herzliya's orange; a light accent uses the text token instead)
  accentInk: null,
};

export const HERZLIYA = {
  id: 'bhbc',
  sport: 'basketball',
  name: 'Bnei Herzliya BC', nameHe: 'מועדון הכדורסל בני הרצליה',
  short: 'Bnei Herzliya', shortHe: 'בני הרצליה',
  wordmark: 'BNEI HERZLIYA', wordmarkHe: 'בני הרצליה',
  reportPrefix: 'BHBC',
  venue: 'HaYovel, Herzliya', venueHe: 'היובל, הרצליה',
  crestW: '/bnei-herzliya-logo-w.png', crest: '/logos/bhbc-logo.png',
  // the club's name in a league feed / opponent string
  matchRe: /הרצליה|herzliy/i,
  palette: HERZLIYA_PALETTE,
  routeBase: null,   // null = the live zone's own /coach/bhbc + /bhbc routes
  demo: false,
};

// A generated crest: a shield in the club's colours with its initials. Used until the club sends its own artwork.
export function crestSvg({ bg, ring, ink, initials, sub = '' }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 116"><path d="M50 3 L95 17 V58 C95 86 75 104 50 113 C25 104 5 86 5 58 V17 Z" fill="${bg}" stroke="${ring}" stroke-width="6"/><path d="M50 14 L84 25 V58 C84 79 69 93 50 101 C31 93 16 79 16 58 V25 Z" fill="none" stroke="${ring}" stroke-width="1.6" opacity="0.55"/><text x="50" y="${sub ? 64 : 70}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${initials.length > 2 ? 26 : 34}" fill="${ink}" letter-spacing="1">${initials}</text>${sub ? `<text x="50" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="9.5" fill="${ring}" letter-spacing="2">${sub}</text>` : ''}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const NETANYA_PALETTE = {
  primary: '#1C1C1C', primaryDeep: '#121212', header: '#0A0A0A',
  accent: '#FFC20E', accentDeep: '#E0A800',
  onAccent: '#111111',
  accentText: '#7A5A00', accentTextDark: '#FFC20E', accentOnPage: '#6B4F00',
  homeDark: '#E2E2E2', stripDark: '#2A2A2A',
  hair: '28,28,28', hairDark: '200,200,200', accentRgb: '255,194,14',
  accentInk: 'var(--bhbc-orange-text, #7A5A00)',
};

// THE NETANYA DEMO (first prospect, Ohad 23.10). Elitzur Ironi Netanya: yellow and black, Liga Leumit (Wikipedia,
// checked 23.10). Every player, number and injury in the demo is generated - none is real.
export const NETANYA = {
  id: 'netanya',
  sport: 'basketball',
  name: 'Elitzur Netanya BC', nameHe: 'מועדון הכדורסל אליצור נתניה',
  short: 'Elitzur Netanya', shortHe: 'אליצור נתניה',
  wordmark: 'ELITZUR NETANYA', wordmarkHe: 'אליצור נתניה',
  reportPrefix: 'ELITZUR',
  medicalBy: 'S&C + physio', medicalByHe: 'כושר + פיזיו',
  venue: 'Yeshurun Hall, Netanya', venueHe: 'אולם ישורון, נתניה',
  // #971 the club's real 2026/27 crest (ibasketball.co.il, Sept 2026) from the club-assets bucket - never in this repo
  crest: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/netanya/crest.png?v=mvllse9j',
  crestW: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/netanya/crest-dark.png?v=mvllse9j',
  icon: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/netanya/icon.png?v=mvllse9j',
  og: 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1/object/public/club-assets/netanya/og.png?v=mvllse9j',
  matchRe: /נתניה|netanya/i,
  palette: NETANYA_PALETTE,
  league: { name: 'Liga Leumit', nameHe: 'הליגה הלאומית' },
  routeBase: '/demo/club/netanya',
  demo: true,
};

