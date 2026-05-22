import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { C, FN, FB, FH, uid, REQUIRED_PATTERNS, SUPERSET_LABELS, CATEGORIES, RESISTANCE_TYPES, BODY_POSITIONS, MOVEMENT_TYPES, MOVEMENT_PATTERNS, LATERALITY } from './theme';

// Heebo's x-height is smaller than Nord's at the same fontSize, so Hebrew
// names visually shrink in a row designed for English. Per the
// feedback_new_ui_box_dimensions rule: Hebrew bumps +3px inside the box.
const isHebrew = (s) => /[֐-׿]/.test(s || '');
import { Btn, Input, Select, Badge, Card, ConfirmDialog, EmptyState, baseInput, isRefined5b, RefinedHeaderStrip } from './ui';
import { useFullPlan, savePlan, deletePlan, duplicatePlan } from './usePlansStore';
import useAutosave, { autosaveStatusLabel } from './hooks/useAutosave';
import VideoEmbed from './VideoEmbed';
import { sortProgramsChrono } from './traineeUtils';

function ActionIcon({ kind, fallback, color = 'currentColor', size = 14 }) {
  if (!isRefined5b()) return fallback;
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { verticalAlign: 'middle', display: 'inline-block' } };
  switch (kind) {
    case 'target': return <svg {...common}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill={color}/></svg>;
    case 'eye': return <svg {...common}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'duplicate': return <svg {...common}><rect x="9" y="9" width="13" height="13"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
    default: return fallback;
  }
}

const defaultPlanEx = () => ({ id: uid(), exerciseId: "", sets: 3, reps: "8-12", load: "", rpe: "", tempo: "", rest: "90", notes: "", order: 0, superset: "", wk: null });
const defaultDay = (n) => ({ id: uid(), name: `Day ${n}`, exercises: [] });

const PAGE_SIZE = 25;

// Resolve a Google Photos share URL to a direct googleusercontent stream
// once at paste-time. We store the stable URL on the plan so the trainee
// portal embeds instantly without re-scraping Google on every page load.
// Falls back to the original URL if the resolver can't reach Google.
async function maybeResolveGooglePhotos(url) {
  if (!url || !/photos\.(app\.goo|google)\./i.test(url)) return url;
  try {
    const r = await fetch('/api/resolve-video?url=' + encodeURIComponent(url));
    if (!r.ok) return url;
    const j = await r.json();
    return j?.url || url;
  } catch { return url; }
}

function PatternCoverage({ plan, exercises }) {
  const pats = useMemo(() => {
    const s = new Set();
    plan.days.forEach(d => d.exercises.forEach(pe => {
      const ex = exercises.find(e => e.id === pe.exerciseId);
      if (ex?.movementPattern) s.add(ex.movementPattern);
    }));
    return s;
  }, [plan.days, exercises]);
  const missing = REQUIRED_PATTERNS.filter(p => !pats.has(p));
  if (exercises.length === 0) return null;
  return (<div style={{ background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)', border:`1px solid ${C.cardBd}`, borderRadius: 0, padding: 12, marginBottom: 16 }}>
    <div style={{ fontSize: 12, fontFamily: FN, fontWeight: 700, color: C.or, marginBottom: 8, letterSpacing:'0.06em' }}>PATTERN COVERAGE: {REQUIRED_PATTERNS.length - missing.length}/{REQUIRED_PATTERNS.length}</div>
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{REQUIRED_PATTERNS.map(p => <Badge key={p} color={pats.has(p) ? C.gn : C.tm} style={pats.has(p) ? {} : {fontWeight:500,opacity:0.65}}>{pats.has(p) ? "✓" : "✗"} {p}</Badge>)}</div>
  </div>);
}

// Shared modal for browsing and picking an exercise.
// Props: open, onClose, onPick(exerciseId), exercises, currentId, title
function ExerciseBrowserModal({ open, onClose, onPick, exercises, currentId, currentEx, fallbackTitle }) {
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [filters, setFilters] = useState({ category: "", resistanceType: "", bodyPosition: "", movementType: "", movementPattern: "", laterality: "" });
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);

  const setF = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const clearFilters = () => setFilters({ category: "", resistanceType: "", bodyPosition: "", movementType: "", movementPattern: "", laterality: "" });
  const clearAll = () => { setSearch(""); clearFilters(); };

  const filt = useMemo(() => {
    if (!open) return [];
    const q = search.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const match = (ex) => {
      if (filters.category && ex.category !== filters.category) return false;
      if (filters.resistanceType && ex.resistanceType !== filters.resistanceType) return false;
      if (filters.bodyPosition && ex.bodyPosition !== filters.bodyPosition) return false;
      if (filters.movementType && ex.movementType !== filters.movementType) return false;
      if (filters.movementPattern && ex.movementPattern !== filters.movementPattern) return false;
      if (filters.laterality && ex.laterality !== filters.laterality) return false;
      if (tokens.length === 0) return true;
      const haystack = [
        ex.title, ex.category, ex.resistanceType, ex.bodyPosition, ex.movementType,
        ex.movementPattern, ex.laterality, ex.primaryMuscles, ex.secondaryMuscles,
        ex.primaryJoints, ex.jointMovements
      ].filter(Boolean).join(' ').toLowerCase();
      return tokens.every(t => haystack.includes(t));
    };
    return exercises.filter(match).slice(0, 200);
  }, [exercises, search, filters, open]);

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setSearch("");
      clearFilters();
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  React.useEffect(() => { setActiveIdx(0); }, [search, filters]);

  // Scroll active row into view
  React.useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const pick = (ex) => { onPick(ex.id); onClose(); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filt.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filt[activeIdx]) pick(filt[activeIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const subtitle = (ex) => [ex.resistanceType, ex.bodyPosition, ex.movementType].filter(Boolean).join(' · ');
  const muscles = (ex) => [ex.primaryMuscles, ex.secondaryMuscles].filter(Boolean).join(' / ');
  const filterSelectStyle = { ...baseInput, padding: '7px 10px', fontSize: 12 };
  // Active filters get the brand cyan border + subtle bg tint so the coach
  // can see at a glance which dimensions are constraining the result list.
  const filterStyleActive = { ...filterSelectStyle, border: `1px solid ${C.ac}`, color: C.tx };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, background: C.scrim, backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border:`1px solid ${C.bd}`, borderRadius: 0, width: 'min(900px, 92vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: `0 20px 60px ${C.shadow}` }}>
        {/* Header hero — eyebrow tag (action), big exercise name, metadata.
            Lifts the current exercise out of the page header and into a
            scannable hierarchy: WHAT you're replacing, in big type, with
            the relevant biomechanical context one click of glance away. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 22px 14px', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.ac, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              {currentEx ? 'Change Exercise' : (fallbackTitle ? 'Link to Library' : 'Select Exercise')}
            </div>
            {(currentEx || fallbackTitle) && (
              <h3 style={{ margin: 0, fontFamily: FB, fontSize: 22, fontWeight: 700, color: C.tx, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentEx ? currentEx.title : fallbackTitle}
              </h3>
            )}
            {currentEx && (() => {
              const sub = [currentEx.resistanceType, currentEx.bodyPosition, currentEx.movementType].filter(Boolean).join(' · ');
              return sub ? <div style={{ fontSize: 11, fontFamily: FN, color: C.tm, letterSpacing: '0.04em' }}>{sub}</div> : null;
            })()}
          </div>
          <button onClick={onClose} style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tm, cursor: 'pointer', padding: '4px 10px', borderRadius: 0, fontSize: 14, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ padding: '0 22px' }}>
          <input
            ref={inputRef}
            placeholder="Search by title, muscle, pattern, position..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={onKeyDown}
            style={{ ...baseInput, padding: '10px 14px', fontSize: 14 }}
          />
          {/* Filter row — auto-fit so phones get 2-col, tablets 3-col,
              desktop 6-col without a media query. Each select takes the
              brand-cyan border style when its filter is active (the
              filterStyleActive variant), so the coach can see which
              dimensions are narrowing the result set at a glance. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, marginTop: 10 }}>
            <select value={filters.category} onChange={e => setF('category', e.target.value)} style={filters.category ? filterStyleActive : filterSelectStyle}><option value="">Category</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.resistanceType} onChange={e => setF('resistanceType', e.target.value)} style={filters.resistanceType ? filterStyleActive : filterSelectStyle}><option value="">Resistance</option>{RESISTANCE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.bodyPosition} onChange={e => setF('bodyPosition', e.target.value)} style={filters.bodyPosition ? filterStyleActive : filterSelectStyle}><option value="">Body Position</option>{BODY_POSITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.movementType} onChange={e => setF('movementType', e.target.value)} style={filters.movementType ? filterStyleActive : filterSelectStyle}><option value="">Movement Type</option>{MOVEMENT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.movementPattern} onChange={e => setF('movementPattern', e.target.value)} style={filters.movementPattern ? filterStyleActive : filterSelectStyle}><option value="">Pattern</option>{MOVEMENT_PATTERNS.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.laterality} onChange={e => setF('laterality', e.target.value)} style={filters.laterality ? filterStyleActive : filterSelectStyle}><option value="">Laterality</option>{LATERALITY.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          {/* Result count + keyboard hints. Count goes bold/cyan to draw the
              eye — that's the number the coach scans as filters change.
              Hints stay muted: useful but not part of the primary scan. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 11, fontFamily: FN, color: C.td, gap: 12, flexWrap: 'wrap' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ color: C.ac, fontWeight: 700 }}>{filt.length}</span>
              {(search.trim() || activeFilterCount > 0) && exercises.length > filt.length ? <span style={{ color: C.td }}> of {exercises.length}</span> : null}
              <span style={{ color: C.td }}> result{filt.length === 1 ? '' : 's'}</span>
              <span style={{ color: C.td, opacity: 0.6, marginLeft: 10, letterSpacing: '0.04em' }}>↑↓ navigate · Enter select · Esc close</span>
            </span>
            {(search.trim() || activeFilterCount > 0) && <button onClick={clearAll} style={{ background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.ac, cursor: 'pointer', fontSize: 10, fontFamily: FN, fontWeight: 700, letterSpacing: '0.18em', padding: '4px 10px', borderRadius: 0 }}>× CLEAR ALL</button>}
          </div>
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 22px 22px', marginTop: 10, borderTop: `1px solid ${C.cardBd}` }}>
          {filt.length === 0 ? (
            <div style={{ padding: 40, fontSize: 13, color: C.td, textAlign: 'center' }}>No exercises found. Try relaxing filters or the search term.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {filt.map((ex, idx) => {
                const isActive = idx === activeIdx;
                const isSelected = ex.id === currentId;
                // Active (keyboard/hover focus) → solid cyan border. Selected
                // (currently linked from the plan) → cyan-left bar + chip, but
                // keeps neutral border so it doesn't compete with active.
                // Active+Selected → cyan border AND chip, both signals visible.
                return (
                  <button
                    key={ex.id}
                    data-idx={idx}
                    onClick={() => pick(ex)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    style={{
                      textAlign: 'left', padding: '10px 12px',
                      background: isSelected ? 'rgba(59,160,255,0.06)' : 'var(--c-sf)',
                      border: `${isActive ? '1px' : '0.25px'} solid ${isActive ? C.ac : C.cardBd}`,
                      borderLeft: isSelected ? `3px solid ${C.ac}` : (isActive ? `1px solid ${C.ac}` : `1px solid ${C.cardBd}`),
                      borderRadius: 0, cursor: 'pointer', fontFamily: FB, color: C.tx,
                      transition: 'all 0.1s', position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ex.title}</div>
                      {isSelected && <span title="Currently linked exercise" style={{ fontSize: 8, fontFamily: FN, fontWeight: 700, color: C.ac, letterSpacing: '0.18em', whiteSpace: 'nowrap', border: `1px solid ${C.ac}`, padding: '1px 5px' }}>CURRENT</span>}
                      {!isSelected && ex.movementPattern && <span style={{ fontSize: 9, fontFamily: FN, fontWeight: 700, color: C.gn, whiteSpace: 'nowrap' }}>{ex.movementPattern}</span>}
                    </div>
                    {subtitle(ex) && <div style={{ fontSize: 10, color: C.tm, fontFamily: FN, marginBottom: 2 }}>{subtitle(ex)}</div>}
                    {muscles(ex) && <div style={{ fontSize: 10, color: C.td, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{muscles(ex)}</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Small button shown inline in an exercise row. Clicking it opens the browser modal.
function ExPicker({ exercises, value, onChange, label, fallbackTitle }) {
  const [modalOpen, setModalOpen] = useState(false);
  const sel = exercises.find(e => e.id === value);
  const displayTitle = sel?.title || fallbackTitle || '';
  const hasDisplay = !!displayTitle;
  const unlinked = !sel && !!fallbackTitle;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', minWidth: 0 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: 'uppercase', fontFamily: FN }}>{label}</label>}
      <button onClick={() => setModalOpen(true)} style={{ ...baseInput, width: '100%', textAlign: 'center', cursor: 'pointer', position: 'relative', borderColor: unlinked ? 'rgba(255,165,2,0.376)' : undefined, paddingRight: 24 }}>
        {/* Text takes the full button width with text-align:center, so the
            displayed exercise name lands at the true column center —
            matching where the EXERCISE label above is centered. The ▼
            sits absolutely on the right so it doesn't shift the text. */}
        <span style={{ color: hasDisplay ? C.tx : C.td, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {unlinked && <span style={{ color: C.or, marginRight: 6, fontSize: 10 }}>📝</span>}
          {hasDisplay ? displayTitle : 'Select exercise...'}
        </span>
        <span style={{ color: C.td, fontSize: 10, position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>▼</span>
      </button>
      <ExerciseBrowserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onPick={id => { onChange(id); setModalOpen(false); }}
        exercises={exercises}
        currentId={value}
        currentEx={sel}
        fallbackTitle={fallbackTitle}
      />
    </div>
  );
}

// Compose the warm-up rep-line. Prefer the new structured fields
// (sets × reps, optional tempo); fall back to the legacy free-text rx
// so plans authored before the field split still render their original
// rep prescription unchanged.
function wuRx(w) {
  if (w && (w.sets || w.reps)) {
    const sets = w.sets ?? '';
    const reps = w.reps ?? '';
    const core = sets && reps ? `${sets}×${reps}` : `${sets}${reps}`;
    return w.tempo ? `${core}  ${w.tempo}` : core;
  }
  return (w && w.rx) || '';
}

function WarmupEditor({ plan, setPlan }) {
  const warmup = Array.isArray(plan.warmup) ? plan.warmup : [];
  // Collapsed by default whenever there's content, so the warm-up doesn't
  // dominate the editor when the coach is iterating on the main exercise
  // list. Empty programs default to expanded so the "+ Add Warm-Up" button
  // is one click away (otherwise a coach would have to expand the empty
  // card just to discover the add control).
  const [open, setOpen] = useState(warmup.length === 0);
  const update = (idx, patch) => setPlan(p => ({ ...p, warmup: (p.warmup || []).map((w, i) => i === idx ? { ...w, ...patch } : w) }));
  // New warm-ups carry sets/reps/tempo as first-class fields. Legacy plans
  // still carry an `rx` string instead — those keep rendering verbatim until
  // the coach edits them (we never touch existing rows on load).
  const add = () => { setOpen(true); setPlan(p => ({ ...p, warmup: [...(p.warmup || []), { t: '', sets: 1, reps: '', tempo: '', vid: '' }] })); };
  const remove = idx => setPlan(p => ({ ...p, warmup: (p.warmup || []).filter((_, i) => i !== idx) }));
  return (
    <div style={{ background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)', border:`1px solid ${C.cardBd}`, borderRadius: 0, padding: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open && warmup.length ? 10 : 0 }}>
        <button onClick={() => setOpen(o => !o)} title={open ? 'Collapse warm-up' : 'Expand warm-up'}
          style={{ background:'transparent', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:10, color:C.or, fontFamily:FN, fontWeight:700, width:10, display:'inline-block', textAlign:'center' }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontSize: 12, fontFamily: FN, fontWeight: 700, color: C.or, letterSpacing:'0.06em' }}>WARM-UP ({warmup.length})</span>
        </button>
        <Btn variant="ghost" onClick={add} style={{ padding: '4px 10px', fontSize: 11 }}>+ Add Warm-Up</Btn>
      </div>
      {open && <>
        {warmup.map((w, i) => (
          <div key={i} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: i < warmup.length - 1 ? `1px solid ${C.cardBd}` : 'none' }}>
            {/* Main row: structured fields (sets × reps × tempo) match the
                main-exercise editor row shape. Existing plans authored before
                this split kept their string `rx` — we render that as a small
                legacy line below and let the coach clear it once they've
                filled in the new fields. Order of operations on each row:
                  - never wipe legacy w.rx on load (preserved unless coach
                    clicks the × on the legacy line)
                  - the displayed athlete value prefers sets/reps over rx
                    once sets/reps exist (see wuRx() helper). */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1.6fr 56px 72px 72px 1.4fr 24px', gap: 10, alignItems: 'end' }}>
              <div style={{ paddingBottom: 9, fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700, textAlign: 'center', letterSpacing: '0.18em' }}>{i + 1}</div>
              <Input label={i === 0 ? 'Exercise' : ''} value={w.t || ''} onChange={e => update(i, { t: e.target.value })} placeholder="e.g. BW Step-Down" />
              <Input label={i === 0 ? 'Sets' : ''} type="number" value={w.sets ?? ''} onChange={e => update(i, { sets: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })} placeholder="1" />
              <Input label={i === 0 ? 'Reps' : ''} value={w.reps ?? ''} onChange={e => update(i, { reps: e.target.value })} placeholder="10 / 30s" />
              <Input label={i === 0 ? 'Tempo' : ''} value={w.tempo ?? ''} onChange={e => update(i, { tempo: e.target.value })} placeholder="3010" />
              <Input label={i === 0 ? 'Video URL' : ''} value={w.vid || ''} onChange={e => update(i, { vid: e.target.value })}
                onBlur={async e => { const resolved = await maybeResolveGooglePhotos(e.target.value); if (resolved !== e.target.value) update(i, { vid: resolved }); }}
                placeholder="https://youtube.com/..." />
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: C.rd, cursor: 'pointer', padding: 4, marginBottom: 4, opacity: 0.6, fontSize: 16 }}>🗑</button>
            </div>
            {/* Legacy free-text rx, only when the new fields are empty AND a
                pre-split rx exists. Lets the coach see what the athlete is
                currently being shown, then dismiss it once they've migrated. */}
            {w.rx && (!w.sets || w.sets === '') && !w.reps && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.tm, fontFamily: FN }}>
                <span style={{ fontWeight: 700, letterSpacing: '0.12em', color: C.td }}>LEGACY RX:</span>
                <span style={{ color: C.tx, fontFamily: FB }}>{w.rx}</span>
                <button onClick={() => update(i, { rx: '' })}
                  title="Clear the legacy rx string — the athlete will now see the structured sets/reps above (once you fill them in)."
                  style={{ background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.rd, padding: '2px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', borderRadius: 0, opacity: 0.7 }}>× CLEAR</button>
              </div>
            )}
            {w.vid && <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}><div style={{ width: '100%', maxWidth: 480 }}><VideoEmbed url={w.vid} /></div></div>}
          </div>
        ))}
        {warmup.length === 0 && <div style={{ fontSize: 11, color: C.td, marginTop: 8 }}>No warm-ups. Click "+ Add Warm-Up" to add one.</div>}
      </>}
    </div>
  );
}

// Read-only side-by-side compare panel — surfaces inside PlanEditor when
// the coach hits the "↔ COMPARE" toggle. Lists previous programs for the
// same athlete (by traineeId, exact match — couples with separate sub-IDs
// only see their own line). Picking a program loads the full plan and
// renders an editor-shaped read-only view (day tabs, warm-up, exercise
// rows with sets/reps/load/RPE/tempo/notes). The compared plan is never
// mutated — every input is replaced with display text.
function ReadOnlyPlanPanel({ planIndex, currentPlan, exercises, trainees, onClose }) {
  // Athlete filter drives everything: until one is chosen, the program
  // dropdown is empty/disabled. Defaults to the current plan's athlete so
  // the most useful comparison appears first.
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => currentPlan?.traineeId || '');
  const [warmOpen, setWarmOpen] = useState(false);
  const { plan: cmpPlan, load: loadCmp, clear: clearCmp, loading } = useFullPlan();
  // Athlete options for the dropdown — flatten couples to per-member rows
  // so the picker matches the rest of the app.
  const athleteOptions = useMemo(() => {
    const opts = (trainees || []).flatMap(t => {
      if (t.members && t.members.length === 2) {
        return t.members.map((m, i) => ({ value: t.id + '__' + i, label: m.name || ('Member ' + (i + 1)) }));
      }
      return [{ value: t.id, label: t.name }];
    });
    return opts.sort((a, b) => (a.label || '').localeCompare(b.label || '', 'he'));
  }, [trainees]);
  // Programs of the chosen athlete. Empty when no athlete is selected so
  // the program dropdown stays unusable until the user picks one.
  const candidates = useMemo(() => {
    if (!selectedAthleteId) return [];
    return (planIndex || [])
      .filter(p => p.id !== currentPlan?.id && p.traineeId === selectedAthleteId)
      .slice()
      .sort(sortProgramsChrono);
  }, [planIndex, currentPlan?.id, selectedAthleteId]);
  const [pickedId, setPickedId] = useState(() => candidates[0]?.id || '');

  // Default the picker to the most recent prior program every time the set
  // of candidates shrinks/grows (e.g. a new athlete is assigned mid-edit).
  useEffect(() => {
    if (!pickedId && candidates[0]) setPickedId(candidates[0].id);
    if (pickedId && !candidates.some(c => c.id === pickedId) && candidates[0]) setPickedId(candidates[0].id);
  }, [candidates, pickedId]);

  // Load the full picked plan; clear when the panel unmounts so we don't
  // leak the previous selection into a future open.
  useEffect(() => {
    if (pickedId) loadCmp(pickedId); else clearCmp();
  }, [pickedId, loadCmp, clearCmp]);

  return (
    <div style={{flex:1, minWidth:0, alignSelf:'stretch', position:'relative'}}>
      {/* Faded vertical divider as an absolute-positioned 1px strip with a
          vertical gradient — fades to transparent at the top and bottom
          edges, low alpha (~25%) in the middle. Sits at x=-8 so it lands
          in the middle of the flex gap between halves. pointerEvents:none
          so it never intercepts clicks. */}
      <div style={{position:'absolute', top:0, bottom:0, left:-8, width:1, background:'linear-gradient(to bottom, transparent 0%, rgba(127,127,131,0.35) 12%, rgba(127,127,131,0.35) 88%, transparent 100%)', pointerEvents:'none', zIndex:0}} />
      {/* Filter row is ALWAYS rendered. Hiding it on empty-state would trap
          the user (e.g. picked athlete with no programs and couldn't change
          back). Empty states below render after the filter row so the
          athlete dropdown stays reachable. */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:12,marginBottom:20,position:'relative'}}>
        <div style={{gridColumn:'span 2', minWidth:0}}>
          <Select label="Athlete Filter" options={athleteOptions} value={selectedAthleteId} onChange={v => { setSelectedAthleteId(v); setPickedId(''); }} placeholder="Pick athlete…" />
        </div>
        <div style={{gridColumn:'span 2', minWidth:0}}>
          <Select label="Program Filter"
            options={selectedAthleteId ? candidates.map(p => ({value: p.id, label: p.name})) : []}
            value={pickedId}
            onChange={setPickedId}
            placeholder={selectedAthleteId ? (candidates.length ? 'Pick program…' : 'No programs for this athlete') : 'Choose athlete first'} />
        </div>
        <button onClick={onClose} title="Close compare panel"
          style={{position:'absolute', top:-2, right:-2, background:C.bg, border:`1px solid ${C.cardBd}`, color:C.tm, cursor:'pointer', padding:'1px 6px', borderRadius:0, fontSize:11, lineHeight:1, zIndex:2}}>✕</button>
      </div>
      {!selectedAthleteId ? (
        <div style={{padding:'24px 16px', color:C.td, fontSize:12, textAlign:'center', fontFamily:FB}}>Pick an athlete from the filter above to compare.</div>
      ) : candidates.length === 0 ? (
        <div style={{padding:'24px 16px', color:C.td, fontSize:12, textAlign:'center', fontFamily:FB}}>No programs for this athlete yet.</div>
      ) : !pickedId ? (
        <div style={{padding:'24px 16px', color:C.td, fontSize:12, textAlign:'center', fontFamily:FB}}>Pick a program from the filter above to compare.</div>
      ) : loading || !cmpPlan ? (
        <div style={{padding:'30px 12px', color:C.td, fontSize:12, textAlign:'center', fontFamily:FN, letterSpacing:'0.18em'}}>LOADING…</div>
      ) : (
        <>
          {/* Pattern coverage of the compared plan. Same component the
              editor renders on the left, so the box sits at the same
              vertical position on both halves. */}
          <PatternCoverage plan={cmpPlan} exercises={exercises} />
              {/* Warm-up (foldable, mirrors editor). */}
              {Array.isArray(cmpPlan.warmup) && cmpPlan.warmup.length > 0 && (
                <div style={{border:`1px solid ${C.cardBd}`, padding:10, marginBottom:12}}>
                  <button onClick={() => setWarmOpen(o => !o)}
                    style={{background:'transparent', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:8}}>
                    <span style={{fontSize:10, color:C.or, fontFamily:FN, fontWeight:700, width:10, textAlign:'center'}}>{warmOpen ? '▾' : '▸'}</span>
                    <span style={{fontSize:11, fontFamily:FN, fontWeight:700, color:C.or, letterSpacing:'0.06em'}}>WARM-UP ({cmpPlan.warmup.length})</span>
                  </button>
                  {warmOpen && <div style={{marginTop:8}}>
                    {cmpPlan.warmup.map((w, i) => (
                      <div key={i} style={{display:'grid', gridTemplateColumns:'24px 2fr 1fr', gap:8, padding:'4px 0', alignItems:'center', borderTop:i === 0 ? 'none' : `1px solid rgba(57,189,255,0.102)`}}>
                        <div style={{fontFamily:FN, fontSize:11, color:C.tm, fontWeight:700, textAlign:'center'}}>{i + 1}</div>
                        <div style={{fontSize:13, color:C.tx, fontFamily:FB, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{w.t || '—'}</div>
                        <div style={{fontSize:12, color:C.tm, fontFamily:FN}}>{wuRx(w) || '—'}</div>
                      </div>
                    ))}
                  </div>}
                </div>
              )}
              {/* Overview body — pixel-mirror of the editor's overview grid.
                  Each cell is rendered with the same `tinyInput` box style
                  the editor uses, so row heights and column widths match
                  exactly when the two halves are scanned side-by-side. */}
              {(cmpPlan.days || []).map((d, di) => {
                const dayExs = d.exercises || [];
                const tinyInputRO = {...baseInput, padding:'3px 6px', fontSize:11, minWidth:0, width:'100%', boxSizing:'border-box', color:C.tm, cursor:'default'};
                return (
                  <div key={d.id || di} style={{background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:12,marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',marginBottom:8,gap:10}}>
                      <input value={d.name || `Day ${di + 1}`} readOnly tabIndex={-1}
                        style={{...baseInput, fontFamily:FB, fontWeight:700, fontSize:14, color:C.tx, padding:'4px 8px', maxWidth:260, cursor:'default'}} />
                      <span style={{color:C.td,fontSize:12,whiteSpace:'nowrap'}}>({dayExs.length} ex)</span>
                    </div>
                    {dayExs.length === 0 ? (
                      <div style={{color:C.td,fontSize:12,fontStyle:'italic'}}>No exercises.</div>
                    ) : (
                      <div style={{overflowX:'auto',margin:'0 -12px',padding:'0 12px'}}>
                        {/* LOAD column intentionally omitted on the read-only
                            compare side — load values change every block and
                            aren't useful for delta-scanning. Same column
                            template otherwise. */}
                        <div style={{display:'grid',gridTemplateColumns:'36px minmax(180px,3.3fr) 56px minmax(50px,0.8fr) minmax(60px,1fr) minmax(48px,60px) minmax(80px,1.3fr) 24px',gap:'6px 8px',fontSize:12,alignItems:'center',minWidth:554}}>
                          {['#','EXERCISE','GRP','SETS','REPS','RPE','TEMPO',''].map((h,hi) =>
                            hi === 0 ? (
                              <div key={hi} style={{display:'flex', alignItems:'center', gap:5, minWidth:0}}>
                                <span style={{fontFamily:FN, fontSize:12, lineHeight:1, fontWeight:400, opacity:0}}>⇕</span>
                                <span style={{fontSize:9, fontFamily:FN, color:C.td}}>{h}</span>
                              </div>
                            ) : hi === 1 ? (
                              // EXERCISE header — identical box-model
                              // structure to the exercise-name cells below
                              // (3px transparent borderLeft + 6px paddingLeft)
                              // so the text x-position is computed by the
                              // browser the exact same way. No reliance on
                              // adding pixel values manually.
                              <div key={hi} style={{fontSize:9,fontFamily:FN,color:C.td,minWidth:0, borderLeft:'3px solid transparent', paddingLeft:6}}>{h}</div>
                            ) : (
                              <div key={hi} style={{fontSize:9,fontFamily:FN,color:C.td,minWidth:0}}>{h}</div>
                            )
                          )}
                          {dayExs.map((pe, ei) => {
                            const exData = exercises.find(e => e.id === pe.exerciseId);
                            const title = exData?.title || pe.title || (pe.notes?.match(/^\[(.+)\]$/)?.[1]) || '(unresolved)';
                            const sc = pe.superset === 'A' ? C.ac : pe.superset === 'B' ? C.pu : pe.superset === 'C' ? C.or : C.td;
                            const weeks = Math.max((pe.wk?.length||0), (pe.wkS?.length||0), 1);
                            return <React.Fragment key={pe.id || ei}>
                              {/* Same flex+⇕ structure as the left side's
                                  number cell. fontSize:12 matches the grid
                                  default, so the number's baseline aligns
                                  with the exercise-name text in the next
                                  column. */}
                              <div style={{display:'flex',alignItems:'center',gap:5,minWidth:0,padding:0}}>
                                <span style={{fontFamily:FN, fontSize:12, fontWeight:400, opacity:0}}>⇕</span>
                                <span style={{color:C.tm, fontFamily:FN, fontWeight:700, fontSize:12}}>{ei + 1}</span>
                              </div>
                              <div title={title}
                                style={{color:C.tx, minWidth:0, overflowWrap:'anywhere', wordBreak:'break-word', borderLeft:`3px solid ${pe.superset?sc:'transparent'}`, paddingLeft:6}}>{title}</div>
                              <input value={pe.superset || ''} readOnly tabIndex={-1}
                                style={{...tinyInputRO, color:pe.superset?sc:C.td, fontFamily:FN, fontWeight:600}} />
                              {Array.isArray(pe.wkS) && pe.wkS.length > 0 ? (
                                <div style={{display:'grid', gridTemplateColumns:`repeat(${weeks},minmax(0,1fr))`, gap:2}}>
                                  {pe.wkS.map((v, wi) => <input key={wi} value={v||''} readOnly tabIndex={-1} style={{...tinyInputRO, padding:'3px 4px', fontSize:10}} />)}
                                </div>
                              ) : (
                                <input value={pe.sets ?? ''} readOnly tabIndex={-1} style={tinyInputRO} />
                              )}
                              {Array.isArray(pe.wk) && pe.wk.length > 0 ? (
                                <div style={{display:'grid', gridTemplateColumns:`repeat(${weeks},minmax(0,1fr))`, gap:2}}>
                                  {pe.wk.map((v, wi) => <input key={wi} value={v||''} readOnly tabIndex={-1} style={{...tinyInputRO, padding:'3px 4px', fontSize:10}} />)}
                                </div>
                              ) : (
                                <input value={pe.reps || ''} readOnly tabIndex={-1} style={tinyInputRO} />
                              )}
                              <input value={pe.rpe || ''} readOnly tabIndex={-1} style={tinyInputRO} />
                              <input value={pe.tempo || ''} readOnly tabIndex={-1} style={tinyInputRO} />
                              <div />
                            </React.Fragment>;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
        </>
      )}
    </div>
  );
}

function PlanEditor({ plan: init, onSave, onCancel, onSwitchProgram, trainees, exercises, weeklyFocus, setWeeklyFocus, planIndex, onPreviewPlan }) {
  const [plan, setPlan] = useState(init);
  const [activeDay, setActiveDay] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [overview, setOverview] = useState(false);
  // Compare mode: side-by-side 50/50 split with a read-only view of a
  // previous program (same athlete). Only available WHEN Overview is on —
  // anchored to the wide grid where row-by-row delta-scanning actually pays
  // off. Layout matches the original side-by-side pattern.
  const [compareOpen, setCompareOpen] = useState(false);
  const compareActive = compareOpen && overview;
  // Auto-close compare when the user leaves Overview, so the state doesn't
  // linger and re-fire if Overview is toggled back on later.
  React.useEffect(() => { if (!overview && compareOpen) setCompareOpen(false); }, [overview, compareOpen]);
  // Drag-to-reorder state for the Overview view. Source = the row picked up;
  // over = the row currently being hovered as a drop target (used to draw the
  // insertion bar). Reorder is constrained to within the source row's day.
  const [dragSrc, setDragSrc] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  // Move exercise from `from` index to `to` index within the same day.
  const reorderExInDay = (di, from, to) => setPlan(p => ({...p, days: p.days.map((d, idx) => {
    if (idx !== di) return d;
    const exs = [...(d.exercises || [])];
    if (from < 0 || from >= exs.length || to < 0 || to >= exs.length || from === to) return d;
    const [moved] = exs.splice(from, 1);
    exs.splice(to, 0, moved);
    return {...d, exercises: exs};
  })}));
  // Autosave: shared hook serializes saves, flushes on tab switch / screen
  // lock / browser back / refresh / close / unmount.
  const { status: autoStatus, flush: flushAutosave, markClean } = useAutosave(plan, savePlan);

  const updateDay = (i, u) => setPlan(p => ({...p, days: p.days.map((d,idx) => idx===i ? {...d,...u} : d)}));
  const addDay = () => { setPlan(p => ({...p, days: [...p.days, defaultDay(p.days.length+1)]})); setActiveDay(plan.days.length); };
  const removeDay = i => { if (plan.days.length<=1) return; setPlan(p => ({...p, days: p.days.filter((_,idx)=>idx!==i)})); if (activeDay>=plan.days.length-1) setActiveDay(Math.max(0,plan.days.length-2)); };
  const addExWithId = (exerciseId) => {
    const ex = defaultPlanEx();
    ex.order = plan.days[activeDay]?.exercises.length || 0;
    ex.exerciseId = exerciseId;
    // Seed the per-instance note (ex.n) with the library's cues so the coach
    // can edit them directly as orange-text notes. Without this, the library
    // cues only rendered on the athlete portal via a separate d.q layer that
    // shadowed any coach-written note. ex.n is now the single source of
    // truth for what the athlete sees.
    const lib = exerciseId ? (exercises || []).find(e => e.id === exerciseId) : null;
    if (lib?.cues) ex.n = lib.cues;
    updateDay(activeDay, { exercises: [...(plan.days[activeDay]?.exercises || []), ex] });
  };
  // When the coach swaps the exerciseId on an existing row, re-seed the
  // ex.n notes from the new library entry's cues — unless the coach has
  // already typed a custom note (don't clobber their orange text). Mirror
  // the same logic for ex.notes/notesEdited: an explicit empty override
  // (notesEdited=true, notes='') gets discarded on swap so the new
  // exercise's library cues show; a real typed override is preserved.
  const updateEx = (ei,u) => {
    const exs=[...plan.days[activeDay].exercises];
    const cur = exs[ei];
    let next = {...cur,...u};
    if (u.exerciseId && u.exerciseId !== cur.exerciseId) {
      if (!(cur.n && cur.n.trim())) {
        const lib = (exercises || []).find(e => e.id === u.exerciseId);
        if (lib?.cues) next.n = lib.cues;
      }
      if (!(cur.notes && cur.notes.trim())) {
        next.notes = '';
        next.notesEdited = false;
      }
    }
    exs[ei]=next;
    updateDay(activeDay,{exercises:exs});
  };
  // Per-day variants — used by the overview table so a row in any day can be
  // edited without first switching `activeDay` (and without leaving overview).
  const updateExInDay = (di, ei, u) => setPlan(p => ({...p, days: p.days.map((d, idx) => {
    if (idx !== di) return d;
    const exs = [...(d.exercises || [])];
    exs[ei] = {...exs[ei], ...u};
    return {...d, exercises: exs};
  })}));
  const removeExFromDay = (di, ei) => setPlan(p => ({...p, days: p.days.map((d, idx) => idx === di ? {...d, exercises: (d.exercises||[]).filter((_,i) => i !== ei)} : d)}));
  const removeEx = ei => updateDay(activeDay, {exercises:plan.days[activeDay].exercises.filter((_,i)=>i!==ei)});
  const day = plan.days[activeDay];
  const handleSave = async () => {
    setSaving(true);
    await onSave(plan);
    // Explicit save covered everything pending — clear dirty so the
    // visibilitychange/unmount paths don't issue a redundant write.
    markClean();
    setSaving(false);
  };
  const handleBack = async () => {
    // Awaiting flushAutosave resolves only after every queued + in-flight
    // save lands, so the latest data is on disk before the editor unmounts.
    await flushAutosave();
    onCancel();
  };
  const statusLabel = autosaveStatusLabel(autoStatus, C);
  return (
    <div>
      {/* Narrow-screen layout for the exercise rows. Below 900px the
          8-column grid (Exercise / Superset / Sets / Reps / Load / RPE /
          Tempo / Trash) wraps so per-week inputs don't force horizontal
          scroll. Drag-handle column gets smaller; tempo wraps under load. */}
      <style>{`
        @media (max-width: 900px) {
          .ex-row-outer { grid-template-columns: 38px 1fr !important; gap: 8px !important; }
          .ex-row-outer > div:last-child { display: none !important; }
          .ex-row-scroll { overflow-x: visible !important; }
          .ex-row-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            min-width: 0 !important;
            gap: 10px !important;
          }
          .ex-row-grid > :first-child { grid-column: 1 / -1; }
        }
        @media (max-width: 560px) {
          .ex-row-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:12,alignItems:'center',minWidth:0,flex:'1 1 240px'}}>
          <button onClick={handleBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0,whiteSpace:'nowrap'}}>← Back</button>
          {/* Switch-program dropdown — lets the coach scroll between this
              athlete's programs (current + earlier blocks) without leaving
              the editor. Saves any pending edits first. Mounted only when
              there are 2+ programs to switch between. */}
          {(() => {
            const sameAthlete = (planIndex || [])
              .filter(p => p.traineeId === plan.traineeId)
              .slice()
              .sort(sortProgramsChrono);
            if (sameAthlete.length < 2 || !onSwitchProgram) return null;
            // Styled to match the COMPARE / OVERVIEW / SAVE buttons in the
            // same row — same height, font, weight, letter-spacing, border
            // thickness, transparent background. Reads as one of the four
            // controls in the row, not a different control family.
            return (
              <div style={{position:'relative',display:'flex',minWidth:0,flex:'1 1 240px',maxWidth:360}}>
                <select value={plan.id} onChange={async e => {
                  const nextId = e.target.value;
                  if (nextId === plan.id) return;
                  await flushAutosave();
                  onSwitchProgram(nextId);
                }}
                  title="Switch to another program for this athlete"
                  style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,height:42,padding:'0 36px 0 18px',lineHeight:'42px',color:C.tm,fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',outline:'none',appearance:'none',WebkitAppearance:'none',flex:1,minWidth:0,boxSizing:'border-box',cursor:'pointer',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {sameAthlete.map(p => <option key={p.id} value={p.id}>{p.name || 'Untitled'}</option>)}
                </select>
                <span style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:C.tm,fontSize:12,lineHeight:1}}>▾</span>
              </div>
            );
          })()}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"stretch"}}>
          {statusLabel && <span aria-live="polite" style={{fontFamily:FN,fontSize:11,fontWeight:600,color:statusLabel.color,letterSpacing:"0.04em",alignSelf:'center'}}>{statusLabel.text}</span>}
          {/* COMPARE: read-only view of a previous program for the same
              athlete, stacked below the Overview grid. Only enabled when
              Overview is on — single-day detail-view comparisons were too
              cramped to be useful, so we anchor compare to the wide grid. */}
          <button onClick={()=>{ if (!overview) return; setCompareOpen(v=>!v); }}
            disabled={!overview}
            title={!overview ? 'Switch to Overview to use Compare' : 'Compare with a previous program (read-only)'}
            style={{background:'var(--c-sf)',border:`${compareActive?'1px':'0.25px'} solid ${compareActive?C.ac:C.cardBd}`,borderRadius:0,height:42,padding:'0 18px',lineHeight:'42px',color:!overview?C.td:(compareActive?C.ac:C.tm),cursor:!overview?'not-allowed':'pointer',opacity:!overview?0.5:1,fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase'}}>{compareActive?'✓ COMPARE':'↔ COMPARE'}</button>
          <button onClick={()=>setOverview(v=>!v)} style={{background:'var(--c-sf)',border:`${overview?'1px':'0.25px'} solid ${overview?C.ac:C.cardBd}`,borderRadius:0,height:42,padding:'0 18px',lineHeight:'42px',color:overview?C.ac:C.tm,cursor:"pointer",fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase'}}>{overview?'✓ OVERVIEW':'OVERVIEW'}</button>
          {onPreviewPlan && plan?.id && <button onClick={async () => { await flushAutosave(); onPreviewPlan(plan.id); }}
            title="Open this program in the athlete portal view" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,height:42,padding:'0 18px',lineHeight:'42px',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            PORTAL
          </button>}
          <Btn onClick={handleSave} disabled={saving} style={{height:42,padding:'0 18px',fontSize:13,lineHeight:'42px',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{saving ? 'Saving...' : 'Save Program'}</Btn>
        </div>
      </div>
      <div style={{display:compareActive?'flex':'block',gap:16,alignItems:'flex-start'}}>
      <div style={{flex:compareActive?1:'unset',minWidth:0,width:compareActive?'50%':'auto'}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:12,marginBottom:20}}>
        <Input label="Program Name" value={plan.name} onChange={e => setPlan({...plan,name:e.target.value})} placeholder="Hypertrophy Block A" />
        <Select label="Assign to Athlete" options={[{value:"",label:"Unassigned"}, ...trainees.flatMap(t => {
          if (t.members && t.members.length === 2) {
            return t.members.map((m, i) => ({ value: t.id + '__' + i, label: m.name || ('Member ' + (i+1)) }));
          }
          return [{ value: t.id, label: t.name }];
        })]} value={plan.traineeId} onChange={v => setPlan({...plan,traineeId:v})} />
        <Input label="Phase / Block" value={plan.phase||""} onChange={e => setPlan({...plan,phase:e.target.value})} placeholder="Accumulation..." />
        {/* Weeks selector hidden for daily-routine plans — a daily routine
            has no week structure. Athlete logs it unlimited times during
            whatever timeframe is convenient. */}
        {plan.kind !== 'daily' && (
          <Select label="Weeks" options={[3,4,5,6,8,12].map(n=>({value:String(n),label:n+' weeks'}))} value={String(plan.weeks||4)} onChange={v => {
            const n = parseInt(v) || 4;
            const resize = (arr) => Array.from({length:n}, (_,i) => (arr && arr[i] !== undefined ? arr[i] : ""));
            // propagate week count to every per-week array across the program
            const nextDays = (plan.days || []).map(d => ({...d, exercises: (d.exercises||[]).map(ex => ({
              ...ex,
              wk: ex.wk ? resize(ex.wk) : ex.wk,
              wkS: ex.wkS ? resize(ex.wkS) : ex.wkS,
            }))}));
            setPlan({...plan, weeks: n, days: nextDays});
          }} />
        )}
      </div>
      <PatternCoverage plan={plan} exercises={exercises} />
      <WarmupEditor plan={plan} setPlan={setPlan} />
      {/* Day tabs. Each tab can be individually flagged as a "daily routine"
          via a small 📆 toggle inside the day's content (see below). A daily
          day in a multi-day plan lets the athlete log it any number of times
          during the block — e.g., a "Morning Routine" day inside a Mon/Wed/Fri
          program. Plan-level kind='daily' is the legacy form (96e5f72) and is
          treated as "all days daily" at display time. */}
      {!overview && <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap",alignItems:"stretch",justifyContent:"center"}}>
        {plan.days.map((d,i) => <div key={d.id} style={{display:"flex",alignItems:"stretch"}}>
          <button onClick={()=>setActiveDay(i)} style={{padding:"8px 16px",fontSize:12,borderRadius:0,border:`${i===activeDay?'2px':'0.25px'} solid ${i===activeDay?C.ac:C.cardBd}`,borderRight:'none',background:'transparent',color:i===activeDay?C.ac:C.tm,cursor:"pointer",fontFamily:FN,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase'}}>{d.kind === 'daily' && '📆 '}{d.name} ({d.exercises.length})</button>
          {plan.days.length>1&&<button onClick={()=>removeDay(i)} style={{padding:"8px 10px",fontSize:12,borderRadius:0,border:`${i===activeDay?'2px':'0.25px'} solid ${i===activeDay?C.ac:C.cardBd}`,background:'transparent',color:i===activeDay?C.ac:C.tm,cursor:"pointer",opacity:0.7}}>×</button>}
        </div>)}
        {/* "+" matches the day tabs: same padding (8/16), same border weight,
            same font sizing — uses a plain <button> rather than <Btn> so the
            ghost variant's slimmer 6/12 padding doesn't shorten the row. */}
        <button onClick={addDay} title="Add day"
          style={{padding:"8px 16px",fontSize:12,borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.ac,cursor:"pointer",fontFamily:FN,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase'}}>+</button>
      </div>}
      {overview && <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
        {plan.days.map((d, dayIdx) => {
          const dayExs = d.exercises || [];
          const weeks = plan.weeks || 4;
          const resize = (arr, n, fill) => Array.from({length:n}, (_,i) => (arr && arr[i] !== undefined ? arr[i] : fill));
          const tinyInput = {...baseInput, padding:"3px 6px", fontSize:11, minWidth:0, width:"100%", boxSizing:"border-box"};
          return (
            <div key={d.id} style={{background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:12}}>
              <div style={{display:"flex",alignItems:"center",marginBottom:8,gap:10}}>
                <input value={d.name} onChange={e=>updateDay(dayIdx,{name:e.target.value})}
                  style={{...baseInput, fontFamily:FB, fontWeight:700, fontSize:14, color:C.tx, padding:"4px 8px", maxWidth:260}} />
                <span style={{color:C.td,fontSize:12,whiteSpace:"nowrap"}}>({dayExs.length} ex)</span>
                <button onClick={()=>{setActiveDay(dayIdx);setOverview(false)}} title="Open this day in the detail editor — needed to add exercises, change the exercise itself, or edit notes/URL"
                  style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:"3px 10px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.18em',marginLeft:"auto"}}>DETAIL ▸</button>
              </div>
              {dayExs.length === 0 ? <div style={{color:C.td,fontSize:12,fontStyle:"italic"}}>No exercises.</div> :
                <div style={{overflowX:"auto",margin:"0 -12px",padding:"0 12px"}}><div style={{display:"grid",gridTemplateColumns:"36px minmax(180px,3.3fr) 56px minmax(50px,0.8fr) minmax(60px,1fr) minmax(60px,80px) minmax(48px,60px) minmax(80px,1.3fr) 24px",gap:"6px 8px",fontSize:12,alignItems:"center",minWidth:614}}>
                  {["#","EXERCISE","GRP","SETS","REPS","LOAD","RPE","TEMPO",""].map((h,hi) =>
                    hi === 0 ? (
                      <div key={hi} style={{display:'flex', alignItems:'center', gap:5, minWidth:0}}>
                        <span style={{fontFamily:FN, fontSize:12, lineHeight:1, fontWeight:400, opacity:0}}>⇕</span>
                        <span style={{fontSize:9, fontFamily:FN, color:C.td}}>{h}</span>
                      </div>
                    ) : hi === 1 ? (
                      // Same structure as the exercise-name cells below — 3px
                      // transparent borderLeft + 6px paddingLeft — so the
                      // browser computes header text x-position identically
                      // to content text x-position. Pixel-perfect by design.
                      <div key={hi} style={{fontSize:9,fontFamily:FN,color:C.td,minWidth:0, borderLeft:'3px solid transparent', paddingLeft:6}}>{h}</div>
                    ) : (
                      <div key={hi} style={{fontSize:9,fontFamily:FN,color:C.td,minWidth:0}}>{h}</div>
                    )
                  )}
                  {dayExs.map((ex, exIdx) => {
                    const exData = exercises.find(e=>e.id===ex.exerciseId);
                    const title = exData?.title || ex.title || (ex.notes?.match(/^\[(.+)\]$/)?.[1]) || '(unresolved)';
                    const sc = ex.superset==="A"?C.ac:ex.superset==="B"?C.pu:ex.superset==="C"?C.or:C.td;
                    const update = (u) => updateExInDay(dayIdx, exIdx, u);
                    return <React.Fragment key={ex.id}>
                      <div draggable
                        onDragStart={e => { e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', `${dayIdx}:${exIdx}`); setDragSrc({dayIdx, exIdx}); }}
                        onDragOver={e => { if (dragSrc && dragSrc.dayIdx===dayIdx) { e.preventDefault(); e.dataTransfer.dropEffect='move'; setDragOver({dayIdx, exIdx}); } }}
                        onDragLeave={() => { if (dragOver && dragOver.dayIdx===dayIdx && dragOver.exIdx===exIdx) setDragOver(null); }}
                        onDrop={e => { e.preventDefault(); if (dragSrc && dragSrc.dayIdx===dayIdx && dragSrc.exIdx!==exIdx) reorderExInDay(dayIdx, dragSrc.exIdx, exIdx); setDragSrc(null); setDragOver(null); }}
                        onDragEnd={() => { setDragSrc(null); setDragOver(null); }}
                        title="Drag to reorder"
                        style={{display:"flex",alignItems:"center",gap:5,minWidth:0,cursor:"grab",userSelect:"none",padding:0,opacity:dragSrc&&dragSrc.dayIdx===dayIdx&&dragSrc.exIdx===exIdx?0.4:1,borderTop:dragOver&&dragOver.dayIdx===dayIdx&&dragOver.exIdx===exIdx?`2px solid ${C.ac}`:"none"}}>
                        <span style={{color:C.tm, fontFamily:FN, fontSize:12, fontWeight:400}}>⇕</span>
                        <span style={{color:C.tm, fontFamily:FN, fontWeight:700, fontSize:12}}>{exIdx+1}</span>
                      </div>
                      <div title="Exercise name links to the library — open DETAIL to swap the exercise or edit notes/URL"
                        style={{color:C.tx, minWidth:0, overflowWrap:"anywhere", wordBreak:"break-word", borderLeft:`3px solid ${ex.superset?sc:'transparent'}`, paddingLeft:6}}>{title}</div>
                      <select value={ex.superset||""} onChange={e=>update({superset:e.target.value})}
                        style={{...tinyInput, color:sc, fontFamily:FN, fontWeight:600}}>
                        {SUPERSET_LABELS.map(s => <option key={s} value={s}>{s||"—"}</option>)}
                      </select>
                      {ex.wkS && Array.isArray(ex.wkS) && ex.wkS.length > 0 ? (
                        <div style={{display:"grid", gridTemplateColumns:`repeat(${weeks},minmax(0,1fr))`, gap:2}}>
                          {Array.from({length:weeks}).map((_,wi) => (
                            <input key={wi} value={ex.wkS[wi]||""} onChange={e=>{const next=resize(ex.wkS,weeks,""); next[wi]=e.target.value; update({wkS:next});}}
                              placeholder={"W"+(wi+1)} style={{...tinyInput, padding:"3px 4px", fontSize:10}} />
                          ))}
                        </div>
                      ) : (
                        <input type="number" value={ex.sets||""} onChange={e=>update({sets:parseInt(e.target.value)||0})} style={tinyInput} />
                      )}
                      {ex.wk && Array.isArray(ex.wk) && ex.wk.length > 0 ? (
                        <div style={{display:"grid", gridTemplateColumns:`repeat(${weeks},minmax(0,1fr))`, gap:2}}>
                          {Array.from({length:weeks}).map((_,wi) => (
                            <input key={wi} value={ex.wk[wi]||""} onChange={e=>{const next=resize(ex.wk,weeks,""); next[wi]=e.target.value; update({wk:next});}}
                              placeholder={"W"+(wi+1)} style={{...tinyInput, padding:"3px 4px", fontSize:10}} />
                          ))}
                        </div>
                      ) : (
                        <input value={ex.reps||""} onChange={e=>update({reps:e.target.value})} placeholder="8-12" style={tinyInput} />
                      )}
                      <input value={ex.load||""} onChange={e=>update({load:e.target.value})} placeholder="kg/%" style={tinyInput} />
                      <input value={ex.rpe||""} onChange={e=>update({rpe:e.target.value})} placeholder="7-8" style={tinyInput} />
                      <input value={ex.tempo||""} onChange={e=>update({tempo:e.target.value})} placeholder="3010" style={tinyInput} />
                      <button onClick={()=>removeExFromDay(dayIdx, exIdx)} title="Remove exercise from this day"
                        style={{background:"none",border:"none",color:C.rd,cursor:"pointer",fontSize:13,opacity:0.55,padding:0}}>🗑</button>
                    </React.Fragment>;
                  })}
                </div></div>
              }
            </div>
          );
        })}
      </div>}
      {!overview && day && <div style={{marginBottom:12}}><Input label={`Day ${activeDay+1} Name`} value={day.name} onChange={e=>updateDay(activeDay,{name:e.target.value})} /></div>}
      {/* Per-day "📆 Daily Routine" toggle. When ON, this specific day lets
          the athlete log it unlimited times during the block (no DONE lock,
          no week-rotation tie-in). Other days in the same plan keep normal
          week-paced behavior. Use case: a "Morning Routine" day inside a
          Mon/Wed/Fri training program. Replaces the plan-level kind='daily'
          flag from 96e5f72 — legacy plans with plan.kind='daily' still
          render correctly via the ClientPortal fallback. */}
      {!overview && day && (
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,padding:'8px 12px',border:`1px solid ${day.kind === 'daily' ? C.ac : C.cardBd}`}}>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
            <input type="checkbox" checked={day.kind === 'daily'} onChange={e => {
              if (e.target.checked) updateDay(activeDay, { kind: 'daily' });
              else { const { kind: _, ...rest } = day; setPlan(p => ({ ...p, days: p.days.map((dd, idx) => idx === activeDay ? rest : dd) })); }
            }} style={{accentColor: C.ac, width: 16, height: 16}} />
            <span style={{fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.12em',color: day.kind === 'daily' ? C.ac : C.tm,textTransform:'uppercase'}}>📆 Daily Routine</span>
          </label>
          <span style={{fontSize:11,color:C.td,flex:1}}>
            {day.kind === 'daily'
              ? 'Unlimited logs per block · no DONE lock · no week-rotation tag'
              : 'Standard week-paced day (one log per week marks DONE)'}
          </span>
        </div>
      )}
      {!overview && (day&&day.exercises.length===0?
        <div style={{textAlign:"center",padding:30,color:C.td}}><p style={{fontSize:13}}>No exercises.</p><Btn onClick={()=>setAddExerciseOpen(true)} style={{marginTop:8}}>+ Add Exercise</Btn></div>
      :<div>
        {day?.exercises.map((ex,exIdx) => {
          const exData = exercises.find(e=>e.id===ex.exerciseId);
          const exTitle = exData ? exData.title : (ex.notes?.match(/^\[(.+)\]$/)?.[1] || '');
          const sc = ex.superset==="A"?C.ac:ex.superset==="B"?C.pu:ex.superset==="C"?C.or:"transparent";
          return(<div key={ex.id} className="ex-row-card" style={{background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',border:`1px solid ${ex.superset?sc:C.cardBd}`,borderLeft:`3px solid ${ex.superset?sc:C.cardBd}`,borderRadius:0,padding:12,marginBottom:8}}>
            <div className="ex-row-outer" style={{display:"grid",gridTemplateColumns:"54px 1fr 54px",gap:12,alignItems:"start"}}>
              <div draggable
                onDragStart={e => { e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', `${activeDay}:${exIdx}`); setDragSrc({dayIdx: activeDay, exIdx}); }}
                onDragOver={e => { if (dragSrc && dragSrc.dayIdx===activeDay) { e.preventDefault(); e.dataTransfer.dropEffect='move'; setDragOver({dayIdx: activeDay, exIdx}); } }}
                onDragLeave={() => { if (dragOver && dragOver.dayIdx===activeDay && dragOver.exIdx===exIdx) setDragOver(null); }}
                onDrop={e => { e.preventDefault(); if (dragSrc && dragSrc.dayIdx===activeDay && dragSrc.exIdx!==exIdx) reorderExInDay(activeDay, dragSrc.exIdx, exIdx); setDragSrc(null); setDragOver(null); }}
                onDragEnd={() => { setDragSrc(null); setDragOver(null); }}
                title="Drag to reorder"
                style={{display:"flex",flexDirection:"row",alignItems:"center",gap:6,cursor:"grab",userSelect:"none",opacity:dragSrc&&dragSrc.dayIdx===activeDay&&dragSrc.exIdx===exIdx?0.4:1,borderTop:dragOver&&dragOver.dayIdx===activeDay&&dragOver.exIdx===exIdx?`2px solid ${C.ac}`:"none"}}>
                <span style={{fontFamily:FN,fontSize:11,color:C.tm,lineHeight:1,fontWeight:400}}>⇕</span>
                <span style={{fontFamily:FN,fontSize:12,color:C.tm,fontWeight:700,lineHeight:1}}>{exIdx+1}</span>
              </div>
              <div className="ex-row-scroll" style={{overflowX:"auto"}}>
                <div className="ex-row-grid" style={{display:"grid",gridTemplateColumns:"4.4fr 1fr 1fr 1.5fr 1fr 1fr 1.6fr auto",minWidth:780,gap:12,alignItems:"end"}}>
                  <ExPicker exercises={exercises} value={ex.exerciseId} onChange={id=>updateEx(exIdx,{exerciseId:id})} label="Exercise" fallbackTitle={ex.title} />
                  <div title="Superset letter — exercises sharing the same letter (A, B, C) are performed back-to-back as a superset. Leave blank for a standalone exercise." style={{minWidth:0}}>
                    <Select label="Superset" options={SUPERSET_LABELS.map(s=>({value:s,label:s||"—"}))} value={ex.superset||""} onChange={v=>updateEx(exIdx,{superset:v})} />
                  </div>
                  {(() => {
                    // Week count comes from plan.weeks — set once at the program level and applied to every per-week array
                    const weeks = plan.weeks || 4;
                    const resize = (arr, n, fill) => Array.from({length:n}, (_,i) => (arr && arr[i] !== undefined ? arr[i] : fill));
                    return <>
                      {ex.wkS && Array.isArray(ex.wkS) && ex.wkS.length > 0 ? (
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                            <label style={{fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:FN}}>Sets / Wk</label>
                            <button onClick={()=>updateEx(exIdx,{wkS:null,sets:parseInt(ex.wkS[0])||ex.sets||3})} title="Collapse to single sets value" style={{background:"none",border:"none",color:C.ac,fontSize:10,cursor:"pointer",padding:0,marginLeft:"auto",fontFamily:FN}}>← flat</button>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:`repeat(${weeks},minmax(40px,1fr))`,gap:3}}>
                            {Array.from({length:weeks}).map((_,i) => (
                              <input key={i} value={ex.wkS[i]||""} onChange={e=>{const next=resize(ex.wkS,weeks,""); next[i]=e.target.value; updateEx(exIdx,{wkS:next})}} placeholder={"W"+(i+1)} style={{...baseInput,padding:"4px 6px",fontSize:11,minWidth:0}} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:4,minWidth:0}}>
                            <label style={{fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:FN,whiteSpace:"nowrap"}}>Sets</label>
                            <button onClick={()=>updateEx(exIdx,{wkS:Array.from({length:weeks},()=>String(ex.sets||3))})} title="Set different sets per week" aria-label="Set different sets per week" style={{background:"none",border:"none",color:C.ac,fontSize:11,cursor:"pointer",padding:"0 2px",marginLeft:"auto",fontFamily:FN,lineHeight:1,whiteSpace:"nowrap"}}>↦</button>
                          </div>
                          <input type="number" value={ex.sets} onChange={e=>updateEx(exIdx,{sets:parseInt(e.target.value)||0})} style={{...baseInput}} />
                        </div>
                      )}
                      {ex.wk && Array.isArray(ex.wk) && ex.wk.length > 0 ? (
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                            <label style={{fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:FN}}>Reps / Wk</label>
                            <button onClick={()=>updateEx(exIdx,{wk:null,reps:ex.wk[0]||"8-12"})} title="Collapse to single reps value" style={{background:"none",border:"none",color:C.ac,fontSize:10,cursor:"pointer",padding:0,fontFamily:FN,marginLeft:"auto"}}>← flat</button>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:`repeat(${weeks},minmax(40px,1fr))`,gap:3}}>
                            {Array.from({length:weeks}).map((_,i) => (
                              <input key={i} value={ex.wk[i]||""} onChange={e=>{const next=resize(ex.wk,weeks,""); next[i]=e.target.value; updateEx(exIdx,{wk:next})}} placeholder={"W"+(i+1)} style={{...baseInput,padding:"4px 6px",fontSize:11,minWidth:0}} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                            <label style={{fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:FN}}>Reps</label>
                            <button onClick={()=>updateEx(exIdx,{wk:Array.from({length:weeks},()=>ex.reps||""),reps:">"})} title="Set different reps per week" style={{background:"none",border:"none",color:C.ac,fontSize:10,cursor:"pointer",padding:0,marginLeft:"auto",fontFamily:FN}}>per week →</button>
                          </div>
                          <input value={ex.reps||""} onChange={e=>updateEx(exIdx,{reps:e.target.value})} placeholder="8-12" style={{...baseInput}} />
                        </div>
                      )}
                    </>;
                  })()}
                  <Input label="Load" value={ex.load} onChange={e=>updateEx(exIdx,{load:e.target.value})} placeholder="kg/%" />
                  <Input label="RPE" value={ex.rpe} onChange={e=>updateEx(exIdx,{rpe:e.target.value})} placeholder="7-8" />
                  <Input label="Tempo" value={ex.tempo} onChange={e=>updateEx(exIdx,{tempo:e.target.value})} placeholder="3010" />
                  <button onClick={()=>removeEx(exIdx)} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:4,marginBottom:4,opacity:0.6}}>🗑</button>
                </div>
                {exData?<div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                  {exData.movementPattern&&<Badge color={C.gn}>{exData.movementPattern}</Badge>}
                  {exData.laterality&&<Badge color={C.tm}>{exData.laterality}</Badge>}
                  {exData.primaryMuscles&&<span style={{fontSize:11,color:C.td}}>{exData.primaryMuscles}</span>}
                </div>:exTitle?<div style={{fontSize:11,color:C.or,marginTop:4}}>📝 {exTitle}</div>:null}
                {(() => {
                  // Notes/Modifications — three-state override pattern (same shape
                  // as the videoUrl field below):
                  //   ex.notesEdited === undefined/false  → use library cues
                  //   ex.notesEdited === true             → ex.notes is the override
                  //                                         (including '' = explicit
                  //                                         "no note for this program",
                  //                                         which does NOT fall back to
                  //                                         the library)
                  // Without the explicit-edited flag, clearing the field would re-
                  // collapse to the library cues, so the coach could never delete a
                  // library-prefilled note for this program only. The Reset button
                  // re-enables the library fallback.
                  const libCues = exData?.cues || '';
                  const hasOverride = !!ex.notesEdited || !!(ex.notes && ex.notes.length > 0);
                  const value = hasOverride ? (ex.notes || '') : libCues;
                  const isFallback = !hasOverride && libCues;
                  return (
                    <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.cardBd}`,position:'relative'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6,minHeight:14,gap:8}}>
                        <span style={{fontSize:9,fontFamily:FN,fontWeight:700,color:C.td,letterSpacing:'0.18em'}}>NOTES</span>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          {isFallback && <span title="Auto-prefilled from the exercise library — start typing to override for this program only" style={{fontSize:9,fontFamily:FN,fontWeight:700,color:C.tm,letterSpacing:'0.18em'}}>FROM LIBRARY</span>}
                          {hasOverride && libCues && (
                            <button onClick={()=>updateEx(exIdx,{notes:'',notesEdited:false})}
                              title="Discard this program's override and show the library cues again. Doesn't touch the library."
                              style={{background:'transparent',border:`1px solid ${C.cardBd}`,color:C.tm,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',padding:'2px 8px',cursor:'pointer',borderRadius:0}}>↩ USE LIBRARY</button>
                          )}
                          {hasOverride && (ex.notes||'').length > 0 && (
                            <button onClick={()=>updateEx(exIdx,{notes:'',notesEdited:true})}
                              title="Clear the note for this program only (library is untouched)."
                              style={{background:'transparent',border:`1px solid ${C.cardBd}`,color:C.rd,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',padding:'2px 8px',cursor:'pointer',borderRadius:0,opacity:0.7}}>× CLEAR</button>
                          )}
                        </div>
                      </div>
                      <textarea value={value}
                        onChange={e=>updateEx(exIdx,{notes:e.target.value,notesEdited:true})}
                        placeholder={libCues?"Notes / modifications (overrides library cues)":"Notes, modifications..."}
                        style={{...baseInput,textAlign:'center',minHeight:64,padding:'10px 12px',lineHeight:1.5,resize:'vertical',fontFamily:FB,fontSize:13}} />
                    </div>
                  );
                })()}
                {(() => {
                  // Per-exercise URL.
                  // - undefined override → show library videoLink (read-only fallback)
                  // - any string override (including '') → use it; '' = explicit "no
                  //   video for this program" and the field stays empty even if the
                  //   library has one. Editing/clearing here never touches the library.
                  const libUrl = exData?.videoLink || '';
                  const hasOverride = ex.videoUrl !== undefined;
                  const value = hasOverride ? (ex.videoUrl || '') : libUrl;
                  const effective = value;
                  return (
                    <div style={{marginTop:6,display:"grid",gridTemplateColumns:effective?"1fr auto":"1fr",gap:6,alignItems:"stretch"}}>
                      <Input value={value} onChange={e=>updateEx(exIdx,{videoUrl:e.target.value})}
                        onBlur={async e => { const resolved = await maybeResolveGooglePhotos(e.target.value); if (resolved !== e.target.value) updateEx(exIdx, { videoUrl: resolved }); }}
                        placeholder="📹 Insert video URL" />
                      {/* alignItems:'stretch' on the parent + display:'inline-flex'
                          here makes the LIB/OPEN pill match the URL input's exact
                          height (input padding + font-13 was taller than the
                          pill's padding + font-10). */}
                      {effective && <a href={effective} target="_blank" rel="noreferrer"
                        title={hasOverride?"Per-program URL":"From exercise library"}
                        style={{display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontFamily:FN,fontWeight:700,letterSpacing:'0.18em',color:hasOverride?C.ac:C.tm,textDecoration:"none",padding:"0 10px",border:`${hasOverride?'1px':'0.25px'} solid ${hasOverride?C.ac:C.cardBd}`,borderRadius:0,whiteSpace:"nowrap",boxSizing:"border-box"}}>
                        {hasOverride?"OPEN ▸":"LIB ▸"}
                      </a>}
                      {/* Symmetric padding within the wrapper so the video
                          sits centered between the URL row above and the
                          next content below. alignItems:center reinforces
                          vertical centering inside the flex box. */}
                      {effective && <div style={{gridColumn:'1 / -1',padding:'14px 0',display:'flex',justifyContent:'center',alignItems:'center'}}><div style={{width:'100%',maxWidth:480}}><VideoEmbed url={effective} /></div></div>}
                    </div>
                  );
                })()}
                {plan.name && day && (() => {
                  // Match the plan's actual week count — the per-week sets/reps
                  // grids above use plan.weeks, but this used to be hardcoded
                  // to 4, hiding focus inputs for weeks 5+ on longer plans.
                  const weeks = plan.weeks || 4;
                  return (
                    <div style={{marginTop:6,background:'transparent',borderRadius:0,padding:"10px 12px",border:`1px solid ${C.cardBd}`}}>
                      <div style={{fontSize:10,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:8,letterSpacing:'0.18em',textAlign:'center'}}>WEEKLY FOCUS</div>
                      {/* Bigger, expandable boxes. minmax(180,1fr) keeps each
                          cell wide enough to actually write a sentence
                          ("W1: tempo eccentric 4s", not just a single word).
                          textarea + resize:vertical lets the coach drag any
                          one cell taller for a longer cue without forcing
                          every cell to grow. Cells auto-fit per row, so a 4-week
                          plan typically lays out 4-across on desktop and stacks
                          to 2-across on phones. */}
                      <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fit,minmax(180px,1fr))`,gap:10}}>
                        {Array.from({length:weeks}, (_, i) => i + 1).map(w => {
                          const fk = `${plan.name}|${day.name}|${ex.exerciseId}|W${w}`;
                          const v = weeklyFocus?.[fk] || '';
                          return (
                            <div key={w} style={{display:'flex',flexDirection:'column',gap:4}}>
                              <div style={{fontSize:9,fontFamily:FN,fontWeight:700,color:v?C.ac:C.tm,letterSpacing:'0.18em',textAlign:'center'}}>{`W${w}`}</div>
                              <textarea value={v}
                                onChange={e=>{const nv=e.target.value;setWeeklyFocus(prev=>({...prev,[fk]:nv}))}}
                                placeholder="—"
                                rows={2}
                                style={{background:'var(--c-sf)',border:`1px solid ${v?C.ac:C.cardBd}`,borderRadius:0,padding:'10px 12px',minHeight:64,color:C.tx,fontFamily:FB,fontSize:13,lineHeight:1.45,outline:'none',boxSizing:'border-box',textAlign:'center',minWidth:0,resize:'vertical',width:'100%'}} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div><div /></div></div>);
        })}
        <Btn variant="ghost" onClick={()=>setAddExerciseOpen(true)} style={{width:"100%",justifyContent:"center",marginTop:8}}>+ Add Exercise</Btn>
      </div>)}
      </div>
      {compareActive && (
        <ReadOnlyPlanPanel
          planIndex={planIndex}
          currentPlan={plan}
          exercises={exercises}
          trainees={trainees}
          onClose={() => setCompareOpen(false)}
        />
      )}
      </div>
      <ExerciseBrowserModal
        open={addExerciseOpen}
        onClose={()=>setAddExerciseOpen(false)}
        onPick={id=>{ addExWithId(id); setAddExerciseOpen(false); }}
        exercises={exercises}
        title="Add Exercise to Day"
      />
    </div>);
}

// Build the same visibility key TraineeDetail uses (`${trainee.name}:${plan.name}:m${memberIndex}`)
// from a plan in the program list. Couples store plans against tr_xxx__N
// sub-IDs; we strip the suffix to find the parent name and use the suffix as
// the member index. Solo plans get m0.
function visKeyForPlan(p, trainees) {
  const tid = p?.traineeId || '';
  if (!tid) return null;
  const m = tid.match(/^(.+)__(\d+)$/);
  if (m) {
    const parent = trainees.find(t => t.id === m[1]);
    if (!parent) return null;
    return `${parent.name}:${p.name}:m${m[2]}`;
  }
  const trainee = trainees.find(t => t.id === tid);
  if (!trainee) return null;
  return `${trainee.name}:${p.name}:m0`;
}

export default function PlansView({ planIndex, reloadIndex, trainees, exercises, clientWorkouts, weeklyFocus, setWeeklyFocus, openPlanId, onPlanOpened, onPreviewPlan, portalVis, setPortalVis, onCloseEditor }) {
  const { plan: editPlanData, loading: editLoading, load: loadFullPlan, clear: clearPlan, setPlan: setEditPlan } = useFullPlan();
  const [linkedTaskId, setLinkedTaskId] = useState(null);
  const { plan: previewPlan, load: loadPreviewPlan, clear: clearPreviewPlan } = useFullPlan();
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filterTrainee, setFilterTrainee] = useState("");
  const [hoverPos, setHoverPos] = useState(null);
  const hoverTimerRef = useRef(null);
  // Sort: field is 'name' | 'created' | 'updated'; dir is 'asc' | 'desc'.
  // Default 'created desc' matches the old creation-order-newest-first list.
  const [sortField, setSortField] = useState('created');
  const [sortDir, setSortDir] = useState('desc');

  // Auto-open plan if requested from TraineeDetail
  React.useEffect(() => {
    if (openPlanId && !editMode) {
      loadFullPlan(openPlanId).then(() => { setEditMode(true); if (onPlanOpened) onPlanOpened(); });
    }
  }, [openPlanId]);

  // Athlete-grouped view: collapsed by default, expanded individually per
  // athlete row. Lives in a Set so toggling one row doesn't churn other rows
  // and we can reset cheaply when filters/search change.
  const [expandedAthletes, setExpandedAthletes] = useState(() => new Set());
  const toggleAthlete = (id) => setExpandedAthletes(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const traineeMap = useMemo(() => {
    const m = {};
    trainees.forEach(t => {
      m[t.id] = t.name;
      // Couples store plans against sub-IDs tr_xxx__0 / __1 — map those to the member's own name
      if (t.members && t.members.length === 2) {
        t.members.forEach((mem, i) => {
          m[t.id + '__' + i] = mem.name || ('Member ' + (i+1));
        });
      }
    });
    return m;
  }, [trainees]);

  const filtered = useMemo(() => {
    let result = planIndex;
    if (search) { const q = search.toLowerCase(); result = result.filter(p => p.name.toLowerCase().includes(q) || (traineeMap[p.traineeId]||'').toLowerCase().includes(q)); }
    if (filterTrainee) result = result.filter(p => p.traineeId === filterTrainee);
    // Apply the user-chosen sort. 'created' uses block-number-aware chrono
    // sort (sortProgramsChrono) so Drive-imported plans that share a single
    // import timestamp don't end up in random order — they fall back to
    // Block #N parsed from the name. Hebrew-aware localeCompare for names.
    // Date fields fall back to 0 when missing.
    const dirMul = sortDir === 'asc' ? 1 : -1;
    const sorted = result.slice().sort((a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '', 'he') * dirMul;
      if (sortField === 'created') return sortProgramsChrono(a, b) * (sortDir === 'asc' ? -1 : 1);
      const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return (ta - tb) * dirMul;
    });
    return sorted;
  }, [planIndex, search, filterTrainee, traineeMap, sortField, sortDir]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  const handleOpenPlan = async (planId) => { await loadFullPlan(planId); setEditMode(true); };
  const handleNewPlan = (presetTraineeId = '') => {
    setEditPlan({ id: 'pl_' + uid(), name: "", traineeId: presetTraineeId || "", phase: "", notes: "", active: true, createdAt: new Date().toISOString(), days: [defaultDay(1)], warmup: [], weeks: 4 });
    setEditMode(true);
  };
  const handleSave = async (plan) => {
    await savePlan(plan);
    // If this editor was opened from a task → "→ NEW PROGRAM" handoff,
    // auto-mark the task done + link it to the saved plan so the chain
    // becomes visible in the trainee's activity feed.
    if (linkedTaskId) {
      const { markTaskCompletedByPlan } = await import('./coachNotes');
      const ok = await markTaskCompletedByPlan(linkedTaskId, plan.id);
      if (!ok) {
        // markTaskCompletedByPlan already surfaced a toast via reportFailure.
        // Belt-and-suspenders: also stash the pair so a future dashboard
        // sweep can offer a retry affordance. sessionStorage scoped per-
        // task-plan pair; cleared when the user clicks the retry.
        try {
          const key = 'expo-pendingTaskPlanRetry';
          const raw = sessionStorage.getItem(key);
          const arr = raw ? JSON.parse(raw) : [];
          arr.push({ taskId: linkedTaskId, planId: plan.id, when: Date.now() });
          sessionStorage.setItem(key, JSON.stringify(arr.slice(-20)));
        } catch {}
        const { toast } = await import('./ui');
        toast('Task auto-link failed — check the trainee card for the retry pill.', 'warn', { ttl: 7000 });
      }
      setLinkedTaskId(null);
    }
    setEditMode(false);
    clearPlan();
    await reloadIndex();
    if (onCloseEditor) onCloseEditor();
  };

  // Consume a pending task→plan handoff (set by clicking "→ NEW PROGRAM"
  // on a trainee-tagged task). When present on mount, auto-open a fresh
  // plan editor pre-bound to that trainee and remember the task id so
  // handleSave can mark it done on commit.
  //
  // Peek + drop pattern (instead of the destructive consume) so an unmount
  // race between the read and the consumer commit can't silently lose the
  // handoff. Drop only after we've committed to using the payload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { peekPendingTaskPlanLink, dropPendingTaskPlanLink } = await import('./coachNotes');
      const pending = peekPendingTaskPlanLink();
      if (!pending || cancelled) return;
      dropPendingTaskPlanLink();
      setLinkedTaskId(pending.taskId);
      handleNewPlan(pending.traineeId);
    })();
    return () => { cancelled = true; };
  // Run-once on mount; the handoff is one-shot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Back from the editor: reload the index so autosaved edits (program name,
  // day count, exercise count, updatedAt sort, etc.) appear immediately.
  // onCloseEditor (when provided by App.jsx) routes the coach back to
  // wherever the editor was opened from — typically the trainee card if
  // they clicked "Open Plan" there, no-op when opened from the plans list.
  const handleCancel = () => { setEditMode(false); clearPlan(); reloadIndex(); if (onCloseEditor) onCloseEditor(); };
  const handleDuplicate = async (planId) => {
    const { supabase: sb } = await import('./supabase');
    const { data } = await sb.from('plans').select('*').eq('id', planId).single();
    if (data) { await duplicatePlan({ id: data.id, name: data.name, traineeId: data.trainee_id, phase: data.phase, notes: data.notes, active: data.active, createdAt: data.created_at, days: data.data?.days||[], warmup: data.data?.warmup||[] }); await reloadIndex(); }
  };
  const handleDelete = async (planId) => { await deletePlan(planId); setConfirmDelete(null); await reloadIndex(); };

  // F-18 — Public program share. Creates a program_shares row with a
  // random token, copies the public URL to the clipboard, and toasts
  // success. Anon visitors hit /p/<token> which reads via the
  // get_shared_program(token) SECURITY DEFINER function (PII never
  // leaves the server).
  const handleShare = async (planId) => {
    try {
      const { supabase: sb } = await import('./supabase');
      const token = 'sh_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
      const { error } = await sb.from('program_shares').insert({
        token,
        plan_id: planId,
        created_at: new Date().toISOString(),
      });
      if (error) {
        const { toast } = await import('./ui');
        toast(`Share failed: ${error.message}`, 'error');
        return;
      }
      const url = `${window.location.origin}/p/${token}`;
      try { await navigator.clipboard.writeText(url); } catch {}
      const { toast } = await import('./ui');
      toast(`Public link copied — ${url}`, 'success');
    } catch (e) {
      console.warn('handleShare error:', e);
    }
  };

  const traineeOptions = useMemo(() => {
    const ids = [...new Set(planIndex.map(p => p.traineeId).filter(Boolean))];
    return ids.map(id => ({ value: id, label: traineeMap[id] || id })).sort((a,b) => a.label.localeCompare(b.label));
  }, [planIndex, traineeMap]);

  // Default view: athlete-grouped, current-block-first. Activates when the
  // user isn't searching or filtering by trainee — those modes fall back to
  // the flat list because cross-athlete results don't group sensibly.
  // For each non-archived trainee:
  //   • currentBlock = highest-block-# active plan (or most recent createdAt)
  //   • lastSession = most recent clientWorkout date (any plan)
  //   • daysSince  = derived from lastSession
  //   • earlier    = remaining plans, sorted by block# desc
  // Couples with sub-IDs (__0/__1) collapse under the parent member view —
  // we attribute every plan to whichever sub-id-or-parent owns it.
  const sortByRecency = sortProgramsChrono;
  const grouped = useMemo(() => {
    if (search || filterTrainee) return null; // flat-list fallback for filtered modes
    // Bucket plans by athlete (parent or sub-id).
    const buckets = new Map();
    for (const p of planIndex) {
      const tid = p.traineeId || '__unassigned__';
      if (!buckets.has(tid)) buckets.set(tid, []);
      buckets.get(tid).push(p);
    }
    // Last session per trainee from clientWorkouts. Match by either parent or
    // sub-id so couples roll up where appropriate.
    const lastByTid = new Map();
    for (const w of (clientWorkouts || [])) {
      const ts = new Date(w.date || w.createdAt || 0).getTime();
      if (!isFinite(ts)) continue;
      const cur = lastByTid.get(w.clientId) || 0;
      if (ts > cur) lastByTid.set(w.clientId, ts);
    }
    const now = Date.now();
    const rows = [];
    for (const [tid, plans] of buckets.entries()) {
      const sorted = plans.slice().sort(sortByRecency);
      const current = sorted[0];
      const earlier = sorted.slice(1);
      const lastTs = lastByTid.get(tid) || 0;
      const daysSince = lastTs ? Math.floor((now - lastTs) / 86400000) : null;
      rows.push({
        tid,
        name: traineeMap[tid] || (tid === '__unassigned__' ? 'Unassigned' : tid),
        current,
        earlier,
        daysSince,
        totalCount: plans.length,
      });
    }
    // Surface active trainees who have NO plans assigned — easy to overlook
    // a new athlete and have them silently fall off the radar otherwise. These
    // get a zero-state row at the bottom of the list so the gap is impossible
    // to miss when scanning. Couples with sub-IDs are checked at the parent
    // level; we count an athlete as "covered" if any of their IDs (parent or
    // sub) appears in the buckets map.
    const covered = new Set(buckets.keys());
    const orphans = (trainees || []).filter(t => {
      if (t.status === 'Archived') return false;
      const ids = [t.id];
      if (t.members && t.members.length === 2) {
        ids.push(t.id + '__0', t.id + '__1');
      }
      return ids.every(id => !covered.has(id));
    });
    for (const t of orphans) {
      rows.push({
        tid: t.id,
        name: t.name || t.id,
        current: null,           // zero-state: no current block
        earlier: [],
        daysSince: null,
        totalCount: 0,
        orphan: true,
      });
    }
    // Sort athletes: most-recently-trained first; never-trained next; orphans
    // (no plan at all) at the very bottom; unassigned (legacy) last of all.
    rows.sort((a, b) => {
      if (a.tid === '__unassigned__') return 1;
      if (b.tid === '__unassigned__') return -1;
      if (a.orphan && !b.orphan) return 1;
      if (b.orphan && !a.orphan) return -1;
      const aT = lastByTid.get(a.tid) || 0;
      const bT = lastByTid.get(b.tid) || 0;
      if (aT !== bT) return bT - aT;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [planIndex, clientWorkouts, trainees, search, filterTrainee, traineeMap]);

  if (editMode) {
    if (editLoading || !editPlanData) return <div style={{textAlign:"center",padding:60,color:C.td}}><div style={{fontSize:14}}>Loading program...</div></div>;
    // key={editPlanData.id} forces a remount when the visitor switches
    // programs via the new in-editor dropdown — PlanEditor's internal `plan`
    // state is initialized from `init` only once, so a remount is the
    // simplest way to load fresh data without rewiring its state plumbing.
    return <PlanEditor key={editPlanData.id} plan={editPlanData} onSave={handleSave} onCancel={handleCancel} onSwitchProgram={loadFullPlan} trainees={trainees} exercises={exercises} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} planIndex={planIndex} onPreviewPlan={onPreviewPlan} />;
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:12,alignItems:"stretch",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180,display:'flex'}}><input placeholder="Search programs..." value={search} onChange={e=>{setSearch(e.target.value);setVisibleCount(PAGE_SIZE)}} style={{...baseInput,height:42,padding:'0 14px',fontSize:13,lineHeight:'42px',display:'flex',alignItems:'center',textAlignLast:'center'}} /></div>
        <div style={{position:'relative',width:200,display:'flex'}}>
          <select value={filterTrainee} onChange={e=>{setFilterTrainee(e.target.value);setVisibleCount(PAGE_SIZE)}} style={{...baseInput,height:42,padding:'0 36px 0 14px',fontSize:13,appearance:'none',WebkitAppearance:'none',textAlign:'center',textAlignLast:'center',flex:1}}>
            <option value="">All Athletes ({planIndex.length})</option>
            {traineeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:C.tm,fontSize:16,lineHeight:1}}>▾</span>
        </div>
        <Btn onClick={handleNewPlan} style={{height:42,padding:'0 18px',fontSize:13,lineHeight:'42px',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>+ New Program</Btn>
      </div>
      {/* Sort controls. Click an inactive field to activate it (keeps current dir);
          click the active field to flip direction. Arrow points 'up' for asc. */}
      <div style={{display:"flex",gap:6,marginBottom:16,alignItems:"center",flexWrap:"wrap",fontFamily:FN,fontSize:11}}>
        <span style={{color:C.td,letterSpacing:"0.05em"}}>SORT</span>
        {[
          ['name','Name'],
          ['created','Uploaded'],
          ['updated','Last edited'],
        ].map(([field,label]) => {
          const active = sortField === field;
          return (
            <button key={field} onClick={() => {
              if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
              else setSortField(field);
            }} style={{
              padding:"4px 10px",borderRadius:0,
              border:`${active?'1px':'0.25px'} solid ${active?C.ac:C.cardBd}`,
              background:'transparent',
              color:active?C.ac:C.tm,
              fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',
              cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4
            }}>
              {label}{active && <span style={{fontSize:10}}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </button>
          );
        })}
      </div>
      <div style={{fontSize:12,color:C.td,marginBottom:12,fontFamily:FN}}>
        {grouped
          ? `${grouped.length} athlete${grouped.length===1?'':'s'} · ${planIndex.length} program${planIndex.length===1?'':'s'} total`
          : `Showing ${visible.length} of ${filtered.length} programs${filtered.length !== planIndex.length ? ` (${planIndex.length} total)` : ''}`}
      </div>
      {/* Athlete-grouped default view. Each row = one athlete, current block
          surfaced prominently with last-session signal. (N earlier blocks)
          chevron expands the older blocks inline so nothing is lost — they
          just stay out of the daily scan path. */}
      {grouped && grouped.length > 0 && (
        <div style={{display:"grid",gap:8}}>
          {grouped.map(row => {
            const expanded = expandedAthletes.has(row.tid);
            const cur = row.current;
            const tagColor = row.daysSince == null ? C.td : row.daysSince <= 3 ? C.gn : row.daysSince <= 7 ? C.tm : row.daysSince <= 14 ? C.or : C.rd;
            const tagText = row.daysSince == null ? 'NEVER LOGGED' : row.daysSince === 0 ? 'TRAINED TODAY' : `${row.daysSince}D AGO`;
            // Zero-state: active trainee with no plan at all. Skip the
            // current-block row entirely — render a single "NO PROGRAM ASSIGNED"
            // line with a + NEW PROGRAM CTA pre-bound to this athlete via
            // handleNewPlan (which seeds an empty plan; the editor's trainee
            // picker is right there for assignment after the editor opens).
            if (row.orphan) {
              return (
                <div key={row.tid} style={{background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',border:`0.25px dashed rgba(255,165,2,0.502)`,borderRadius:0,padding:'12px 14px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                  <div style={{minWidth:0,flex:1,display:'flex',alignItems:'baseline',gap:14,flexWrap:'wrap'}}>
                    <div style={{fontWeight:700,fontSize:15,color:C.tx,whiteSpace:'nowrap',letterSpacing:'0.01em',flexShrink:0}}><bdi>{row.name}</bdi></div>
                    <div style={{fontSize:11,color:C.or,fontFamily:FN,letterSpacing:'0.18em',textTransform:'uppercase',fontWeight:700}}>NO PROGRAM ASSIGNED</div>
                  </div>
                  <button onClick={()=>handleNewPlan()} style={{background:'var(--c-sf)',border:`1px solid ${C.or}`,borderRadius:0,color:C.or,cursor:'pointer',padding:'3px 10px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.18em',whiteSpace:'nowrap'}}>+ ASSIGN PROGRAM</button>
                </div>
              );
            }
            return (
              <div key={row.tid} style={{background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderLeft:`3px solid ${C.ac}`,borderRadius:0}}>
                {/* Current-block row — clicking opens the plan editor. */}
                <div onClick={()=>handleOpenPlan(cur.id)}
                  onMouseEnter={e => {
                    const x = e.clientX, y = e.clientY;
                    clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = setTimeout(() => { setHoverPos({ x, y }); loadPreviewPlan(cur.id); }, 220);
                  }}
                  onMouseLeave={() => { clearTimeout(hoverTimerRef.current); setHoverPos(null); clearPreviewPlan(); }}
                  style={{cursor:'pointer',padding:'12px 14px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                  <div style={{minWidth:0,flex:1,display:'flex',alignItems:'baseline',gap:14,flexWrap:'wrap'}}>
                    <div style={{fontWeight:700,fontSize:15,color:C.tx,whiteSpace:'nowrap',letterSpacing:'0.01em',flexShrink:0}}><bdi>{row.name}</bdi></div>
                    <div style={{fontWeight:700,fontSize:15,color:C.ac,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'0.04em',fontFamily:FN,minWidth:0,flex:1}}>{cur.name||"Untitled"}</div>
                    <div style={{fontSize:11,color:C.tm,fontFamily:FN,letterSpacing:'0.04em',fontWeight:500,flexShrink:0,whiteSpace:'nowrap'}}>{cur.dayCount}d · {cur.exerciseCount}ex</div>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                    <span title={`Last session: ${tagText.toLowerCase()}`} style={{fontSize:10,fontFamily:FN,color:tagColor,letterSpacing:'0.04em',fontWeight:600,border:`1px solid ${tagColor}`,padding:'3px 7px',whiteSpace:'nowrap'}}>{tagText.toLowerCase()}</span>
                    {row.earlier.length > 0 && (
                      <button onClick={e=>{e.stopPropagation();toggleAthlete(row.tid);}}
                        title={expanded?`Hide ${row.earlier.length} earlier block${row.earlier.length===1?'':'s'}`:`Show ${row.earlier.length} earlier block${row.earlier.length===1?'':'s'}`}
                        style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,color:C.ac,cursor:'pointer',padding:'3px 8px',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',whiteSpace:'nowrap',minWidth:34,textAlign:'center'}}>
                        {expanded?`▴ ${row.earlier.length}`:`▾ +${row.earlier.length}`}
                      </button>
                    )}
                    {setPortalVis && row.earlier.length > 0 && (() => {
                      const curKey = visKeyForPlan(cur, trainees);
                      if (!curKey) return null;
                      const earlierKeys = row.earlier.map(p => visKeyForPlan(p, trainees)).filter(Boolean);
                      return <button onClick={e => { e.stopPropagation(); const next = { ...portalVis, [curKey]: true }; earlierKeys.forEach(k => { next[k] = false; }); setPortalVis(next); }}
                        title="Hide earlier blocks on portal; keep only current"
                        style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,color:C.ac,cursor:'pointer',padding:'3px 7px',fontFamily:FN,fontSize:13,lineHeight:1,fontWeight:700,whiteSpace:'nowrap'}}>
                        <ActionIcon kind="target" fallback="🎯" color={C.ac} />
                      </button>;
                    })()}
                    {setPortalVis && (() => {
                      const vk = visKeyForPlan(cur, trainees);
                      if (!vk) return null;
                      const isVis = portalVis?.[vk] !== false;
                      return <button onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis})}} title={isVis?'Visible on athlete portal — click to hide':'Hidden from athlete portal — click to show'} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center'}}>
                        <div style={{width:28,height:16,borderRadius:8,background:isVis?'rgba(46,213,115,0.251)':C.sf3,border:`1px solid ${isVis?'rgba(46,213,115,0.376)':C.bd2}`,position:'relative',transition:'all .15s'}}><div style={{width:12,height:12,borderRadius:6,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?14:1,transition:'all .15s'}}/></div>
                      </button>;
                    })()}
                    {onPreviewPlan && <button onClick={e=>{e.stopPropagation();onPreviewPlan(cur.id);}} title="Preview as trainee" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${isRefined5b() ? C.ac : C.cardBd}`,borderRadius:0,color: isRefined5b() ? C.ac : C.tm,cursor:"pointer",padding:'3px 7px',fontFamily:FN,fontSize:13,lineHeight:1}}><ActionIcon kind="eye" fallback="👁" color={C.tm} /></button>}
                    <button onClick={e=>{e.stopPropagation();handleDuplicate(cur.id);}} title="Duplicate program" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,color:C.ac,cursor:"pointer",padding:'3px 7px',fontFamily:FN,fontSize:13,lineHeight:1}}><ActionIcon kind="duplicate" fallback="⎘" color={C.ac} /></button>
                    <button onClick={e=>{e.stopPropagation();handleShare(cur.id);}} title="Public share — copies a /p/<token> URL anyone can open" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,color:C.ac,cursor:"pointer",padding:'3px 7px',fontFamily:FN,fontSize:13,lineHeight:1}}>🔗</button>
                  </div>
                </div>
                {/* Expanded earlier blocks — same hover preview, slightly compressed
                    visual treatment so the eye stays on the current block. */}
                {expanded && row.earlier.length > 0 && (
                  <div style={{borderTop:`1px solid ${C.cardBd}`,padding:'4px 0'}}>
                    {row.earlier.map(p => (
                      <div key={p.id} onClick={()=>handleOpenPlan(p.id)}
                        onMouseEnter={e => {
                          const x = e.clientX, y = e.clientY;
                          clearTimeout(hoverTimerRef.current);
                          hoverTimerRef.current = setTimeout(() => { setHoverPos({ x, y }); loadPreviewPlan(p.id); }, 220);
                        }}
                        onMouseLeave={() => { clearTimeout(hoverTimerRef.current); setHoverPos(null); clearPreviewPlan(); }}
                        style={{cursor:'pointer',padding:'7px 14px 7px 32px',display:'flex',alignItems:'center',gap:8,opacity:0.78,borderTop:`1px solid rgba(57,189,255,0.102)`}}>
                        <div style={{flex:1,minWidth:0,fontSize:13,color:C.tm,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'0.04em',fontFamily:FN}}>{p.name||"Untitled"}</div>
                        <div style={{fontSize:11,color:C.td,fontFamily:FN,letterSpacing:'0.04em',fontWeight:500,flexShrink:0,whiteSpace:'nowrap'}}>{p.dayCount}d · {p.exerciseCount}ex</div>
                        {setPortalVis && (() => {
                          const vk = visKeyForPlan(p, trainees);
                          if (!vk) return null;
                          const isVis = portalVis?.[vk] !== false;
                          return <button onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis})}} title={isVis?'Visible on athlete portal — click to hide':'Hidden from athlete portal — click to show'} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',flexShrink:0}}>
                            <div style={{width:28,height:16,borderRadius:8,background:isVis?'rgba(46,213,115,0.251)':C.sf3,border:`1px solid ${isVis?'rgba(46,213,115,0.376)':C.bd2}`,position:'relative',transition:'all .15s'}}><div style={{width:12,height:12,borderRadius:6,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?14:1,transition:'all .15s'}}/></div>
                          </button>;
                        })()}
                        {onPreviewPlan && <button onClick={e=>{e.stopPropagation();onPreviewPlan(p.id);}} title="Preview as trainee" style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,color:C.tm,cursor:"pointer",padding:'2px 7px',fontFamily:FN,fontSize:13,lineHeight:1,flexShrink:0}}><ActionIcon kind="eye" fallback="👁" color={C.tm} /></button>}
                        <button onClick={e=>{e.stopPropagation();handleDuplicate(p.id);}} title="Duplicate program" style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,color:C.ac,cursor:"pointer",padding:'2px 7px',fontFamily:FN,fontSize:13,lineHeight:1,flexShrink:0}}><ActionIcon kind="duplicate" fallback="⎘" color={C.ac} /></button>
                        <button onClick={e=>{e.stopPropagation();setConfirmDelete(p.id);}} title="Delete program" style={{background:'var(--c-sf)',border:`1px solid rgba(255,71,87,0.502)`,borderRadius:0,color:C.rd,cursor:"pointer",padding:'2px 7px',fontFamily:FN,fontSize:13,lineHeight:1,flexShrink:0}}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Flat-list fallback — only when search/trainee-filter is active. */}
      {!grouped && (filtered.length===0?<EmptyState icon="" message="No programs match your search." />:(
        <div style={{display:"grid",gap:6}}>{visible.map(p => {
          const tName = traineeMap[p.traineeId] || "Unassigned";
          return <Card key={p.id} onClick={()=>handleOpenPlan(p.id)} style={{padding:'10px 14px', background: isRefined5b() ? '#FFFFFF' : undefined, borderLeft:`3px solid ${C.ac}`}}
            onMouseEnter={e => {
              const x = e.clientX, y = e.clientY;
              clearTimeout(hoverTimerRef.current);
              hoverTimerRef.current = setTimeout(() => {
                setHoverPos({ x, y });
                loadPreviewPlan(p.id);
              }, 220);
            }}
            onMouseLeave={() => {
              clearTimeout(hoverTimerRef.current);
              setHoverPos(null);
              clearPreviewPlan();
            }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{minWidth:0,flex:1,direction:'ltr',unicodeBidi:'isolate',display:'flex',alignItems:'baseline',gap:14,flexWrap:'wrap'}}>
                <div style={{fontWeight:700,fontSize:isHebrew(tName)?18:15,fontFamily:isHebrew(tName)?FH:undefined,color:C.tx,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'0.01em',flexShrink:0}}><bdi>{tName}</bdi></div>
                <div style={{fontWeight:700,fontSize:15,color:C.ac,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'0.04em',fontFamily:FN,minWidth:0,flex:1}}>{p.name||"Untitled"}</div>
                <div style={{fontSize:11,color:C.tm,fontFamily:FN,letterSpacing:'0.04em',fontWeight:500,flexShrink:0,whiteSpace:'nowrap'}}>{p.dayCount}d · {p.exerciseCount}ex{p.phase?` · ${p.phase}`:''}</div>
              </div>
              <div style={{display:"flex",gap:8,flexShrink:0,alignItems:'center'}}>
                {setPortalVis && (() => {
                  const vk = visKeyForPlan(p, trainees);
                  if (!vk) return null;
                  const isVis = portalVis?.[vk] !== false;
                  return <button onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis})}} title={isVis?'Visible on athlete portal — click to hide':'Hidden from athlete portal — click to show'} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center'}}>
                    <div style={{width:28,height:16,borderRadius:8,background:isVis?'rgba(46,213,115,0.251)':C.sf3,border:`1px solid ${isVis?'rgba(46,213,115,0.376)':C.bd2}`,position:'relative',transition:'all .15s'}}><div style={{width:12,height:12,borderRadius:6,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?14:1,transition:'all .15s'}}/></div>
                  </button>;
                })()}
                {onPreviewPlan && <button onClick={e=>{e.stopPropagation();onPreviewPlan(p.id)}} title="Preview as trainee" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${isRefined5b() ? C.ac : C.cardBd}`,borderRadius:0,color: isRefined5b() ? C.ac : C.tm,cursor:"pointer",padding:'3px 7px',fontFamily:FN,fontSize:13,lineHeight:1}}><ActionIcon kind="eye" fallback="👁" color={C.tm} /></button>}
                <button onClick={e=>{e.stopPropagation();handleDuplicate(p.id)}} title="Duplicate program" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,color:C.ac,cursor:"pointer",padding:'3px 7px',fontFamily:FN,fontSize:13,lineHeight:1}}><ActionIcon kind="duplicate" fallback="⎘" color={C.ac} /></button>
                <button onClick={e=>{e.stopPropagation();setConfirmDelete(p.id)}} title="Delete program" style={{background:'var(--c-sf)',border:`1px solid rgba(255,71,87,0.502)`,borderRadius:0,color:C.rd,cursor:"pointer",padding:'3px 7px',fontFamily:FN,fontSize:13,lineHeight:1}}>×</button>
              </div></div></Card>})}
          {hasMore && <Btn variant="ghost" onClick={()=>setVisibleCount(c=>c+PAGE_SIZE)} style={{width:"100%",justifyContent:"center",marginTop:8}}>Load more ({filtered.length - visibleCount} remaining)</Btn>}
        </div>))}
      {/* Hover preview popover */}
      {previewPlan && hoverPos && (() => {
        const GAP = 16;
        const spaceRight = window.innerWidth - hoverPos.x - GAP;
        const leftAnchored = spaceRight >= 200;
        const left = leftAnchored ? hoverPos.x + GAP : 'auto';
        const right = leftAnchored ? 'auto' : window.innerWidth - hoverPos.x + GAP;
        const top = Math.min(hoverPos.y - 8, window.innerHeight - 20);
        return (
          <div style={{position:'fixed',zIndex:900,top:top,left:leftAnchored?Math.max(8,left):undefined,right:leftAnchored?undefined:Math.max(8,right),width:'min(440px,90vw)',background: isRefined5b() ? '#F0FAFF' : C.sf,border:`2px solid ${C.ac}`,borderRadius:0,padding:16,pointerEvents:'none',boxShadow: isRefined5b() ? '0 6px 16px rgba(0,0,0,0.10), 0 16px 40px rgba(0,0,0,0.18)' : `0 8px 32px ${C.shadow}`}}>
            <div style={{fontFamily:FN,fontSize:13,fontWeight:700,color:C.ac,letterSpacing:'0.04em',marginBottom:2}}>{previewPlan.name||"Untitled"}</div>
            <div style={{fontFamily:FN,fontSize:10,color:C.tm,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:12}}>{previewPlan.days.length} DAYS · {previewPlan.days.reduce((n,d)=>n+d.exercises.length,0)} EX{previewPlan.phase?` · ${previewPlan.phase}`:''}</div>
            {previewPlan.days.map((d,di) => (
              <div key={d.id} style={{marginBottom:10}}>
                <div style={{fontFamily:FN,fontSize:10,fontWeight:700,color:C.tx,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>{d.name}</div>
                {d.exercises.slice(0,8).map((pe,ei) => {
                  const ex = exercises.find(e=>e.id===pe.exerciseId);
                  const title = ex?.title || pe.title || '—';
                  return (
                    <div key={pe.id||ei} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,padding:'2px 0',borderBottom:`1px solid rgba(57,189,255,0.102)`}}>
                      <span style={{fontSize:11,color:C.tm,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ei+1}. {title}</span>
                      <span style={{fontSize:10,fontFamily:FN,color:C.ac,flexShrink:0}}>{pe.sets}×{pe.reps}</span>
                    </div>
                  );
                })}
                {d.exercises.length > 8 && <div style={{fontSize:10,color:C.td,fontFamily:FN,marginTop:3}}>+{d.exercises.length-8} more</div>}
              </div>
            ))}
          </div>
        );
      })()}
      <ConfirmDialog open={!!confirmDelete} title="Delete Program?" message="Existing workouts will remain." onConfirm={()=>handleDelete(confirmDelete)} onCancel={()=>setConfirmDelete(null)} />
    </div>);
}
