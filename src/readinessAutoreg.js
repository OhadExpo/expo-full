// readinessAutoreg.js — turn the athlete's daily readiness check-in (pain / sleep
// / energy) into a concrete session nudge for TODAY.
//
// MARKET GAP: fitness apps LOG a readiness/wellness check-in; none tie it to the
// PRESCRIBED session. EXPO has both, so it can say "you reported pain 4 + poor
// sleep — today's main lift: back off ~10% or drop a set" instead of leaving the
// coach to eyeball it. Grounded in EXPO's own load rules (project CLAUDE.md):
//   • Pain 0–3/10 train · 4–5 MODIFY · 6+ STOP and reassess (never program through).
//   • Regress in order ROM → Tempo → Intensity → Volume → Frequency (freq last).
// Pure + honest — a missing check-in returns 'unknown', never a fabricated verdict.
// GREENLIGHT-GATED: no UI until Ohad approves.

// Normalize one check-in field to a 0–3 QUALITY (3 = best). Accepts the portal's
// named levels AND legacy numeric strings; pain is inverted (less pain = better).
// Returns null when the field wasn't logged.
const SLEEP_ENERGY = { high: 3, good: 3, great: 3, moderate: 2, ok: 2, mild: 1, low: 1, poor: 1, none: 0, bad: 0 };
const PAIN = { none: 3, no: 3, mild: 2, moderate: 1, mod: 1, high: 0, severe: 0 };

export function fieldQuality(key, val) {
  const s = String(val ?? '').trim().toLowerCase();
  if (!s) return null;
  const table = key === 'pain' ? PAIN : SLEEP_ENERGY;
  if (s in table) return table[s];
  const num = parseFloat(s);
  if (!Number.isFinite(num)) return null;
  if (key === 'pain') {
    // Numeric pain maps to the TRAINING RULE thresholds, not a linear scale:
    // 0 none · 1–3 trainable · 4–5 MODIFY · 6+ STOP (CLAUDE.md). A linear /10
    // would let a 5 read "fine" and a 6 read "modify" — wrong side of both gates.
    if (num >= 6) return 0;
    if (num >= 4) return 1;
    if (num >= 1) return 2;
    return 3;
  }
  const norm = Math.max(0, Math.min(1, num / 10)); // sleep/energy: linear 0–10
  return Math.max(0, Math.min(3, Math.round(norm * 3)));
}

// checkin = { pain, sleep, energy } (any subset; named or numeric). Returns:
//   { level:'green'|'amber'|'red'|'unknown', loadAdjustPct, regress, headline, note }
// loadAdjustPct: suggested % change to today's top load (0 = as planned, null = don't
// load). regress: which lever to pull first, per the hierarchy. Never prescribes a
// number the check-in doesn't support.
export function readinessAutoreg(checkin = {}) {
  const painQ = fieldQuality('pain', checkin.pain);
  const sleepQ = fieldQuality('sleep', checkin.sleep);
  const energyQ = fieldQuality('energy', checkin.energy);
  if (painQ == null && sleepQ == null && energyQ == null) {
    return { level: 'unknown', loadAdjustPct: null, regress: null, headline: 'No check-in logged', note: 'Ask for a quick pain / sleep / energy check-in to unlock a session nudge.' };
  }

  // Pain is the GATE — it overrides sleep/energy (CLAUDE.md pain rules).
  if (painQ === 0) { // pain high (≈6+/10) → stop & reassess, never program through
    return { level: 'red', loadAdjustPct: null, regress: 'frequency', headline: 'Pain 6+ — don\'t load today', note: 'Stop and reassess, not a training-through day. Screen for red flags; swap to pain-free ROM / mobility or rest.' };
  }
  if (painQ === 1) { // pain moderate (≈4–5) → MODIFY
    return { level: 'amber', loadAdjustPct: -10, regress: 'intensity', headline: 'Pain 4–5 — modify the session', note: 'Drop the top load ~10% and stay in a pain-free range (ROM/tempo first, then intensity). Reassess set to set — cut it if pain climbs past 5.' };
  }

  // Pain fine (0–3): the effort read comes from sleep + energy.
  const eff = [sleepQ, energyQ].filter((x) => x != null);
  if (!eff.length) {
    return { level: 'green', loadAdjustPct: 0, regress: null, headline: 'Pain clear — train as planned', note: 'No pain reported and no sleep/energy read — proceed on the plan, autoregulate by feel.' };
  }
  const avg = eff.reduce((a, b) => a + b, 0) / eff.length;
  if (avg >= 2.5) return { level: 'green', loadAdjustPct: 0, regress: null, headline: 'Recovered — full send', note: 'Pain clear, sleep + energy good. Hit the prescribed loads; a PR attempt is fair game.' };
  if (avg >= 1.5) return { level: 'amber', loadAdjustPct: -5, regress: 'volume', headline: 'A bit under — trim, don\'t grind', note: 'Sleep/energy off. Keep the intensity, cut a back-off set or two (volume before intensity) and stop sets a rep short.' };
  return { level: 'amber', loadAdjustPct: -12, regress: 'intensity', headline: 'Run down — back off today', note: 'Poor sleep AND low energy. Pull the top load ~10–15% and keep it crisp; bank the session, don\'t chase it. Keep frequency — regress load first.' };
}
