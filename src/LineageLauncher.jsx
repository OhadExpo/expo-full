// Reusable Training-Lineage launcher — a hook any coach view can use to open
// the athlete's Lineage report in a modal, without duplicating the plan-load +
// portal wiring. PlansView keeps its own inline copy (untouched); this powers
// the entry points on TraineeDetail, the athletes list, and anywhere else.
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { C } from './theme';
import TrainingLineageV2 from './TrainingLineageV2';
import { useAthletePlans } from './usePlansStore';

export function useLineageLauncher({ exercises, clientWorkouts, traineeMap = {}, onOpenPlan } = {}) {
  const [tid, setTid] = useState(null);
  const { plans, loading, load, clear } = useAthletePlans();
  useEffect(() => {
    if (tid) load(tid); else clear();
  }, [tid, load, clear]);
  useEffect(() => {
    if (!tid) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setTid(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tid]);
  const open = useCallback((id) => setTid(id), []);
  const close = useCallback(() => setTid(null), []);
  // Opens as a FULL PAGE (Ohad), not a dismissable pop-up: an opaque, full-viewport
  // surface with a sticky Back bar and its own scroll — reads like a real page.
  const node = tid ? createPortal(
    <div role="dialog" aria-modal="true" aria-label="Training Analysis"
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'var(--c-bg, #0a0a0b)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--c-sf2)', borderBottom: `1px solid ${C.cardBd}`, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={close} title="Back (Esc)"
          style={{ background: 'none', border: 'none', color: C.ac, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Back</button>
      </div>
      <div style={{ flex: 1, padding: '18px 16px 60px' }}>
        <div style={{ width: 'min(1180px, 96vw)', margin: '0 auto' }}>
          <TrainingLineageV2
            traineeId={tid}
            traineeName={traineeMap[tid] || 'Athlete'}
            exercises={exercises}
            plans={plans}
            clientWorkouts={clientWorkouts}
            loading={loading}
            onOpenPlan={(id) => { setTid(null); if (onOpenPlan) onOpenPlan(id); }}
          />
        </div>
      </div>
    </div>, document.body) : null;
  return { open, close, node, openId: tid };
}

// A small pill button that opens the Lineage for a trainee. Pass the launcher's
// `open` fn. Matches the cyan/quiet control grammar used elsewhere.
export function LineageButton({ onClick, label = 'ANALYSIS', title = 'Training Analysis — cross-block progression, what to program next' }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: C.ac, background: 'transparent', border: `1px solid ${C.ac}`, padding: '5px 10px', cursor: 'pointer', borderRadius: 0, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ fontSize: 11 }}>◫</span>{label}
    </button>
  );
}
