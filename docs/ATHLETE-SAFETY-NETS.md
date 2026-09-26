# The athlete's safety nets

Ohad, 26.9: *"build guards and safety nets that will never allow the athletes
to not be able to use the app. 0 fails and bugs."* Same day, an athlete had
been shown **SAVE FAILED — EXPO-TRAINEES** over a workout that had in fact
saved: the portal upserted the staff-only roster row from the athlete's seat
and RLS refused it. Nothing was lost; the athlete could not know that.

These are the nets, innermost first. Each one names the fault it exists for.

## 1. The seat fence — `src/seatWrite.js`

App tells the store hook which seat this is once the role is known (`setSeat`:
`staff` / `bhbc-coach` / `athlete` / `unknown`). `useSupaStore.save()` and the
offline queue's replay both ask `canSeatWrite(key)` first. A write the seat
cannot make **never leaves the device and never becomes a banner** — it is
recorded (console, `/api/log-error`, `window.__expoBlockedWrites`) as the
upstream bug it is. RLS remains the last line behind it. `unknown` blocks
nothing: a coach's first save does not wait on a role lookup.

Also in `save()`: a same-reference update (`prev => prev`) is a no-op, never a
network write. That single missing line was the 26.9 banner.

## 2. The boot watchdog — `BootSplash` in `src/App.jsx`

A splash that outstays ten seconds shows *"Still loading — that is longer than
usual. Reloading usually clears it."* and a **Reload** that also clears the
service worker's cached bundle. A stale or broken cached build cannot loop the
athlete on a spinner.

## 3. The crash boundary — `src/ErrorBoundary.jsx`

Around the portal (and every coach tab): a render error becomes a recovery card
with Reload / hard reset / report, posted to `/api/log-error`, instead of a
black page.

## 4. The athlete's own writes never vanish — `src/offlineQueue.js`

Workouts, bodyweight and form videos are queued locally and replayed with
retry; a permanent refusal (RLS, constraint) is surfaced once and dropped, a
transient one retries. Their data is theirs; a lost network is not a lost set.

## 5. The build refuses a coach's pen in the portal — `scripts/verify-portal-write-boundary.mjs`

Runs in `npm run build`. Parses `src/App.jsx`: the portal components
(`ClientPortal`, `MealLogger`, `TrySandbox`, `DemoTraineePortal`) may receive
only the setters an athlete owns (workouts, bodyweight, weekly focus, form
videos; `onDecrementSession` is listed on purpose — it is a no-op off the coach
seat). Portal files may not write the `store` table except their own presence
row. Break-tested: a planted `setTrainees` on `<ClientPortal>` fails the build.

## 6. The athlete's contract with the database — `npm run verify:portal-rls`

Signs in as the test fixture athlete with the public key, exactly as the app
does, and asserts against the live project: the portal's reads are readable
(exercises, portal visibility, own plans, own workouts); the roster row is
*invisible*, not an error; an own workout write round-trips (marker row in,
marker row out); the roster and library writes are **refused with 42501**. If
the last clause ever passes, the database fence is down — say so before
anything else.

## 7. The athlete's seat, end to end — `npm run smoke:portal`

`BASE=https://expo-app.co.il npm run smoke:portal` after every deploy (default
BASE is the preview on `127.0.0.1:5199`). Signs in as the fixture athlete on a
390px phone, opens `/athlete`, starts a day, exits. Fails on: a SAVE FAILED
banner (either language), any 4xx/5xx from the data API, any thrown error or
`console.error`, any write to the `store` table, no program to open, or the
workout view not opening. Prints what it reached; refuses to pass if it did not
reach the workout view.

## What "0 fails" means in practice

- A write the seat cannot make is a bug in the code, not an event for the
  athlete. Nets 1 and 5 make it invisible to them and loud to us.
- A screen that cannot come up must still offer a way out. Nets 2 and 3.
- Their own data survives the network. Net 4.
- Every deploy is proven from their seat before it is called done. Nets 6 and 7.

Order after a deploy: `verify:portal-rls` → `smoke:portal` against production →
only then "done". Both print their coverage; an empty log is not a pass.
