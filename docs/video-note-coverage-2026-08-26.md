# Video and note coverage, measured from the athlete's side — 2026-08-26

Ohad, 2026-08-26: *"make sure amit gershon block is perfect (full notes, videos
for every exercise)."* Amit is done. Doing it surfaced a measurement error and
the real roster-wide picture, both below.

Tool: `node scripts/audit-athlete-block.cjs [name-or-id]` (no argument = every
athlete). Reads only.

## The measurement error, first

My first pass reported **"16 of 24 rows have no video"** on Amit and that was
wrong. It counted rows whose `videoUrl` is blank. But `videoUrl` is three-state
(`src/ClientPortal.jsx:252`): `undefined` means *no override — show the
library's video for this eid*. All 16 of Amit's rows carried an eid that
resolved to a library video, so he could already see all 24.

Verified rather than assumed: for each of the 16, the URL now on the row is
**byte-identical** to what the library fallback would have served — 16 identical,
0 changed. The fill made his rows self-contained; it did not fix a gap.

The audit now reports **what the athlete sees**, and says how many rows reach
their video through the library.

## Amit Gershon (`tr_bh_4djtfei1ly3`) — Block #1

| | |
|---|---|
| rows | 24 |
| athlete sees a video | **24 / 24** |
| videos confirmed playable | **24 / 24** (YouTube oEmbed, not a URL-shape check) |
| distinct videos | 24 — no row reuses another's clip |
| notes present | 21 / 24 |
| sets / reps / titles | complete |

Backup before the write: `scripts/_backup-amit-pl_czpgs9z9mt8kh0cw-2026-08-26.json`.

**Needs Ohad — 3 rows have no note, and no note exists anywhere for them.** Not
in the library, and not on any other athlete's row anywhere in the database:

- day 1 #8 — Reverse Sitting Cable Over-Head Tricep Extension
- day 2 #5 — ISO Sitting DB Shrug
- day 3 #2 — DB SL Depth Drop

Cue authoring is Ohad's, so these stay blank rather than being invented.

## The roster, measured the same way

32 athletes · 185 plans · 3,751 exercise rows.

| | rows | share |
|---|---|---|
| video comes from the row itself | 727 | 19% |
| video comes from the library | 2,496 | 67% |
| **athlete sees NO video** | **528** | **14%** |
| no note | 641 | 17% |

105 of 185 plans contain at least one row the athlete sees no video for.

## Why those rows are blank — and why no script fixes them

Across the whole `plans` table (all plans, not only rostered athletes):

- **544 rows** point at a library entry that simply **has no video**. This is the
  same wall as `docs/missing-videos.md`: the sources are exhausted. It needs
  footage, not code.
- **138 rows have no exercise id at all** — free text the coach typed. Of those,
  exactly **1** has a title matching a library entry with a video. The other 137
  are things like *"Optional: low incline DB press / Machine Press"*,
  *"Biceps tendon isometric - elbow 90 deg"*, *"Dragon fly"* — never library
  exercises. Several sit in Block #15, which is Gutliv territory (ask, don't fix).
- **0 rows** point at an eid missing from the library, so there are no dangling
  references. The linking is sound; the coverage is not.

**Nothing here was bulk-fixed.** Filling these means either sourcing video or
changing what an athlete sees, and the library is not to be bulk-touched without
Ohad saying so.

## What Ohad decides

1. Author the 3 missing cues for Amit (or say to leave them blank).
2. Whether to make every row self-contained roster-wide, as Amit's now is. It
   changes nothing an athlete sees today, but it means a later library edit
   cannot silently remove a video from a written programme.
3. The 544 library entries with no video — same backlog as `missing-videos.md`.
4. The 137 free-text rows: promote to real library exercises, or accept no video.
