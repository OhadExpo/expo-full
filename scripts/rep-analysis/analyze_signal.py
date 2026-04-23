"""
Look at the signal. For SL hip thrust, the dominant motion is hip extension —
hips cycle huge while knees stay near 90° and shoulders don't move much.
Goal: find the real number of reps using proper peak detection, then check
what our live detector's heuristics would say.
"""
import sys, os, csv, math
import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import find_peaks

CSV_PATH = os.path.join(os.path.dirname(__file__), 'sl-hip-thrust.csv')

def load():
    t = []
    cols = {}
    with open(CSV_PATH) as f:
        r = csv.DictReader(f)
        for row in r:
            t.append(float(row['t']))
            for k, v in row.items():
                if k in ('frame', 't'): continue
                cols.setdefault(k, []).append(float(v) if v else np.nan)
    return np.array(t), {k: np.array(v) for k, v in cols.items()}

def smooth(x, n=5):
    out = np.full_like(x, np.nan)
    for i in range(len(x)):
        w = x[max(0, i-n//2):i+n//2+1]
        w = w[~np.isnan(w)]
        if len(w): out[i] = np.median(w)
    return out

def main():
    t, cols = load()
    print(f'frames: {len(t)}, duration: {t[-1]:.2f}s, fps: {len(t)/t[-1]:.2f}')
    print('\nchannel stats:')
    for k, v in cols.items():
        nonnan = v[~np.isnan(v)]
        if len(nonnan) == 0:
            print(f'  {k}: ALL NAN'); continue
        print(f'  {k}: min={nonnan.min():.1f}° max={nonnan.max():.1f}° range={nonnan.max()-nonnan.min():.1f}° nans={np.isnan(v).sum()}/{len(v)}')

    # Smooth
    sm = {k: smooth(v, 5) for k, v in cols.items()}

    # For SL hip thrust, hip is the dominant channel. Peak detection on the
    # smoothed signal — PEAKS in hip angle (= hip extension = rep top, body up).
    # prominence = how much the peak stands out from surrounding signal
    # distance = minimum samples between peaks (min cycle length)
    fps = len(t) / t[-1]
    for ch in ['L_HIP', 'R_HIP', 'L_KNE', 'R_KNE']:
        sig = sm[ch]
        # need to handle NaN for find_peaks
        mask = ~np.isnan(sig)
        if not mask.any(): continue
        sig_clean = np.where(mask, sig, np.nanmin(sig))
        # distance = 0.4s at min = ~10 frames, prominence = 15° (a real rep peak must stand out)
        peaks, props = find_peaks(sig_clean, prominence=15, distance=int(fps*0.4))
        rng = np.nanmax(sig) - np.nanmin(sig)
        print(f'\n{ch}: {len(peaks)} peaks | range {rng:.1f}°')
        for p in peaks[:20]:
            print(f'  t={t[p]:.2f}s  angle={sig[p]:.1f}°  prom={props["prominences"][list(peaks).index(p)]:.1f}°')

    # Plot the signal
    fig, axes = plt.subplots(4, 1, figsize=(14, 8), sharex=True)
    for ax, ch in zip(axes, ['L_HIP', 'R_HIP', 'L_KNE', 'R_KNE']):
        ax.plot(t, sm[ch], 'b-', lw=1)
        ax.plot(t, cols[ch], 'r:', lw=0.5, alpha=0.5)
        mask = ~np.isnan(sm[ch])
        sig_clean = np.where(mask, sm[ch], np.nanmin(sm[ch]))
        peaks, props = find_peaks(sig_clean, prominence=15, distance=int(fps*0.4))
        ax.plot(t[peaks], sm[ch][peaks], 'go', markersize=8, label=f'{len(peaks)} peaks')
        ax.set_ylabel(ch)
        ax.legend(loc='upper right')
        ax.grid(alpha=0.3)
    axes[-1].set_xlabel('time (s)')
    fig.suptitle('SL Hip Thrust — joint angles + detected peaks', fontsize=12)
    plt.tight_layout()
    out_png = os.path.join(os.path.dirname(__file__), 'sl-hip-thrust-plot.png')
    plt.savefig(out_png, dpi=90)
    print(f'\nsaved plot to {out_png}')

if __name__ == '__main__':
    main()
