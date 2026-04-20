// Dedup exercise library entries whose titles normalize to the same key.
// "Duplicate" = same normalized title AND compatible metadata (cues / videoLink match OR one is empty).
// "Different-but-same-name" = same normalized title but distinct videoLinks AND distinct cues → keep both.
// When collapsing a group, the canonical entry is the one with the richest metadata (videoLink, cues, category).
// All plan references are rewritten to point to the canonical id.

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const h = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9א-ת]+/g, '').trim();

function richness(e) {
  let n = 0;
  if ((e.videoLink || '').trim()) n += 4;
  if ((e.cues || '').trim()) n += 2;
  if ((e.category || '').trim()) n += 1;
  if ((e.notes || '').trim()) n += 1;
  if ((e.primaryMuscles || '').trim()) n += 1;
  return n;
}

function samePayload(a, b) {
  // Two exercises are considered the same underlying movement if their videoLink
  // matches OR both lack one, and their cues match OR both lack one.
  const va = (a.videoLink || '').trim(), vb = (b.videoLink || '').trim();
  if (va && vb && va !== vb) return false;
  const ca = (a.cues || '').trim(), cb = (b.cues || '').trim();
  if (ca && cb && ca !== cb) return false;
  return true;
}

(async () => {
  const libR = await fetch(SUPA_URL + '/rest/v1/store?key=eq.expo-exercises&select=value', { headers: h });
  const library = (await libR.json())[0]?.value || [];
  console.log('Library start:', library.length);

  // Group by normalized title
  const groups = {};
  for (const e of library) {
    const k = norm(e.title);
    if (!k) continue;
    (groups[k] = groups[k] || []).push(e);
  }

  // For each group with >1 entry, split into equivalence classes by samePayload.
  // Each class collapses to 1 canonical; classes with distinct payloads remain separate.
  const idRemap = {}; // oldId -> canonicalId
  const toRemove = new Set(); // ids to remove from library

  let mergedCount = 0, keptSplitCount = 0;
  for (const [key, entries] of Object.entries(groups)) {
    if (entries.length === 1) continue;
    // Partition: greedy classes
    const classes = [];
    for (const e of entries) {
      let matched = null;
      for (const cls of classes) {
        if (samePayload(cls[0], e)) { matched = cls; break; }
      }
      if (matched) matched.push(e);
      else classes.push([e]);
    }
    for (const cls of classes) {
      if (cls.length === 1) continue;
      // Pick canonical (richest; ties broken by shorter id first for stability)
      const canonical = cls.slice().sort((a, b) => richness(b) - richness(a) || a.id.length - b.id.length || a.id.localeCompare(b.id))[0];
      for (const e of cls) {
        if (e.id !== canonical.id) {
          idRemap[e.id] = canonical.id;
          toRemove.add(e.id);
          mergedCount++;
        }
      }
    }
    if (classes.length > 1) keptSplitCount++;
  }

  console.log(`Merged ${mergedCount} entries into canonicals; ${keptSplitCount} titles kept split (distinct payloads).`);
  console.log(`Will remove ${toRemove.size} library entries.`);

  if (toRemove.size === 0) { console.log('Nothing to dedupe.'); return; }

  // Rewrite plans that reference removed ids
  const plansR = await fetch(SUPA_URL + '/rest/v1/plans?select=id,data', { headers: h });
  const plans = await plansR.json();
  console.log('Plans scanned:', plans.length);

  let plansTouched = 0, refsRewritten = 0;
  for (const p of plans) {
    let changed = false;
    const data = p.data || {};
    const days = Array.isArray(data.days) ? data.days : [];
    for (const d of days) {
      if (!Array.isArray(d.ex)) continue;
      for (const ex of d.ex) {
        if (ex.eid && idRemap[ex.eid]) {
          ex.eid = idRemap[ex.eid];
          refsRewritten++;
          changed = true;
        }
      }
    }
    if (changed) {
      plansTouched++;
      const upd = await fetch(SUPA_URL + '/rest/v1/plans?id=eq.' + p.id, {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (upd.status >= 300) console.error('  patch failed for', p.id, upd.status, await upd.text());
    }
  }
  console.log(`Plans updated: ${plansTouched}, exercise refs rewritten: ${refsRewritten}`);

  // Remove duplicates from library
  const newLibrary = library.filter(e => !toRemove.has(e.id));
  const saveR = await fetch(SUPA_URL + '/rest/v1/store', {
    method: 'POST',
    headers: { ...h, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: 'expo-exercises', value: newLibrary }),
  });
  console.log('Library save status:', saveR.status, '— new size:', newLibrary.length);
})();
