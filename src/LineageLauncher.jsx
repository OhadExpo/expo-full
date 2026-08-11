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
  const node = tid ? createPortal(
    <div onClick={close} role="dialog" aria-modal="true" aria-label="Training Lineage"
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflow: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(1180px, 96vw)', position: 'relative' }}>
        <button onClick={close} title="Close (Esc)"
          style={{ position: 'absolute', top: 0, right: 0, transform: 'translate(40%,-40%)', zIndex: 2, width: 30, height: 30, borderRadius: '50%', border: `1px solid ${C.cardBd}`, background: 'var(--c-bg, #0a0a0b)', color: C.tm, cursor: 'pointer', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
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
    </div>, document.body) : null;
  return { open, close, node, openId: tid };
}

// A small pill button that opens the Lineage for a trainee. Pass the launcher's
// `open` fn. Matches the cyan/quiet control grammar used elsewhere.
export function LineageButton({ onClick, label = 'LINEAGE', title = 'Training Lineage — cross-block progression, what to program next' }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: C.ac, background: 'transparent', border: `1px solid ${C.ac}`, padding: '5px 10px', cursor: 'pointer', borderRadius: 0, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ fontSize: 11 }}>◫</span>{label}
    </button>
  );
}
