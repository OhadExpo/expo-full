// MUSCLE FOCUS (#907, Ohad 23.10 on an anatomy reel: "our models are not close to this level"): the muscles a movement
// is about, lit on the body (AnatomyBody.setHighlight). A group is a set of Z-Anatomy muscle names; AUTO picks the
// group(s) of the joint(s) that moved the most in the clip, read from the model's own angles over the whole track.
import { modelAngles } from './rig.js';

export const MUSCLE_GROUPS = {
  neck: /Levator scapulae|Trapezius|Splenius|Semispinalis capitis|Sternocleidomastoid|Scalenus/i,
  shoulders: /Deltoid|Supraspinatus|Infraspinatus|Teres minor|Subscapularis/i,
  chest: /Pectoralis|Serratus anterior/i,
  back: /Latissimus|Rhomboid|Trapezius|Iliocostalis|Longissimus|Spinalis|Multifidus|Teres major/i,
  arms: /Biceps brachii|Triceps|Brachialis|Brachioradialis|Coracobrachialis/i,
  core: /Rectus abdominis|abdominal oblique|Transversus abdominis|Quadratus lumborum/i,
  glutes: /Gluteus|Piriformis/i,
  legs: /Rectus femoris|Vastus|Biceps femoris|Semitendinosus|Semimembranosus|Adductor (magnus|longus|brevis)|Gracilis|Sartorius|Gastrocnemius|Soleus|Tibialis anterior/i,
};
// the order the chips show (every row full: 10 = 5 + 5)
export const FOCUS_KEYS = ['off', 'auto', 'neck', 'shoulders', 'chest', 'back', 'arms', 'core', 'glutes', 'legs'];

// which joint moving means which muscles work (the prime movers of that joint's motion)
const JOINT_GROUPS = { knee: ['legs'], hip: ['glutes', 'legs'], ankle: ['legs'], elbow: ['arms'], shoulder: ['shoulders', 'chest', 'back'], trunk: ['core', 'back'], neck: ['neck'] };

// the range of every joint over the clip (seen readings only, 5th-95th percentile), then the group(s) of the biggest:
// every joint within 75% of the largest range counts, at most two groups
export function autoFocus(track, samples = 48) {
  if (!track || !(track.t1 > track.t0)) return [];
  const vals = {};
  for (let k = 0; k <= samples; k++) {
    const a = modelAngles(track, track.t0 + ((track.t1 - track.t0) * k) / samples); if (!a) continue;
    for (const [key, o] of Object.entries(a)) {
      if (!o || o.v == null || !o.seen) continue;
      const j = key.replace(/[LR]$/, ''); (vals[j] || (vals[j] = [])).push(o.v);
    }
  }
  const range = Object.entries(vals).filter(([j, v]) => JOINT_GROUPS[j] && v.length >= 6).map(([j, v]) => {
    const s = v.slice().sort((x, y) => x - y), p = (q) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
    return [j, p(0.95) - p(0.05)];
  }).sort((x, y) => y[1] - x[1]);
  if (!range.length || range[0][1] < 12) return [];   // a hold, not a movement: nothing to point at
  const out = [];
  for (const [j, r] of range) { if (r < range[0][1] * 0.75) break; for (const g of JOINT_GROUPS[j]) if (!out.includes(g) && out.length < 2) out.push(g); }
  return out;
}

// one regex for a set of groups
export const focusPattern = (groups) => (groups && groups.length ? new RegExp(groups.map((g) => MUSCLE_GROUPS[g].source).join('|'), 'i') : null);
