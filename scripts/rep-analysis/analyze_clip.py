import os, csv, numpy as np
from scipy.signal import find_peaks
import matplotlib.pyplot as plt

CSV = os.path.join(os.path.dirname(__file__), 'test-clip.csv')
t = []; cols = {}
with open(CSV) as f:
    for row in csv.DictReader(f):
        t.append(float(row['t']))
        for k, v in row.items():
            if k in ('frame','t'): continue
            cols.setdefault(k, []).append(float(v) if v else np.nan)
t = np.array(t); cols = {k: np.array(v) for k, v in cols.items()}

print(f'fps: {len(t)/t[-1]:.2f}, duration: {t[-1]:.2f}s, samples: {len(t)}')
print('\nSignal ranges per channel:')
for k, v in cols.items():
    nn = v[~np.isnan(v)]
    if len(nn)==0: print(f'  {k}: all NaN'); continue
    print(f'  {k}: range={nn.max()-nn.min():.1f}°  min={nn.min():.1f}°  max={nn.max():.1f}°')

def smooth(x, n=5):
    out = np.full_like(x, np.nan)
    for i in range(len(x)):
        w = x[max(0,i-n//2):i+n//2+1]; w = w[~np.isnan(w)]
        if len(w): out[i] = np.median(w)
    return out

fps = len(t)/t[-1]
print('\nPeak counts at prominence=25, distance=0.4s:')
for k in ['L_SHO','R_SHO','L_ELB','R_ELB','L_HIP','R_HIP','L_KNE','R_KNE']:
    sig = smooth(cols[k], 5)
    clean = np.where(~np.isnan(sig), sig, np.nanmin(sig))
    peaks,_ = find_peaks(clean, prominence=25, distance=int(fps*0.4))
    print(f'  {k}: {len(peaks)} peaks')

print('\nPlotting...')
fig, axes = plt.subplots(4,2, figsize=(14,10), sharex=True)
for ax, k in zip(axes.flat, ['L_SHO','R_SHO','L_ELB','R_ELB','L_HIP','R_HIP','L_KNE','R_KNE']):
    sm = smooth(cols[k], 5)
    ax.plot(t, sm, 'b-', lw=1.2)
    ax.plot(t, cols[k], 'r:', lw=0.5, alpha=0.5)
    clean = np.where(~np.isnan(sm), sm, np.nanmin(sm) if np.any(~np.isnan(sm)) else 0)
    peaks,_ = find_peaks(clean, prominence=25, distance=int(fps*0.4))
    ax.plot(t[peaks], sm[peaks], 'go', markersize=8)
    ax.set_title(f'{k} ({len(peaks)} peaks)')
    ax.grid(alpha=0.3)
plt.tight_layout()
out = os.path.join(os.path.dirname(__file__), 'test-clip-plot.png')
plt.savefig(out, dpi=90); print(f'saved {out}')
