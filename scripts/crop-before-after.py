# -*- coding: utf-8 -*-
"""Crop each before/after pair to the region that actually changed.

A full-page shot scaled into half a column hides the very thing it is meant to
show - a 27px overflow on one card is invisible at that size. The crop is what
makes the picture worth having.

Both images of a pair get the SAME box, or the eye compares two different
framings and sees a difference that is not there. The box is clamped to
whichever image is smaller, and a pair whose box comes out empty is left
uncropped rather than written as a zero-byte image.
"""
import json, os
from PIL import Image

IDX = 'audit-out/beforeafter/index.json'
pairs = json.load(open(IDX, encoding='utf-8'))
out = []

for p in pairs:
    fb = f"audit-out/beforeafter/{p['id']}-before.png"
    fa = f"audit-out/beforeafter/{p['id']}-after.png"
    if not (os.path.exists(fb) and os.path.exists(fa)):
        continue
    ib, ia = Image.open(fb), Image.open(fa)
    # DPR is NOT constant: the 390px shots come back 2x (mobile emulation sets a
    # deviceScaleFactor) while the desktop ones are 1x. Assuming 2 everywhere
    # produced an empty box and a "cannot write empty image" crash. Derive the
    # scale from the capture itself.
    w = min(ib.size[0], ia.size[0])
    h = min(ib.size[1], ia.size[1])
    scale = max(1, round(w / p['w'])) if p.get('w') else 1
    x, y, cw, ch = p['crop']
    box = (max(0, x * scale), max(0, y * scale),
           min((x + cw) * scale, w), min((y + ch) * scale, h))
    if box[2] - box[0] < 20 or box[3] - box[1] < 20:
        print('  %-18s box empty after clamping (%dx%d image) - left uncropped'
              % (p['id'], w, h))
        out.append(p)
        continue
    ib.crop(box).save(fb.replace('.png', '-c.png'))
    ia.crop(box).save(fa.replace('.png', '-c.png'))
    q = dict(p); q['cropped'] = True
    out.append(q)
    print('  %-18s %dx%d -> %dx%d' % (p['id'], w, h, box[2] - box[0], box[3] - box[1]))

json.dump(out, open(IDX, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('%d pair(s) indexed' % len(out))
