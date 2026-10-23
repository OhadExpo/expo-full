# EXPO Teams - the club zone for any club

The club zone (`src/BhbcView.jsx`) was built for Bnei Herzliya. Since 23.10 it wears a CLUB: colours, crest, names, venue, report prefix, sport. Herzliya is the default record, so the live zone is unchanged. Phase B (a second REAL club, with its own data) is in `docs/team-version-phase-b.md`.

### What is where

- `src/clubs/clubs.js` - `HERZLIYA` (today's exact values, the default), the generated crest (`crestSvg`), `NETANYA` (a prospect's demo).

- `src/clubs/demoClubs.js` - `GALIL` (basketball) and `SHARON` (football), fictional; `ALL_DEMO_CLUBS`, the one list every tool reads.

- `src/clubs/demoSeed.js` / `soccerSeed.js` - a whole season, deterministic, dated from today, in the zone's own store shapes.

- `src/clubs/demoHebrew.js` - the season's own text in Hebrew for a Hebrew screen (display only).

- `src/clubs/ClubDemo.jsx` - `/demo/club/<slug>`: the real zone on the seed, every write in memory. `ClubTour.jsx` - the banner and the 7-stop tour (`?tour=n`). `ClubDemoIndex.jsx` - `/demo/club`.

- In the zone: `applyClub()` (palette), `zoneRootOf()` (routes), `clubSay()` (names), `DEMO` (in-memory activity, programs, staff names), `SoccerLeagueView` (football's games tab).

### Add a demo club for the next prospect (about 15 minutes)

1. A record in `src/clubs/demoClubs.js` (copy `GALIL` for basketball, `SHARON` for football): `id` (the URL slug), names in English and Hebrew, venue, `matchRe` (how the league feed spells the club), palette, `routeBase: '/demo/club/<id>'`. A light accent (yellow, white) needs `onAccent` dark and `accentInk` set to the text token.

2. One line in `ALL_DEMO_CLUBS` - `listed: false` for a prospect (shared by link, never shown on `/demo/club`).

3. Two rewrites in `vercel.json` (copy the netanya pair) so a link preview gets the club's title and card.

4. `node scripts/gen-club-assets.mjs` - the tab icon and the share card. Commit `public/clubs/<id>-crest.svg` and `-og.png` (`git add -f`, png is ignored).

5. A row in `docs/SURFACES.md`.

6. Gates: `node scripts/verify-club-demo.mjs <id>` (0 database requests, 0 errors, no Herzliya words, every page full), `node scripts/verify-club-demo-clicks.mjs <id>` (every control pressed), `node scripts/ocd-sweep.mjs --clubs --w=390` (and 820, 1440). Then build, deploy, and run the first one again with `BASE=https://expo-app.co.il`.

A real crest replaces the generated one by pointing `crest` / `crestW` at the club's files (never commit a club's logo without the club's permission - the repo is public).

### Gates for the live zone

- `scripts/verify-club-pixel-parity.mjs shoot <dir>` before a change and after, then `diff` - Herzliya must not move. Shoot both minutes apart (live data), and never edit the zone while it shoots (the dev server reloads).
