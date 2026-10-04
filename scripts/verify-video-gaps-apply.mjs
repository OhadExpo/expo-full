// verify-video-gaps-apply.mjs - the Videos screen's write rules (5.10 #559). Pure, no network.
// BREAK=1 swaps in the naive versions (a setter that ignores what the coach saw,
// a validator that takes any string) - must FAIL.
import * as real from '../src/videoGapsApply.js';

const naive = {
  setLibraryVideo: (prev, id, _from, url) => (prev || []).map((e) => (e.id === id ? { ...e, videoLink: url } : e)),
  checkLink: (s) => ({ ok: !!String(s || '').trim(), kind: 'https', url: String(s || '').trim() }),
};
const { dryRun, missingAthletes, unknownDataKeys, undoVerdict, chunk, linksToCheck, deadRows } = real;
const setLibraryVideo = process.env.BREAK ? naive.setLibraryVideo : real.setLibraryVideo;
const checkLink = process.env.BREAK ? naive.checkLink : real.checkLink;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const V = 'https://youtu.be/AAAAAAAAAAA', V2 = 'https://www.youtube.com/watch?v=BBBBBBBBBBB';

// --- the link the coach pastes
ok(checkLink(V).ok && checkLink(V).kind === 'youtube', 'a youtu.be link is a YouTube video');
ok(checkLink('https://youtube.com/shorts/CCCCCCCCCCC').ok, 'a Shorts link is accepted');
ok(checkLink('https://vimeo.com/123456789').kind === 'vimeo', 'a Vimeo link is a Vimeo video');
ok(checkLink('https://cdn.example.com/clip.mp4').ok, 'any other https link is accepted as-is');
ok(!checkLink('http://youtu.be/AAAAAAAAAAA').ok, 'http is refused (https only)');
ok(!checkLink('javascript:alert(1)').ok, 'javascript: is refused');
ok(!checkLink('https://www.youtube.com/channel/xyz').ok, 'a YouTube link with no video id is refused');
ok(!checkLink('rdl video').ok, 'free text is refused');

// --- the library setter (the 27.8 wipe shape)
const lib = [{ id: 'a', title: 'A', videoLink: '' }, { id: 'b', title: 'B', videoLink: V }];
const n1 = setLibraryVideo(lib, 'a', '', V2);
ok(n1 !== lib && n1.length === 2 && n1[0].videoLink === V2 && n1[1] === lib[1], 'a gap gets its video by id; every other row is the same object');
ok(setLibraryVideo(lib, 'b', '', V2) === lib, 'a row that already HAS a video is not overwritten by a gap approve (same array back = no write)');
ok(setLibraryVideo(lib, 'b', V, V2)[1].videoLink === V2, 'a dead-link replacement writes only over the link the coach saw');
ok(setLibraryVideo([], 'a', '', V2).length === 0, 'an unloaded (empty) library is never written into');
ok(setLibraryVideo(lib, 'zz', '', V2) === lib, 'an id that is gone changes nothing');

// --- the dry run
const plans = [
  { id: 'p1', trainee_id: 't1', name: 'Block 3', active: true, data: { days: [
    { name: 'Day A', exercises: [{ exerciseId: 'a', title: 'A' }, { exerciseId: 'a', title: 'A', videoUrl: '' }] },
    { name: 'Day B', exercises: [{ exerciseId: 'a', title: 'A', videoUrl: V }] },
  ], warmup: [{ eid: 'a', t: 'A' }] } },
  { id: 'p2', trainee_id: 't2', name: 'Block 1', active: false, data: { days: [{ n: 'Lower', ex: [{ t: 'a' }] }] } },
  { id: 'p3', trainee_id: 't3', name: 'Other', active: true, data: { days: [{ exercises: [{ exerciseId: 'b', title: 'B' }] }] } },
];
const trainees = [{ id: 't1', name: 'Dana' }, { id: 't2', name: 'Yoni' }];
const d = dryRun({ exId: 'a', exTitle: 'A', from: '', url: V2 }, plans, trainees);
ok(d.rowCount === 3 && d.plans.length === 2, `3 rows in 2 programs (${d.rowCount}/${d.plans.length})`);
ok(d.leftAlone === 2, `your "no video" row and your override are left alone and counted (${d.leftAlone})`);
ok(d.plans[0].athlete === 'Dana' && d.plans[0].places.some((x) => x.where === 'warmup') && d.plans[0].places.some((x) => x.dayName === 'Day A'), 'each place is named: athlete, day name, warm-up');
ok(d.plans[1].places[0].dayName === 'Lower' && d.plans[1].active === false, 'a compact-shape day keeps its name; the inactive program sorts last');
ok(d.athleteCount === 2 && d.library.from === '' && d.library.to === V2, 'the library line reads "" -> the new link');

ok([...missingAthletes([{ id: 'a', title: 'A', videoLink: '' }, { id: 'b', title: 'B', videoLink: V }], plans)].join() === 't1', 'athletes missing a video = ACTIVE programs, absent row, exercise with no library video');

// --- which programs an athlete sees today (the portal's default rule)
const cur = real.markCurrent([
  { id: 'b7', trainee_id: 't1', name: 'Block #7', active: true, created_at: '2026-01-01' },
  { id: 'b9', trainee_id: 't1', name: 'Block 9 - Power', active: true, created_at: '2025-12-01' },
  { id: 'mr', trainee_id: 't1', name: 'Morning Routine', active: true, created_at: '2025-01-01' },
  { id: 'b2', trainee_id: 't2', name: 'Phase 2', active: true, created_at: '2025-01-01' },
]);
const act = Object.fromEntries(cur.map((p) => [p.id, p.active]));
ok(process.env.BREAK ? true : (act.b9 && !act.b7 && act.mr && act.b2), 'current = the highest block per athlete + every unnumbered program; an older block is not current even if created later');

// --- the save + undo fences
ok(unknownDataKeys({ days: [], warmup: [], weeks: 4, isTemplatePurchase: false }).length === 0, 'the four keys on prod are all round-tripped by savePlan');
ok(unknownDataKeys({ days: [], extra: 1 }).join() === 'extra', 'a key savePlan would drop is caught (the program is refused, not stripped)');
ok(undoVerdict('2026-10-05T01:00:00+00:00', { updated_at: '2026-10-05T01:00:00+00:00' }) === 'ok', 'undo when the program is still the version we wrote');
ok(undoVerdict('2026-10-05T01:00:00+00:00', { updated_at: '2026-10-05T01:05:00+00:00' }) === 'changed', 'a program saved after us is NOT undone');
ok(undoVerdict('x', null) === 'gone', 'a deleted program is reported, not re-created');

// --- the health check plumbing
ok(chunk(Array.from({ length: 120 }, (_, i) => i), 50).map((c) => c.length).join() === '50,50,20', 'links go in batches of 50 (the endpoint\'s cap)');
ok(linksToCheck([{ videoLink: V }, { videoLink: V + ' ' }, { videoLink: 'https://cdn.x.com/a.mp4' }, { videoLink: '' }]).length === 1, 'only YouTube/Vimeo links are sent, deduplicated');
const dr = deadRows([{ id: 'a', title: 'Zed', videoLink: V }, { id: 'b', title: 'Alpha', videoLink: V2 }, { id: 'c', title: 'C', videoLink: 'https://vimeo.com/123456789' }],
  [{ url: V, state: 'dead' }, { url: V2, state: 'no-embed' }, { url: 'https://vimeo.com/123456789', state: 'unknown' }]);
ok(dr.length === 2 && dr[0].state === 'dead', 'dead first, then no-embed; a failed check (unknown) is never called dead');

console.log(`VIDEO GAPS APPLY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
