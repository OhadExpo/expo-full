import os, csv
import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import find_peaks

CSV = os.path.join(os.path.dirname(__file__), 'sl-hip-thrust.csv')

def load():
    t = []; cols = {}
    with open(CSV) as f:
        for row in csv.DictReader(f):
            t.append(float(row['t']))
            for k, v in row.items():
                if k in ('frame', 't'): continue
                cols.setdefault(k, []).append(float(v) if v else np.nan)
    return np.array(t), {k: np.array(v) for k, v in cols.items()}

def smooth(x, n=5):
    out = np.full_like(x, np.nan)
    for i in range(len(x)):
        w = x[max(0, i-n//2):i+n//2+1]; w = w[~np.isnan(w)]
        if len(w): out[i] = np.median(w)
    return out

t, cols = load()
fps = len(t) / t[-1]
sm = {k: smooth(v, 5) for k, v in cols.items()}

# Try a sweep of prominence thresholds on just hip channels.
print(f'fps={fps:.2f}, {len(t)} frames')
print('\nprominence sweep (hip channels, distance=0.5s):')
print(f'{"prom":>5} | {"L_HIP":>6} {"R_HIP":>6} {"L_KNE":>6} {"R_KNE":>6}')
for prom in [10, 15, 20, 25, 30, 40]:
    row = [f'{prom:>5}']
    for ch in ['L_HIP', 'R_HIP', 'L_KNE', 'R_KNE']:
        sig = np.where(~np.isnan(sm[ch]), sm[ch], np.nanmin(sm[ch]))
        peaks, _ = find_peaks(sig, prominence=prom, distance=int(fps*0.5))
        row.append(f'{len(peaks):>6}')
    print(' | '.join(row))

# Now — peaks on hip but require TROUGH between peaks to be below a floor.
# For a SL hip thrust, "top of rep" has hip > 140°, "bottom of rep" has hip < 120°.
# Peaks without a sufficiently deep trough between them are double-bounces, not reps.
print('\npeaks between first-rep-start and last-rep-end, L_HIP prom=20:')
sig = np.where(~np.isnan(sm['L_HIP']), sm['L_HIP'], np.nanmin(sm['L_HIP']))
peaks, props = find_peaks(sig, prominence=20, distance=int(fps*0.5))
for p in peaks:
    print(f'  t={t[p]:.2f}s  angle={sig[p]:.1f}°  prom={props["prominences"][list(peaks).index(p)]:.1f}°')
print(f'\ncount: {len(peaks)}')

# Zoom plot 5s-27s (the "active" set portion)
i_start = int(5 * fps); i_end = int(28 * fps)
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(t[i_start:i_end], sm['L_HIP'][i_start:i_end], 'b-', lw=1.5, label='L_HIP smoothed')
ax.plot(t[i_start:i_end], sm['R_HIP'][i_start:i_end], 'g-', lw=1.5, label='R_HIP smoothed', alpha=0.7)
pl, _ = find_peaks(np.where(~np.isnan(sm['L_HIP']), sm['L_HIP'], np.nanmin(sm['L_HIP'])), prominence=20, distance=int(fps*0.5))
pr, _ = find_peaks(np.where(~np.isnan(sm['R_HIP']), sm['R_HIP'], np.nanmin(sm['R_HIP'])), prominence=20, distance=int(fps*0.5))
pl = [p for p in pl if i_start <= p < i_end]; pr = [p for p in pr if i_start <= p < i_end]
ax.plot(t[pl], sm['L_HIP'][pl], 'bo', markersize=10, label=f'L_HIP {len(pl)}')
ax.plot(t[pr], sm['R_HIP'][pr], 'gs', markersize=10, label=f'R_HIP {len(pr)}', alpha=0.7)
ax.set_xlabel('time (s)'); ax.set_ylabel('hip angle (°)')
ax.legend(); ax.grid(alpha=0.3)
ax.set_title('Zoomed: 5s-28s hip signals with prominence-based peaks')
out = os.path.join(os.path.dirname(__file__), 'hip-zoom.png')
plt.tight_layout(); plt.savefig(out, dpi=100)
print(f'\nsaved {out}')
