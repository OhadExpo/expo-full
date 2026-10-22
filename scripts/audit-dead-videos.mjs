// Exercise videos that YouTube no longer serves.
//
// A removed or private YouTube video does not error anywhere: the athlete's
// card shows PREVIEW UNAVAILABLE and the tap opens "Video unavailable". On
// 22.10 the first sweep found 18 such ids in the library (Walking DB Lunge,
// BB OHP, BW Step-Up ... used in 30+ plan rows) and one in front of an athlete
// (Omer, Block #10). Nobody reports these - they just quietly stop watching.
//
// Dead = i.ytimg.com answers with YouTube's 120x90 "no thumbnail" placeholder
// for the id (a live video's hqdefault is 480x360; measured), checked twice so
// a network blip is not a dead video. One read of the library and the plans;
// everything else is YouTube, so it costs the database nothing.
//
//   node scripts/audit-dead-videos.mjs          (signs in as the owner; EXPO_PW, default 1234)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const ytId = (u) => (String(u || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) || [])[1] || null;

async function thumbWidth(id) {
  try {
    const r = await fetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, { signal: AbortSignal.timeout(20000) });
    const d = Buffer.from(await r.arrayBuffer());
    for (let i = 0; i < d.length - 9; i++) if (d[i] === 0xff && (d[i + 1] === 0xc0 || d[i + 1] === 0xc2)) return d.readUInt16BE(i + 7);
    return r.status === 404 ? 0 : -1;   // -1: answered, but not a JPEG we can read - not counted as dead
  } catch { return -1; }
}
const isDead = async (id) => { const w = await thumbWidth(id); if (w < 0 || w > 160) return false; const w2 = await thumbWidth(id); return w2 >= 0 && w2 <= 160; };

const { error: ae } = await s.auth.signInWithPassword({ email: process.env.EXPO_EMAIL || 'ohadyproductions@gmail.com', password: process.env.EXPO_PW || '1234' });
if (ae) { console.error('sign-in:', ae.message); process.exit(2); }
const [{ data: lib }, { data: plans }] = await Promise.all([
  s.from('store').select('value').eq('key', 'expo-exercises').single(),
  s.from('plans').select('id,name,trainee_id,data'),
]);

const uses = new Map();   // youtube id -> [{ where }]
const add = (id, where) => { if (!id) return; if (!uses.has(id)) uses.set(id, []); uses.get(id).push(where); };
for (const e of lib.value) add(ytId(e.videoLink), `library: ${e.title}`);
// A row with no video of its own plays its library exercise's video (the
// portal's fallback), so a dead library link is dead on that row too.
const libVid = new Map(lib.value.map((e) => [e.id, e.videoLink]));
const rowVid = (own, exId) => (own !== undefined && own !== null && own !== '') ? [own, ''] : [libVid.get(exId), ' (via library)'];
for (const p of plans) {
  for (const w of p.data?.warmup || []) { const [u, via] = rowVid(w.vid, w.exerciseId); add(ytId(u), `${p.trainee_id} / ${p.name} / warm-up / ${w.t}${via}`); }
  for (const d of p.data?.days || []) for (const x of d.exercises || []) { const [u, via] = rowVid(x.videoUrl ?? x.vid, x.exerciseId); add(ytId(u), `${p.trainee_id} / ${p.name} / ${d.name} / ${x.title}${via}`); }
}

const ids = [...uses.keys()];
const dead = [];
for (let i = 0; i < ids.length; i += 10) {
  const batch = ids.slice(i, i + 10);
  const res = await Promise.all(batch.map(isDead));
  batch.forEach((id, k) => { if (res[k]) dead.push(id); });
}
for (const id of dead) {
  console.log(`DEAD ${id}`);
  for (const w of uses.get(id)) console.log(`     ${w}`);
}
console.log(`\n${ids.length} YouTube ids checked (library ${lib.value.length} exercises, ${plans.length} plans): ${dead.length} dead`);
process.exit(dead.length ? 1 : 0);
