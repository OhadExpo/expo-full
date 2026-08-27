# Prod deploy — what I fixed, and what still needs you

## Fixed (real, reproduced, verified)

`package.json` declared `pngjs`; `package-lock.json` did not. Vercel installs
with `npm ci`, which refuses that mismatch outright rather than repairing it
like `npm install` would:

```
npm error `npm ci` can only install packages when your package.json
npm error and package-lock.json are in sync.
npm error Missing: pngjs@7.0.0 from lock file
```

I introduced it in `ade74c7` by staging `package.json` with an earlier
session's uncommitted dependency and not its lockfile half. Reproduced it by
checking the two committed files into an empty directory and running
`npm ci --dry-run`, fixed it in `015b694`, and prod moved immediately after —
from a bundle that was hours stale to `ShotAnalyzer-Bd9iKZxz.js`.

Guarded so it cannot recur: `scripts/verify-lockfile-sync.mjs` runs inside
`npm run build`, and it is proven against the real broken commit.

## Still stuck, and it is not our side

Since that deploy landed at ~00:46, **47 commits** have reached GitHub and
**none has deployed** (counted: `git log --oneline 015b694..HEAD`). As of 02:23 prod still serves `Bd9iKZxz`.

What I ruled out, each by testing rather than reasoning:

| suspicion | how it was checked | result |
|---|---|---|
| pushes not reaching GitHub | `git ls-remote origin refs/heads/master` | GitHub has them |
| lockfile mismatch again | `npm ci --dry-run` on committed files | installs clean, 508 packages |
| build failing on Linux | fresh clone of `origin/master`, `npm ci` + `npm run build` | **passes, every gate** |
| case-sensitive imports | `scripts/verify-import-case.mjs` | 167 files, zero mismatches |
| stale CDN cache, not a stale build | asset content-type + byte size | genuinely a different build, not cache |

So: the commits are on GitHub, they install, and they build. Vercel is
receiving them and not building them.

## What to check when you are up

1. **vercel.com → expo-full → Deployments.** Is there a queue of skipped or
   failed builds since ~00:46, or simply nothing at all?
2. **Settings → Git → Ignored Build Step.** If this is set, Vercel accepts the
   push and deliberately skips the build — which looks exactly like this.
3. **Settings → Git.** Confirm the GitHub integration is still connected and
   the production branch is still `master`.

`node scripts/verify-prod-current.mjs` answers "is prod serving what this tree
builds" in about ten seconds, without needing the dashboard. Exit 0 current,
1 behind, 2 could not compare.

## Everything is safe meanwhile

All work is committed and pushed to `origin/master`. Nothing is lost by the
delay — the moment Vercel builds, all of tonight goes live at once. Restore
point if anything needs undoing: `2d5829e`.
