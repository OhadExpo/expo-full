import React, { useState, useMemo, useEffect, useRef } from 'react';
import { C, FN, FB, FH, uid, REQUIRED_PATTERNS, SUPERSET_LABELS, CATEGORIES, RESISTANCE_TYPES, BODY_POSITIONS, MOVEMENT_TYPES, MOVEMENT_PATTERNS, LATERALITY } from './theme';

// Heebo's x-height is smaller than Nord's at the same fontSize, so Hebrew
// names visually shrink in a row designed for English. Per the
// feedback_new_ui_box_dimensions rule: Hebrew bumps +3px inside the box.
const isHebrew = (s) => /[֐-׿]/.test(s || '');
import { Btn, Input, Select, Badge, Card, ConfirmDialog, EmptyState, baseInput, isRefined5b, usePersistentState, useDelayedUnmount, toast } from './ui';

// Memoized id->exercise lookup. The library is ~1,500 exercises; a per-row
// `exercises.find(...)` in the PlanEditor render loop re-scanned the whole
// array on every keystroke (~30k comparisons/keypress). Rebuilds the Map only
// when the exercises array reference changes (load/save), so all callers get
// O(1) lookups for free without each needing its own useMemo.
let _exMapSrc = null, _exMap = null;
function exById(exercises) {
  if (_exMapSrc !== exercises) {
    _exMapSrc = exercises;
    _exMap = new Map((exercises || []).map(e => [e.id, e]));
  }
  return _exMap;
}
import { useFullPlan, savePlan, deletePlan, duplicatePlan } from './usePlansStore';
import useAutosave, { autosaveStatusLabel } from './hooks/useAutosave';
import VideoEmbed from './VideoEmbed';
import { sortProgramsChrono } from './traineeUtils';

const defaultPlanEx = () => ({ id: uid(), exerciseId: "", sets: "", reps: "", load: "", rpe: "", tempo: "", rest: "", notes: "", order: 0, superset: "", wk: null });
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

// In compare mode each half is a fixed header row above its own scroller.
// The scroller's content is narrower than the pane by (scrollbar + 6px
// paddingRight), so a full-width header row visually overhangs the boxes
// below it (Ohad: "the text boxes should end before the scroller, level
// with Pattern Coverage"). Measures the pane's scrollbar width so the
// header can pad-right to the exact same content edge.
function useScrollbarInset(active) {
  const ref = useRef(null);
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!active) { setInset(0); return; }
    const el = ref.current;
    if (!el) return;
    const measure = () => setInset(el.offsetWidth - el.clientWidth);
    measure();
    // ResizeObserver catches the scrollbar appearing/disappearing as content
    // grows/shrinks (it changes the content-box width), window resize covers
    // pane-width changes.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [active]);
  return [ref, inset];
}

function PatternCoverage({ plan, exercises, cols = 5 }) {
  const pats = useMemo(() => {
    const s = new Set();
    plan.days.forEach(d => d.exercises.forEach(pe => {
      const ex = exById(exercises).get(pe.exerciseId);
      if (ex?.movementPattern) s.add(ex.movementPattern);
    }));
    return s;
  }, [plan.days, exercises]);
  const missing = REQUIRED_PATTERNS.filter(p => !pats.has(p));
  if (exercises.length === 0) return null;
  return (<div style={{ background: 'var(--c-sf)', border:`1px solid ${C.cardBd}`, borderRadius: 0, padding: 12, marginBottom: 16 }}>
    <div style={{ fontSize: 12, fontFamily: FN, fontWeight: 700, color: C.or, marginBottom: 8, letterSpacing:'0.06em' }}>PATTERN COVERAGE: {REQUIRED_PATTERNS.length - missing.length}/{REQUIRED_PATTERNS.length}</div>
    {/* minmax(0,1fr): a bare 1fr floors at min-content, so long labels
        (Carry/Loaded Locomotion) widened their column and narrow panes got
        visibly unequal boxes. height:100% makes every badge fill its grid
        row, so a wrapped label doesn't leave its row-mates shorter. */}
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 5 }}>{REQUIRED_PATTERNS.map(p => <Badge key={p} color={pats.has(p) ? C.gn : C.tm} style={{ width:'100%', height:'100%', minHeight:0, boxSizing:'border-box', justifyContent:'center', alignItems:'center', textAlign:'center', display:'inline-flex', ...(pats.has(p) ? {} : {fontWeight:500,opacity:0.65}) }}>{pats.has(p) ? "✓" : "✗"} {p}</Badge>)}</div>
  </div>);
}

// Shared modal for browsing and picking an exercise.
// Props: open, onClose, onPick(exerciseId), exercises, currentId, title
// onPickName(name) — optional: pick a FREE-TEXT name not in the library.
// onCreateLibrary(name) — optional: create a real library exercise + link it.
function ExerciseBrowserModal({ open, onClose, onPick, onPickName, onCreateLibrary, exercises, currentId, currentEx, fallbackTitle }) {
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
  // Add the typed search text as a free-text exercise (not in the library).
  const pickName = () => { const t = (search || '').trim(); if (t && onPickName) { onPickName(t); onClose(); } };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filt.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filt[activeIdx]) pick(filt[activeIdx]); else pickName(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // Show the first 2-3 available parameters so similar exercises are
  // distinguishable (athletic/med-ball rows often lack resistance/body-position
  // but DO have category + laterality). movementPattern is shown separately.
  const subtitle = (ex) => [ex.category, ex.resistanceType, ex.bodyPosition, ex.movementType, ex.laterality].filter(Boolean).slice(0, 3).join(' · ');
  const muscles = (ex) => [ex.primaryMuscles, ex.secondaryMuscles].filter(Boolean).join(' / ');
  const filterSelectStyle = { ...baseInput, padding: '7px 10px', fontSize: 12 };
  // Active filters get the brand cyan border + subtle bg tint so the coach
  // can see at a glance which dimensions are constraining the result list.
  const filterStyleActive = { ...filterSelectStyle, border: `1px solid ${C.ac}`, color: C.tx };

  const { mounted, closing } = useDelayedUnmount(open);
  if (!mounted) return null;

  return (
    <div role="dialog" aria-modal="true" className={closing ? 'motion-fade-out' : 'motion-fade-in'} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, background: C.scrim, backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={closing ? 'motion-fall' : 'motion-rise'} style={{ background: C.sf, border:`1px solid ${C.bd}`, borderRadius: 0, width: 'min(900px, 92vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: `0 20px 60px ${C.shadow}` }}>
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
          {/* "Add by name" / "Create in library" — offered whenever the coach
              has typed something, EVEN when there are matching suggestions
              (Ohad: the exact name they want may not be in the list). */}
          {(onPickName || onCreateLibrary) && search.trim() && (
            <div style={{ marginBottom: 12, padding: 12, border: `1px dashed ${C.cardBd}`, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, color: C.td, fontFamily: FN, letterSpacing: '0.06em', width: '100%', textAlign: 'center' }}>NOT IN THE LIST?</span>
              {onPickName && (
                <button onClick={pickName} title="Add by name only — no library link, notes, or video"
                  style={{ background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '7px 14px', borderRadius: 0 }}>
                  + ADD “{search.trim()}” (THIS PROGRAM ONLY)
                </button>
              )}
              {onCreateLibrary && (
                <button onClick={() => { onCreateLibrary(search.trim()); onClose(); }} title="Create a reusable library exercise (edit details later in Exercises)"
                  style={{ background: '#39BDFF', border: '1px solid #39BDFF', color: '#FFFFFF', cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '7px 14px', borderRadius: 0 }}>
                  + CREATE “{search.trim()}” IN LIBRARY
                </button>
              )}
            </div>
          )}
          {filt.length === 0 ? (
            <div style={{ padding: 40, fontSize: 13, color: C.td, textAlign: 'center' }}>
              No exercises found. Try relaxing filters or the search term.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.tx, lineHeight: 1.3, flex: 1, overflowWrap: 'anywhere' }}>{ex.title}</div>
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
function ExPicker({ exercises, value, onChange, onPickName, label, fallbackTitle }) {
  const [modalOpen, setModalOpen] = useState(false);
  const sel = exById(exercises).get(value);
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
        onPickName={onPickName ? (name => { onPickName(name); setModalOpen(false); }) : undefined}
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

function WarmupEditor({ plan, setPlan, compact = false, exercises = [] }) {
  const warmup = Array.isArray(plan.warmup) ? plan.warmup : [];
  // Collapsed by default whenever there's content, so the warm-up doesn't
  // dominate the editor when the coach is iterating on the main exercise
  // list. Empty programs default to expanded so the "+ Add Warm-Up" button
  // is one click away (otherwise a coach would have to expand the empty
  // card just to discover the add control).
  const [open, setOpen] = useState(warmup.length === 0);
  // Drag-to-reorder — same mechanics + visual language as the day-exercise
  // grid: whole grid is the drop zone, slot picked against row centres,
  // dashed dividers double as the insertion line.
  const [dragSrc, setDragSrc] = useState(null);   // index being dragged
  const [dragOver, setDragOver] = useState(null); // gap 0..len the row would land in
  const dragging = dragSrc !== null;
  // Static dividers + an absolute insertion bar (see the day grid's
  // rowDivider note) — slot changes never shift the rows.
  const rowDivider = { gridColumn: '1 / -1', borderTop: `1px dashed ${C.ac}`, opacity: 0.22, margin: 0, position: 'relative', top: '-1.5px' };
  const onGridDragOver = (e) => {
    if (!dragging) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const rows = [...e.currentTarget.querySelectorAll('[data-wurow]')];
    let gap = rows.length;
    for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { gap = i; break; } }
    const gRect = e.currentTarget.getBoundingClientRect();
    let y;
    if (rows.length === 0) y = 0;
    else if (gap === 0) y = rows[0].getBoundingClientRect().top - gRect.top - 3;
    else if (gap === rows.length) y = rows[rows.length - 1].getBoundingClientRect().bottom - gRect.top + 3;
    else { const a = rows[gap - 1].getBoundingClientRect(), b = rows[gap].getBoundingClientRect(); y = ((a.bottom + b.top) / 2) - gRect.top; }
    setDragOver(prev => (prev && prev.gap === gap && Math.abs(prev.y - y) < 1) ? prev : { gap, y });
  };
  const onGridDrop = (e) => {
    e.preventDefault();
    if (dragging && dragOver !== null) {
      const from = dragSrc;
      let to = dragOver.gap;
      if (to > from) to -= 1; // source is spliced out first, so slots above it shift down one
      if (to !== from) setPlan(p => {
        const arr = [...(p.warmup || [])];
        if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return p;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        return { ...p, warmup: arr };
      });
    }
    setDragSrc(null); setDragOver(null);
  };
  const update = (idx, patch) => setPlan(p => ({ ...p, warmup: (p.warmup || []).map((w, i) => i === idx ? { ...w, ...patch } : w) }));
  // Inline-expand per row — same pattern as the day-exercise rows: chevron
  // on the name, panel with NOTES + full-size video. Collapses while a
  // drag is live so the drag effect matches the day grid.
  const [wuExpanded, setWuExpanded] = useState({});
  const toggleWuExpand = (i) => setWuExpanded(prev => ({ ...prev, [i]: !prev[i] }));
  // New warm-ups carry sets/reps/tempo as first-class fields. Legacy plans
  // still carry an `rx` string instead — those keep rendering verbatim until
  // the coach edits them (we never touch existing rows on load).
  const add = () => { setOpen(true); setPlan(p => ({ ...p, warmup: [...(p.warmup || []), { t: '', sets: 1, reps: '', tempo: '', vid: '' }] })); };
  const remove = idx => setPlan(p => ({ ...p, warmup: (p.warmup || []).filter((_, i) => i !== idx) }));
  // Same compact input the day-exercise grid uses, so warm-up rows read as
  // the same table family as the day cards below.
  const tinyInput = { ...baseInput, background: 'color-mix(in srgb, var(--c-sf2) 85%, #ffffff)', padding: '3px 6px', fontSize: 11, minWidth: 0, width: '100%', boxSizing: 'border-box' };
  return (
    <div style={{ background: 'var(--c-sf)', border:`1px solid ${C.cardBd}`, borderRadius: 0, padding: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: open ? 8 : 0 }}>
        <button onClick={() => setOpen(o => !o)} title={open ? 'Collapse warm-up' : 'Expand warm-up'}
          style={{ background:'transparent', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ color:C.tm, fontSize:13, lineHeight:1, flexShrink:0, display:'inline-block', transform:open?'none':'rotate(-90deg)', transition:'transform 180ms ease', userSelect:'none' }}>▾</span>
          <span style={{ fontSize: 12, fontFamily: FN, fontWeight: 700, color: C.or, letterSpacing:'0.06em' }}>WARM-UP ({warmup.length})</span>
        </button>
        {/* EXPAND ALL — identical control + rules as the day cards: toggles
            every row's inline panel; expanding inside a collapsed card is
            invisible, so it opens the card along with the rows. */}
        {warmup.length > 0 && (() => {
          const anyOpen = warmup.some((_, i) => wuExpanded[i]);
          return <button onClick={() => {
            if (!anyOpen && !open) setOpen(true);
            setWuExpanded(prev => { const next = { ...prev }; warmup.forEach((_, i) => { if (anyOpen) delete next[i]; else next[i] = true; }); return next; });
          }}
            title={anyOpen ? 'Collapse all warm-ups' : 'Expand all warm-ups to edit fully'}
            style={{ marginLeft:'auto', background:'var(--c-sf)', border:`1px solid ${C.ac}`, borderRadius:0, padding:'3px 0', color:C.ac, cursor:'pointer', fontFamily:FN, fontSize:10, fontWeight:700, letterSpacing:'0.14em', whiteSpace:'nowrap', width:142, flexShrink:0, boxSizing:'border-box', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
            <span aria-hidden style={{ display:'inline-block', transform:anyOpen?'rotate(180deg)':'none', transition:'transform 180ms ease', lineHeight:1 }}>▾</span>
            {anyOpen ? 'COLLAPSE ALL' : 'EXPAND ALL'}
          </button>;
        })()}
      </div>
      <div style={{ display:'grid', gridTemplateRows: open ? '1fr' : '0fr', transition:'grid-template-rows 260ms ease' }}><div style={{ overflow:'hidden', minHeight:0 }}>
        {warmup.length === 0 ? <div style={{ fontSize: 11, color: C.td, fontStyle: 'italic' }}>No warm-ups.</div> :
          <div style={{ overflowX: 'auto', margin: '0 -12px', padding: compact ? '0 12px 7px' : '0 12px' }}>
          {/* Same table structure as the day-exercise grid, just the
              warm-up's parameters (no GRP/LOAD/RPE, no URL column — the
              video lives in the expanded panel like day rows). compact
              (compare mode): minmax(0,…) columns so it compresses to the
              half-width pane with no inner horizontal scrollbar. */}
          <div onDragOver={onGridDragOver} onDrop={onGridDrop} style={{ display: 'grid', position: 'relative', gridTemplateColumns: compact ? '30px minmax(0,3.3fr) minmax(0,60px) minmax(0,80px) minmax(0,80px) 22px' : '36px minmax(180px,3.3fr) 64px 96px 96px 24px', gap: '3px 8px', fontSize: 12, alignItems: 'center', minWidth: compact ? 380 : 480 }}>
            {['#', 'EXERCISE', 'SETS', 'REPS', 'TEMPO', ''].map((h, hi) =>
              hi === 0 ? (
                <div key={hi} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <span style={{ fontFamily: FN, fontSize: 12, lineHeight: 1, fontWeight: 400, opacity: 0 }}>⇕</span>
                  <span style={{ fontSize: 9, fontFamily: FN, color: C.td }}>{h}</span>
                </div>
              ) : hi === 1 ? (
                <div key={hi} style={{ fontSize: 9, fontFamily: FN, color: C.td, minWidth: 0, borderLeft: '3px solid transparent', paddingLeft: 6 }}>{h}</div>
              ) : (
                <div key={hi} style={{ fontSize: 9, fontFamily: FN, color: C.td, minWidth: 0, textAlign: 'center' }}>{h}</div>
              )
            )}
            {warmup.map((w, i) => {
              const wuOpen = !!wuExpanded[i] && !dragging;
              return (
              <React.Fragment key={i}>
                {/* Divider between rows — static; the insertion bar is the
                    absolute overlay at the end of the grid. */}
                {i > 0 && <div style={rowDivider} />}
                <div draggable data-wurow={i}
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); setRowDragImage(e, e.currentTarget, 6); setTimeout(() => setDragSrc(i), 0); }}
                  onDragEnd={() => { setDragSrc(null); setDragOver(null); }}
                  title="Drag to reorder"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, cursor: 'grab', userSelect: 'none', opacity: dragging && dragSrc === i ? 0.4 : 1, transition: 'opacity 120ms' }}>
                  <span style={{ color: C.tm, fontFamily: FN, fontSize: 11, lineHeight: 1, fontWeight: 400, position: 'relative', top: '1px' }}>⇕</span>
                  <span style={{ color: C.tx, fontFamily: FN, fontWeight: 700, fontSize: 12, lineHeight: 1 }}>{i + 1}</span>
                </div>
                {/* Name as TEXT, exactly like a day-exercise row — chevron +
                    title, whole cell expands. Editing the name happens inside
                    the expanded panel (where day rows put their picker).
                    Transparent 3px borderLeft mirrors the day rows' superset
                    bar slot so the text x-position matches the day grid. */}
                <div onClick={() => toggleWuExpand(i)} title="Click to expand — edit name, video & note"
                  role="button" tabIndex={0} aria-expanded={wuOpen}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleWuExpand(i); } }}
                  style={{ color: C.tx, minWidth: 0, borderLeft: '3px solid transparent', paddingLeft: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: C.ac, fontSize: 11, fontWeight: 700, lineHeight: 1, flexShrink: 0, transform: wuOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms ease' }}>▾</span>
                  <span style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', color: w.t ? C.tx : C.td }}>{w.t || 'New warm-up — click to name'}</span>
                </div>
                <input type="number" value={w.sets ?? ''} onChange={e => update(i, { sets: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })} placeholder="1" style={tinyInput} />
                <input value={w.reps ?? ''} onChange={e => update(i, { reps: e.target.value })} placeholder="10 / 30s" style={tinyInput} />
                <input value={w.tempo ?? ''} onChange={e => update(i, { tempo: e.target.value })} placeholder="3010" style={tinyInput} />
                <button onClick={() => remove(i)} title="Remove warm-up" aria-label="Remove warm-up"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TrashIcon size={15} /></button>
                {/* Legacy free-text rx, only when the new fields are empty AND a
                    pre-split rx exists. Lets the coach see what the athlete is
                    currently being shown, then dismiss it once they've migrated. */}
                {w.rx && (!w.sets || w.sets === '') && !w.reps && (
                  <div style={{ gridColumn: '2 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.tm, fontFamily: FN, padding: '2px 0' }}>
                    <span style={{ fontWeight: 700, letterSpacing: '0.12em', color: C.td }}>LEGACY RX:</span>
                    <span style={{ color: C.tx, fontFamily: FB }}>{w.rx}</span>
                    <button onClick={() => update(i, { rx: '' })}
                      title="Clear the legacy rx string — the athlete will now see the structured sets/reps above (once you fill them in)."
                      style={{ background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.rd, padding: '2px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', borderRadius: 0, opacity: 0.7 }}>× CLEAR</button>
                  </div>
                )}
                {/* Inline expand — IDENTICAL structure to the day-exercise
                    expanded panel: top row = name editor (the warm-up's
                    "picker" slot) + VIDEO URL at 1.2fr/1fr, bottom row =
                    NOTES + full-size embed on the same column edges.
                    Orange accent keeps the warm-up identity. */}
                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateRows: wuOpen ? '1fr' : '0fr', transition: 'grid-template-rows 260ms ease' }}>
                  <div style={{ overflow: 'hidden', minHeight: 0 }}>
                    <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.or}`, padding: 14, margin: '2px 0 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'end' }}>
                        {/* Real library picker, same as day exercises. A
                            library pick links the row (w.exerciseId), takes
                            the library title, and prefills video/cues only
                            where the row is still empty. Free-text stays
                            possible via the modal's add-by-name. */}
                        <div style={{ minWidth: 0 }}>
                          <ExPicker exercises={exercises} value={w.exerciseId || ''} label="Exercise" fallbackTitle={w.t}
                            onChange={id => { const lib = exById(exercises).get(id); update(i, { exerciseId: id, t: lib?.title || w.t || '', ...((!w.vid && lib?.videoLink) ? { vid: lib.videoLink } : {}), ...((!w.note && lib?.cues) ? { note: lib.cues } : {}) }); }}
                            onPickName={name => update(i, { exerciseId: '', t: name })} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: 'uppercase', fontFamily: FN }}>Video</label>
                          <Input value={w.vid || ''} onChange={e => update(i, { vid: e.target.value })}
                            onBlur={async e => { const resolved = await maybeResolveGooglePhotos(e.target.value); if (resolved !== e.target.value) update(i, { vid: resolved }); }}
                            placeholder="📹 Video URL" />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', minHeight: 16 }}>
                            <span style={{ fontSize: 9, fontFamily: FN, fontWeight: 700, color: C.td, letterSpacing: '0.18em' }}>NOTES</span>
                          </div>
                          <textarea value={w.note || ''} onChange={e => update(i, { note: e.target.value })} placeholder="Notes, cues... (shown to the athlete on this warm-up step)"
                            style={{ ...baseInput, textAlign: 'center', flex: 1, minHeight: 120, padding: '10px 12px', lineHeight: 1.5, resize: 'vertical', fontFamily: FB, fontSize: 13 }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 6 }}>
                          <div aria-hidden style={{ minHeight: 16, visibility: 'hidden' }} />
                          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start' }}>
                            {w.vid && wuOpen ? <div style={{ width: '100%' }}><VideoEmbed url={w.vid} /></div> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );})}
            {/* Insertion bar — absolute overlay, never moves the rows. */}
            {dragging && dragOver && dragOver.y != null && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: dragOver.y - 1, height: 2, background: C.ac, boxShadow: `0 0 5px ${C.ac}88`, pointerEvents: 'none', zIndex: 2, transition: 'top 90ms ease' }} />
            )}
          </div>
          </div>
        }
        <Btn variant="ghost" onClick={add} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>+ Add Warm-Up</Btn>
      </div></div>
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
  const [collapsedCmpDays, setCollapsedCmpDays] = useState({}); // per-day collapse on the compare side
  const toggleCmpDay = (k) => setCollapsedCmpDays(prev => ({ ...prev, [k]: !prev[k] }));
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

  // Read-only inline expand — mirrors the editor's row expand (badges,
  // notes incl. the library-cues fallback, video thumbnail) without any
  // editing. Keyed per exercise; reset when the compared program changes.
  const [cmpExpandedEx, setCmpExpandedEx] = useState({});
  useEffect(() => { setCmpExpandedEx({}); }, [pickedId]);
  const toggleCmpEx = (k) => setCmpExpandedEx(prev => ({ ...prev, [k]: !prev[k] }));
  // Warm-up rows expand too — the coach copies the video URL / note from
  // the old block while authoring the new one.
  const [cmpWuOpen, setCmpWuOpen] = useState({});
  useEffect(() => { setCmpWuOpen({}); }, [pickedId]);
  const toggleCmpWu = (i) => setCmpWuOpen(prev => ({ ...prev, [i]: !prev[i] }));
  // Filter row ends level with the scroller content below it (same
  // scrollbar-inset alignment as the editor half's field row).
  const [cmpPaneRef, cmpSbInset] = useScrollbarInset(true);

  return (
    <div style={{flex:1, minWidth:0, alignSelf:'stretch', display:'flex', flexDirection:'column', minHeight:0}}>
      {/* Filter row is ALWAYS rendered. Hiding it on empty-state would trap
          the user (e.g. picked athlete with no programs and couldn't change
          back). It sits ABOVE the scroller (fixed) so the blue scrollbar
          starts level with the content below the filter boxes — and the
          dropdowns stay reachable however far the pane is scrolled. */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20,position:'relative',flexShrink:0,paddingRight:cmpSbInset+6}}>
        <div style={{minWidth:0}}>
          <Select label="Athlete Filter" options={athleteOptions} value={selectedAthleteId} onChange={v => { setSelectedAthleteId(v); setPickedId(''); }} placeholder="Select athlete" />
        </div>
        <div style={{minWidth:0}}>
          <Select label="Program Filter"
            options={selectedAthleteId ? candidates.map(p => ({value: p.id, label: p.name})) : []}
            value={pickedId}
            onChange={setPickedId}
            placeholder={selectedAthleteId ? (candidates.length ? 'Select program' : 'No programs for this athlete') : 'Choose athlete first'} />
        </div>
        <button onClick={onClose} title="Close compare panel"
          style={{position:'absolute', top:-2, right:-2, background:C.bg, border:`1px solid ${C.cardBd}`, color:C.tm, cursor:'pointer', padding:'1px 6px', borderRadius:0, fontSize:11, lineHeight:1, zIndex:2}}>✕</button>
      </div>
      <div data-compare-pane ref={cmpPaneRef} style={{position:'relative', overflowY:'auto', minHeight:0, flex:1, paddingRight:6}}>
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
          <PatternCoverage plan={cmpPlan} exercises={exercises} cols={3} />
              {/* Warm-up (foldable, mirrors editor). Each row expands to a
                  read-only card — video URL (copyable) + note — same pattern
                  as the exercise rows below. */}
              {Array.isArray(cmpPlan.warmup) && cmpPlan.warmup.length > 0 && (
                <div style={{background:'var(--c-sf)', border:`1px solid ${C.cardBd}`, borderRadius:0, padding:12, marginBottom:16}}>
                  <button onClick={() => setWarmOpen(o => !o)}
                    style={{background:'transparent', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:10}}>
                    <span style={{color:C.tm, fontSize:13, lineHeight:1, flexShrink:0, display:'inline-block', transform:warmOpen?'none':'rotate(-90deg)', transition:'transform 180ms ease', userSelect:'none'}}>▾</span>
                    <span style={{fontSize:12, fontFamily:FN, fontWeight:700, color:C.or, letterSpacing:'0.06em'}}>WARM-UP ({cmpPlan.warmup.length})</span>
                  </button>
                  {warmOpen && <div style={{marginTop:8}}>
                    {cmpPlan.warmup.map((w, i) => {
                      const wuOpen = !!cmpWuOpen[i];
                      const note = w.note || w.n || '';
                      return (
                        <React.Fragment key={i}>
                          <div onClick={() => toggleCmpWu(i)} role="button" tabIndex={0} aria-expanded={wuOpen}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCmpWu(i); } }}
                            title="Click to expand — copy video URL & note"
                            style={{display:'grid', gridTemplateColumns:'24px 2fr 1fr', gap:8, padding:'4px 0', alignItems:'center', borderTop:i === 0 ? 'none' : `1px solid rgba(57,189,255,0.102)`, cursor:'pointer'}}>
                            <div style={{fontFamily:FN, fontSize:11, color:C.tm, fontWeight:700, textAlign:'center'}}>{i + 1}</div>
                            <div style={{fontSize:13, color:C.tx, fontFamily:FB, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6}}>
                              <span style={{color:C.ac, fontSize:11, fontWeight:700, lineHeight:1, flexShrink:0, transform:wuOpen?'none':'rotate(-90deg)', transition:'transform 150ms ease'}}>▾</span>
                              <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{w.t || '—'}</span>
                            </div>
                            <div style={{fontSize:12, color:C.tm, fontFamily:FN}}>{wuRx(w) || '—'}</div>
                          </div>
                          {wuOpen && (
                            <div style={{background:'var(--c-sf2)', border:`1px solid ${C.cardBd}`, borderLeft:`3px solid ${C.or}`, padding:'12px 14px', margin:'2px 0 8px'}}>
                              <div style={{marginBottom:10}}>
                                <div style={{fontSize:9, fontFamily:FN, fontWeight:700, color:C.td, letterSpacing:'0.18em', marginBottom:6}}>VIDEO URL</div>
                                {w.vid ? (
                                  <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:6, alignItems:'stretch'}}>
                                    <input value={w.vid} readOnly onFocus={e => e.target.select()}
                                      style={{...baseInput, padding:'6px 10px', fontSize:11, color:C.tm, cursor:'text', minWidth:0, width:'100%', boxSizing:'border-box'}} />
                                    <button onClick={() => { const p = navigator.clipboard?.writeText(w.vid); if (p) p.then(() => toast('Video URL copied')).catch(() => toast('Copy blocked — click the URL and Ctrl+C', 'warn')); else toast('Copy blocked — click the URL and Ctrl+C', 'warn'); }}
                                      title="Copy video URL"
                                      style={{background:'transparent', border:`1px solid ${C.ac}`, color:C.ac, cursor:'pointer', fontFamily:FN, fontSize:10, fontWeight:700, letterSpacing:'0.1em', padding:'0 10px', borderRadius:0, whiteSpace:'nowrap'}}>COPY</button>
                                  </div>
                                ) : <div style={{fontSize:12, color:C.td}}>No video.</div>}
                              </div>
                              <div style={{display:'grid', gridTemplateColumns:w.vid?'1fr 1fr':'1fr', gap:16, alignItems:'start'}}>
                                <div style={{minWidth:0}}>
                                  <div style={{fontSize:9, fontFamily:FN, fontWeight:700, color:C.td, letterSpacing:'0.18em', marginBottom:6}}>NOTE</div>
                                  <div dir="auto" style={{fontSize:13, color:note?C.tx:C.td, lineHeight:1.55, whiteSpace:'pre-wrap', fontFamily:isHebrew(note)?FH:FB}}>{note || 'No note.'}</div>
                                </div>
                                {w.vid && (
                                  <div style={{minWidth:0}}>
                                    <div style={{maxWidth:280}}><VideoEmbed url={w.vid} /></div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
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
                const cmpDayKey = d.id || di;
                const cmpCollapsed = !!collapsedCmpDays[cmpDayKey];
                return (
                  <div key={d.id || di} style={{background: 'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:12,marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',marginBottom:cmpCollapsed?0:8,gap:10,position:'sticky',top:0,zIndex:3,background:'var(--c-sf)',paddingTop:4,marginTop:-4,paddingBottom:cmpCollapsed?0:8,borderBottom:cmpCollapsed?'none':`1px solid ${C.cardBd}`}}>
                      <span role="button" tabIndex={0} onClick={()=>toggleCmpDay(cmpDayKey)} onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleCmpDay(cmpDayKey); } }} title={cmpCollapsed?'Expand day':'Collapse day'} style={{cursor:'pointer',color:C.tm,fontSize:12,lineHeight:1,userSelect:'none'}}>{cmpCollapsed?'▸':'▾'}</span>
                      <input value={d.name || `Day ${di + 1}`} readOnly tabIndex={-1}
                        style={{...baseInput, fontFamily:FB, fontWeight:700, fontSize:14, color:C.tx, padding:'4px 8px', maxWidth:260, cursor:'default'}} />
                      <span style={{color:C.td,fontSize:12,whiteSpace:'nowrap'}}>({dayExs.length} ex)</span>
                    </div>
                    {!cmpCollapsed && (<>
                    {dayExs.length === 0 ? (
                      <div style={{color:C.td,fontSize:12,fontStyle:'italic'}}>No exercises.</div>
                    ) : (
                      <div style={{overflowX:'auto',margin:'0 -12px',padding:'0 12px 7px'}}>
                        {/* LOAD column intentionally omitted on the read-only
                            compare side — load values change every block and
                            aren't useful for delta-scanning. Same column
                            template otherwise. */}
                        {/* No trailing trash column here — the editor side
                            ends with its 22px delete slot, but the read-only
                            mirror has no button so the space read as dead
                            whitespace after TEMPO. */}
                        <div style={{display:'grid',gridTemplateColumns:'30px minmax(0,3.3fr) 44px minmax(0,0.9fr) minmax(0,1.4fr) minmax(0,0.9fr) minmax(0,60px) minmax(0,1.3fr)',gap:'3px 8px',fontSize:12,alignItems:'center',minWidth:Math.max(592,518+(cmpPlan.weeks||4)*40)}}>
                          {['#','EXERCISE','GRP','SETS','REPS','LOAD','RPE','TEMPO'].map((h,hi) =>
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
                              // Box-column headers center over their inputs.
                              <div key={hi} style={{fontSize:9,fontFamily:FN,color:C.td,minWidth:0,textAlign:'center'}}>{h}</div>
                            )
                          )}
                          {dayExs.map((pe, ei) => {
                            const exData = exById(exercises).get(pe.exerciseId);
                            const title = exData?.title || pe.title || (pe.notes?.match(/^\[(.+)\]$/)?.[1]) || '(unresolved)';
                            const sc = pe.superset === 'A' ? C.ac : pe.superset === 'B' ? C.pu : pe.superset === 'C' ? C.or : C.td;
                            const weeks = Math.max((pe.wk?.length||0), (pe.wkS?.length||0), 1);
                            const exKey = pe.id || `${cmpDayKey}-${ei}`;
                            const exOpen = !!cmpExpandedEx[exKey];
                            // Same 3-state note/video resolution as the editor:
                            // program override wins, else library cues/link.
                            const cmpNote = (pe.notesEdited || (pe.notes && pe.notes.length > 0)) ? (pe.notes || '') : (exData?.cues || '');
                            const cmpNoteFromLib = !(pe.notesEdited || (pe.notes && pe.notes.length > 0)) && !!exData?.cues;
                            const cmpVid = pe.videoUrl !== undefined ? (pe.videoUrl || '') : (exData?.videoLink || '');
                            return <React.Fragment key={pe.id || ei}>
                              {ei > 0 && <div style={{gridColumn:'1 / -1', borderTop:`1px dashed ${C.ac}`, opacity:0.22, margin:0}} />}
                              {/* Same flex+⇕ structure as the left side's
                                  number cell. fontSize:12 matches the grid
                                  default, so the number's baseline aligns
                                  with the exercise-name text in the next
                                  column. */}
                              <div style={{display:'flex',alignItems:'center',gap:5,minWidth:0,padding:0}}>
                                <span style={{fontFamily:FN, fontSize:12, fontWeight:400, opacity:0}}>⇕</span>
                                <span style={{color:C.tm, fontFamily:FN, fontWeight:700, fontSize:12}}>{ei + 1}</span>
                              </div>
                              <div title={title} onClick={()=>toggleCmpEx(exKey)}
                                role="button" tabIndex={0} aria-expanded={exOpen}
                                onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleCmpEx(exKey); } }}
                                style={{color:C.tx, minWidth:0, overflowWrap:'break-word', wordBreak:'normal', borderLeft:`3px solid ${pe.superset?sc:'transparent'}`, paddingLeft:6, cursor:'pointer', display:'flex', alignItems:'center', gap:6}}>
                                <span style={{color:C.ac, fontSize:11, fontWeight:700, lineHeight:1, flexShrink:0, transform:exOpen?'none':'rotate(-90deg)', transition:'transform 150ms ease'}}>▾</span>
                                <span style={{overflowWrap:'break-word', wordBreak:'normal'}}>{title}</span>
                              </div>
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
                              <input value={pe.load || ''} readOnly tabIndex={-1} style={tinyInputRO} />
                              <input value={pe.rpe || ''} readOnly tabIndex={-1} style={tinyInputRO} />
                              <input value={pe.tempo || ''} readOnly tabIndex={-1} style={tinyInputRO} />
                              {exOpen && (
                                <div style={{gridColumn:'1 / -1', background:'var(--c-sf2)', border:`1px solid ${C.cardBd}`, borderLeft:`3px solid ${C.ac}`, padding:'12px 14px', margin:'2px 0 6px'}}>
                                  {(exData && (exData.movementPattern || exData.laterality || exData.primaryMuscles)) && (
                                    <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
                                      {exData.movementPattern && <Badge color={C.gn}>{exData.movementPattern}</Badge>}
                                      {exData.laterality && <Badge color={C.tm}>{exData.laterality}</Badge>}
                                      {exData.primaryMuscles && <span style={{fontSize:11,color:C.td}}>{exData.primaryMuscles}</span>}
                                    </div>
                                  )}
                                  <div style={{display:'grid',gridTemplateColumns:cmpVid?'1fr 1fr':'1fr',gap:16,alignItems:'start'}}>
                                    <div style={{minWidth:0}}>
                                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                                        <span style={{fontSize:9,fontFamily:FN,fontWeight:700,color:C.td,letterSpacing:'0.18em'}}>NOTES</span>
                                        {cmpNoteFromLib && <span style={{fontSize:9,fontFamily:FN,fontWeight:700,color:C.tm,letterSpacing:'0.12em'}}>FROM LIBRARY</span>}
                                      </div>
                                      <div dir="auto" style={{fontSize:13,color:cmpNote?C.tx:C.td,lineHeight:1.55,whiteSpace:'pre-wrap',fontFamily:isHebrew(cmpNote)?FH:FB}}>{cmpNote || 'No notes.'}</div>
                                      {pe.rest && <div style={{marginTop:10,fontSize:11,color:C.tm,fontFamily:FN}}><span style={{color:C.td,fontSize:9,fontWeight:700,letterSpacing:'0.15em',marginRight:8}}>REST</span>{pe.rest}</div>}
                                    </div>
                                    {cmpVid && (
                                      <div style={{minWidth:0}}>
                                        <div style={{fontSize:9,fontFamily:FN,fontWeight:700,color:C.td,letterSpacing:'0.18em',marginBottom:6}}>VIDEO</div>
                                        <div style={{maxWidth:440}}><VideoEmbed url={cmpVid} /></div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </React.Fragment>;
                          })}
                        </div>
                      </div>
                    )}
                    </>)}
                  </div>
                );
              })}
        </>
      )}
      </div>
    </div>
  );
}

// Whole-row drag image. The native drag ghost is just the element that
// carries `draggable` — here that's the narrow ⇕/number cell, so dragging
// reads as "a number floating around". This clones the row's grid cells
// into an offscreen replica (same resolved column template) and hands it to
// setDragImage, so the ENTIRE row visibly travels with the cursor.
// Must run synchronously inside dragstart. Cosmetic only — never throws.
function setRowDragImage(e, handleEl, cellCount) {
  try {
    const grid = handleEl.parentElement;
    const gcs = getComputedStyle(grid);
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:absolute;top:-10000px;left:0;pointer-events:none;display:grid;align-items:center;box-sizing:border-box;opacity:0.95;padding:6px 8px;';
    ghost.style.gridTemplateColumns = gcs.gridTemplateColumns;
    ghost.style.gap = gcs.gap;
    ghost.style.width = grid.getBoundingClientRect().width + 'px';
    ghost.style.background = gcs.backgroundColor && gcs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? gcs.backgroundColor : 'var(--c-sf)';
    ghost.style.border = `1px solid ${C.ac}`;
    ghost.style.fontSize = gcs.fontSize;
    ghost.style.fontFamily = gcs.fontFamily;
    let n = handleEl;
    for (let i = 0; i < cellCount && n; i++) {
      const k = n.cloneNode(true);
      // cloneNode copies attributes, not the live value React set on the
      // property — sync inputs/selects so the ghost shows real content.
      const src = n.matches('input,select,textarea') ? [n] : [...n.querySelectorAll('input,select,textarea')];
      const dst = k.matches && k.matches('input,select,textarea') ? [k] : [...k.querySelectorAll('input,select,textarea')];
      src.forEach((s, j) => { if (dst[j]) dst[j].value = s.value; });
      // iframes don't render in a drag snapshot — swap for a dark stub.
      [...(k.querySelectorAll ? k.querySelectorAll('iframe') : [])].forEach(f => { const d = document.createElement('div'); d.style.cssText = 'width:100%;height:100%;background:#0a0a0b;'; f.replaceWith(d); });
      ghost.appendChild(k);
      n = n.nextElementSibling;
    }
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 24, ghost.getBoundingClientRect().height / 2);
    setTimeout(() => ghost.remove(), 0);
  } catch { /* drag still works with the default image */ }
}

// Red trash icon — an SVG (not the 🗑 emoji, which ignores `color`) so it
// renders clearly RED in both light and dark themes via C.rd.
function TrashIcon({ size = 14, color = C.rd }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', opacity: 0.68 }} aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

// Full per-exercise detail editor (badges + 3-state library-cues notes +
// 3-state video override). Shared by the unified overview's inline-expand
// panel so it has EVERY feature the old detail card had. `update(patch)`
// abstracts the day/exercise write so either view can drive it.
function ExEditorExtras({ ex, exData, exTitle, update, showEmbed = true, picker = null }) {
  const libCues = exData?.cues || '';
  const hasNoteOverride = !!ex.notesEdited || !!(ex.notes && ex.notes.length > 0);
  const noteValue = hasNoteOverride ? (ex.notes || '') : libCues;
  const isFallback = !hasNoteOverride && libCues;
  const libUrl = exData?.videoLink || '';
  const hasVidOverride = ex.videoUrl !== undefined;
  const vidValue = hasVidOverride ? (ex.videoUrl || '') : libUrl;
  return (
    <>
      {(exData && (exData.movementPattern || exData.laterality || exData.primaryMuscles)) ? <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
        {exData.movementPattern && <Badge color={C.gn}>{exData.movementPattern}</Badge>}
        {exData.laterality && <Badge color={C.tm}>{exData.laterality}</Badge>}
        {exData.primaryMuscles && <span style={{fontSize:11,color:C.td}}>{exData.primaryMuscles}</span>}
      </div> : (!exData && exTitle ? <div style={{fontSize:11,color:C.or,marginBottom:6}}>📝 {exTitle}</div> : null)}
      {/* Video URL spans the top; NOTES (left) + thumbnail (right) sit in an
          aligned row below — the spacer on the right matches the NOTES label
          row, so the notes box and the thumbnail are the exact same height
          (tops AND bottoms line up). */}
      <div style={{paddingTop:10,borderTop:`1px solid ${C.cardBd}`,display:'flex',flexDirection:'column',gap:10}}>
        {/* Top row mirrors the NOTES/THUMBNAIL grid below — EXERCISE picker
            left, VIDEO URL right, same 1fr/1fr split and 16px gap, so all
            four boxes share the same column edges. No OPEN/LIB button (Ohad)
            — the URL field runs the full half-width. */}
        <div style={{display:'grid',gridTemplateColumns:picker?'1.2fr 1fr':'1fr',gap:16,alignItems:'end'}}>
          {picker && <div style={{minWidth:0}}>{picker}</div>}
          <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:0}}>
            <label style={{fontSize:11,fontWeight:600,color:C.tm,textTransform:'uppercase',fontFamily:FN}}>Video</label>
            <Input value={vidValue} onChange={e=>update({videoUrl:e.target.value})}
              onBlur={async e => { const resolved = await maybeResolveGooglePhotos(e.target.value); if (resolved !== e.target.value) update({ videoUrl: resolved }); }}
              placeholder="📹 Video URL" />
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:16,alignItems:'stretch'}}>
          {/* NOTES (left) */}
          <div style={{gridColumn:1,display:'flex',flexDirection:'column',minWidth:0,gap:6}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',minHeight:16,gap:8,flexWrap:'wrap'}}>
              <span style={{fontSize:9,fontFamily:FN,fontWeight:700,color:C.td,letterSpacing:'0.18em'}}>NOTES</span>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                {isFallback && <span title="Auto-prefilled from the exercise library — start typing to override for this program only" style={{fontSize:9,fontFamily:FN,fontWeight:700,color:C.tm,letterSpacing:'0.12em'}}>FROM LIBRARY</span>}
                {hasNoteOverride && libCues && <button onClick={()=>update({notes:'',notesEdited:false})} title="Discard this program's override and show the library cues again. Doesn't touch the library." style={{background:'transparent',border:`1px solid ${C.cardBd}`,color:C.tm,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.1em',padding:'2px 7px',cursor:'pointer',borderRadius:0}}>↩ LIBRARY</button>}
                {hasNoteOverride && (ex.notes||'').length>0 && <button onClick={()=>update({notes:'',notesEdited:true})} title="Clear the note for this program only (library is untouched)." style={{background:'transparent',border:`1px solid ${C.cardBd}`,color:C.rd,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.1em',padding:'2px 7px',cursor:'pointer',borderRadius:0,opacity:0.7}}>× CLEAR</button>}
              </div>
            </div>
            <textarea value={noteValue} onChange={e=>update({notes:e.target.value,notesEdited:true})} placeholder={libCues?"Notes / modifications (overrides library cues)":"Notes, modifications..."} style={{...baseInput,textAlign:'center',flex:1,minHeight:120,padding:'10px 12px',lineHeight:1.5,resize:'vertical',fontFamily:FB,fontSize:13}} />
          </div>
          {/* THUMBNAIL (right) — spacer mirrors the NOTES label row height.
              Fills the column edge-to-edge so it shares the exact left/right
              edges with the VIDEO URL box above it (symmetric, Ohad). */}
          <div style={{gridColumn:2,display:'flex',flexDirection:'column',minWidth:0,gap:6}}>
            <div aria-hidden style={{minHeight:16,visibility:'hidden'}} />
            <div style={{flex:1,display:'flex',alignItems:'flex-start'}}>
              {vidValue && showEmbed && <div style={{width:'100%'}}><VideoEmbed url={vidValue} /></div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PlanEditor({ plan: init, onSave, onCancel, onSwitchProgram, trainees, exercises, setExercises, planIndex, onPreviewPlan }) {
  const [plan, setPlan] = useState(init);
  const [activeDay, setActiveDay] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [confirmDeleteDay, setConfirmDeleteDay] = useState(null); // dayIdx pending delete-confirm
  const [collapsedDays, setCollapsedDays] = usePersistentState('plan-collapsed-days', {}); // overview day cards collapse
  const toggleDayCollapse = (id) => setCollapsedDays(prev => ({ ...prev, [id]: !prev[id] }));
  // Unified view: expand an OVERVIEW row inline to its full detail (swap +
  // notes + video) — combines overview + detail in one place.
  const [ovExpanded, setOvExpanded] = usePersistentState('plan-ov-expanded', {});
  const toggleOvExpand = (id) => setOvExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  // Compare mode: side-by-side 50/50 split with a read-only view of a
  // previous program (same athlete). (The old overview/detail toggle is
  // gone — the unified overview is the only view, so compareActive is
  // simply compareOpen.)
  const [compareOpen, setCompareOpen] = useState(false);
  const compareActive = compareOpen;
  // Three scrollers in compare: wheel OVER a pane scrolls only that pane (each
  // half is its own bounded overflow:auto with its own scrollbar); wheel over
  // the grey page edges / background scrolls BOTH in lock-step. Window-level
  // non-passive listener so it can claim wheels over the background and
  // preventDefault the page scroll only when a pane actually moved.
  useEffect(() => {
    if (!compareActive) return;
    const onWheel = (e) => {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('[data-compare-pane]')) return; // over a pane → it scrolls itself
      if (e.target.closest('[role="dialog"]')) return; // a modal is open over compare → let it scroll, don't hijack
      const panes = document.querySelectorAll('[data-compare-pane]');
      if (!panes.length) return;
      let scrolled = false;
      panes.forEach(k => { const b = k.scrollTop; k.scrollTop += e.deltaY; if (k.scrollTop !== b) scrolled = true; });
      if (scrolled) e.preventDefault();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [compareActive]);
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
  // Compare mode: pad the fixed Program-Name/Phase/Weeks row right so it
  // ends level with the scroller content (Pattern Coverage), not over the
  // scrollbar.
  const [leftPaneRef, leftSbInset] = useScrollbarInset(compareActive);

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
  // Draft quick-add: append an exercise by NAME only — no library link, no
  // cues/notes, no video. exerciseId stays "" so the row renders via ex.title.
  // Lets the coach sketch a whole program fast, then attach details later.
  const addExByName = (name) => {
    const t = (name || '').trim();
    if (!t) return;
    const ex = defaultPlanEx();
    ex.order = plan.days[activeDay]?.exercises.length || 0;
    ex.title = t;
    updateDay(activeDay, { exercises: [...(plan.days[activeDay]?.exercises || []), ex] });
  };
  // Create a REAL library exercise (reusable, editable in the library) and
  // link this plan row to it — vs addExByName which is plan-only free text.
  const createLibraryExercise = (name) => {
    const t = (name || '').trim();
    if (!t || !setExercises) return;
    const id = uid();
    setExercises(prev => [...(prev || []), {
      id, title: t, category: '', resistanceType: '', bodyPosition: '',
      movementType: '', movementPattern: '', laterality: '', primaryMuscles: '',
      secondaryMuscles: '', cues: '', videoLink: '',
    }]);
    const ex = defaultPlanEx();
    ex.order = plan.days[activeDay]?.exercises.length || 0;
    ex.exerciseId = id;
    updateDay(activeDay, { exercises: [...(plan.days[activeDay]?.exercises || []), ex] });
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
  const handleSave = async () => {
    setSaving(true);
    await onSave(plan);
    // Explicit save covered everything pending — clear dirty so the
    // visibilitychange/unmount paths don't issue a redundant write.
    markClean();
    setSaving(false);
    // Stay in the editor after Save (Ohad) — the URL stays /coach/programs/<id>
    // so a refresh keeps you here. BACK is the explicit "leave" action.
  };
  const handleBack = async () => {
    // Awaiting flushAutosave resolves only after every queued + in-flight
    // save lands, so the latest data is on disk before the editor unmounts.
    await flushAutosave();
    onCancel();
  };
  const statusLabel = autosaveStatusLabel(autoStatus, C);
  return (
    // In compare mode the editor breaks out of the global <main> 1200px cap
    // so the two side-by-side panes are each wide enough for the full 9-column
    // day grid to fit. Without this each pane is ~580px on a 1536 screen —
    // narrower than the grid's min-width — so the grid overflowed and the last
    // (clipped, empty) column read as wasted whitespace on the card's right.
    // Centered via margin, NOT transform: a transformed ancestor becomes the
    // containing block for position:fixed, which would anchor every modal
    // (exercise browser, confirm dialog) to this wrapper instead of the viewport.
    <div style={compareActive ? { width: 'min(96vw, 2400px)', marginLeft: 'calc(50% - min(48vw, 1200px))' } : undefined}>
      <style>{`
        /* Editor field row: 3 across on wide, 1 on narrow, so Phase/Block
           always has room (no label wrap / misalignment). */
        .plan-fields-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        @media (max-width: 620px) { .plan-fields-grid { grid-template-columns: 1fr; } }
        /* (Removed .ex-row-outer/.ex-row-scroll/.ex-row-grid rules — those
           classes died with the !overview detail view; the unified grid
           handles narrow widths via its own overflowX scroll.) */
      `}</style>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:12,alignItems:'center',minWidth:0,flex:'1 1 100%',justifyContent:'center',position:'relative'}}>
          <button onClick={handleBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',padding:0,whiteSpace:'nowrap',position:'absolute',left:0}}>← BACK</button>
          {/* Athlete assignment — editable, to the LEFT of the block dropdown
              (Ohad). This is the ONLY athlete control now (dropped the duplicate
              field from the row below). */}
          <div style={{position:'relative',display:'flex',minWidth:0,flex:'1 1 240px',maxWidth:360}}>
            <select value={plan.traineeId||""} onChange={e=>setPlan({...plan,traineeId:e.target.value})}
              title="Assign this program to an athlete"
              style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,color:C.tx,fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.04em',cursor:'pointer',height:42,padding:'0 36px 0 18px',borderRadius:0,outline:'none',appearance:'none',WebkitAppearance:'none',flex:1,minWidth:0,boxSizing:'border-box',textAlign:'center',textAlignLast:'center',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
              <option value="">Unassigned</option>
              {trainees.flatMap(t => t.members && t.members.length===2 ? t.members.map((m,i)=>({value:t.id+'__'+i,label:m.name||('Member '+(i+1))})) : [{value:t.id,label:t.name}]).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:C.tm,fontSize:12,lineHeight:1}}>▾</span>
          </div>
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
                  style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,height:42,padding:'0 36px 0 18px',lineHeight:'42px',color:C.tm,fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',outline:'none',appearance:'none',WebkitAppearance:'none',flex:1,minWidth:0,boxSizing:'border-box',cursor:'pointer',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'center'}}>
                  {sameAthlete.map(p => <option key={p.id} value={p.id}>{p.name || 'Untitled'}</option>)}
                </select>
                <span style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:C.tm,fontSize:12,lineHeight:1}}>▾</span>
              </div>
            );
          })()}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"stretch",justifyContent:"center",flexWrap:"wrap",flex:"1 1 100%"}}>
          {statusLabel && <span aria-live="polite" style={{fontFamily:FN,fontSize:11,fontWeight:600,color:statusLabel.color,letterSpacing:"0.04em",alignSelf:'center'}}>{statusLabel.text}</span>}
          {/* COMPARE: read-only view of a previous program for the same
              athlete, side-by-side with the editor grid. */}
          <button onClick={()=>setCompareOpen(v=>!v)}
            title="Compare with a previous program (read-only)"
            style={{background: compareActive ? `${C.ac}1f` : (isRefined5b() ? 'transparent' : 'var(--c-sf)'),border:`1px solid ${C.ac}`,borderRadius:0,height:42,padding:'0 18px',lineHeight:'42px',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,whiteSpace:'nowrap'}}><span style={{display:'inline-block',width:13,textAlign:'center',flexShrink:0}}>{compareActive?'✓':'↔'}</span>COMPARE</button>
          {onPreviewPlan && plan?.id && <button onClick={async () => { await flushAutosave(); onPreviewPlan(plan.id); }}
            title="Open this program in the athlete portal view" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,height:42,padding:'0 18px',lineHeight:'42px',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            PORTAL
          </button>}
          <Btn onClick={handleSave} disabled={saving} style={{height:42,minWidth:190,padding:'0 20px',fontSize:13,letterSpacing:'0.18em',lineHeight:'42px',background:'#39BDFF',color:'#FFFFFF',border:'1px solid #39BDFF',opacity:saving?0.6:1,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{saving ? 'Saving...' : 'Save Program'}</Btn>
        </div>
      </div>
      <div style={{display:compareActive?'flex':'block',gap:16,alignItems:compareActive?'stretch':'flex-start',maxHeight:compareActive?'calc(100vh - 170px)':undefined}}>
      {/* In compare mode each half is a fixed header row (program fields /
          athlete filters) above its own scroller, so the blue scrollbar
          starts level with the content below the text boxes, not above them. */}
      <div style={{flex:compareActive?1:'unset',minWidth:0,width:compareActive?'50%':'auto',display:compareActive?'flex':'block',flexDirection:'column',minHeight:0}}>
      <div className="plan-fields-grid" style={{display:"grid",gap:12,marginBottom:20,flexShrink:0,paddingRight:compareActive?leftSbInset+6:0}}>
        <Input label="Program Name" value={plan.name} onChange={e => setPlan({...plan,name:e.target.value})} placeholder="Hypertrophy Block A" />
        {/* "Assign to Athlete" moved to the top row next to the block dropdown. */}
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
      {/* paddingRight in compare keeps the day cards / + ADD DAY box from
          touching the pane's cyan scrollbar. */}
      <div data-compare-pane ref={leftPaneRef} style={{overflowY:compareActive?'auto':'visible',minHeight:0,flex:compareActive?1:'unset',paddingRight:compareActive?6:0}}>
      <PatternCoverage plan={plan} exercises={exercises} cols={compareActive ? 3 : 5} />
      <WarmupEditor plan={plan} setPlan={setPlan} compact={compareActive} exercises={exercises} />
      {/* Day tabs. Each tab can be individually flagged as a "daily routine"
          via a small 📆 toggle inside the day's content (see below). A daily
          day in a multi-day plan lets the athlete log it any number of times
          during the block — e.g., a "Morning Routine" day inside a Mon/Wed/Fri
          program. Plan-level kind='daily' is the legacy form (96e5f72) and is
          treated as "all days daily" at display time. */}
      <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
        {plan.days.map((d, dayIdx) => {
          const dayExs = d.exercises || [];
          const weeks = plan.weeks || 4;
          const resize = (arr, n, fill) => Array.from({length:n}, (_,i) => (arr && arr[i] !== undefined ? arr[i] : fill));
          const tinyInput = {...baseInput, background:'color-mix(in srgb, var(--c-sf2) 85%, #ffffff)', padding:"3px 6px", fontSize:11, minWidth:0, width:"100%", boxSizing:"border-box"};
          const dayCollapsed = !!collapsedDays[d.id];
          // Drag-reorder. The whole day grid is the drop zone (not just the
          // narrow drag-handle column it used to be — that made the indicator
          // update only when the cursor happened to be over the # cell, so it
          // showed the wrong slot most of the time). `dragOver.gap` is the slot
          // 0..len the row will land in, picked by comparing the cursor against
          // each row's vertical centre. A solid line marks that slot.
          const dragging = dragSrc && dragSrc.dayIdx === dayIdx;
          // Static divider between rows — never changes during drag, so the
          // grid's layout is rock-stable. The insertion indicator is the
          // absolutely-positioned bar below (zero layout impact, glides
          // between slots via a top transition) — the old approach mutated
          // divider border widths and mounted/unmounted edge lines, which
          // shifted every row a few px per slot change (read as "jumpy").
          const rowDivider = { gridColumn: '1 / -1', borderTop: `1px dashed ${C.ac}`, opacity: 0.22, margin: 0, position: 'relative', top: '-1.5px' };
          const onGridDragOver = (e) => {
            if (!dragging) return;
            e.preventDefault(); e.dataTransfer.dropEffect = 'move';
            const rows = [...e.currentTarget.querySelectorAll('[data-exrow]')];
            let gap = rows.length;
            for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { gap = i; break; } }
            // Bar y is derived from row rects (not the cursor), relative to
            // the grid container — same gap → same y, so renders are cheap.
            const gRect = e.currentTarget.getBoundingClientRect();
            let y;
            if (rows.length === 0) y = 0;
            else if (gap === 0) y = rows[0].getBoundingClientRect().top - gRect.top - 3;
            else if (gap === rows.length) y = rows[rows.length - 1].getBoundingClientRect().bottom - gRect.top + 3;
            else { const a = rows[gap - 1].getBoundingClientRect(), b = rows[gap].getBoundingClientRect(); y = ((a.bottom + b.top) / 2) - gRect.top; }
            setDragOver(prev => (prev && prev.dayIdx === dayIdx && prev.gap === gap && Math.abs(prev.y - y) < 1) ? prev : { dayIdx, gap, y });
          };
          const onGridDrop = (e) => {
            e.preventDefault();
            if (dragging && dragOver && dragOver.dayIdx === dayIdx) {
              const from = dragSrc.exIdx;
              let to = dragOver.gap;
              if (to > from) to -= 1; // source is spliced out first, so slots above it shift down one
              if (to !== from) reorderExInDay(dayIdx, from, to);
            }
            setDragSrc(null); setDragOver(null);
          };
          return (
            <div key={d.id} style={{background: 'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'12px'}}>
              {/* marginBottom only while open — a collapsed card otherwise
                  reads 12px above the row but 20px below (off-centre). */}
              {/* Sticky header (compare) gets a hairline below it — rows
                  scroll under it, so without a divider the pinned row reads
                  as floating over the table (Ohad). */}
              <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",marginBottom:dayCollapsed?0:8,gap:10, ...(compareActive ? {position:'sticky',top:0,zIndex:3,background:'var(--c-sf)',paddingTop:4,marginTop:-4,paddingBottom:dayCollapsed?0:8,borderBottom:dayCollapsed?'none':`1px solid ${C.cardBd}`} : {})}}>
                <span role="button" tabIndex={0} onClick={()=>toggleDayCollapse(d.id)}
                  onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleDayCollapse(d.id); } }}
                  title={dayCollapsed?'Expand day':'Collapse day'}
                  style={{cursor:'pointer',color:C.tm,fontSize:13,lineHeight:1,flexShrink:0,transform:dayCollapsed?'rotate(-90deg)':'none',transition:'transform 180ms ease',userSelect:'none'}}>▾</span>
                <input value={d.name} onChange={e=>updateDay(dayIdx,{name:e.target.value})}
                  style={{...baseInput, fontFamily:FB, fontWeight:700, fontSize:14, color:C.tx, padding:"4px 8px", maxWidth:260, minWidth:64, flex:'1 1 120px', width:'auto'}} />
                <span style={{color:C.td,fontSize:12,whiteSpace:"nowrap"}}>({dayExs.length} ex)</span>
                {/* Per-day Daily-Routine toggle — ported from the old detail view
                    (the unified view had dropped it). ON = athlete logs this day
                    unlimited times per block, no DONE lock, no week rotation. */}
                <button onClick={() => { if (d.kind === 'daily') { const { kind: _k, ...rest } = d; setPlan(p => ({ ...p, days: p.days.map((dd, idx) => idx === dayIdx ? rest : dd) })); } else updateDay(dayIdx, { kind: 'daily' }); }}
                  title={d.kind==='daily' ? 'Daily Routine ON — unlimited logs per block, no DONE lock, no week rotation. Click for a standard week-paced day.' : 'Make this a Daily Routine day (unlimited logs, no DONE lock, no week rotation).'}
                  style={{marginLeft:'auto',background: d.kind==='daily' ? `${C.ac}1f` : 'var(--c-sf)',border:`1px solid ${d.kind==='daily'?C.ac:C.cardBd}`,borderRadius:0,padding:"3px 0",color: d.kind==='daily'?C.ac:C.tm,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.1em',whiteSpace:'nowrap',width:100,flexShrink:0,boxSizing:'border-box',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>📆 {d.kind==='daily'?'DAILY ✓':'DAILY'}</button>
                {(() => {
                  const dayIds = (dayExs||[]).map(e=>e.id);
                  const anyOpen = dayIds.some(id=>ovExpanded[id]);
                  return <button onClick={()=>{
                    // Expanding exercises inside a COLLAPSED day card is
                    // invisible — open the card along with them.
                    if (!anyOpen && dayCollapsed) setCollapsedDays(prev => ({ ...prev, [d.id]: false }));
                    setOvExpanded(prev=>{ const next={...prev}; dayIds.forEach(id=>{ if(anyOpen) delete next[id]; else next[id]=true; }); return next; });
                  }}
                    title={anyOpen?'Collapse all exercises in this day':'Expand all exercises in this day to edit fully'}
                    style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,padding:"3px 0",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.14em',whiteSpace:'nowrap',width:142,flexShrink:0,boxSizing:'border-box',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:5}}>
                    {/* One glyph rotated for both states — ▴ and ▾ render at
                        different sizes in this font, so the arrows mismatched. */}
                    <span aria-hidden style={{display:'inline-block',transform:anyOpen?'rotate(180deg)':'none',transition:'transform 180ms ease',lineHeight:1}}>▾</span>
                    {anyOpen?'COLLAPSE ALL':'EXPAND ALL'}
                  </button>;
                })()}
                {/* Remove-day — ported from the dead detail view (unified had
                    no way to delete a day). Confirm since it's destructive. */}
                {plan.days.length > 1 && <button onClick={()=>setConfirmDeleteDay(dayIdx)} title="Delete this day" aria-label="Delete day" style={{background:'transparent',border:'none',color:C.rd,cursor:'pointer',fontSize:17,lineHeight:1,padding:'0 4px',opacity:0.55,flexShrink:0}}>×</button>}
              </div>
              <div style={{display:'grid',gridTemplateRows:dayCollapsed?'0fr':'1fr',transition:'grid-template-rows 260ms ease'}}><div style={{overflow:'hidden',minHeight:0}}>
              {dayExs.length === 0 ? <div style={{color:C.td,fontSize:12,fontStyle:"italic"}}>No exercises.</div> :
                <div style={{overflowX:"auto",margin:"0 -12px",padding:compareActive?"0 12px 7px":"0 12px"}}><div onDragOver={onGridDragOver} onDrop={onGridDrop} style={{display:"grid",position:"relative",gridTemplateColumns: compareActive ? `30px minmax(0,3.3fr) 44px minmax(0,0.9fr) minmax(0,1.4fr) minmax(0,0.9fr) minmax(0,60px) minmax(0,1.3fr) 22px` : `36px minmax(180px,3.3fr) 56px minmax(${Math.max(56,weeks*22)}px,0.9fr) minmax(${Math.max(64,weeks*26)}px,1.4fr) minmax(60px,80px) minmax(48px,60px) minmax(80px,1.3fr) 24px`,gap:"3px 8px",fontSize:12,alignItems:"center",minWidth: compareActive ? Math.max(590,516+weeks*40) : Math.max(614,540+weeks*40)}}>
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
                      // Box-column headers center over their inputs.
                      <div key={hi} style={{fontSize:9,fontFamily:FN,color:C.td,minWidth:0,textAlign:'center'}}>{h}</div>
                    )
                  )}
                  {dayExs.map((ex, exIdx) => {
                    const exData = exById(exercises).get(ex.exerciseId);
                    const title = exData?.title || ex.title || (ex.notes?.match(/^\[(.+)\]$/)?.[1]) || '(unresolved)';
                    const sc = ex.superset==="A"?C.ac:ex.superset==="B"?C.pu:ex.superset==="C"?C.or:C.td;
                    const update = (u) => updateExInDay(dayIdx, exIdx, u);
                    // While a drag is live in this day, render expanded rows
                    // as collapsed (the panel animates shut via its 0fr/1fr
                    // transition) so the drag gets the same clean gap-line
                    // effect as collapsed mode. ovExpanded itself is left
                    // untouched — rows re-open where they were on drop.
                    const exOpen = !!ovExpanded[ex.id] && !dragging;
                    return <React.Fragment key={ex.id}>
                      {/* Divider between exercises — static; the drag
                          insertion bar is the absolute overlay below. */}
                      {exIdx > 0 && <div style={rowDivider} />}
                      <div draggable data-exrow={exIdx}
                        onDragStart={e => { e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', `${dayIdx}:${exIdx}`);
                          // Whole row travels with the cursor, not just the # cell.
                          setRowDragImage(e, e.currentTarget, 9);
                          // Deferred one tick: setting state here re-renders
                          // synchronously inside dragstart, and the layout
                          // shift (expanded panels snapping shut) makes Chrome
                          // abort the drag before it begins. After the tick
                          // the drag is established and layout can change.
                          setTimeout(() => setDragSrc({dayIdx, exIdx}), 0); }}
                        onDragEnd={() => { setDragSrc(null); setDragOver(null); }}
                        title="Drag to reorder"
                        style={{display:"flex",alignItems:"center",gap:5,minWidth:0,cursor:"grab",userSelect:"none",opacity:dragging&&dragSrc.exIdx===exIdx?0.4:1,transition:"opacity 120ms"}}>
                        <span style={{color:C.tm, fontFamily:FN, fontSize:11, lineHeight:1, fontWeight:400, position:'relative', top:'1px'}}>⇕</span>
                        <span style={{color:C.tx, fontFamily:FN, fontWeight:700, fontSize:12, lineHeight:1}}>{exIdx+1}</span>
                      </div>
                      <div onClick={()=>toggleOvExpand(ex.id)} title="Click to expand — swap exercise, edit notes & video inline"
                        role="button" tabIndex={0} aria-expanded={exOpen}
                        onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleOvExpand(ex.id); } }}
                        style={{color:C.tx, minWidth:0, borderLeft:`3px solid ${ex.superset?sc:'transparent'}`, paddingLeft:6, cursor:"pointer", display:"flex", alignItems:"center", gap:6}}>
                        <span style={{color:C.ac, fontSize:11, fontWeight:700, lineHeight:1, flexShrink:0, transform:exOpen?'none':'rotate(-90deg)', transition:'transform 150ms ease'}}>▾</span>
                        <span style={{overflowWrap: compareActive ? 'break-word' : 'anywhere', wordBreak: compareActive ? 'normal' : 'break-word'}}>{title}</span>
                      </div>
                      <select value={ex.superset||""} onChange={e=>update({superset:e.target.value})}
                        style={{...tinyInput, color:sc, fontFamily:FN, fontWeight:600, height:20, minHeight:20, padding:'0 6px', boxSizing:'border-box', appearance:'none', WebkitAppearance:'none', textAlignLast:'center'}}>
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
                      <button onClick={()=>removeExFromDay(dayIdx, exIdx)} title="Remove exercise from this day" aria-label="Remove exercise"
                        style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}><TrashIcon size={15} /></button>
                      {/* Per-week toggles, column-aligned under SETS (col 4) and
                          REPS (col 5), shown only when the row is expanded. */}
                      {exOpen && <label style={{gridColumn:4,display:'flex',alignItems:'center',justifyContent:'center',gap:5,cursor:'pointer',fontFamily:FN,fontSize:9,color:C.tm,letterSpacing:'0.02em',padding:'5px 0',whiteSpace:'nowrap'}}>
                        <input type="checkbox" checked={!!(ex.wkS&&ex.wkS.length)} onChange={()=> (ex.wkS&&ex.wkS.length) ? update({wkS:null,sets:parseInt(ex.wkS[0])||ex.sets||3}) : update({wkS:Array.from({length:weeks},()=>String(ex.sets||3))})} style={{accentColor:C.ac,width:13,height:13,cursor:'pointer',flexShrink:0}} /> per week
                      </label>}
                      {exOpen && <label style={{gridColumn:5,display:'flex',alignItems:'center',justifyContent:'center',gap:5,cursor:'pointer',fontFamily:FN,fontSize:9,color:C.tm,letterSpacing:'0.02em',padding:'5px 0',whiteSpace:'nowrap'}}>
                        <input type="checkbox" checked={!!(ex.wk&&ex.wk.length)} onChange={()=> (ex.wk&&ex.wk.length) ? update({wk:null,reps:ex.wk[0]||"8-12"}) : update({wk:Array.from({length:weeks},()=>ex.reps||""),reps:">"})} style={{accentColor:C.ac,width:13,height:13,cursor:'pointer',flexShrink:0}} /> per week
                      </label>}
                      {/* Inline full detail — the combined overview+detail panel. */}
                      <div style={{gridColumn:'1 / -1', display:'grid', gridTemplateRows: exOpen?'1fr':'0fr', transition:'grid-template-rows 260ms ease'}}>
                       <div style={{overflow:'hidden', minHeight:0}}>
                        <div style={{background:'var(--c-sf)', border:`1px solid ${C.cardBd}`, borderLeft:`3px solid ${ex.superset?sc:C.ac}`, padding:14, margin:'2px 0 12px', display:'flex', flexDirection:'column', gap:12}}>
                          {/* Only the bits NOT already in the table row — no duplicate
                              sets/reps/load/etc. Swap the exercise + per-week toggle
                              + the polished notes/video block (ExEditorExtras). The
                              picker renders INSIDE extras, on one row with the
                              video URL (50/50, aligned with notes/thumb below). */}
                          <ExEditorExtras ex={ex} exData={exData} exTitle={title} update={update} showEmbed={exOpen}
                            picker={<ExPicker exercises={exercises} value={ex.exerciseId} onChange={id=>update({exerciseId:id})} onPickName={name=>update({exerciseId:'', title:name})} label="Exercise" fallbackTitle={ex.title} />} />
                        </div>
                       </div>
                      </div>
                    </React.Fragment>;
                  })}
                  {/* Insertion bar — absolute overlay, glides between slots
                      without ever moving the rows themselves. */}
                  {dragging && dragOver && dragOver.dayIdx === dayIdx && dragOver.y != null && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: dragOver.y - 1, height: 2, background: C.ac, boxShadow: `0 0 5px ${C.ac}88`, pointerEvents: 'none', zIndex: 2, transition: 'top 90ms ease' }} />
                  )}
                </div></div>
              }
              {/* Add-exercise — ported to the unified view (the only add buttons
                  used to live in the dead detail view, so the unified editor
                  couldn't add exercises at all). Targets THIS day. */}
              <Btn variant="ghost" onClick={()=>{ setActiveDay(dayIdx); setAddExerciseOpen(true); }} style={{width:"100%",justifyContent:"center",marginTop:4}}>+ Add Exercise</Btn>
              </div></div>
            </div>
          );
        })}
        {/* Add-day — ported to the unified view (the only add-day button lived
            in the dead detail view, so the unified editor couldn't add days). */}
        <button onClick={addDay} title="Add a day to this program"
          style={{background:`${C.ac}12`,border:`1px solid ${C.ac}`,borderRadius:0,padding:'15px',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.2em',textTransform:'uppercase'}}>+ ADD DAY</button>
      </div>
      {/* (Removed dead `!overview` detail-view day-name input + daily-routine
          toggle — overview is forced true so they never rendered; both live
          in the unified day-card header above.) */}
      {/* (Removed dead `!overview` detail-view exercise editor — overview is
          forced true so this branch never rendered; the unified day-card
          table above is the editor. ~215 lines of dead JSX excised.) */}
      </div>
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
        onPickName={name=>{ addExByName(name); setAddExerciseOpen(false); }}
        onCreateLibrary={setExercises ? (name=>{ createLibraryExercise(name); setAddExerciseOpen(false); }) : undefined}
        exercises={exercises}
      />
      <ConfirmDialog
        open={confirmDeleteDay !== null}
        title="Delete day?"
        message={confirmDeleteDay !== null ? `"${plan.days[confirmDeleteDay]?.name || 'This day'}" and its ${plan.days[confirmDeleteDay]?.exercises?.length || 0} exercise(s) will be removed. This can't be undone.` : ''}
        onConfirm={()=>{ removeDay(confirmDeleteDay); setConfirmDeleteDay(null); }}
        onCancel={()=>setConfirmDeleteDay(null)}
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

export default function PlansView({ planIndex, reloadIndex, trainees, exercises, setExercises, clientWorkouts, weeklyFocus, setWeeklyFocus, openPlanId, onPlanOpened, onEditorOpen, onEditorClose, onPreviewPlan, portalVis, setPortalVis, onCloseEditor }) {
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

  // Report editor open/close to the parent so it can deep-link the URL
  // (/coach/programs/<planId>) — a refresh / tab-duplicate then reopens the
  // same editor instead of dropping back to the list. Ref-guarded so close
  // only fires after a real open (not on initial mount).
  const wasEditingRef = React.useRef(false);
  React.useEffect(() => {
    if (editMode && editPlanData?.id) { if (onEditorOpen) onEditorOpen(editPlanData.id); wasEditingRef.current = true; }
    else if (!editMode && wasEditingRef.current) { if (onEditorClose) onEditorClose(); wasEditingRef.current = false; }
  }, [editMode, editPlanData?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (search) { const q = search.toLowerCase(); result = result.filter(p => (p.name||'').toLowerCase().includes(q) || (traineeMap[p.traineeId]||'').toLowerCase().includes(q)); }
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
    // Stay in the editor after Save (Ohad) — refresh the program index in the
    // background, but do NOT unmount the editor. BACK is the explicit leave.
    await reloadIndex();
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
    if (data) { await duplicatePlan({ id: data.id, name: data.name, traineeId: data.trainee_id, phase: data.phase, notes: data.notes, active: data.active, createdAt: data.created_at, days: data.data?.days||[], warmup: data.data?.warmup||[], weeks: data.data?.weeks, kind: data.data?.kind, isTemplatePurchase: data.data?.isTemplatePurchase }); await reloadIndex(); }
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
      // crypto-strong: the token is the read capability for the program.
      const token = 'sh_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
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

  // Row action button — TEXT label only (Ohad: the icons are unnecessary once
  // the words are visible). One shape across all row variants. `children`
  // (the old icon) is intentionally ignored.
  const LabeledBtn = ({ onClick, title, label, danger }) => (
    <button onClick={onClick} title={title}
      style={{
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        height:30, width:92, padding:0, lineHeight:1, flexShrink:0,
        background: isRefined5b() ? 'transparent' : 'var(--c-sf)',
        border:`1px solid ${danger ? 'rgba(255,71,87,0.5)' : C.ac}`, borderRadius:0,
        color: danger ? C.rd : C.ac, cursor:'pointer',
        fontFamily:FN, fontSize:9, fontWeight:700, letterSpacing:'0.08em', whiteSpace:'nowrap',
      }}>{label}</button>
  );

  // Portal-visibility as a single-line pill (status dot + text) at the same
  // height as the action buttons — replaces the 2-line switch+caption column
  // that didn't vertically align with the rest of the row.
  const PortalPill = ({ on, onClick, onLabel = 'ON PORTAL', offLabel = 'HIDDEN', title }) => (
    <button onClick={onClick}
      title={title || (on ? 'Visible on athlete portal — click to hide' : 'Hidden from athlete portal — click to show')}
      style={{
        // Fixed width so both states of a toggle (and every toggle on the
        // page) are identical length — keeps the pill columns symmetric
        // across rows regardless of the label inside.
        display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
        height:30, width:108, padding:0, lineHeight:1, flexShrink:0, borderRadius:0, cursor:'pointer',
        background:'transparent', border:`1px solid ${on ? C.gn : C.cardBd}`,
        color: on ? C.gn : C.tm,
        fontFamily:FN, fontSize:9, fontWeight:700, letterSpacing:'0.08em', whiteSpace:'nowrap',
      }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background: on ? C.gn : C.td, flexShrink:0 }} />
      {on ? onLabel : offLabel}
    </button>
  );

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
    // Sort athletes by the active sortField/sortDir from the SORT bar so
    // the Name / Uploaded / Last edited buttons actually do something on
    // the grouped view (previously they only worked in flat search mode).
    // Pinned positions: unassigned legacy row always last; orphans (no
    // plan at all) sorted but always above unassigned.
    const dirMul = sortDir === 'asc' ? 1 : -1;
    const keyFor = (row) => {
      if (sortField === 'name') return null; // localeCompare path below
      const p = row.current;
      if (!p) return 0;
      if (sortField === 'created') return new Date(p.createdAt || 0).getTime();
      return new Date(p.updatedAt || p.createdAt || 0).getTime();
    };
    rows.sort((a, b) => {
      if (a.tid === '__unassigned__') return 1;
      if (b.tid === '__unassigned__') return -1;
      if (a.orphan && !b.orphan) return 1;
      if (b.orphan && !a.orphan) return -1;
      if (sortField === 'name') return a.name.localeCompare(b.name, 'he') * dirMul;
      const aT = keyFor(a);
      const bT = keyFor(b);
      if (aT !== bT) return (aT - bT) * dirMul;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [planIndex, clientWorkouts, trainees, search, filterTrainee, traineeMap, sortField, sortDir]);

  if (editMode) {
    if (editLoading || !editPlanData) return <div style={{textAlign:"center",padding:60,color:C.td}}><div style={{fontSize:14}}>Loading program...</div></div>;
    // key={editPlanData.id} forces a remount when the visitor switches
    // programs via the new in-editor dropdown — PlanEditor's internal `plan`
    // state is initialized from `init` only once, so a remount is the
    // simplest way to load fresh data without rewiring its state plumbing.
    return <PlanEditor key={editPlanData.id} plan={editPlanData} onSave={handleSave} onCancel={handleCancel} onSwitchProgram={loadFullPlan} trainees={trainees} exercises={exercises} setExercises={setExercises} planIndex={planIndex} onPreviewPlan={onPreviewPlan} />;
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:12,alignItems:"stretch",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180,display:'flex'}}><input title="Search programs by name or block (e.g. “Block #5”, “GPP”)" placeholder="Search programs..." value={search} onChange={e=>{setSearch(e.target.value);setVisibleCount(PAGE_SIZE)}} style={{...baseInput,height:42,padding:'0 14px',fontSize:13,lineHeight:'42px',display:'flex',alignItems:'center',textAlignLast:'center',border:`1px solid ${C.ac}`}} /></div>
        <div style={{position:'relative',width:200,display:'flex'}}>
          <select title="Show only one athlete's programs (default: everyone, grouped by athlete)" value={filterTrainee} onChange={e=>{setFilterTrainee(e.target.value);setVisibleCount(PAGE_SIZE)}} style={{...baseInput,height:42,padding:'0 36px 0 14px',fontSize:13,appearance:'none',WebkitAppearance:'none',textAlign:'center',textAlignLast:'center',flex:1,border:`1px solid ${C.ac}`}}>
            <option value="">All Athletes ({planIndex.length})</option>
            {traineeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:C.ac,fontSize:16,lineHeight:1}}>▾</span>
        </div>
        <Btn title="Create a new, empty program — you pick the athlete inside the editor" onClick={handleNewPlan} style={{height:42,padding:'0 18px',fontSize:13,lineHeight:'42px',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>+ New Program</Btn>
      </div>
      {/* Sort controls. Click an inactive field to activate it (keeps current dir);
          click the active field to flip direction. Arrow points 'up' for asc. */}
      <div style={{display:"flex",gap:6,marginBottom:16,alignItems:"center",flexWrap:"wrap",fontFamily:FN,fontSize:11}}>
        {[
          ['name','Name','Sort by program name. Click again to flip A–Z / Z–A.'],
          ['created','Uploaded','Sort by when the program was created/imported. Click again to flip newest/oldest.'],
          ['updated','Last edited','Sort by when the program was last edited. Click again to flip newest/oldest.'],
        ].map(([field,label,tip]) => {
          const active = sortField === field;
          return (
            <button key={field} title={tip} onClick={() => {
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
                <div key={row.tid} style={{background: 'var(--c-sf)',border:`0.25px dashed rgba(255,165,2,0.502)`,borderRadius:0,padding:'12px 14px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                  <div style={{minWidth:0,flex:1,display:'flex',alignItems:'baseline',gap:14,flexWrap:'wrap'}}>
                    <div style={{fontWeight:700,fontSize:15,color:C.tx,whiteSpace:'nowrap',letterSpacing:'0.01em',flexShrink:0}}><bdi>{row.name}</bdi></div>
                    <div style={{fontSize:11,color:C.or,fontFamily:FN,letterSpacing:'0.18em',textTransform:'uppercase',fontWeight:700}}>NO PROGRAM ASSIGNED</div>
                  </div>
                  <button onClick={()=>handleNewPlan()} style={{background:'var(--c-sf)',border:`1px solid ${C.or}`,borderRadius:0,color:C.or,cursor:'pointer',padding:'3px 10px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.18em',whiteSpace:'nowrap'}}>+ ASSIGN PROGRAM</button>
                </div>
              );
            }
            return (
              <div key={row.tid} style={{background: 'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderLeft:`3px solid ${C.ac}`,borderRadius:0}}>
                {/* Current-block row — clicking opens the plan editor. */}
                <div onClick={()=>handleOpenPlan(cur.id)}
                  role="button" tabIndex={0}
                  onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); handleOpenPlan(cur.id); } }}
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
                  {/* Fixed-width columns + reserved empty slots for the +N and
                      LATEST-ONLY controls (absent on rows with no earlier
                      blocks) so every box sits in the same column down the
                      list. Order: tag · +N · ON PORTAL · LATEST ONLY · PREVIEW
                      · DUPLICATE · SHARE. */}
                  <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'flex-end',flexShrink:0}}>
                    <span title={`Last session: ${tagText.toLowerCase()}`} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',height:30,width:112,fontSize:10,fontFamily:FN,color:tagColor,letterSpacing:'0.04em',fontWeight:600,border:`1px solid ${tagColor}`,whiteSpace:'nowrap',flexShrink:0,boxSizing:'border-box'}}>{tagText.toLowerCase()}</span>
                    {row.earlier.length > 0 ? (
                      <button onClick={e=>{e.stopPropagation();toggleAthlete(row.tid);}}
                        title={expanded?`Hide ${row.earlier.length} earlier block${row.earlier.length===1?'':'s'}`:`Show ${row.earlier.length} earlier block${row.earlier.length===1?'':'s'}`}
                        style={{display:'inline-flex',alignItems:'center',justifyContent:'center',height:30,width:44,background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',whiteSpace:'nowrap',flexShrink:0,boxSizing:'border-box'}}>
                        {expanded?`▴ ${row.earlier.length}`:`▾ +${row.earlier.length}`}
                      </button>
                    ) : <div style={{width:44,flexShrink:0}} />}
                    {setPortalVis ? (() => {
                      const vk = visKeyForPlan(cur, trainees);
                      if (!vk) return <div style={{width:108,flexShrink:0}} />;
                      const isVis = portalVis?.[vk] !== false;
                      return <PortalPill on={isVis} onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis})}} />;
                    })() : <div style={{width:108,flexShrink:0}} />}
                    {setPortalVis && row.earlier.length > 0 ? (() => {
                      const curKey = visKeyForPlan(cur, trainees);
                      if (!curKey) return <div style={{width:108,flexShrink:0}} />;
                      const earlierKeys = row.earlier.map(p => visKeyForPlan(p, trainees)).filter(Boolean);
                      const latestOnly = (portalVis?.[curKey] !== false) && earlierKeys.every(k => portalVis?.[k] === false);
                      return <PortalPill on={latestOnly}
                        onLabel="LATEST ONLY" offLabel="ALL BLOCKS"
                        title={latestOnly ? 'Only the latest block shows on the portal — click to show all' : 'Show only the latest block on the portal (hide older)'}
                        onClick={e => { e.stopPropagation(); const next = { ...portalVis, [curKey]: true }; earlierKeys.forEach(k => { next[k] = latestOnly ? true : false; }); setPortalVis(next); }} />;
                    })() : <div style={{width:108,flexShrink:0}} />}
                    {onPreviewPlan && <LabeledBtn onClick={e=>{e.stopPropagation();onPreviewPlan(cur.id);}} title="Preview as trainee" label="PREVIEW" />}
                    <LabeledBtn onClick={e=>{e.stopPropagation();handleDuplicate(cur.id);}} title="Duplicate program" label="DUPLICATE" />
                    <LabeledBtn onClick={e=>{e.stopPropagation();handleShare(cur.id);}} title="Public share — copies a /p/<token> URL anyone can open" label="SHARE" />
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
                          return <PortalPill on={isVis} onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis})}} />;
                        })()}
                        {onPreviewPlan && <LabeledBtn onClick={e=>{e.stopPropagation();onPreviewPlan(p.id);}} title="Preview as trainee" label="PREVIEW" />}
                        <LabeledBtn onClick={e=>{e.stopPropagation();handleDuplicate(p.id);}} title="Duplicate program" label="DUPLICATE" />
                        <LabeledBtn onClick={e=>{e.stopPropagation();setConfirmDelete(p.id);}} title="Delete program" label="DELETE" danger />
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
          return <Card key={p.id} onClick={()=>handleOpenPlan(p.id)} style={{padding:'10px 14px', background: 'var(--c-sf)', borderLeft:`3px solid ${C.ac}`}}
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
              <div style={{display:"flex",gap:8,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
                {setPortalVis && (() => {
                  const vk = visKeyForPlan(p, trainees);
                  if (!vk) return null;
                  const isVis = portalVis?.[vk] !== false;
                  return <PortalPill on={isVis} onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis})}} />;
                })()}
                {onPreviewPlan && <LabeledBtn onClick={e=>{e.stopPropagation();onPreviewPlan(p.id)}} title="Preview as trainee" label="PREVIEW" />}
                <LabeledBtn onClick={e=>{e.stopPropagation();handleDuplicate(p.id)}} title="Duplicate program" label="DUPLICATE" />
                <LabeledBtn onClick={e=>{e.stopPropagation();setConfirmDelete(p.id)}} title="Delete program" label="DELETE" danger />
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
                  const ex = exById(exercises).get(pe.exerciseId);
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
