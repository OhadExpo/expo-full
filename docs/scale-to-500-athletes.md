# Scaling to 500 athletes — measured, 2026-08-31

Ohad: "plan it so i can work with 500 athletes in the same time."

## The shape of the cost

Measured against the live database, not extrapolated from one browser profile.
Dividing everything by headcount was the earlier mistake and it produced a
meaningless "20 KB per athlete".

| | size | grows with |
|---|---|---|
| exercise library + program templates | **602 KB** | nothing |
| roster row + portal visibility | **0.9 KB** | each athlete |
| a logged workout | **3.2 KB** | each session logged |

| scenario | projected | vs 5 MB quota |
|---|---|---|
| 500 athletes, shallow history as today (~4 each) | 7.3 MB | over ×1.5 |
| 500 athletes, one season (~60 each) | 94.2 MB | over ×18.8 |
| 500 athletes, a year (~100 each) | 156.3 MB | over ×31.3 |

**Headcount is not the driver. Logged history is.** 500 athletes who never train
cost 1.1 MB; 20 athletes with three years of history cost more than 500 with a
week.

## Already fixed

localStorage is no longer the failure point. The workout snapshot is trimmed to
a 384 KB budget (`lsSnapshotRecent`, proven on 5000 synthetic rows) and the auth
token is written through a storage wrapper that evicts snapshots rather than
letting the session be the thing that gets dropped. That was the bug behind "i
cant login through chrome or the pwa".

## The remaining wall, and it is not localStorage

`useSupaStore.js:525` loads the whole table:

    supabase.from('client_workouts').select('*').order('date', ...)

No window, no limit. At 500 athletes with a season that is ~30,000 rows fetched,
parsed and held in memory on every app load.

### The 36% that is free

Measured across the current 122 rows (392.8 KB total):

    form_videos      141.3 KB   36%
    exercises        216.0 KB   55%
    everything else   35.6 KB    9%

`form_videos` is over a third of the payload, and a lazy per-id fetch for it
**already exists** (`useSupaStore.js:209` and `:695`). Dropping it from the bulk
select is the single biggest cut available.

**It is not a drop-in.** 33 references across 10 files read `formVideos` off
state — including `autoTasks.js`, which raises the form-video review tasks, and
`autoAnalyzeVideos.js`. Removing the column silently would leave those reading
an empty array: no error, no review tasks, nobody told. That is the exact
failure mode the no-silent-caps rule exists to prevent.

So it needs a marker the consumers can branch on — a count or the ids in the
bulk row, payload fetched on demand — not a deletion.

### Order of work

1. Bulk row carries `form_videos` **ids/count only**; payloads fetched lazily
   through the path that already exists. Update the 33 consumers to branch on
   the marker. −36% immediately, no behaviour change.
2. Window the initial fetch by date (most recent N months) with an explicit,
   visible "load older" path. Never a silent cap — if rows are withheld, the UI
   says so.
3. Only then consider the 602 KB library floor: it is fixed cost, it is already
   the smaller half, and it is shared by every screen.

Do 1 and 2 before touching 3.

## Rule for whoever does this

These are trainee-visible data paths. Branch, preview, verify from the real
seat, and ask before the production deploy.
