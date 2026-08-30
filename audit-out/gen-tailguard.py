# -*- coding: utf-8 -*-
# A release you did not film the end of is not a measurable shot.
#
# Measured 2026-08-30 on a darkened copy of Ohad's clip: 18 shots where the
# reference encode gives 17. The two runs agree on all seventeen real releases
# to within ~400 ms; the extra one sits at 79,250 ms in a clip that ends at
# ~79,500 ms. It is the camera being switched off, read as a shot.
#
# Darkening did not invent a rep - it added landmark noise, and the noise was
# enough to push a truncated tail over the release threshold. Raising the
# threshold to hide that would be tuning against one clip. The real defect is
# that a candidate is accepted without checking there is any clip left to
# measure it in: the engine requires a follow-through hold of at least 300 ms
# after release, so a release with 250 ms remaining can never satisfy its own
# checkpoints, yet it still counted toward the total the coach reads.

import io, json

src = io.open('src/shotAnalysis.js', encoding='utf-8', newline='').read()
NL = '\r\n' if '\r\n' in src else '\n'
fix = lambda t: t.replace('\n', NL)

assert 'clip ends' not in src, 'already applied'

a = ("    const armElevNear = bestNear(sm.armElev, release, 150);\n"
     "    if (!isReal(armElevNear) || armElevNear < G.armElev) { note(tMs[release], 'arm not overhead (' + Math.round(armElevNear || 0) + '° image-plane)'); continue; }")

b = ("    // THERE HAS TO BE CLIP LEFT TO MEASURE THE SHOT IN.\n"
     "    //\n"
     "    // The follow-through checkpoint wants the arm held for 300 ms after\n"
     "    // release, so a release with less clip than that remaining cannot be\n"
     "    // scored on its own terms - and a truncated tail is exactly what noise\n"
     "    // turns into a phantom rep. A darkened copy of Ohad's clip returned 18\n"
     "    // shots against the reference encode's 17, and the extra one sat 250 ms\n"
     "    // from the end of the file: the camera being switched off, read as a\n"
     "    // shot. Rejecting it is not a tuned threshold, it is the definition of\n"
     "    // a rep this engine can measure.\n"
     "    if (tMs[n - 1] - tMs[release] < MIN_TAIL_MS) { note(tMs[release], 'clip ends ' + Math.round(tMs[n - 1] - tMs[release]) + 'ms after release'); continue; }\n"
     + a)

a, b = fix(a), fix(b)
n = src.count(a)
assert n == 1, ('anchor matched %d' % n)
out = src.replace(a, b)

# the constant, next to the other detection floors
c = "const ARM_UP_FLOOR = 55;"
assert out.count(c) == 1, out.count(c)
out = out.replace(c, c + fix(
    "\n// A shot needs enough clip after the release to observe the follow-through\n"
    "// the scorecard asks for (300 ms), plus a margin. Shorter than this and the\n"
    "// rep cannot be scored, so counting it only inflates the number.\n"
    "const MIN_TAIL_MS = 400;"))

io.open('audit-out/patch-tailguard.mjs', 'w', encoding='utf-8', newline='').write(
    "const OUT = " + json.dumps(out, ensure_ascii=False) + ";\n"
    "export default (s) => { if (s.includes('MIN_TAIL_MS')) throw new Error('already applied'); "
    "if (s === OUT) throw new Error('no-op'); return OUT; };\n")
print('tail guard written (not applied - a run is in flight)')
