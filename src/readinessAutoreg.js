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
// Scale MUST match ReadinessRow.checkinQuality (the declared single source of
// truth) so the load nudge and the readiness trend graph agree on the same
// check-in. Portal writes: sleep poor/ok/good/great · energy low/ok/good/high.
const SLEEP_ENERGY = { poor: 0, low: 0, bad: 0, none: 0, ok: 1, fair: 1, moderate: 1, good: 2, great: 3, high: 3 };
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

  // Pain is the GATE — it overrides sleep/energy (CLAUDE.md pain rules). This
  // reads pain MAGNITUDE only, not pathology; a low/mild-pain green can still
  // harbour a red flag (saddle anaesthesia, night pain, drop foot…) — screen in
  // person, don't treat this as a clinical clearance.
  if (painQ === 0) { // pain high (≈6+/10) → stop & reassess, never program through
    return { level: 'red', loadAdjustPct: null, regress: 'frequency', headline: 'Pain 6+ — don\'t load today', note: 'Stop and reassess — not a training-through day. Swap to pain-free ROM / mobility or rest, and screen in person for red flags (this reads pain intensity only, not pathology).' };
  }
  if (painQ === 1) { // pain moderate (≈4–5) → MODIFY
    return { level: 'amber', loadAdjustPct: -10, regress: 'intensity', headline: 'Pain 4–5 — modify the session', note: 'Stay pain-free: regress ROM/tempo first, then pull the top load ~10%. Reassess set to set — cut it if pain climbs past 5.' };
  }

  // Pain trainable (mild / none) OR pain NOT logged. Effort read = sleep + energy.
  // SAFETY: a MISSING pain answer is NOT "pain-free" — never green / "PR" a day
  // pain wasn't reported (adversarial-review HIGH). A logged MILD pain is
  // trainable but the note must reflect it and drop any PR language.
  const painMissing = painQ == null;
  const painMild = painQ === 2;
  const painNote = painMissing ? ' Pain wasn\'t logged — confirm the athlete is pain-free before loading heavy.'
    : painMild ? ' Mild pain reported — keep it pain-free, stop if it climbs.' : '';
  const eff = [sleepQ, energyQ].filter((x) => x != null);

  if (!eff.length) { // pain logged (mild/none) but no sleep/energy read
    if (painMissing) return { level: 'amber', loadAdjustPct: 0, regress: null, headline: 'Pain not logged — confirm first', note: 'No sleep/energy read and pain wasn\'t answered — confirm pain-free, then train by feel.' };
    return { level: painMild ? 'amber' : 'green', loadAdjustPct: 0, regress: null, headline: painMild ? 'Mild pain — train pain-free' : 'Pain clear — train as planned', note: (painMild ? 'Mild pain reported and no sleep/energy read — stay pain-free, autoregulate by feel.' : 'No pain and no sleep/energy read — proceed on the plan, autoregulate by feel.') };
  }
  const avg = eff.reduce((a, b) => a + b, 0) / eff.length; // 0–3 on the corrected scale

  if (avg >= 2) { // sleep + energy good or better
    if (painMissing) return { level: 'amber', loadAdjustPct: 0, regress: null, headline: 'Good markers — confirm pain first', note: 'Sleep + energy look good.' + painNote + ' Then proceed as planned.' };
    if (painMild) return { level: 'green', loadAdjustPct: 0, regress: null, headline: 'Recovered — train pain-free', note: 'Sleep + energy good — hit the prescribed loads.' + painNote };
    return { level: 'green', loadAdjustPct: 0, regress: null, headline: 'Recovered — full send', note: 'Pain clear, sleep + energy good. Hit the prescribed loads; a PR attempt is fair game.' };
  }
  if (avg >= 1) return { level: 'amber', loadAdjustPct: -5, regress: 'volume', headline: 'A bit under — trim, don\'t grind', note: 'Recovery markers are a little down — keep the intensity, cut a back-off set or two (volume before intensity), stop sets a rep short.' + painNote };
  return { level: 'amber', loadAdjustPct: -12, regress: 'intensity', headline: 'Run down — back off today', note: 'Recovery markers are low — pull the top load ~10–15% (a starting point; regress load first, keep frequency) and keep it crisp. Bank the session, don\'t chase it.' + painNote };
}
