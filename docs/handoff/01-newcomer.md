# Lens 1 — the newcomer

*You have never seen this repo. Read this before anything else.*

## What EXPO is

A fitness-coaching platform Ohad built to replace a Google-Sheets business.
Vite + React + Supabase, deployed by Vercel on push to `master`.

Three products in one codebase:

| Surface | Route | Who uses it |
| --- | --- | --- |
| Athlete portal | `/athlete` | his ~20 private clients |
| Coach app | `/coach/*` | Ohad, and Yuval on a staff tier |
| Club zone | `/coach/bhbc` | Bnei Herzliya BC staff — head coach, assistants, a physio |
| Marketing | `expo-il/` (own Vite root) | prospects |
| Demo | `/demo`, `/demo/coach`, `/demo/athlete`, `/try` | prospects, unauthenticated |

## The machine you are on

- Windows 11, PowerShell primary; a Bash tool is Git Bash (POSIX).
- **Node scripts run through `cmd.exe` when spawned by `execSync`.** `%` and `^`
  are shell metacharacters there and get eaten before the program sees them.
- Chrome is driven through a **persistent debug profile** on port 9222 —
  `chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\Users\Administrator\chrome-debug-budget"`.
  It stays signed into Google and into expo-app.co.il. Never use a fresh profile.
- Scripts that import `puppeteer-core` must live inside the repo, or module
  resolution fails.
- `node` resolves a `/tmp/...` path to `C:\tmp`. Use the session scratchpad.

## How to run the thing

```bash
npm run build          # eslint runs first and FAILS the build on any error
npx vite preview       # serves dist on 4173 — this is what the probes hit
```

`http://127.0.0.1:4173` is the branch build. `https://expo-app.co.il` is
production, which is a **different, older commit**.

## Signing in

Every seat, production included, uses password `1234`.

| Seat | Email |
| --- | --- |
| owner | `ohadyproductions@gmail.com` |
| physio (BHBC) | `tomerlich11@gmail.com` |
| athlete (thin fixture) | `diego@diegoday.com` |
| athlete (real history) | `amit@enoshy.com` |

The fixture athlete has almost no data — thin data hides exactly the defects the
gates look for, so point them at a real person with `EMAIL=`.

## The one thing that will bite you first

**The dev server shares the PRODUCTION database.** There is no staging copy.
Anything you write from a local page or a script lands in the real store that
real athletes and the club's physio read. Snapshot to `audit-out/bhbc-state/`
before a write, and restore after.

## Where you are right now

Branch `bhbc-hebrew`, over 1,200 commits ahead of `master`, none of them
deployed. The whole of tonight's work is on it. Ohad has not approved a deploy.
