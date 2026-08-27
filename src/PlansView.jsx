import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB, FH, uid, REQUIRED_PATTERNS, SUPERSET_LABELS, CATEGORIES, RESISTANCE_TYPES, BODY_POSITIONS, MOVEMENT_TYPES, MOVEMENT_PATTERNS, LATERALITY } from './theme';

// Superset group E colour — gold/amber. The four taken hues are A(cyan) /
// B(purple) / C(orange) / D(green) and red is reserved for delete/errors, so
// gold is the one remaining clearly-distinct categorical colour (and it reads
// on both the dark and light themes — Ohad: "colors that are unique").
const SUPERSET_E = '#EAB308';

// One place maps a superset letter → its group colour. Used for the row accent
// strip, the GRP cell text, AND each letter in the GRP dropdown so the menu is
// colour-coded per group (Ohad). '' / '—' (no group) stays muted grey.
function supersetColor(s) {
  return s === 'A' ? C.ac : s === 'B' ? C.pu : s === 'C' ? C.or : s === 'D' ? C.gn : s === 'E' ? SUPERSET_E : C.td;
}

// Heebo's x-height is smaller than Nord's at the same fontSize, so Hebrew
// names visually shrink in a row designed for English. Per the
// feedback_new_ui_box_dimensions rule: Hebrew bumps +3px inside the box.
const isHebrew = (s) => /[֐-׿]/.test(s || '');
import { Btn, Input, Select, Badge, Card, ConfirmDialog, EmptyState, baseInput, isRefined5b, usePersistentState, useDelayedUnmount, toast, asButton } from './ui';

// Memoized id->exercise lookup. The library is ~1,500 exercises; a per-row
// `exercises.find(...)` in the PlanEditor render loop re-scanned the whole
// array on every keystroke (~30k comparisons/keypress). Rebuilds the Map only
// when the exercises array reference changes (load/save), so all callers get
// O(1) lookups for free without each needing its own useMemo.
let _exMapSrc = null, _exMap = null;
export function exById(exercises) {
  if (_exMapSrc !== exercises) {
    _exMapSrc = exercises;
    _exMap = new Map((exercises || []).map(e => [e.id, e]));
  }
  return _exMap;
}
// Same module-singleton pattern, keyed on normalized title — so free-text rows
// resolve their library target with an O(1) Map lookup instead of a linear
// exercises.find() over ~1,500 entries per row on every render (keystroke lag).
let _exTitleSrc = null, _exTitleMap = null;
function exByTitle(exercises) {
  if (_exTitleSrc !== exercises) {
    _exTitleSrc = exercises;
    _exTitleMap = new Map((exercises || []).map(e => [(e.title || '').trim().toLowerCase(), e]));
  }
  return _exTitleMap;
}
import { useFullPlan, useAthletePlans, savePlan, deletePlan, duplicatePlan } from './usePlansStore';
import useAutosave, { autosaveStatusLabel } from './hooks/useAutosave';
import VideoEmbed from './VideoEmbed';
import { NextBlockReport } from './NextBlockReport';
import TrainingLineageV2 from './TrainingLineageV2';
import { sortProgramsRecent, sortProgramsByBlockDesc } from './traineeUtils';
import { SideRail } from './SideRail';
import { fmtPrettyDate } from './dates';
import { cloneDayForCopy } from './planCopy.js';

// "1 DAYS" read wrong on every single-day block. One helper, used by every
// place that prints a count next to a noun.
const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;

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
    const exMap = exById(exercises);
    // Coverage was read from the library `movementPattern` column — but that's
    // ~91% empty (1,379/1,476 unclassified), so a program packed with squats/
    // hinges/presses still reported 0/9 (a false "trains nothing" — violates the
    // no-fake-data rule). Classify from the exercise TITLE instead, the same
    // library-independent method the Overload chart uses (classifyPattern),
    // mapped onto the 9 primary patterns. Verified accurate on real blocks.
    // Guard days/exercises (a null day or missing array would throw here during
    // PlanEditor render and lose the coach's draft — :779/:1597 use the same ||[]).
    (plan.days || []).forEach(d => (d?.exercises || []).forEach(pe => {
      const lib = exMap.get(pe?.exerciseId);
      const title = pe?.title || lib?.title || '';
      const req = coveragePattern(title, lib);
      if (req) s.add(req);
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
    {/* Mobile: 5 fixed columns crush the labels into each other (they can't
        wrap in that width) — drop to 2 columns on phones and let labels wrap. */}
    <style>{`@media (max-width:760px){ .pattern-cov-grid{ grid-template-columns: repeat(2, minmax(0,1fr)) !important; } }`}</style>
    <div className="pattern-cov-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 5 }}>{REQUIRED_PATTERNS.map(p => <Badge key={p} color={pats.has(p) ? C.gn : C.tm} style={{ width:'100%', height:'100%', minHeight:0, boxSizing:'border-box', justifyContent:'center', alignItems:'center', textAlign:'center', display:'inline-flex', whiteSpace:'normal', lineHeight:1.15, padding:'5px 4px', ...(pats.has(p) ? {} : {fontWeight:500,opacity:0.65}) }}>{pats.has(p) ? "✓" : "✗"} {p}</Badge>)}</div>
  </div>);
}

// Shared modal for browsing and picking an exercise.
// Props: open, onClose, onPick(exerciseId), exercises, currentId, title
// onPickName(name) — optional: pick a FREE-TEXT name not in the library.
// onCreateLibrary(name) — optional: create a real library exercise + link it.
function ExerciseBrowserModal({ open, onClose, onPick, onPickName, onCreateLibrary, exercises, currentId, currentEx, fallbackTitle }) {
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [compareOpen, setCompareOpen] = useState(true); // collapse compare for more list room (Ohad)
  // Only the 3 filters that map to REAL exercise-DB columns (Resistance / Body
  // Position / Movement Type). Category, Pattern and Laterality were dropped —
  // they aren't columns in the library (same mismatch fixed on the Exercises
  // table), so filtering by them just hid everything. Free-text search still
  // covers muscles/joints/etc. via the haystack below.
  // Every exercise-DB sheet column is filterable now (Ohad: "still only shows 3
  // parameters to choose from"). Single-value fields match exactly; multi-value
  // fields (joints / movements / muscles are comma-lists) match on membership.
  const EMPTY_FILTERS = { resistanceType: "", bodyPosition: "", movementType: "", primaryJoints: "", jointMovements: "", primaryMuscles: "", secondaryMuscles: "" };
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);

  const setF = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const clearFilters = () => setFilters(EMPTY_FILTERS);
  const clearAll = () => { setSearch(""); clearFilters(); };

  const splitCsv = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  // Distinct values (by frequency) for the multi-value dropdowns — pulled live
  // from the library so options reflect what actually exists.
  const optLists = useMemo(() => {
    const acc = { primaryJoints: {}, jointMovements: {}, primaryMuscles: {}, secondaryMuscles: {} };
    for (const e of (exercises || [])) {
      for (const k of Object.keys(acc)) new Set(splitCsv(e[k])).forEach(v => { acc[k][v] = (acc[k][v] || 0) + 1; });
    }
    const sort = m => Object.keys(m).sort((a, b) => m[b] - m[a] || a.localeCompare(b));
    return { primaryJoints: sort(acc.primaryJoints), jointMovements: sort(acc.jointMovements), primaryMuscles: sort(acc.primaryMuscles), secondaryMuscles: sort(acc.secondaryMuscles) };
  }, [exercises]);

  const filt = useMemo(() => {
    if (!open) return [];
    const q = search.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const match = (ex) => {
      if (filters.resistanceType && ex.resistanceType !== filters.resistanceType) return false;
      if (filters.bodyPosition && ex.bodyPosition !== filters.bodyPosition) return false;
      if (filters.movementType && ex.movementType !== filters.movementType) return false;
      if (filters.primaryJoints && !splitCsv(ex.primaryJoints).includes(filters.primaryJoints)) return false;
      if (filters.jointMovements && !splitCsv(ex.jointMovements).includes(filters.jointMovements)) return false;
      if (filters.primaryMuscles && !splitCsv(ex.primaryMuscles).includes(filters.primaryMuscles)) return false;
      if (filters.secondaryMuscles && !splitCsv(ex.secondaryMuscles).includes(filters.secondaryMuscles)) return false;
      if (tokens.length === 0) return true;
      const haystack = [
        ex.title, ex.category, ex.resistanceType, ex.bodyPosition, ex.movementType,
        ex.movementPattern, ex.laterality, ex.primaryMuscles, ex.secondaryMuscles,
        ex.primaryJoints, ex.jointMovements
      ].filter(Boolean).join(' ').toLowerCase();
      return tokens.every(t => haystack.includes(t));
    };
    return (exercises || []).filter(match).slice(0, 200);
  }, [exercises, search, filters, open]);

  // Reset state when modal opens. When RELINKING a free-text row (no library
  // link yet — currentEx is null but we have its typed name in fallbackTitle),
  // pre-seed the search with that name so its library matches are on screen
  // instantly: open → click the match = one-click relink (Ohad, #5). Changing an
  // already-linked exercise still opens on a clean search.
  React.useEffect(() => {
    if (open) {
      setSearch(!currentEx && fallbackTitle ? String(fallbackTitle).trim() : "");
      clearFilters();
      setActiveIdx(0);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50);
    }
  }, [open]);

  React.useEffect(() => { setActiveIdx(0); }, [search, filters]);

  // Scroll active row into view — KEYBOARD navigation only. Hover also sets
  // activeIdx; scrolling the list under a resting mouse re-fires mouseenter
  // on the row that slid under it, which chained into the "entire list
  // glitches" jump Ohad hit. navByKey flips on in onKeyDown and is consumed
  // here, so hover never moves the list.
  const navByKeyRef = React.useRef(false);
  React.useEffect(() => {
    if (!open || !listRef.current || !navByKeyRef.current) return;
    navByKeyRef.current = false;
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const pick = (ex) => { onPick(ex.id); onClose(); };
  // Add the typed search text as a free-text exercise (not in the library).
  const pickName = () => { const t = (search || '').trim(); if (t && onPickName) { onPickName(t); onClose(); } };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); navByKeyRef.current = true; setActiveIdx(i => Math.min(i + 1, filt.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); navByKeyRef.current = true; setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filt[activeIdx]) pick(filt[activeIdx]); else pickName(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // Show the first 2-3 available parameters so similar exercises are
  // distinguishable (athletic/med-ball rows often lack resistance/body-position
  // but DO have category + laterality). movementPattern is shown separately.
  // Parameters shown = the REAL library-xlsx classification columns only
  // (Ohad: "parameters not aligned with Last Draft Exercise Library.xlsx").
  // xlsx cols: Resistance Type · Body Position · Movement Type · Primary Joints
  // · Joint Movements · Primary/Secondary Muscle Groups. No category/laterality/
  // movementPattern — those aren't columns in the library.
  const subtitle = (ex) => [ex.resistanceType, ex.bodyPosition, ex.movementType, ex.primaryJoints].filter(Boolean).slice(0, 3).join(' · ');
  const muscles = (ex) => [ex.primaryMuscles, ex.secondaryMuscles].filter(Boolean).join(' / ');
  // Every column from the final exercise-list sheet — used for the compare panel
  // (Ohad: "open like a compare view + add all the parameters from the sheet").
  // Exact column names from the exercise-database sheet (Ohad: "show all
  // parameters like in the sheet"). Coaching Notes is rendered below as its own
  // labelled block since it's long free text.
  const PARAM_ROWS = [['Resistance Type', 'resistanceType'], ['Body Position', 'bodyPosition'], ['Movement Type', 'movementType'], ['Primary Joints', 'primaryJoints'], ['Joint Movements', 'jointMovements'], ['Primary Muscle Groups', 'primaryMuscles'], ['Secondary Muscle Groups', 'secondaryMuscles']];
  const filterSelectStyle = { ...baseInput, padding: '7px 10px', fontSize: 12 };
  // Active filters get the brand cyan border + subtle bg tint so the coach
  // can see at a glance which dimensions are constraining the result list.
  const filterStyleActive = { ...filterSelectStyle, border: `1px solid ${C.ac}`, color: C.tx };

  // Push-not-hide (Ohad: "a panel is fine if it doesn't hide the page but pushes
  // it and collapses it"). While open, pad the body by the panel width so the
  // editor stays fully visible + usable beside the panel — no covering scrim.
  const DRAWER_W = 'min(620px, 94vw)';
  useEffect(() => {
    if (!open) return;
    const w = Math.min(620, Math.round(window.innerWidth * 0.94));
    document.body.style.transition = 'padding-right 220ms cubic-bezier(0.22,0.61,0.36,1)';
    document.body.style.paddingRight = w + 'px';
    // Padding alone was not "push" — it was "shove off the edge". <main> is
    // maxWidth:1200 + margin:0 auto, so shrinking the body just RE-CENTRES it:
    // measured at 1920, main slid from left:354 to left:44 without shrinking at
    // all, and on a narrower window the left column lands past x=0. The app root
    // is overflowX:clip, so whatever goes off the left is unreachable — you
    // cannot scroll it back. Hence Ohad seeing his day cards cut in half.
    //
    // The class (styles below) pins main to the LEFT while the drawer is open
    // and relaxes the clip, so the page shrinks in place instead of sliding,
    // and anything that still cannot fit stays scrollable rather than lost.
    document.body.classList.add('ex-drawer-open');
    return () => {
      document.body.style.paddingRight = '';
      document.body.classList.remove('ex-drawer-open');
    };
  }, [open]);

  const { mounted, closing } = useDelayedUnmount(open);
  if (!mounted) return null;

  return (
    // pointerEvents:none so the pushed page stays clickable; only the panel
    // itself captures events. No scrim — the page is visible, not hidden.
    <div role="dialog" aria-modal="true" className={closing ? 'motion-fade-out' : 'motion-fade-in'} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end', pointerEvents: 'none' }}>
      {/* Right-side DRAWER (not a covering modal) so the program stays visible on
          the left while picking — Ohad: "i can't see the program when selecting an
          exercise". Slides in from the right over a light scrim. */}
      <style>{`@keyframes exDrawerIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
        /* Push, don't shove — see the effect above for the measurements.
           Compare mode's full-bleed breakout assumes <main> is centred in the
           viewport. While this drawer is open it is not, and the breakout throws
           the editor 300px off the left edge where it cannot be scrolled back.
           Switch the breakout off for the duration: Compare keeps working, just
           at the normal column width. */
        body.ex-drawer-open .editor-bleed{width:auto !important;margin-left:0 !important;}
        /* Safety net: anything that still cannot fit stays reachable rather
           than being silently clipped away. */
        body.ex-drawer-open .app-root{overflow-x:auto !important;}`}</style>
      <div onClick={e => e.stopPropagation()} style={{ pointerEvents: 'auto', background: C.sf, borderLeft:`1px solid ${C.ac}`, borderRadius: 0, width: DRAWER_W, height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: `-16px 0 50px ${C.shadow}`, animation: closing ? 'none' : 'exDrawerIn 220ms cubic-bezier(0.22,0.61,0.36,1)', transform: closing ? 'translateX(100%)' : 'translateX(0)', transition: closing ? 'transform 200ms cubic-bezier(0.22,0.61,0.36,1)' : 'none' }}>
        {/* Header hero — eyebrow tag (action), big exercise name, metadata.
            Lifts the current exercise out of the page header and into a
            scannable hierarchy: WHAT you're replacing, in big type, with
            the relevant biomechanical context one click of glance away. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '13px 22px 9px', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.ac, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              {currentEx ? 'Change Exercise' : (fallbackTitle ? 'Link to Library' : 'Select Exercise')}
            </div>
            {(currentEx || fallbackTitle) && (
              <h3 style={{ margin: 0, fontFamily: FB, fontSize: 19, fontWeight: 700, color: C.tx, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          {/* Inline UNDERLINE filter rail — WRAPS to fit with SHORT labels so it
              packs into ~2 tight rows: no wasted space, no horizontal scroll, and
              max height left for the suggestion list below (Ohad). */}
          {/* Aligned 4-column GRID (4 + 3), every select the same width with a
              resting hairline underline — the old wrap-flex rail packed 7
              different-width selects into ragged rows ("parameters are a
              mess", Ohad). Underline = filter material (not a box); cyan
              when the filter is active. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px 14px', marginTop: 10 }}>
            {[['resistanceType', 'Resistance', RESISTANCE_TYPES], ['bodyPosition', 'Position', BODY_POSITIONS], ['movementType', 'Movement', MOVEMENT_TYPES], ['primaryJoints', 'Joints', optLists.primaryJoints], ['jointMovements', 'Joint Mvmt', optLists.jointMovements], ['primaryMuscles', 'Primary', optLists.primaryMuscles], ['secondaryMuscles', 'Secondary', optLists.secondaryMuscles]].map(([k, label, opts]) => (
              <select key={k} value={filters[k]} onChange={e => setF(k, e.target.value)} title={label}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'transparent', border: 'none', borderBottom: `1px solid ${filters[k] ? C.ac : C.cardBd}`, color: filters[k] ? C.ac : C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '5px 0', cursor: 'pointer', outline: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <option value="">{label}</option>{opts.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ))}
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
        {/* RICH COMPARE — pinned ABOVE the scrolling list so its top (names +
            Current/New headers + every sheet param) is always visible (Ohad: "i
            can't see the top comparison"). The result list scrolls below it. */}
        <div style={{ padding: '10px 22px 0', flexShrink: 0 }}>
          {/* Collapse toggle — reclaim the compare's height for the list (Ohad:
              "the bottom part doesn't have enough vertical space"). */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compareOpen ? 8 : 2 }}>
            <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: C.tm, textTransform: 'uppercase' }}>Compare</span>
            <button onClick={() => setCompareOpen(o => !o)} title={compareOpen ? 'Collapse the compare for more list room' : 'Show the compare'} style={{ background: 'transparent', border: 'none', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0 }}>{compareOpen ? 'Collapse' : 'Expand'} <span aria-hidden style={{ fontSize: 8, transform: compareOpen ? 'none' : 'rotate(180deg)' }}>▾</span></button>
          </div>
          {compareOpen && (() => {
            const cand = filt[activeIdx];
            const detail = (ex, label, base) => {
              const isNew = label === 'New';
              return (
                <div style={{ flex: 1, minWidth: 0, border: `1px solid ${isNew ? C.ac : C.cardBd}`, background: 'var(--c-sf)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ padding: '6px 10px', background: 'var(--c-sf2)', borderBottom: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: isNew ? C.ac : C.tm }}>{label}</div>
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Every block below has a FIXED height (title 2 lines,
                        one line per param, notes 38px) so hovering a different
                        candidate never changes the compare's height — a
                        taller/shorter compare shoved the list under the
                        cursor, which re-fired hover on another row (glitch). */}
                    <div title={ex ? ex.title : ''} style={{ fontFamily: FB, fontSize: 13, fontWeight: 700, color: ex ? C.tx : C.td, lineHeight: 1.15, height: 30, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{ex ? ex.title : 'Highlight an exercise →'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: '2px 8px' }}>
                      {PARAM_ROWS.map(([lab, k]) => {
                        const v = ex ? (ex[k] || '—') : '—';
                        const diff = isNew && base && ((base[k] || '') !== (ex?.[k] || '')) && (ex?.[k] || '');
                        return (
                          <React.Fragment key={k}>
                            <div style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.td, lineHeight: 1.2, paddingTop: 1 }}>{lab}</div>
                            <div title={v !== '—' ? v : undefined} style={{ fontFamily: FN, fontSize: 10, color: diff ? C.ac : C.tm, fontWeight: diff ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{v}</div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                    {/* Coaching Notes — the 8th sheet column; video shown as a small badge. */}
                    <div style={{ borderTop: `1px solid ${C.cardBd}`, paddingTop: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.td }}>Coaching Notes</span>
                        {ex?.videoLink && <span title="Has a demo video" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: FN, fontSize: 8, fontWeight: 700, color: C.ac, letterSpacing: '0.08em' }}><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>VIDEO</span>}
                      </div>
                      <div style={{ fontFamily: FB, fontSize: 10, color: ex?.cues ? C.tm : C.td, whiteSpace: 'pre-wrap', lineHeight: 1.35, height: 38, overflowY: 'auto' }}>{ex?.cues || '—'}</div>
                    </div>
                  </div>
                </div>
              );
            };
            return (
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  {currentEx && detail(currentEx, 'Current', null)}
                  {detail(cand, 'New', currentEx)}
                </div>
                {cand && <button onClick={() => pick(cand)} title="Replace with this exercise"
                  style={{ marginTop: 8, width: '100%', background: '#39BDFF', border: '1px solid #39BDFF', color: '#06131b', cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', padding: '9px 0', borderRadius: 0, textTransform: 'uppercase' }}>Use “{cand.title}” →</button>}
              </div>
            );
          })()}
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 22px 22px', marginTop: 8, borderTop: `1px solid ${C.cardBd}` }}>
          {/* "Add by name" / "Create in library" — offered whenever the coach
              has typed something, EVEN when there are matching suggestions
              (Ohad: the exact name they want may not be in the list). */}
          {(onPickName || onCreateLibrary) && search.trim() && (
            // Library-first (Ohad): the PRIMARY action creates a reusable library
            // exercise (better long-term data — it can gain a video + cues later);
            // the free-text "use once" path is a quiet secondary link for the rare
            // case where the coach deliberately doesn't want it saved.
            <div style={{ marginBottom: 12, padding: 14, border: `1px dashed ${C.cardBd}`, display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: C.td, fontFamily: FN, letterSpacing: '0.06em', textAlign: 'center' }}>NOT IN THE LIST?</span>
              {onCreateLibrary ? (
                <button onClick={() => { onCreateLibrary(search.trim()); onClose(); }} title="Create a reusable library exercise (edit details later in Exercises)"
                  style={{ background: '#39BDFF', border: '1px solid #39BDFF', color: '#FFFFFF', cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', padding: '9px 20px', borderRadius: 0 }}>
                  + ADD “{search.trim()}” TO LIBRARY
                </button>
              ) : onPickName && (
                <button onClick={pickName} title="Add by name only — no library link, notes, or video"
                  style={{ background: '#39BDFF', border: '1px solid #39BDFF', color: '#FFFFFF', cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', padding: '9px 20px', borderRadius: 0 }}>
                  + ADD “{search.trim()}” (THIS PROGRAM)
                </button>
              )}
              {onCreateLibrary && onPickName && (
                <button onClick={pickName} title="Add by name only — no library link, notes, or video; won't be reusable"
                  style={{ background: 'transparent', border: 'none', color: C.tm, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textDecoration: 'underline', textUnderlineOffset: 2, padding: 2 }}>
                  use once in this program only
                </button>
              )}
            </div>
          )}
          {filt.length === 0 ? (
            <div style={{ padding: 40, fontSize: 13, color: C.td, textAlign: 'center' }}>
              No exercises found. Try relaxing filters or the search term.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4 }}>
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
                      textAlign: 'left', padding: '7px 11px',
                      background: isSelected ? 'rgba(59,160,255,0.06)' : 'var(--c-sf)',
                      // Constant 1px border — only the COLOR changes on
                      // hover/active. A width swap re-flowed every row under
                      // the cursor and cascaded mouseenters (the glitch).
                      border: `1px solid ${isActive ? C.ac : C.cardBd}`,
                      borderLeft: isSelected ? `3px solid ${C.ac}` : `1px solid ${isActive ? C.ac : C.cardBd}`,
                      borderRadius: 0, cursor: 'pointer', fontFamily: FB, color: C.tx,
                      transition: 'all 0.1s', position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.tx, lineHeight: 1.25, flex: 1, overflowWrap: 'anywhere' }}>{ex.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                        {/* Media / notes indicators — show at a glance which library
                            exercises already have a demo video (cyan) and coaching
                            cues (orange), so the coach picks an informed one (Ohad). */}
                        {ex.videoLink && <span title="Has a demo video" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, fontFamily: FN, fontWeight: 700, color: C.ac, letterSpacing: '0.08em' }}><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>VIDEO</span>}
                        {ex.cues && <span title="Has coaching notes / cues" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, fontFamily: FN, fontWeight: 700, color: C.or, letterSpacing: '0.08em' }}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9"/></svg>NOTE</span>}
                        {isSelected && <span title="Currently linked exercise" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: 8, fontFamily: FN, fontWeight: 700, color: C.ac, letterSpacing: '0.18em', whiteSpace: 'nowrap', border: `1px solid ${C.ac}`, padding: '2px 5px' }}>CURRENT</span>}
                      </div>
                    </div>
                    {/* Compact single meta line — category · resistance · position ·
                        muscles, truncated. Halves the row height so ~2× more
                        exercises are scannable per screen (Ohad: picker felt
                        uncomfortable / a wall of dense rows). */}
                    {(subtitle(ex) || muscles(ex)) && <div style={{ fontSize: 10, color: C.tm, fontFamily: FN, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[subtitle(ex), muscles(ex)].filter(Boolean).join('  ·  ')}</div>}
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
// Create a reusable library exercise from a bare name and return its id (or
// null if the name is blank / no library setter is wired). Taxonomy is left
// blank for the coach to fill in later in the Exercises screen — same shape as
// createLibraryExercise, but it returns the id so the caller can link the row
// it was invoked from instead of appending a new one.
// OVERVIEW — every day and every exercise of a program on ONE screen.
//
// Ohad: "add overview where i can see all the days and exercises in one screen"
// / "make sure i can still see the entire screen". The editor stacks day cards
// vertically, so a 4-day block is a long scroll and you can never see the shape
// of the week at once. This is the read-at-a-glance view of the same data:
// days as columns that auto-fit the available width, exercises as compact rows.
//
// Deliberately NOT editable. It is for reading the shape of the block — the
// editor one click away is where you change things. Clicking a day jumps there.
function PlanOverview({ plan, exercises, onJumpToDay = null }) {
  const days = plan?.days || [];
  // One Map for the whole render. exercises.find() per row is the documented
  // way this screen gets slow with a 1,300-row library.
  const byId = useMemo(() => exById(exercises), [exercises]);
  const nameOf = (ex) => (ex?.title || byId.get(ex?.exerciseId)?.title || '—');
  // Plans carry two shapes; the editor writes {sets, reps} but older sheet
  // imports use {s, r}. Read both or half the block renders blank.
  const rxOf = (ex) => {
    const s = ex?.sets ?? ex?.s ?? '';
    const r = ex?.reps ?? ex?.r ?? '';
    if (s !== '' && r !== '') return `${s}×${r}`;
    return String(s || r || '');
  };
  const warm = plan?.warmup || plan?.warmUp || [];

  const card = (key, heading, count, rows, onClick) => (
    <div key={key} style={{ border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        onClick={onClick || undefined}
        title={onClick ? 'Open this day in the editor' : undefined}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${C.cardBd}`, borderLeft: `2px solid ${C.ac}`, cursor: onClick ? 'pointer' : 'default' }}>
        <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heading}</span>
        <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, flexShrink: 0 }}>{count}</span>
      </div>
      <div style={{ padding: '4px 0' }}>
        {rows.length === 0
          ? <div style={{ padding: '8px 10px', fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.06em' }}>EMPTY</div>
          : rows}
      </div>
    </div>
  );

  const exRow = (ex, i) => {
    const sc = supersetColor(ex?.superset);
    const rx = rxOf(ex);
    return (
      <div key={ex?.id || i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '3px 10px', minWidth: 0 }}>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, width: 15, flexShrink: 0, textAlign: 'right' }}>{i + 1}</span>
        {/* Superset letter keeps its group colour, so the pairing is readable
            here exactly as it is in the editor's GRP column. */}
        {ex?.superset ? <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: sc, flexShrink: 0 }}>{ex.superset}</span> : null}
        <span style={{ fontSize: 12, color: C.tx, lineHeight: 1.3, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{nameOf(ex)}</span>
        {rx ? <span style={{ fontFamily: FN, fontSize: 10, color: C.tm, flexShrink: 0, whiteSpace: 'nowrap' }}>{rx}</span> : null}
      </div>
    );
  };

  return (
    // auto-fit + minmax is what makes "one screen" hold for 2 days or 7: the
    // columns share the width they are given rather than each demanding a fixed
    // size and pushing the last day off the edge.
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, alignItems: 'start', marginBottom: 16 }}>
      {warm.length > 0 && card('warmup', 'Warm-up', `${warm.length} EX`, warm.map((w, i) => exRow({ ...w, title: w.t || w.title, id: w.id || `w${i}` }, i)), null)}
      {days.map((d, i) => card(
        d.id || `d${i}`,
        d.name || d.title || `Day ${i + 1}`,
        `${(d.exercises || d.ex || []).length} EX`,
        (d.exercises || d.ex || []).map(exRow),
        onJumpToDay ? () => onJumpToDay(i) : null,
      ))}
    </div>
  );
}

function addLibExercise(setExercises, name) {
  const t = (name || '').trim();
  if (!t || !setExercises) return null;
  const lib = newLibExercise({ title: t });
  setExercises(prev => [...(prev || []), lib]);
  return lib.id;
}

// onCreateLibrary(name) — optional: create a real library exercise AND link this
// row to it (vs onPickName which adds free text for this program only). When
// wired, the picker's modal shows a "+ CREATE … IN LIBRARY" button.
function ExPicker({ exercises, value, onChange, onPickName, onCreateLibrary, label, fallbackTitle }) {
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
        onCreateLibrary={onCreateLibrary ? (name => { onCreateLibrary(name); setModalOpen(false); }) : undefined}
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

// Push-to-library controls for a WARM-UP row. Warm-ups carry a flat
// {t, vid, note, exerciseId} shape (no 3-state override), so this mirrors the
// day-exercise ExEditorExtras library buttons against those fields — SAME
// markup/styles so both editors read identically (Ohad: OCD consistency).
function WarmupLibraryControls({ w, onLink, exercises, setExercises }) {
  const [libConfirm, setLibConfirm] = useState(null); // 'update' | 'new' | null
  const libEnabled = typeof setExercises === 'function' && Array.isArray(exercises);
  const title = (w.t || '').trim();
  const vid = w.vid || '';
  const note = w.note || '';
  if (!libEnabled || !(title || vid || note)) return null;
  const exData = w.exerciseId ? exById(exercises).get(w.exerciseId) : null;
  // Link target: the linked library exercise, or an exact (case-insensitive)
  // title match for a free-text warm-up.
  const libTarget = exData || (title ? (exByTitle(exercises).get(title.toLowerCase()) || null) : null);
  const norm = (s) => (s || '').trim();
  const libDirty = !!libTarget && (
    norm(title) !== norm(libTarget.title) ||
    norm(vid) !== norm(libTarget.videoLink) ||
    norm(note) !== norm(libTarget.cues)
  );
  const canUpdateLib = !!libTarget && libDirty;
  const canSaveNew = !libTarget || libDirty;
  const doUpdateLib = () => {
    if (!libTarget) return;
    setExercises(prev => prev.map(e => e.id === libTarget.id
      ? { ...e, title: title || e.title, videoLink: vid, cues: note } : e));
    onLink({ exerciseId: libTarget.id, t: title || libTarget.title });
    toast('Exercise database updated');
    setLibConfirm(null);
  };
  const doSaveNew = () => {
    const created = newLibExercise({ title, videoLink: vid, cues: note });
    setExercises(prev => [...prev, created]);
    onLink({ exerciseId: created.id, t: title });
    toast('Saved as a new exercise');
    setLibConfirm(null);
  };
  return (
    <>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end',alignItems:'center',paddingTop:12,marginTop:2,borderTop:`1px solid ${C.cardBd}`}}>
        <span style={{fontSize:9,fontFamily:FN,fontWeight:700,color:C.td,letterSpacing:'0.09em',marginRight:'auto'}}>EXERCISE DATABASE</span>
        <button onClick={()=>setLibConfirm('update')} disabled={!canUpdateLib}
          title={!libTarget ? 'No matching library exercise to update — use “Save new exercise”.'
            : canUpdateLib ? `Overwrite "${libTarget.title}" in the exercise database with this warm-up's name, video and notes.`
            : 'This warm-up matches the library — nothing to update. Edit the name, video or notes first.'}
          style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:5,background:'transparent',border:`1px solid ${canUpdateLib?C.ac:C.cardBd}`,color:canUpdateLib?C.ac:C.td,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',padding:'6px 12px',cursor:canUpdateLib?'pointer':'not-allowed',opacity:canUpdateLib?1:0.5,borderRadius:0,textTransform:'uppercase'}}><span aria-hidden="true" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:9,height:9,fontSize:9,lineHeight:1}}>↑</span><span>Update the exercise database</span></button>
        <button onClick={()=>setLibConfirm('new')} disabled={!canSaveNew}
          title={canSaveNew
            ? 'Create a brand-new exercise in the database from this warm-up, and link this row to it.'
            : 'This warm-up already matches a library exercise — nothing new to save. Edit the name, video or notes first.'}
          style={{background:'transparent',border:`1px solid ${canSaveNew?C.gn:C.cardBd}`,color:canSaveNew?C.gn:C.td,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',padding:'6px 12px',cursor:canSaveNew?'pointer':'not-allowed',opacity:canSaveNew?1:0.5,borderRadius:0,textTransform:'uppercase'}}>+ Save new exercise</button>
      </div>
      <ConfirmDialog
        open={libConfirm === 'update'}
        onCancel={()=>setLibConfirm(null)}
        onConfirm={doUpdateLib}
        title="Update the exercise database?"
        message={libTarget ? `This overwrites "${libTarget.title}" in the exercise library — its video and notes change for EVERY program that uses it, not just this one. Continue?` : ''} />
      <ConfirmDialog
        open={libConfirm === 'new'}
        onCancel={()=>setLibConfirm(null)}
        onConfirm={doSaveNew}
        title="Save a new exercise?"
        message={`This adds "${title || 'Untitled'}" to the exercise database as a new entry and links this row to it. Continue?`} />
    </>
  );
}

function WarmupEditor({ plan, setPlan, compact = false, exercises = [], setExercises = null, onCopyWarmup = null }) {
  const warmup = Array.isArray(plan.warmup) ? plan.warmup : [];
  // Collapsed by default whenever there's content, so the warm-up doesn't
  // dominate the editor when the coach is iterating on the main exercise
  // list. Empty programs default to expanded so the "+ Add Warm-Up" button
  // is one click away (otherwise a coach would have to expand the empty
  // card just to discover the add control).
  // Starts OPEN — the warm-up list is part of the program's default "first
  // open" look (Ohad, 08-22): warm-up visible, days visible, rows compact.
  const [open, setOpen] = useState(true);
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
  const tinyInput = { ...baseInput, background: 'color-mix(in srgb, var(--c-sf2) 85%, #ffffff)', padding: '3px 6px', fontSize: 11, minWidth: 0, width: '100%', height: 24, boxSizing: 'border-box' };
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
          // Mirror the DAY card header cluster EXACTLY (Ohad: "the buttons
          // should be the same as in the day a card"): EXPAND ALL first
          // (marginLeft:auto pushes the cluster right — warm-ups have no DAILY
          // toggle to hold that slot), then the ⤴ copy + invisible × spacer as
          // one icon pair, same 28×24 boxes and same height:24/padding:0 as the
          // day card. Previously ⤴ sat BEFORE EXPAND ALL and EXPAND ALL used
          // padding:'3px 0' instead of height:24 — different order AND height.
          return <>
          <button onClick={() => {
            if (!anyOpen && !open) setOpen(true);
            setWuExpanded(prev => { const next = { ...prev }; warmup.forEach((_, i) => { if (anyOpen) delete next[i]; else next[i] = true; }); return next; });
          }}
            title={anyOpen ? 'Collapse all warm-ups' : 'Expand all warm-ups to edit fully'}
            style={{ marginLeft:'auto', background:'var(--c-sf)', border:`1px solid ${C.ac}`, borderRadius:0, height:24, padding:0, color:C.ac, cursor:'pointer', fontFamily:FN, fontSize:10, fontWeight:700, letterSpacing:'0.09em', whiteSpace:'nowrap', width:142, flexShrink:0, boxSizing:'border-box', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
            <span aria-hidden style={{ display:'inline-block', transform:anyOpen?'rotate(180deg)':'none', transition:'transform 180ms ease', lineHeight:1 }}>▾</span>
            {/* marginRight cancels the trailing letter-space (letterSpacing
                adds 0.14em AFTER the last glyph too), so the arrow+text group
                optically centres in the box instead of sitting ~1.4px left. */}
            <span style={{ marginRight:'-0.14em' }}>{anyOpen ? 'COLLAPSE ALL' : 'EXPAND ALL'}</span>
          </button>
          {/* ⤴ copy + hidden × spacer = the same icon-pair cluster the day
              cards use, so the warm-up right edge lines up column-for-column.
              Warm-up has no delete, so the × slot is a hidden 28×24 box (not a
              text spacer) — identical geometry to the day card's × button. */}
          <div style={{ display:'inline-flex', gap:4, flexShrink:0, alignItems:'center' }}>
            {onCopyWarmup && <button onClick={(e)=>{ e.stopPropagation(); onCopyWarmup(); }} title="Copy this warm-up to another program" aria-label="Copy warm-up to another program"
              style={{ width:28, height:24, boxSizing:'border-box', background:'var(--c-sf)', border:`1px solid ${C.ac}`, borderRadius:0, color:C.ac, cursor:'pointer', fontSize:12, lineHeight:1, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:0 }}>⤴</button>}
            <span aria-hidden style={{ width:28, height:24, boxSizing:'border-box', visibility:'hidden', flexShrink:0 }}>×</span>
          </div>
          </>;
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, height: 24, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><TrashIcon size={15} /></button>
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
                            onChange={id => { if (id === w.exerciseId) return; const lib = exById(exercises).get(id); update(i, { exerciseId: id, t: lib?.title || '', vid: lib?.videoLink || '', note: lib?.cues || '' }); }}
                            onPickName={name => update(i, { exerciseId: '', t: name })}
                            onCreateLibrary={setExercises ? (name => { const id = addLibExercise(setExercises, name); if (id) update(i, { exerciseId: id, t: name }); }) : undefined} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: 'uppercase', fontFamily: FN }}>Video</label>
                          <Input value={w.vid || ''} onChange={e => update(i, { vid: e.target.value })}
                            onBlur={async e => { const original = e.target.value; const resolved = await maybeResolveGooglePhotos(original); if (resolved !== original) setPlan(p => { const cur = (p.warmup || [])[i]; if (!cur || (cur.vid ?? '') !== original) return p; return { ...p, warmup: p.warmup.map((w2, j) => j === i ? { ...w2, vid: resolved } : w2) }; }); }}
                            placeholder="Video URL" />
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
                      <WarmupLibraryControls w={w} onLink={patch => update(i, patch)} exercises={exercises} setExercises={setExercises} />
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
function ReadOnlyPlanPanel({ planIndex, currentPlan, exercises, trainees, onClose, overview = false }) {
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
      .sort(sortProgramsByBlockDesc); // block# desc — see traineeUtils
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
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:12,marginBottom:20,position:'relative',flexShrink:0,paddingRight:cmpSbInset+6,alignItems:'stretch'}}>
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
        {/* Close = its OWN grid column, level with the two select boxes (same
            BOX height), not absolutely parked over the label row where it
            overlapped "PROGRAM FILTER" (Ohad). Ghost square, cardBd border. */}
        <div style={{display:'flex', flexDirection:'column', gap:4}}>
          {/* Spacer label = same type as Select's label so the button's top
              lines up with the select BOXES, its bottom with their bottoms. */}
          <span aria-hidden style={{fontSize:9, fontWeight:700, letterSpacing:'0.18em', fontFamily:FN, textTransform:'uppercase'}}>&nbsp;</span>
          <button onClick={onClose} title="Close compare panel" aria-label="Close compare panel"
            style={{flex:1, width:36, boxSizing:'border-box', background:'var(--c-sf)', border:`1px solid ${C.cardBd}`, color:C.tm, cursor:'pointer', padding:0, borderRadius:0, fontSize:13, lineHeight:1, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>✕</button>
        </div>
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
      ) : overview ? (
        // Overview applies to BOTH halves (Ohad: "when i use overview, i can
        // also use compare — overview mode in both"). Comparing two blocks is
        // exactly when you want each one condensed to its shape, side by side.
        <>
          <PatternCoverage plan={cmpPlan} exercises={exercises} cols={3} />
          <PlanOverview plan={cmpPlan} exercises={exercises} />
        </>
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
                            <div style={{fontFamily:FN, fontSize:11, color:C.tx, fontWeight:700, textAlign:'center'}}>{i + 1}</div>
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
                    <div onClick={e => { if (e.target === e.currentTarget) toggleCmpDay(cmpDayKey); }}
                      style={{display:'flex',alignItems:'center',marginBottom:cmpCollapsed?0:8,gap:10,position:'sticky',top:0,zIndex:3,background:'var(--c-sf)',paddingTop:4,marginTop:-4,paddingBottom:cmpCollapsed?0:8,borderBottom:cmpCollapsed?'none':`1px solid ${C.cardBd}`}}>
                      <span role="button" tabIndex={0} onClick={()=>toggleCmpDay(cmpDayKey)} onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleCmpDay(cmpDayKey); } }} title={cmpCollapsed?'Expand day':'Collapse day'} style={{cursor:'pointer',color:C.tm,fontSize:12,lineHeight:1,userSelect:'none'}}>{cmpCollapsed?'▸':'▾'}</span>
                      <input value={d.name || `Day ${di + 1}`} readOnly tabIndex={-1}
                        style={{...baseInput, fontFamily:FB, fontWeight:700, fontSize:14, color:C.tx, padding:'4px 8px', maxWidth:260, cursor:'default'}} />
                      <span style={{color:C.td,fontSize:12,whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',lineHeight:1,alignSelf:'center'}}>({dayExs.length} ex)</span>
                      {/* Empty header space = click target to expand/collapse (mirrors editor). */}
                      <div onClick={()=>toggleCmpDay(cmpDayKey)} aria-hidden title={cmpCollapsed?'Expand day':'Collapse day'} style={{flex:'1 1 0',minWidth:0,alignSelf:'stretch',minHeight:24,cursor:'pointer'}} />
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
                        <div style={{display:'grid',gridTemplateColumns:'30px minmax(0,3.3fr) 44px minmax(0,0.9fr) minmax(0,1.4fr) minmax(0,1.3fr) minmax(0,0.9fr) minmax(0,60px)',gap:'3px 8px',fontSize:12,alignItems:'center',minWidth:Math.max(592,518+(cmpPlan.weeks||4)*40)}}>
                          {['#','EXERCISE','GRP','SETS','REPS','TEMPO','LOAD','RPE'].map((h,hi) =>
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
                            const sc = supersetColor(pe.superset);
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
                                <span style={{color:C.tx, fontFamily:FN, fontWeight:700, fontSize:12}}>{ei + 1}</span>
                              </div>
                              <div title={title} onClick={()=>toggleCmpEx(exKey)}
                                role="button" tabIndex={0} aria-expanded={exOpen}
                                onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleCmpEx(exKey); } }}
                                style={{color:C.tx, minWidth:0, overflowWrap:'break-word', wordBreak:'normal', borderLeft:`3px solid ${pe.superset?sc:'transparent'}`, paddingLeft:6, cursor:'pointer', display:'flex', alignItems:'center', gap:6}}>
                                <span style={{color:C.ac, fontSize:11, fontWeight:700, lineHeight:1, flexShrink:0, transform:exOpen?'none':'rotate(-90deg)', transition:'transform 150ms ease'}}>▾</span>
                                <span style={{overflowWrap:'break-word', wordBreak:'normal'}}>{title}</span>
                              </div>
                              <input value={pe.superset || ''} readOnly tabIndex={-1}
                                style={{...tinyInputRO, background: pe.superset ? `color-mix(in srgb, ${sc} 20%, var(--c-sf))` : undefined, border: pe.superset ? `1px solid ${sc}` : tinyInputRO.border, color: pe.superset ? C.tx : C.td, fontFamily:FN, fontWeight: pe.superset ? 800 : 600, textAlign:'center'}} />
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
                              <input value={pe.tempo || ''} readOnly tabIndex={-1} style={tinyInputRO} />
                              <input value={pe.load || ''} readOnly tabIndex={-1} style={tinyInputRO} />
                              <input value={pe.rpe || ''} readOnly tabIndex={-1} style={tinyInputRO} />
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

// Whole-DAY drag image — clones just the day card's HEADER row (name, count,
// toggles), not the full card: the cards collapse during the drag, so a
// header-sized ghost matches what the cursor is actually moving. Must run
// synchronously inside dragstart. Cosmetic only — never throws.
function setDayDragImage(e, cardEl) {
  try {
    if (!cardEl) return;
    const headerEl = cardEl.querySelector('[data-dayheader]');
    if (!headerEl) return;
    const ghost = headerEl.cloneNode(true);
    // cloneNode copies attributes, not the live value React set on the
    // property — sync the day-name input so the ghost shows the real name.
    const src = [...headerEl.querySelectorAll('input,select,textarea')];
    const dst = [...ghost.querySelectorAll('input,select,textarea')];
    src.forEach((s, j) => { if (dst[j]) dst[j].value = s.value; });
    ghost.style.margin = '0';
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:absolute;top:-10000px;left:0;pointer-events:none;box-sizing:border-box;opacity:0.95;padding:10px 12px;border:1px solid ${C.ac};background:var(--c-sf);`;
    wrap.style.width = cardEl.getBoundingClientRect().width + 'px';
    wrap.appendChild(ghost);
    document.body.appendChild(wrap);
    e.dataTransfer.setDragImage(wrap, 24, wrap.getBoundingClientRect().height / 2);
    setTimeout(() => wrap.remove(), 0);
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

// Build a full-shape exercise-library row (every field the ExercisesView form
// knows about) from a name/video/cues triple, so a "Save new exercise" from the
// plan editor produces a library entry indistinguishable from one added in the
// Exercise Database screen. Only name/video/cues carry over — taxonomy is left
// blank for the coach to fill in later in the library.
function newLibExercise({ title, videoLink, cues }) {
  return { id: uid(), title: title || '', category: '', resistanceType: '', bodyPosition: '', movementType: '', laterality: '', movementPattern: '', primaryMuscles: '', secondaryMuscles: '', primaryJoints: '', jointMovements: '', videoLink: videoLink || '', cues: cues || '', notes: '' };
}

// Full per-exercise detail editor (badges + 3-state library-cues notes +
// 3-state video override). Shared by the unified overview's inline-expand
// panel so it has EVERY feature the old detail card had. `update(patch)`
// abstracts the day/exercise write so either view can drive it.
// `exercises`/`setExercises` (when passed) enable the two library-write buttons
// so the coach can push this row's edits back to the Exercise Database.
function ExEditorExtras({ ex, exData, exTitle, update, onResolveVideo = null, showEmbed = true, picker = null, exercises = null, setExercises = null }) {
  const libCues = exData?.cues || '';
  const hasNoteOverride = !!ex.notesEdited || !!(ex.notes && ex.notes.length > 0);
  const noteValue = hasNoteOverride ? (ex.notes || '') : libCues;
  const isFallback = !hasNoteOverride && libCues;
  const libUrl = exData?.videoLink || '';
  const hasVidOverride = ex.videoUrl !== undefined;
  const vidValue = hasVidOverride ? (ex.videoUrl || '') : libUrl;

  // ── Push-to-library controls ─────────────────────────────────────────────
  // Only render when the parent wired the library setter (the plan editor does).
  const libEnabled = typeof setExercises === 'function' && Array.isArray(exercises);
  // "Update" needs a target: the exercise this row is linked to (exData), or —
  // for a free-text row — an exact (case-insensitive) title match in the library.
  const libTarget = libEnabled
    ? (exData || (exTitle ? (exByTitle(exercises).get(exTitle.trim().toLowerCase()) || null) : null))
    : null;
  // "Update" is only a real action when the card actually DIFFERS from the
  // library target — with no diff the push is a no-op, so the button must
  // not sit highlighted (Ohad: don't light it while the textbox still shows
  // the untouched library text). Compare against the TARGET's fields, not
  // libCues/libUrl — a free-text row can match a library entry by title,
  // and there exData is null so libCues/libUrl are ''.
  const norm = (s) => (s || '').trim();
  const libDirty = !!libTarget && (
    norm(exTitle) !== norm(libTarget.title) ||
    norm(vidValue) !== norm(libTarget.videoLink) ||
    norm(noteValue) !== norm(libTarget.cues)
  );
  const canUpdateLib = !!libTarget && libDirty;
  // "Save new exercise" only makes sense when there's something new to save:
  // either the row has NO library match (a genuinely new exercise), or it
  // matches one but the coach CHANGED the title/video/notes (forking a new
  // entry). A library-matched, untouched row would just duplicate the
  // identical library entry — so dim + disable it (Ohad).
  const canSaveNew = !libTarget || libDirty;
  const [libConfirm, setLibConfirm] = useState(null); // 'update' | 'new' | null

  // Overwrite the target library exercise with this card's name/video/cues, link
  // the row to it, and drop the per-program overrides so the row now inherits the
  // (freshly-updated) library values — one source of truth again.
  const doUpdateLib = () => {
    if (!libTarget) return;
    setExercises(prev => prev.map(e => e.id === libTarget.id
      ? { ...e, title: exTitle || e.title, videoLink: vidValue, cues: noteValue } : e));
    update({ exerciseId: libTarget.id, videoUrl: undefined, notes: '', notesEdited: false });
    toast('Exercise database updated');
    setLibConfirm(null);
  };
  // Create a brand-new library exercise from this card and link the row to it.
  const doSaveNew = () => {
    const created = newLibExercise({ title: exTitle, videoLink: vidValue, cues: noteValue });
    setExercises(prev => [...prev, created]);
    update({ exerciseId: created.id, title: exTitle, videoUrl: undefined, notes: '', notesEdited: false });
    toast('Saved as a new exercise');
    setLibConfirm(null);
  };

  return (
    <>
      {(exData && (exData.movementPattern || exData.laterality || exData.primaryMuscles)) ? <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
        {exData.movementPattern && <Badge color={C.gn}>{exData.movementPattern}</Badge>}
        {exData.laterality && <Badge color={C.tm}>{exData.laterality}</Badge>}
        {exData.primaryMuscles && <span style={{fontSize:11,color:C.td}}>{exData.primaryMuscles}</span>}
      </div> : null}{/* the redundant orange "📝 {title}" line was removed — the
          name already shows in the row header and the EXERCISE picker below */}
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
              onBlur={async e => { const original = e.target.value; const resolved = await maybeResolveGooglePhotos(original); if (resolved !== original) { if (onResolveVideo) onResolveVideo(original, resolved); else update({ videoUrl: resolved }); } }}
              placeholder="Video URL" />
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
      {/* Push-to-library controls — commit this card's name/video/notes back to
          the Exercise Database. Both actions require an explicit confirm so an
          edit made for one program can't silently rewrite the shared library. */}
      {libEnabled && (exTitle || vidValue || noteValue) ? (
        <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end',alignItems:'center',paddingTop:12,marginTop:2,borderTop:`1px solid ${C.cardBd}`}}>
          <span style={{fontSize:9,fontFamily:FN,fontWeight:700,color:C.td,letterSpacing:'0.09em',marginRight:'auto'}}>EXERCISE DATABASE</span>
          <button onClick={()=>setLibConfirm('update')} disabled={!canUpdateLib}
            title={!libTarget ? 'No matching library exercise to update — use “Save new exercise”.'
              : canUpdateLib ? `Overwrite "${libTarget.title}" in the exercise database with this card's name, video and notes.`
              : 'This card matches the library — nothing to update. Edit the name, video or notes first.'}
            style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:5,background:'transparent',border:`1px solid ${canUpdateLib?C.ac:C.cardBd}`,color:canUpdateLib?C.ac:C.td,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',padding:'6px 12px',cursor:canUpdateLib?'pointer':'not-allowed',opacity:canUpdateLib?1:0.5,borderRadius:0,textTransform:'uppercase'}}><span aria-hidden="true" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:9,height:9,fontSize:9,lineHeight:1}}>↑</span><span>Update the exercise database</span></button>
          <button onClick={()=>setLibConfirm('new')} disabled={!canSaveNew}
            title={canSaveNew
              ? 'Create a brand-new exercise in the database from this card, and link this row to it.'
              : 'This card already matches a library exercise — nothing new to save. Edit the name, video or notes first.'}
            style={{background:'transparent',border:`1px solid ${canSaveNew?C.gn:C.cardBd}`,color:canSaveNew?C.gn:C.td,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',padding:'6px 12px',cursor:canSaveNew?'pointer':'not-allowed',opacity:canSaveNew?1:0.5,borderRadius:0,textTransform:'uppercase'}}>+ Save new exercise</button>
        </div>
      ) : null}
      <ConfirmDialog
        open={libConfirm === 'update'}
        onCancel={()=>setLibConfirm(null)}
        onConfirm={doUpdateLib}
        title="Update the exercise database?"
        message={libTarget ? `This overwrites "${libTarget.title}" in the exercise library — its video and notes change for EVERY program that uses it, not just this one. Continue?` : ''} />
      <ConfirmDialog
        open={libConfirm === 'new'}
        onCancel={()=>setLibConfirm(null)}
        onConfirm={doSaveNew}
        title="Save a new exercise?"
        message={`This adds "${exTitle || 'Untitled'}" to the exercise database as a new entry and links this row to it. Continue?`} />
    </>
  );
}

// Editor secondary-toolbar overflow menu. Mirrors App.jsx's MoreMenu popover
// (fixed-positioned + top-layer so the sticky editor header can't clip it,
// outside-click / Escape to close). Collapses the editor's secondary actions
// (Compare · History · Share · Duplicate · New Program) behind one "⋯ MORE"
// button so the toolbar reads as PORTAL · MORE · SHOW ONLY · DELETE instead of
// a wall of eight buttons (Ohad). Items: {key,label,icon,onClick,active?,badge?}.
function EditorMoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const recalc = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuW = 220;
      // Clamp inside the viewport so the fixed popover never pushes past the
      // right edge on a phone (which would give the document a horizontal
      // scrollbar) or off the left edge.
      let left = r.left;
      if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
      if (left < 8) left = 8;
      setCoords({ top: r.bottom + 4, left });
    };
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => { window.removeEventListener('resize', recalc); window.removeEventListener('scroll', recalc, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!e.target.closest?.('[data-editor-more]')) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!items.length) return null;
  const anyActive = items.some(it => it.active);
  return (
    <div data-editor-more style={{ display: 'inline-flex' }}>
      <button ref={btnRef} onClick={() => setOpen(o => !o)}
        title="More program actions" aria-label="More program actions" aria-haspopup="menu" aria-expanded={open}
        style={{ background: (open || anyActive) ? `${C.ac}1f` : (isRefined5b() ? 'transparent' : 'var(--c-sf)'), border: `1px solid ${C.ac}`, borderRadius: 0, height: 38, padding: '0 13px', lineHeight: '38px', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
        MORE
      </button>
      {open && createPortal((
        <div data-editor-more role="menu" style={{ position: 'fixed', top: coords.top, left: coords.left, background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, minWidth: 220, zIndex: 100000, boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
          {items.map((it, idx) => (
            <button key={it.key} role="menuitem" className={!it.active ? 'nav-item-inactive' : undefined} onClick={() => { setOpen(false); it.onClick(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: it.active ? `${C.ac}1f` : 'transparent', color: it.active ? C.ac : C.tx, border: 'none', borderBottom: idx < items.length - 1 ? `1px solid ${C.cardBd}` : 'none', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', color: it.active ? C.ac : C.tm, flexShrink: 0 }}>{it.icon}</span>
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.badge ? <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.ac, opacity: 0.7 }}>{it.badge}</span> : null}
            </button>
          ))}
        </div>
      ), document.body)}
    </div>
  );
}

function PlanEditor({ plan: init, onSave, onCancel, onSwitchProgram, trainees, exercises, setExercises, planIndex, onPreviewPlan, onDelete, onNewProgramFor, onShare, onDuplicate, onCopyDays, onCopyWarmup, clientWorkouts, portalVis, setPortalVis, editorApiRef }) {
  const [plan, setPlan] = useState(init);
  // Always-latest plan (setPlan makes new objects on every edit), so handleSave
  // can tell whether an edit landed DURING its await before declaring clean.
  const planRef = useRef(plan); planRef.current = plan;

  // ── Undo / redo (Ohad) ───────────────────────────────────────────────────
  // Coarse per-pause history: a debounced snapshot coalesces rapid edits (e.g.
  // typing) into one step. Undo/redo restore a full plan snapshot. `applying`
  // guards the effect from re-recording an undo/redo as a new edit.
  const histRef = useRef({ stack: [JSON.stringify(init)], idx: 0, applying: false, t: null });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  useEffect(() => {
    const u = histRef.current;
    if (u.applying) { u.applying = false; return; }
    if (u.t) clearTimeout(u.t);
    u.t = setTimeout(() => {
      const snap = JSON.stringify(planRef.current);
      if (snap === u.stack[u.idx]) return;
      u.stack = u.stack.slice(0, u.idx + 1);
      u.stack.push(snap);
      if (u.stack.length > 60) u.stack.shift();
      u.idx = u.stack.length - 1;
      setCanUndo(u.idx > 0); setCanRedo(false);
    }, 350);
    return () => { if (u.t) clearTimeout(u.t); };
  }, [plan]);
  const doUndo = () => {
    const u = histRef.current;
    if (u.t) { clearTimeout(u.t); u.t = null; const snap = JSON.stringify(planRef.current); if (snap !== u.stack[u.idx]) { u.stack = u.stack.slice(0, u.idx + 1); u.stack.push(snap); u.idx = u.stack.length - 1; } }
    if (u.idx <= 0) return;
    u.idx--; u.applying = true; setPlan(JSON.parse(u.stack[u.idx]));
    setCanUndo(u.idx > 0); setCanRedo(true);
  };
  const doRedo = () => {
    const u = histRef.current;
    if (u.idx >= u.stack.length - 1) return;
    u.idx++; u.applying = true; setPlan(JSON.parse(u.stack[u.idx]));
    setCanRedo(u.idx < u.stack.length - 1); setCanUndo(true);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Don't hijack native per-field text undo — only drive the plan-level
      // history when focus is OUTSIDE an editable control (Ohad's editor is full
      // of inputs where Ctrl+Z must still undo typing).
      const t = e.target;
      const tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // no deps: closures read refs/latest state each render
  const [activeDay, setActiveDay] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [confirmDeleteDay, setConfirmDeleteDay] = useState(null); // dayIdx pending delete-confirm
  const [confirmDeleteEx, setConfirmDeleteEx] = useState(null); // { dayIdx, exIdx, title } pending exercise delete-confirm
  // Copy-day flow: null | { dayIdxs:Set<number> } — the picker that copies the
  // chosen day(s) into another program (existing or new) as new bottom days.
  const [copyDaysModal, setCopyDaysModal] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false); // logged-workouts panel for THIS block
  // Logged workouts for THIS block: prefer an exact planId link, else fall back
  // to same-athlete + same block-name (older sessions predate planId). Newest
  // first. clientId carries the couples sub-id, matching plan.traineeId.
  const blockWorkouts = useMemo(() => {
    const pid = plan?.id, ptid = plan?.traineeId, pname = (plan?.name || '').trim();
    return (clientWorkouts || []).filter(w =>
      (w.planId && pid && w.planId === pid) ||
      (w.clientId === ptid && (w.planName || '').trim() === pname)
    ).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  }, [clientWorkouts, plan?.id, plan?.traineeId, plan?.name]);
  const [collapsedDays, setCollapsedDays] = usePersistentState('plan-collapsed-days', {}); // overview day cards collapse
  const toggleDayCollapse = (id) => setCollapsedDays(prev => ({ ...prev, [id]: !prev[id] }));
  // Unified view: expand an OVERVIEW row inline to its full detail (swap +
  // notes + video) — combines overview + detail in one place.
  const [ovExpanded, setOvExpanded] = usePersistentState('plan-ov-expanded', {});
  // DEFAULT "FIRST OPEN" LOOK (Ohad, 08-22 — supersedes the older "every day
  // collapsed" rule): every day card OPEN, every exercise row COMPACT (no
  // inline detail), warm-up list open. Both maps are persisted across
  // programs, so without this reset a row expanded yesterday would reopen
  // expanded today. The editor is keyed on plan.id (remounts per program),
  // so this runs once per open.
  const openInitRef = useRef(false);
  useEffect(() => {
    if (openInitRef.current) return;
    openInitRef.current = true;
    setCollapsedDays({});
    setOvExpanded({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);
  const toggleOvExpand = (id) => setOvExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  // Compare mode: side-by-side 50/50 split with a read-only view of a
  // previous program (same athlete). (The old overview/detail toggle is
  // gone — the unified overview is the only view, so compareActive is
  // simply compareOpen.)
  const [compareOpen, setCompareOpen] = useState(false);
  // OVERVIEW: the whole block — every day, every exercise — on one screen.
  // Persisted, because it is a way of working rather than a peek: a coach who
  // reads blocks this way wants it still on when the next program opens.
  const [overviewOpen, setOverviewOpen] = usePersistentState('expo-plan-overview', false);
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
  // True whenever an exercise row is in flight, regardless of which day it
  // came from. Cross-day drag needs this: the drop target may be a DIFFERENT
  // day's grid than the source, so every grid must accept dragover/drop while
  // a drag is live — not just the source day (which is what per-day `dragging`
  // scopes to). Also drives the "all cards render collapsed during drag" so the
  // insertion gap reads cleanly in whichever day the cursor is over.
  const anyExDragging = dragSrc != null;
  // Whole-DAY drag-to-reorder — separate state from the exercise-row drag so
  // the two gestures can't cross-fire (exercise drag events bubble up to the
  // days column, which ignores them unless a day drag is live, and vice
  // versa). Same visual grammar as the row drag: dim the source, absolute
  // insertion bar gliding between slots.
  const [dayDragSrc, setDayDragSrc] = useState(null);   // dayIdx picked up
  const [dayDragOver, setDayDragOver] = useState(null); // {gap, y} target slot in the days column
  const dayDragging = dayDragSrc != null;
  const reorderDay = (from, to) => {
    setPlan(p => {
      const days = [...p.days];
      if (from < 0 || from >= days.length || to < 0 || to >= days.length || from === to) return p;
      const [moved] = days.splice(from, 1);
      days.splice(to, 0, moved);
      return { ...p, days };
    });
    // Keep the add-exercise target pointing at the same day it did before.
    setActiveDay(a => a === from ? to : (from < a && to >= a ? a - 1 : (from > a && to <= a ? a + 1 : a)));
  };
  // Drop zone = the whole days column. Gap picked by comparing the cursor
  // against each day card's vertical centre (same approach as the exercise
  // grid — see onGridDragOver below for the rationale).
  const onDaysDragOver = (e) => {
    if (!dayDragging) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const cards = [...e.currentTarget.querySelectorAll('[data-daycard]')];
    let gap = cards.length;
    for (let i = 0; i < cards.length; i++) { const r = cards[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { gap = i; break; } }
    const cRect = e.currentTarget.getBoundingClientRect();
    let y;
    if (cards.length === 0) y = 0;
    else if (gap === 0) y = Math.max(2, cards[0].getBoundingClientRect().top - cRect.top - 7);
    else if (gap === cards.length) y = cards[cards.length - 1].getBoundingClientRect().bottom - cRect.top + 7;
    else { const a = cards[gap - 1].getBoundingClientRect(), b = cards[gap].getBoundingClientRect(); y = ((a.bottom + b.top) / 2) - cRect.top; }
    setDayDragOver(prev => (prev && prev.gap === gap && Math.abs(prev.y - y) < 1) ? prev : { gap, y });
  };
  const onDaysDrop = (e) => {
    if (!dayDragging) return;
    e.preventDefault();
    if (dayDragOver) {
      let to = dayDragOver.gap;
      if (to > dayDragSrc) to -= 1; // source is spliced out first, so slots above it shift down one
      if (to !== dayDragSrc) reorderDay(dayDragSrc, to);
    }
    setDayDragSrc(null); setDayDragOver(null);
  };
  // Move exercise from `from` index to `to` index within the same day.
  const reorderExInDay = (di, from, to) => setPlan(p => ({...p, days: p.days.map((d, idx) => {
    if (idx !== di) return d;
    const exs = [...(d.exercises || [])];
    if (from < 0 || from >= exs.length || to < 0 || to >= exs.length || from === to) return d;
    const [moved] = exs.splice(from, 1);
    exs.splice(to, 0, moved);
    return {...d, exercises: exs};
  })}));
  // Move an exercise from one day into another, inserting at slot `toGap`
  // (0..len of the target day). Splices out of the source array and into the
  // target array. Like reorderExInDay, this preserves array order as the source
  // of truth and does NOT renumber ex.order — the render path (editor + portal)
  // iterates in array order, so a stale order field is harmless (same
  // convention the within-day reorder relies on).
  const moveExAcrossDays = (fromDay, fromIdx, toDay, toGap) => setPlan(p => {
    if (fromDay === toDay) return p;
    const days = p.days.map(d => ({...d, exercises: [...(d.exercises || [])]}));
    if (fromDay < 0 || fromDay >= days.length || toDay < 0 || toDay >= days.length) return p;
    const fromExs = days[fromDay].exercises;
    if (fromIdx < 0 || fromIdx >= fromExs.length) return p;
    const [moved] = fromExs.splice(fromIdx, 1);
    // Drop the superset letter when crossing into a new day: the letter only
    // groups exercises WITHIN a day, so carrying it over would silently merge
    // the moved exercise into a same-letter group in the target day (the
    // athlete would then be told to superset a pairing the coach never set).
    // The coach re-tags a superset in the destination day if they want one.
    const cleaned = moved.superset ? { ...moved, superset: '' } : moved;
    const toExs = days[toDay].exercises;
    const at = Math.max(0, Math.min(toGap, toExs.length));
    toExs.splice(at, 0, cleaned);
    return {...p, days};
  });
  // Autosave: shared hook serializes saves, flushes on tab switch / screen
  // lock / browser back / refresh / close / unmount.
  const { status: autoStatus, flush: flushAutosave, markClean } = useAutosave(plan, savePlan);
  // Expose autosave controls to the parent. doDelete needs them: it must
  // flush (let any pending/in-flight save land) and then markClean BEFORE
  // deleting, or the editor's unmount autosave fires after the DELETE and
  // upserts the plan straight back into the DB.
  useEffect(() => {
    if (!editorApiRef) return undefined;
    editorApiRef.current = { flush: flushAutosave, markClean };
    return () => { editorApiRef.current = null; };
  }, [editorApiRef, flushAutosave, markClean]);

  // Live shared-sheet (write side): after each autosave lands, broadcast on the
  // 'plans-live' channel so any open read-only preview of this program refetches
  // and reflects the edit live. Broadcast only (self:false); does not touch the
  // editor's own state, so there's no clobber risk here.
  const editorIdRef = useRef('ed_' + Math.random().toString(36).slice(2, 9));
  const liveChanRef = useRef(null);
  const prevAutoRef = useRef(autoStatus);
  // Remote-edit awareness: another device/coach saved THIS program → show a
  // non-destructive banner. Never auto-applies (would blow away focus/undo/local
  // edits); the coach chooses Reload (loads the remote version) or Dismiss.
  const [remoteEdit, setRemoteEdit] = useState(false);
  useEffect(() => {
    let disposed = false;
    import('./supabase').then(({ supabase }) => {
      if (disposed) return;
      const ch = supabase.channel('plans-live', { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'plan-changed' }, ({ payload }) => {
        if (disposed || !payload || payload.editorId === editorIdRef.current) return;
        if (planRef.current && payload.planId === planRef.current.id) setRemoteEdit(true);
      });
      ch.subscribe();
      liveChanRef.current = ch;
    }).catch(() => {});
    return () => { disposed = true; const c = liveChanRef.current; liveChanRef.current = null; if (c) import('./supabase').then(({ supabase }) => supabase.removeChannel(c)).catch(() => {}); };
  }, []);
  useEffect(() => {
    if (prevAutoRef.current !== 'saved' && autoStatus === 'saved') {
      const c = liveChanRef.current;
      if (c && plan.id) { try { c.send({ type: 'broadcast', event: 'plan-changed', payload: { planId: plan.id, traineeId: plan.traineeId, editorId: editorIdRef.current } }); } catch { /* noop */ } }
    }
    prevAutoRef.current = autoStatus;
  }, [autoStatus, plan.id, plan.traineeId]);
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
    // Seed the field the CONSUMERS actually read. Writing only ex.n was dead:
    // ClientPortal resolves `pe.notes ?? pe.n` and defaultPlanEx() already sets
    // notes:'' (not nullish), so the cues never reached the athlete — and
    // normalizeDays dropped the stray `n` on the next save (audit 08-22).
    if (lib?.cues) { ex.notes = lib.cues; ex.n = lib.cues; }
    // Snapshot the title into the plan row. Athletes cannot read the exercise
    // library (RLS staff-only), so a row with only exerciseId renders as
    // "Exercise N" on their device. The plan must be self-contained.
    ex.title = lib?.title || '';
    // Same reason the title is snapshotted: with an empty library on the athlete
    // seat, an un-snapshotted video simply never appears. Only set it when one
    // exists — '' is the explicit "no video" state and would block inheriting a
    // video the library gains later.
    if (lib?.videoLink) ex.videoUrl = lib.videoLink;
    updateDay(activeDay, { exercises: [...(plan.days[activeDay]?.exercises || []), ex] });
    setOvExpanded(prev => ({ ...prev, [ex.id]: true })); // Ohad: a newly-added exercise opens expanded
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
    setOvExpanded(prev => ({ ...prev, [ex.id]: true })); // Ohad: a newly-added exercise opens expanded
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
    // Self-contained plan row (see addExWithId): embed the title so athletes,
    // who can't read the library, still see the exercise name.
    ex.title = t;
    updateDay(activeDay, { exercises: [...(plan.days[activeDay]?.exercises || []), ex] });
    setOvExpanded(prev => ({ ...prev, [ex.id]: true })); // Ohad: a newly-added exercise opens expanded
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
    // Land whatever the autosave already has in flight or pending BEFORE
    // issuing the explicit write (audit #88). The autosave exists to serialize
    // writes through one chain, and this call used to go straight round it: an
    // upsert of an older snapshot already on the wire could resolve at Supabase
    // AFTER the explicit save's upsert, leaving the row at the older state
    // while the editor showed "✓ Saved" and marked itself clean. The coach's
    // last edit was gone and nothing on screen said so.
    //
    // flush() returns the in-flight chain even when nothing is dirty, so this
    // awaits the pending write either way, and the snapshot is taken after it
    // so the explicit save carries the newest plan rather than the one that was
    // on screen when the button was pressed.
    await flushAutosave();
    const snapshot = planRef.current; // latest, and after the chain has drained
    const ok = await onSave(snapshot);
    // Explicit save covered everything pending — clear dirty so the
    // visibilitychange/unmount paths don't issue a redundant write. BUT only
    // if no edit landed DURING the await; otherwise leaving dirty set lets the
    // debounce/flush persist that interim edit instead of silently dropping it.
    //
    // And only when the write actually LANDED. Marking clean after a failed
    // upsert told every flush path (visibilitychange / pagehide / unmount /
    // BACK) there was nothing to write, so a transient Supabase failure ate
    // every edit since the last successful autosave in silence (audit 08-22
    // #38). On failure we stay dirty so those paths retry, and say so.
    if (ok === false) {
      const { toast } = await import('./ui');
      toast('Save failed — your edits are still here. Check the connection and save again.', 'error', { ttl: 8000 });
    } else if (planRef.current === snapshot) markClean();
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
    // Compare mode breaks OUT of <main>'s 1200px to use the full window. The
    // trick is `marginLeft: 50% - 48vw`, where 50% is half of MAIN and 48vw is
    // half the VIEWPORT — which only lands correctly while main is centred in
    // the viewport.
    // The exercise drawer pads the body, main stops being centred, and the
    // breakout then throws the editor 300px off the LEFT edge, where
    // overflowX:clip makes it unreachable. Measured: 420 elements past x=0,
    // worst at -300px, including the ← BACK / UNDO / REDO row. That is Ohad's
    // "i cant see the rest of the screen ... i need to see everything".
    // `editor-bleed` lets the drawer switch the breakout off while it is open
    // (see the rule in the drawer's <style>), so Compare simply uses the normal
    // column width instead of a miscalculated one.
    <div data-allow-copy className={compareActive ? 'editor-bleed' : undefined} style={compareActive ? { width: 'min(96vw, 2400px)', marginLeft: 'calc(50% - min(48vw, 1200px))' } : undefined}>
      <style>{`
        /* Editor field row: 3 across on wide, 1 on narrow, so Phase/Block
           always has room (no label wrap / misalignment). */
        .plan-fields-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        @media (max-width: 620px) { .plan-fields-grid { grid-template-columns: 1fr; } }
        /* Toolbar secondary tier: space-between on desktop so the group edges
           line up under BACK/SAVE. On a phone the 8 buttons wrap, and
           space-between would spread each wrapped line with big gaps — pack them
           left instead so they read as a tidy block. */
        .plan-toolbar-secondary { justify-content: space-between; }
        @media (max-width: 640px) { .plan-toolbar-secondary { justify-content: flex-start; } }
        /* (Removed .ex-row-outer/.ex-row-scroll/.ex-row-grid rules — those
           classes died with the !overview detail view; the unified grid
           handles narrow widths via its own overflowX scroll.) */
        .daydel-btn:hover { border-color: var(--c-rd, #ff5a5a) !important; }
      `}</style>
      <div style={{marginBottom:16}}>
        {/* PRIMARY tier: BACK · athlete+block pickers · SAVE. Navigation and the
            one commit action live up here; the 8 secondary actions moved to
            their own tier below the divider (Ohad: the single 10-button row read
            as a mess). */}
        {/* Mobile: the athlete/block dropdowns get crushed between the fixed BACK
            and SAVE. Drop them to their own full-width line (order:3, basis:100%)
            with BACK ↔ SAVE spread on the line above. */}
        <style>{`@media (max-width:760px){ .editor-top-row{ justify-content: space-between !important; } .editor-top-row > .editor-top-mid{ order: 3 !important; flex-basis: 100% !important; justify-content: flex-start !important; } }`}</style>
        <div className="editor-top-row" style={{display:'flex',gap:12,alignItems:'center',minWidth:0,flexWrap:'wrap'}}>
          <button onClick={handleBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',padding:0,whiteSpace:'nowrap',flexShrink:0}}>← BACK</button>
          {/* Undo / redo (Ohad) — coarse per-pause history; also Ctrl+Z / Ctrl+Shift+Z. */}
          <div style={{display:'inline-flex',gap:4,flexShrink:0}}>
            {/* Word labels, not glyphs (Ohad) — right next to BACK. */}
            <button onClick={doUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{background:'transparent',border:`1px solid ${C.cardBd}`,color:canUndo?C.tm:C.td,cursor:canUndo?'pointer':'not-allowed',opacity:canUndo?1:0.4,padding:'0 10px',height:24,borderRadius:0,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',lineHeight:1,display:'inline-flex',alignItems:'center',justifyContent:'center',whiteSpace:'nowrap'}}>UNDO</button>
            <button onClick={doRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" style={{background:'transparent',border:`1px solid ${C.cardBd}`,color:canRedo?C.tm:C.td,cursor:canRedo?'pointer':'not-allowed',opacity:canRedo?1:0.4,padding:'0 10px',height:24,borderRadius:0,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',lineHeight:1,display:'inline-flex',alignItems:'center',justifyContent:'center',whiteSpace:'nowrap'}}>REDO</button>
          </div>
          <div className="editor-top-mid" style={{flex:1,display:'flex',gap:12,alignItems:'center',justifyContent:'center',minWidth:0}}>
          {/* Athlete assignment — editable, to the LEFT of the block dropdown
              (Ohad). This is the ONLY athlete control now (dropped the duplicate
              field from the row below). */}
          <AthleteCombo
            value={plan.traineeId||""}
            options={[{value:'',label:'Unassigned'}, ...trainees.flatMap(t => t.members && t.members.length===2 ? t.members.map((m,i)=>({value:t.id+'__'+i,label:m.name||('Member '+(i+1))})) : [{value:t.id,label:t.name}])]}
            title="Assigns THIS program when it has no athlete yet; otherwise switches to that athlete's program — type to search"
            onPick={async (tid, label)=>{
                const theirs = tid ? (planIndex||[]).filter(p=>p.traineeId===tid).slice().sort(sortProgramsRecent) : [];
                // Primary behaviour: changing the athlete navigates to THAT
                // athlete's latest program (what the coach expects). Only when
                // the athlete has no program yet (or switching isn't wired) do
                // we fall back to assigning the current program to them — so the
                // "assign a brand-new program" path still works without silently
                // hijacking an existing program's owner.
                // UNASSIGNED program open → the pick ASSIGNS it. "+ New Program"
                // creates a blank, unowned plan and its tooltip says you pick the
                // athlete inside the editor; navigating away instead left that
                // blank plan stranded in the DB for every athlete who already had
                // programs — i.e. all of them (audit 08-22 #40).
                if (tid && !plan.traineeId) {
                  setPlan({ ...plan, traineeId: tid });
                } else if (onSwitchProgram && theirs.length) {
                  if (theirs[0].id !== plan.id) { await flushAutosave(); onSwitchProgram(theirs[0].id); }
                } else if (tid && onNewProgramFor) {
                  // The athlete has no programs yet → ASK (styled menu) whether to
                  // start a new blank program for them. Don't auto-create one (that
                  // left Ohad with junk to delete) and don't silently re-assign.
                  await flushAutosave();
                  onNewProgramFor(tid, label);
                } else {
                  setPlan({...plan,traineeId:tid}); // explicit "Unassigned"
                }
              }} />
          {/* Switch-program dropdown — lets the coach scroll between this
              athlete's programs (current + earlier blocks) without leaving
              the editor. Saves any pending edits first. Mounted only when
              there are 2+ programs to switch between. */}
          {(() => {
            // Order the picker by BLOCK NUMBER descending (#18 → #1) — shared
            // sortProgramsByBlockDesc (traineeUtils), same order as the
            // compare pane's Program Filter.
            const sameAthlete = (planIndex || [])
              .filter(p => p.traineeId === plan.traineeId)
              .slice()
              .sort(sortProgramsByBlockDesc);
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
                  style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,height:42,padding:'0 36px 0 18px',lineHeight:'42px',color:C.tm,fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',outline:'none',appearance:'none',WebkitAppearance:'none',flex:1,minWidth:0,boxSizing:'border-box',cursor:'pointer',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'center'}}>
                  {sameAthlete.map(p => <option key={p.id} value={p.id}>{p.name || 'Untitled'}</option>)}
                </select>
                <span style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:C.tm,fontSize:12,lineHeight:1}}>▾</span>
              </div>
            );
          })()}
          </div>
          <Btn onClick={handleSave} disabled={saving} style={{height:42,minWidth:150,padding:'0 18px',fontSize:13,letterSpacing:'0.09em',lineHeight:'42px',background:'#39BDFF',color:'#FFFFFF',border:'1px solid #39BDFF',opacity:saving?0.6:1,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{saving ? 'Saving...' : 'Save Program'}</Btn>
        </div>
        {/* Autosave status on its OWN right-aligned line with a RESERVED height,
            so it appearing / disappearing / changing width ("Saving…" ⇄
            "✓ Saved") never re-centers and shifts the button row below (Ohad). */}
        <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',minHeight:15,marginTop:4,paddingRight:2}}>
          {statusLabel && <span aria-live="polite" style={{fontFamily:FN,fontSize:10,fontWeight:700,color:statusLabel.color,letterSpacing:'0.1em',textTransform:'uppercase'}}>{statusLabel.text}</span>}
          {remoteEdit && (
            <span style={{display:'inline-flex',alignItems:'center',gap:8,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:'#E0A73A',background:'color-mix(in srgb, #E0A73A 12%, transparent)',border:'1px solid color-mix(in srgb, #E0A73A 45%, transparent)',padding:'3px 9px'}}>
              Saved on another device
              {onSwitchProgram && <button onClick={()=>{ try{markClean();}catch{} setRemoteEdit(false); onSwitchProgram(planRef.current.id); }} style={{fontFamily:FN,fontSize:9.5,fontWeight:700,color:C.ac,background:'transparent',border:`1px solid ${C.ac}`,padding:'2px 7px',cursor:'pointer'}}>Reload</button>}
              <button onClick={()=>setRemoteEdit(false)} title="Dismiss" style={{fontFamily:FN,fontSize:11,color:C.tm,background:'transparent',border:'none',cursor:'pointer'}}>✕</button>
            </span>
          )}
        </div>
        {/* hairline between the two tiers */}
        <div style={{borderTop:`1px solid ${C.cardBd}`,margin:'6px 0 12px'}} />
        {/* SECONDARY tier — decluttered to just the primary actions: PORTAL and
            a ⋯ MORE overflow (Compare/History/Share/Duplicate/New Program) on
            the left, SHOW ONLY + DELETE on the right. space-between so the group
            edges line up with the primary row above — PORTAL under BACK, DELETE
            under SAVE (Ohad). Was eight buttons in one wall. */}
        <div className="plan-toolbar-secondary" style={{display:"flex",gap:10,alignItems:"stretch",flexWrap:"wrap"}}>
          <div style={{display:'flex',gap:8,alignItems:'stretch',flexWrap:'wrap'}}>
          {/* PORTAL first (Ohad). */}
          {onPreviewPlan && plan?.id && <button onClick={async () => { if (await flushAutosave()) onPreviewPlan(plan.id); else toast('Save failed — preview may be stale. Retry once your edits save.', 'error'); }}
            title="Open this program in the athlete portal view" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,height:38,padding:'0 13px',lineHeight:'38px',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            PORTAL
          </button>}
          {/* OVERVIEW — placed immediately after PORTAL (Ohad: "it should be
              displayed as a button, after portal"). Fixed width regardless of
              label so the row never re-flows when it toggles: a control that
              changes size on click reads as a flash bug. */}
          <button onClick={() => setOverviewOpen(v => !v)}
            title={overviewOpen ? 'Back to the full editor' : 'See every day and exercise of this block on one screen'}
            style={{background: overviewOpen ? `${C.ac}1f` : (isRefined5b() ? 'transparent' : 'var(--c-sf)'),border:`1px solid ${C.ac}`,borderRadius:0,height:38,padding:'0 13px',lineHeight:'38px',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,whiteSpace:'nowrap',minWidth:132,boxSizing:'border-box'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            {overviewOpen ? 'EDITOR' : 'OVERVIEW'}
          </button>
          {/* Secondary program actions (Compare · History · Share · Duplicate ·
              New Program) collapsed behind one ⋯ MORE popover — the eight-button
              row read as a wall (Ohad). PORTAL, SHOW ONLY and DELETE stay as
              first-class buttons. Each moved action keeps its exact original
              handler (autosave-flush guards intact) and icon. */}
          <EditorMoreMenu items={[
            { key:'compare', label:'Compare', active: compareActive, onClick:()=>setCompareOpen(v=>!v),
              icon: compareActive
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/></svg> },
            ...(plan?.id ? [{ key:'history', label:'History', badge: blockWorkouts.length || null, onClick:()=>setHistoryOpen(true),
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg> }] : []),
            ...(onShare && plan?.id ? [{ key:'share', label:'Share', onClick: async () => { if (await flushAutosave()) onShare(); else toast('Save failed — not sharing a stale copy. Check your connection and retry.', 'error'); },
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> }] : []),
            ...(onDuplicate && plan?.id ? [{ key:'duplicate', label:'Duplicate', onClick: async () => { if (await flushAutosave()) onDuplicate(); else toast('Save failed — not duplicating a stale copy. Check your connection and retry.', 'error'); },
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }] : []),
            ...(onNewProgramFor && plan?.traineeId ? [{ key:'new', label:'New Program', onClick: async () => {
                await flushAutosave();
                const base = String(plan.traineeId).split('__')[0];
                const t = (trainees || []).find(x => x.id === base);
                const label = t ? (t.members && t.members.length === 2 ? (t.members[parseInt(String(plan.traineeId).split('__')[1] || '0')]?.name || t.name) : t.name) : undefined;
                onNewProgramFor(plan.traineeId, label);
              },
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }] : []),
          ]} />
          </div>
          <div style={{display:'flex',gap:8,alignItems:'stretch',flexWrap:'wrap'}}>
          {setPortalVis && plan?.id && plan?.traineeId && (() => {
            // "Show only this program" on the athlete's portal — makes THIS the
            // only visible program (hides the athlete's other blocks); toggling
            // off restores them all to visible. (Ohad)
            const siblings = (planIndex || []).filter(p => p.traineeId === plan.traineeId);
            const myVk = visKeyForPlan(plan, trainees);
            const isOnly = !!myVk && portalVis?.[myVk] !== false && siblings.every(p => p.id === plan.id || portalVis?.[visKeyForPlan(p, trainees)] === false);
            const toggle = () => {
              const next = { ...(portalVis || {}) };
              siblings.forEach(p => { const vk = visKeyForPlan(p, trainees); if (vk) next[vk] = isOnly ? true : (p.id === plan.id); });
              if (myVk) next[myVk] = true;
              setPortalVis(next);
            };
            return <button onClick={toggle}
              title={isOnly ? 'This is the only program shown on the portal — click to show all again' : 'Show ONLY this program on the athlete portal (hide the others)'}
              style={{background: isOnly ? `${C.gn}1f` : (isRefined5b() ? 'transparent' : 'var(--c-sf)'),border:`1px solid ${isOnly ? C.gn : C.ac}`,borderRadius:0,height:38,padding:'0 13px',lineHeight:'38px',color:isOnly ? C.gn : C.ac,cursor:'pointer',fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>{isOnly
                ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="20 6 9 17 4 12"/></svg>ONLY THIS</>
                : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>SHOW ONLY</>}</button>;
          })()}
          {onDelete && plan?.id && <button onClick={onDelete}
            title="Delete this program" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.rd}`,borderRadius:0,height:38,padding:'0 13px',lineHeight:'38px',color:C.rd,cursor:'pointer',fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            DELETE
          </button>}
          </div>
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
      {/* The overview carries its own warm-up card, so the full editor version
          would be the same content twice and cost the screen space the overview
          exists to save. */}
      {!overviewOpen && <WarmupEditor plan={plan} setPlan={setPlan} compact={compareActive} exercises={exercises} setExercises={setExercises}
        onCopyWarmup={onCopyWarmup ? () => setCopyDaysModal({ warmup: true }) : null} />}
      {/* Day tabs. Each tab can be individually flagged as a "daily routine"
          via a small 📆 toggle inside the day's content (see below). A daily
          day in a multi-day plan lets the athlete log it any number of times
          during the block — e.g., a "Morning Routine" day inside a Mon/Wed/Fri
          program. Plan-level kind='daily' is the legacy form (96e5f72) and is
          treated as "all days daily" at display time. */}
      {/* While a day drag is live, add top/bottom padding so there's a clear
          drop zone ABOVE the first day and BELOW the last — otherwise the first
          card sits flush at the top and "drop before Day A" is unreachable
          (Ohad: "it only lets me drag day a down"). The insertion bar also needs
          this space to render at the top instead of being clipped above. */}
      {overviewOpen && <PlanOverview plan={plan} exercises={exercises} onJumpToDay={(i) => {
        // Jump straight to the day you clicked: leave overview, then scroll to
        // that card once it has rendered.
        setOverviewOpen(false);
        setTimeout(() => {
          const cards = document.querySelectorAll('[data-daycard]');
          const el = cards[i];
          if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 80);
      }} />}
      <div onDragOver={onDaysDragOver} onDrop={onDaysDrop} style={{display: overviewOpen ? 'none' : "flex",flexDirection:"column",gap:12,marginBottom:16,position:'relative', paddingTop: dayDragging ? 16 : 0, paddingBottom: dayDragging ? 16 : 0, transition:'padding 120ms ease'}}>
        {plan.days.map((d, dayIdx) => {
          const dayExs = d.exercises || [];
          const weeks = plan.weeks || 4;
          const resize = (arr, n, fill) => Array.from({length:n}, (_,i) => (arr && arr[i] !== undefined ? arr[i] : fill));
          const tinyInput = {...baseInput, background:'color-mix(in srgb, var(--c-sf2) 85%, #ffffff)', padding:"3px 6px", fontSize:11, minWidth:0, width:"100%", height:24, boxSizing:"border-box"};
          // While a DAY drag is live every card renders collapsed (the 0fr/1fr
          // transition animates them shut) so the column becomes a compact,
          // scannable list of headers — same trick the exercise rows use.
          // collapsedDays itself is untouched; cards re-open where they were.
          const dayCollapsed = !!collapsedDays[d.id] || dayDragging;
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
            // Accept dragover whenever ANY exercise drag is live, not only when
            // this is the source day — that's what makes a drop into a
            // different day possible. The gap/y below are computed for THIS
            // day's rows, so the insertion bar tracks the hovered day.
            if (!anyExDragging) return;
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
            if (anyExDragging && dragOver && dragOver.dayIdx === dayIdx) {
              const fromDay = dragSrc.dayIdx;
              const from = dragSrc.exIdx;
              let to = dragOver.gap;
              if (fromDay === dayIdx) {
                // Same-day reorder: source is spliced out first, so any slot
                // above it shifts down one.
                if (to > from) to -= 1;
                if (to !== from) reorderExInDay(dayIdx, from, to);
              } else {
                // Cross-day move: target array is untouched by the source
                // splice, so the gap index needs no adjustment.
                moveExAcrossDays(fromDay, from, dayIdx, to);
              }
            }
            setDragSrc(null); setDragOver(null);
          };
          return (
            <div key={d.id} data-daycard style={{background: 'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'12px',opacity:dayDragging&&dayDragSrc===dayIdx?0.4:1,transition:'opacity 120ms'}}>
              {/* marginBottom only while open — a collapsed card otherwise
                  reads 12px above the row but 20px below (off-centre). */}
              {/* Sticky header (compare) gets a hairline below it — rows
                  scroll under it, so without a divider the pinned row reads
                  as floating over the table (Ohad). */}
              <div data-dayheader
                onClick={e => { if (e.target === e.currentTarget) toggleDayCollapse(d.id); }}
                style={{display:"flex",alignItems:"center",flexWrap:"wrap",marginBottom:dayCollapsed?0:8,gap:10, ...(compareActive ? {position:'sticky',top:0,zIndex:3,background:'var(--c-sf)',paddingTop:4,marginTop:-4,paddingBottom:dayCollapsed?0:8,borderBottom:dayCollapsed?'none':`1px solid ${C.cardBd}`} : {})}}>
                {/* The header's EMPTY space (between the name/count and the
                    right-hand chips) is a click target too — clicking it
                    expands/collapses the day, same as the caret (Ohad). The
                    spacer div carries the pointer cursor; the header's own
                    self-target onClick catches the residual gaps. Children
                    (input, buttons) keep their own handlers untouched. */}
                {/* Day drag handle — a dedicated ⇕ (not the whole header: the
                    header holds the name input, and `draggable` on a parent
                    makes text-selection inside inputs start drags instead). */}
                {plan.days.length > 1 && <span draggable title="Drag to reorder days" aria-label="Drag to reorder days"
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', 'day:' + dayIdx);
                    setDayDragImage(e, e.currentTarget.closest('[data-daycard]'));
                    // Deferred one tick — same Chrome gotcha as the exercise
                    // rows: a synchronous re-render (cards snapping collapsed)
                    // aborts the drag before it's established.
                    setTimeout(() => setDayDragSrc(dayIdx), 0);
                  }}
                  onDragEnd={() => { setDayDragSrc(null); setDayDragOver(null); }}
                  style={{cursor:'grab',color:C.tm,fontFamily:FN,fontSize:13,lineHeight:1,flexShrink:0,userSelect:'none',padding:'2px 1px'}}>⇕</span>}
                <span role="button" tabIndex={0} onClick={()=>toggleDayCollapse(d.id)}
                  onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleDayCollapse(d.id); } }}
                  title={dayCollapsed?'Expand day':'Collapse day'}
                  style={{cursor:'pointer',color:'#FFFFFF',fontSize:13,lineHeight:1,flexShrink:0,transform:dayCollapsed?'rotate(-90deg)':'none',transition:'transform 180ms ease',userSelect:'none'}}>▾</span>
                <input value={d.name} onChange={e=>updateDay(dayIdx,{name:e.target.value})}
                  style={{...baseInput, fontFamily:FB, fontWeight:700, fontSize:14, color:C.tx, padding:"4px 8px", maxWidth:260, minWidth:64, flex:'1 1 120px', width:'auto', boxShadow:'0 0 12px -6px var(--c-ac)'}} />
                <span style={{color:C.ac,fontSize:12,whiteSpace:"nowrap",display:'inline-flex',alignItems:'center',lineHeight:1,alignSelf:'center'}}>({dayExs.length} ex)</span>
                <div onClick={()=>toggleDayCollapse(d.id)} aria-hidden title={dayCollapsed?'Expand day':'Collapse day'} style={{flex:'1 1 0',minWidth:0,alignSelf:'stretch',minHeight:24,cursor:'pointer'}} />
                {/* Per-day Daily-Routine toggle — ported from the old detail view
                    (the unified view had dropped it). ON = athlete logs this day
                    unlimited times per block, no DONE lock, no week rotation. */}
                <button onClick={() => { if (d.kind === 'daily') { const { kind: _k, ...rest } = d; setPlan(p => ({ ...p, days: p.days.map((dd, idx) => idx === dayIdx ? rest : dd) })); } else updateDay(dayIdx, { kind: 'daily' }); }}
                  title={d.kind==='daily' ? 'Daily Routine ON — unlimited logs per block, no DONE lock, no week rotation. Click for a standard week-paced day.' : 'Make this a Daily Routine day (unlimited logs, no DONE lock, no week rotation).'}
                  style={{background: d.kind==='daily' ? `${C.ac}1f` : 'var(--c-sf)',border:`1px solid ${d.kind==='daily'?C.ac:C.cardBd}`,borderRadius:0,height:24,padding:0,color: d.kind==='daily'?C.ac:C.tm,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.09em',whiteSpace:'nowrap',width:100,flexShrink:0,boxSizing:'border-box',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{d.kind==='daily'?'DAILY ✓':'DAILY'}</button>
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
                    style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,height:24,padding:0,color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.09em',whiteSpace:'nowrap',width:142,flexShrink:0,boxSizing:'border-box',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:5}}>
                    {/* One glyph rotated for both states — ▴ and ▾ render at
                        different sizes in this font, so the arrows mismatched. */}
                    <span aria-hidden style={{display:'inline-block',transform:anyOpen?'rotate(180deg)':'none',transition:'transform 180ms ease',lineHeight:1}}>▾</span>
                    {/* Same trailing letter-space cancellation as the warm-up
                        EXPAND ALL — see that comment. */}
                    <span style={{marginRight:'-0.14em'}}>{anyOpen?'COLLAPSE ALL':'EXPAND ALL'}</span>
                  </button>;
                })()}
                {/* ⤴ copy-day + × delete-day = one matched icon pair, the SAME
                    24px height as the DAILY / EXPAND-ALL chips so the whole
                    right cluster reads as one control row (Ohad OCD). Both
                    28×24 boxes, glyphs optically centred (⤴ smaller than × per
                    point, so 12 vs 15 balances). Delete only shows when >1 day. */}
                {(onCopyDays || plan.days.length > 1) && (
                  <div style={{display:'inline-flex',gap:4,flexShrink:0,alignItems:'center'}}>
                    {onCopyDays && <button onClick={()=>setCopyDaysModal({ dayIdxs: new Set([dayIdx]) })} title="Copy this day to another program" aria-label="Copy day to another program"
                      style={{width:28,height:24,boxSizing:'border-box',background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,color:C.ac,cursor:'pointer',fontSize:12,lineHeight:1,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0}}>⤴</button>}
                    {plan.days.length > 1 && <button onClick={()=>setConfirmDeleteDay(dayIdx)} title="Delete this day" aria-label="Delete day"
                      className="daydel-btn"
                      style={{width:28,height:24,boxSizing:'border-box',background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,color:C.rd,cursor:'pointer',fontSize:15,lineHeight:1,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,transition:'border-color .12s'}}>×</button>}
                  </div>
                )}
              </div>
              <div style={{display:'grid',gridTemplateRows:dayCollapsed?'0fr':'1fr',transition:'grid-template-rows 260ms ease'}}><div style={{overflow:'hidden',minHeight:0}}>
              {dayExs.length === 0 ? (
                // Empty day is still a valid cross-day drop target. Attach the
                // same grid drop handlers (with no rows, the gap resolves to 0)
                // so an exercise can be moved INTO an otherwise-empty day.
                <div onDragOver={onGridDragOver} onDrop={onGridDrop} style={{position:'relative',color:C.td,fontSize:12,fontStyle:"italic",padding:'4px 0',minHeight:26,display:'flex',alignItems:'center'}}>
                  {anyExDragging && dragSrc.dayIdx !== dayIdx ? <span style={{color:C.ac,fontStyle:'normal'}}>Drop here to move into this day</span> : 'No exercises.'}
                  {anyExDragging && dragOver && dragOver.dayIdx === dayIdx && dragOver.y != null && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: dragOver.y - 1, height: 2, background: C.ac, boxShadow: `0 0 5px ${C.ac}88`, pointerEvents: 'none', zIndex: 2 }} />
                  )}
                </div>
              ) :
                <div style={{overflowX:"auto",margin:"0 -12px",padding:compareActive?"0 12px 7px":"0 12px"}}><div onDragOver={onGridDragOver} onDrop={onGridDrop} style={{display:"grid",position:"relative",gridTemplateColumns: compareActive ? `30px minmax(0,3.3fr) 44px minmax(0,0.9fr) minmax(0,1.4fr) minmax(0,1.3fr) minmax(0,0.9fr) minmax(0,60px) 22px` : `36px minmax(180px,3.3fr) 56px minmax(${Math.max(56,weeks*22)}px,0.9fr) minmax(${Math.max(64,weeks*26)}px,1.4fr) minmax(80px,1.3fr) minmax(60px,80px) minmax(48px,60px) 24px`,gap:"3px 8px",fontSize:12,alignItems:"center",minWidth: compareActive ? Math.max(590,516+weeks*40) : Math.max(614,540+weeks*40)}}>
                  {["#","EXERCISE","GRP","SETS","REPS","TEMPO","LOAD","RPE",""].map((h,hi) =>
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
                    const sc = supersetColor(ex.superset);
                    const update = (u) => updateExInDay(dayIdx, exIdx, u);
                    // Guarded video-URL apply: maybeResolveGooglePhotos awaits ~1-3s,
                    // so a reorder/delete during it would make the frozen exIdx write
                    // the resolved video onto a DIFFERENT exercise. Only apply if this
                    // slot still holds the exact URL we started resolving.
                    const onResolveVideo = (original, resolved) => setPlan(p => {
                      const cur = p.days?.[dayIdx]?.exercises?.[exIdx];
                      // Stale-guard: drop only if the coach has since typed a
                      // DIFFERENT explicit override into this row. When the row is
                      // still inheriting (stored ''), the blurred value was the
                      // inherited library video the coach saw in the field — apply
                      // the resolution (the old `stored !== original` check dropped
                      // every inherited-video resolution, since stored is '').
                      const stored = cur ? (cur.videoUrl ?? cur.vid ?? '') : '';
                      // Identity-guard: if a reorder/move landed a DIFFERENT
                      // exercise at this frozen index during the ~1-3s resolve,
                      // `cur.id` no longer matches the row we started on — drop the
                      // write rather than stamp the resolved URL onto the wrong
                      // (possibly inheriting, stored='') exercise.
                      if (!cur || cur.id !== ex.id || (stored && stored !== original)) return p;
                      return { ...p, days: p.days.map((d, i2) => i2 === dayIdx ? { ...d, exercises: (d.exercises || []).map((e, j2) => j2 === exIdx ? { ...e, videoUrl: resolved } : e) } : d) };
                    });
                    // While a drag is live in this day, render expanded rows
                    // as collapsed (the panel animates shut via its 0fr/1fr
                    // transition) so the drag gets the same clean gap-line
                    // effect as collapsed mode. ovExpanded itself is left
                    // untouched — rows re-open where they were on drop.
                    // Collapsing expanded rows during a drag gives clean
                    // insertion gaps — but in COMPARE mode the rows live in a
                    // fixed-height scroll pane, so collapsing them the instant
                    // a drag starts shrinks the pane and force-clamps its
                    // scrollTop by thousands of px. That scroll jump yanks the
                    // grabbed row out from under the cursor and Chrome aborts
                    // the native drag (the classic layout-shift abort, which
                    // the setTimeout(0) defer can't escape here because it's a
                    // scroll clamp, not just a reflow). So in compare mode keep
                    // rows as-is during a drag — the insertion bar is derived
                    // from live row rects, so it still lands in the right gap.
                    const exOpen = !!ovExpanded[ex.id] && !(anyExDragging && !compareActive);
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
                        title={ex.superset ? `Superset group ${ex.superset}` : 'Not in a superset'}
                        style={{...tinyInput, background: ex.superset ? `color-mix(in srgb, ${sc} 20%, var(--c-sf))` : tinyInput.background, color: ex.superset ? C.tx : C.td, border: ex.superset ? `1px solid ${sc}` : tinyInput.border, fontFamily:FN, fontWeight: ex.superset ? 800 : 600, height:24, minHeight:24, padding:'0 6px', boxSizing:'border-box', appearance:'none', WebkitAppearance:'none', textAlignLast:'center'}}>
                        {SUPERSET_LABELS.map(s => <option key={s} value={s} style={{color: supersetColor(s), fontWeight: 700}}>{s||"—"}</option>)}
                      </select>
                      {ex.wkS && Array.isArray(ex.wkS) && ex.wkS.length > 0 ? (() => {
                        // Never render or resize to FEWER weeks than the row already
                        // holds. A row programmed for more weeks than plan.weeks had
                        // those weeks hidden, and the first edit truncated them for
                        // good (audit 08-22 #89). Grow to fit, never shrink.
                        const wN = Math.max(weeks, ex.wkS.length);
                        return (
                        <div style={{display:"grid", gridTemplateColumns:`repeat(${wN},minmax(0,1fr))`, gap:2}}>
                          {Array.from({length:wN}).map((_,wi) => (
                            <input key={wi} value={ex.wkS[wi]||""} onChange={e=>{const next=resize(ex.wkS,wN,""); next[wi]=e.target.value; update({wkS:next});}}
                              placeholder={"W"+(wi+1)} style={{...tinyInput, padding:"3px 4px", fontSize:10}} />
                          ))}
                        </div>); })() : (
                        // Sets accepts an integer OR a range ("2-3", as Ohad's sheets
                        // program): a pure integer stores as a NUMBER (setCountFor +
                        // numeric consumers stay exact), a range stores as a STRING
                        // (everything defaults to 3 rows). type=number blanked "2-3".
                        <input value={ex.sets ?? ""} onChange={e=>{const v=e.target.value;const n=parseInt(v,10);update({sets:(v.trim()!=='' && String(n)===v.trim())?n:v});}} placeholder="3" style={tinyInput} />
                      )}
                      {ex.wk && Array.isArray(ex.wk) && ex.wk.length > 0 ? (() => {
                        const wN = Math.max(weeks, ex.wk.length);   // see #89 above
                        return (
                        <div style={{display:"grid", gridTemplateColumns:`repeat(${wN},minmax(0,1fr))`, gap:2}}>
                          {Array.from({length:wN}).map((_,wi) => (
                            <input key={wi} value={ex.wk[wi]||""} onChange={e=>{const next=resize(ex.wk,wN,""); next[wi]=e.target.value; update({wk:next});}}
                              placeholder={"W"+(wi+1)} style={{...tinyInput, padding:"3px 4px", fontSize:10}} />
                          ))}
                        </div>); })() : (
                        <input value={ex.reps||""} onChange={e=>update({reps:e.target.value})} placeholder="8-12" style={tinyInput} />
                      )}
                      <input value={ex.tempo||""} onChange={e=>update({tempo:e.target.value})} placeholder="3010" style={tinyInput} />
                      <input value={ex.load||""} onChange={e=>update({load:e.target.value})} placeholder="kg/%" style={tinyInput} />
                      <input value={ex.rpe||""} onChange={e=>update({rpe:e.target.value})} placeholder="7-8" style={tinyInput} />
                      <button onClick={()=>setConfirmDeleteEx({ dayIdx, exIdx, title })} title="Remove exercise from this day" aria-label="Remove exercise"
                        style={{background:"none",border:"none",cursor:"pointer",padding:0,height:24,boxSizing:"border-box",display:"inline-flex",alignItems:"center",justifyContent:"center"}}><TrashIcon size={15} /></button>
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
                          <ExEditorExtras ex={ex} exData={exData} exTitle={title} update={update} onResolveVideo={onResolveVideo} showEmbed={exOpen}
                            exercises={exercises} setExercises={setExercises}
                            picker={<ExPicker exercises={exercises} value={ex.exerciseId} onChange={id=>{ if (id === ex.exerciseId) return; const lib = exById(exercises).get(id); update({ exerciseId: id, title: lib?.title || '', videoUrl: lib?.videoLink || undefined, vid: undefined, notes: lib?.cues || '', notesEdited: false, n: lib?.cues || '' }); }} onPickName={name=>update({ exerciseId:'', title:name, videoUrl: '', vid: undefined, notes: '', notesEdited: false, n: '' })}
                              onCreateLibrary={setExercises ? (name => { const id = addLibExercise(setExercises, name); if (id) update({ exerciseId: id, title: name, notes: '', notesEdited: false, n: '' }); }) : undefined}
                              label="Exercise" fallbackTitle={ex.title} />} />
                        </div>
                       </div>
                      </div>
                    </React.Fragment>;
                  })}
                  {/* Insertion bar — absolute overlay, glides between slots
                      without ever moving the rows themselves. */}
                  {anyExDragging && dragOver && dragOver.dayIdx === dayIdx && dragOver.y != null && (
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
          style={{background:`${C.ac}12`,border:`1px solid ${C.ac}`,borderRadius:0,padding:'15px',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase'}}>+ ADD DAY</button>
        {/* Day insertion bar — absolute overlay, glides between card slots
            without moving the cards (same pattern as the exercise rows). */}
        {dayDragging && dayDragOver && dayDragOver.y != null && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: dayDragOver.y - 1, height: 2, background: C.ac, boxShadow: `0 0 5px ${C.ac}88`, pointerEvents: 'none', zIndex: 4, transition: 'top 90ms ease' }} />
        )}
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
          overview={overviewOpen}
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
      <ConfirmDialog
        open={confirmDeleteEx !== null}
        title="Remove exercise?"
        message={confirmDeleteEx !== null ? `"${confirmDeleteEx.title || 'This exercise'}" will be removed from ${plan.days[confirmDeleteEx.dayIdx]?.name || 'this day'}. This can't be undone.` : ''}
        onConfirm={()=>{ removeExFromDay(confirmDeleteEx.dayIdx, confirmDeleteEx.exIdx); setConfirmDeleteEx(null); }}
        onCancel={()=>setConfirmDeleteEx(null)}
      />
      {copyDaysModal && <CopyDaysModal
        days={plan.days}
        warmupMode={!!copyDaysModal.warmup}
        warmup={plan.warmup}
        currentPlanId={plan.id}
        preselected={copyDaysModal.dayIdxs}
        planIndex={planIndex}
        sourceWeeks={plan.weeks || 4}
        traineeMap={Object.fromEntries((trainees||[]).flatMap(t => t.members && t.members.length===2 ? t.members.map((m,i)=>[t.id+'__'+i, m.name||('Member '+(i+1))]) : [[t.id, t.name]]))}
        athleteOptions={(trainees||[]).filter(t=>t.status!=='Archived').flatMap(t => t.members && t.members.length===2 ? t.members.map((m,i)=>({value:t.id+'__'+i, label:m.name||('Member '+(i+1))})) : [{value:t.id, label:t.name}])}
        onClose={()=>setCopyDaysModal(null)}
        onCopy={onCopyDays}
        onCopyWarmup={onCopyWarmup}
      />}
      {historyOpen && createPortal((
        <div onClick={()=>setHistoryOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',zIndex:10000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'6vh 16px',overflowY:'auto'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,width:'min(560px,100%)',maxHeight:'88vh',display:'flex',flexDirection:'column'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'14px 18px',borderBottom:`1px solid ${C.cardBd}`,flexShrink:0}}>
              <div style={{fontFamily:FN,fontWeight:700,fontSize:14,letterSpacing:'0.04em',color:C.tx,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>HISTORY · {plan.name} <span style={{color:C.tm,fontWeight:400,fontSize:12}}>· {blockWorkouts.length} logged</span></div>
              <button onClick={()=>setHistoryOpen(false)} aria-label="Close history" style={{background:'transparent',border:'none',color:C.tm,cursor:'pointer',fontSize:20,lineHeight:1,flexShrink:0,padding:0}}>×</button>
            </div>
            <div style={{overflowY:'auto',padding:'12px 18px 18px'}}>
              {blockWorkouts.length === 0
                ? <div style={{color:C.td,textAlign:'center',padding:'34px 10px',fontSize:13}}>No logged workouts for this block yet.</div>
                : blockWorkouts.map(w => {
                    // Card design ported verbatim from the athlete-portal HISTORY
                    // card (ClientPortal `vw==='hist'`) so the two read identically
                    // (Ohad): thin cyan card border, tinted header strip with a cyan
                    // left rail (DAY · W# left, pretty date right), exercise rows as
                    // `n. title  prescribed · done/total` with VIDEO / NOTES dot-tags,
                    // and a boxed 📝 note. (Block name is omitted — the modal title
                    // already names the block, unlike the multi-block athlete view.)
                    const exs = w.exercises || [];
                    return (
                      <div key={w.id} style={{background:'var(--c-sf)',border:`0.25px solid ${C.ac}4D`,borderRadius:0,padding:12,marginBottom:8}}>
                        <div style={{background:'var(--c-sf2)',borderLeft:`3px solid ${C.ac}`,borderBottom:`1px solid ${C.cardBd}`,margin:'-12px -12px 10px',padding:'8px 12px',display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:10}}>
                          <div style={{fontFamily:FN,fontWeight:700,fontSize:13,letterSpacing:'0.02em',color:C.tx,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{w.dayName || 'Workout'}{w.week!=null && <span style={{color:C.ac,fontWeight:700,fontSize:11,letterSpacing:'0.04em'}}> · W{w.week}</span>}</div>
                          <div style={{fontSize:10,fontFamily:FN,color:C.tm,letterSpacing:'0.08em',whiteSpace:'nowrap',flexShrink:0}}>{fmtPrettyDate(w.date || w.createdAt)}</div>
                        </div>
                        {exs.map((x,i)=>{
                          const fv = (w.formVideos || [])[i];
                          const hasVideo = !!(fv && fv.cloudUrl);
                          const notesCount = (fv?.reviewNotes || []).reduce((a, n) => a + 1 + (n.replies?.length || 0), 0);
                          return (
                            <div key={i} style={{fontSize:11,fontFamily:FN,color:C.tm,display:'flex',alignItems:'center',gap:6,padding:'3px 0'}}>
                              <span style={{flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:C.tx}}><span style={{display:'inline-block',width:22,textAlign:'right',flexShrink:0,color:C.td,marginRight:6}}>{i+1}.</span>{x.title} <span style={{color:C.td}}>{x.prescribed ? x.prescribed + ' · ' : ''}{(x.sets||[]).filter(s=>s.done).length}/{(x.sets||[]).length}</span></span>
                              {hasVideo && <span style={{display:'inline-flex',alignItems:'center',gap:4,color:C.gn,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',lineHeight:1,flexShrink:0}}><span style={{width:5,height:5,background:C.gn,borderRadius:'50%'}}/>VIDEO</span>}
                              {notesCount > 0 && <span style={{display:'inline-flex',alignItems:'center',gap:4,color:C.ac,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',lineHeight:1,flexShrink:0}}><span style={{width:5,height:5,background:C.ac,borderRadius:'50%'}}/>{notesCount} {notesCount===1?'NOTE':'NOTES'}</span>}
                            </div>
                          );
                        })}
                        {w.notes && <div style={{fontSize:11,color:C.tm,marginTop:6,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,padding:6,borderRadius:0,fontFamily:FN}}>📝 {w.notes}</div>}
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>
      ), document.body)}
    </div>);
}

// Copy day(s) → another program. Left: this program's days as a checklist
// (the clicked day pre-checked). Right/below: pick a target — search existing
// programs, or create a new one. Copies FULL exercise data (parent's
// handleCopyDays deep-clones with fresh ids, spreading every field). Selected
// days append to the BOTTOM of the target.
function CopyDaysModal({ days, currentPlanId, preselected, planIndex, sourceWeeks, traineeMap, athleteOptions, onClose, onCopy, warmupMode = false, warmup = [], onCopyWarmup = null }) {
  // Escape closes (backdrop + × already do). Listener, not autoFocus-only,
  // so it works before the coach touches anything.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [picked, setPicked] = useState(() => new Set(preselected || []));
  const [mode, setMode] = useState('existing'); // 'existing' | 'new'
  const [newName, setNewName] = useState('');
  const [newAthlete, setNewAthlete] = useState('');   // '' = unassigned
  const [existAthlete, setExistAthlete] = useState(''); // athlete chosen in existing mode
  const [targetId, setTargetId] = useState('');         // program chosen for that athlete
  const [busy, setBusy] = useState(false);
  const toggle = (i) => setPicked(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  // Athletes who have at least one OTHER program (a valid copy target), plus
  // an "Unassigned / other" bucket for target programs whose owner isn't a
  // listed athlete — unassigned template blocks (traineeId '') or
  // archived-athlete-owned programs — so those stay reachable (they were in
  // the old flat search list).
  const UNASSIGNED_TARGETS = '__unassigned__';
  const athletesWithTargets = useMemo(() => {
    const known = new Set((athleteOptions || []).map(o => o.value));
    const targets = (planIndex || []).filter(p => p.id !== currentPlanId);
    const tids = new Set(targets.map(p => p.traineeId));
    const list = (athleteOptions || []).filter(o => tids.has(o.value));
    if (targets.some(p => !known.has(p.traineeId))) list.push({ value: UNASSIGNED_TARGETS, label: 'Unassigned / other' });
    return list;
  }, [athleteOptions, planIndex, currentPlanId]);
  // That athlete's programs (excluding the open one) = the second picker. The
  // Unassigned bucket collects every target program not owned by a listed
  // athlete.
  const programsForAthlete = useMemo(() => {
    const known = new Set((athleteOptions || []).map(o => o.value));
    return (planIndex || []).filter(p => p.id !== currentPlanId && (
      existAthlete === UNASSIGNED_TARGETS ? !known.has(p.traineeId) : p.traineeId === existAthlete
    ));
  }, [planIndex, currentPlanId, existAthlete, athleteOptions]);
  const count = picked.size;
  const wuSteps = (warmup || []).length;
  const canCopy = (warmupMode ? wuSteps > 0 : count > 0) && (mode === 'new' ? true : !!targetId) && !busy;
  // Native-select style, matching the Sessions "add athletes" pickers.
  const sel = { width:'100%', height:38, boxSizing:'border-box', background:'var(--c-sf2)', border:`1px solid ${C.cardBd}`, borderRadius:0, padding:'0 10px', color:C.tx, fontFamily:FN, fontSize:12, outline:'none', cursor:'pointer' };
  const fieldLbl = { fontFamily:FN, fontSize:9, color:C.td, letterSpacing:'0.16em', fontWeight:700, marginBottom:6, textTransform:'uppercase' };
  const doCopy = async () => {
    if (!canCopy) return;
    setBusy(true);
    const target = mode === 'new' ? { kind: 'new', name: newName, traineeId: newAthlete, weeks: sourceWeeks } : { kind: 'existing', planId: targetId };
    const res = warmupMode
      ? await onCopyWarmup(warmup, target)
      : await onCopy([...picked].sort((a,b)=>a-b).map(i => days[i]).filter(Boolean), target);
    setBusy(false);
    if (res && res.ok) onClose();
  };
  // Portal to <body> so the fixed overlay centres on the true viewport — the
  // editor sits inside a transformed (.motion-rise) wrapper, which otherwise
  // makes position:fixed anchor to that wrapper (off-centre). (Ohad)
  return createPortal(
    <div onClick={onClose} role="dialog" aria-modal="true" style={{ position:'fixed', inset:0, zIndex:10000, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--c-sf)', border:`1px solid ${C.cardBd}`, borderRadius:0, width:'min(480px, 96vw)', maxHeight:'86vh', display:'flex', flexDirection:'column', boxShadow:C.cardShadow }}>
        <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.cardBd}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontFamily:FN, fontSize:13, fontWeight:700, letterSpacing:'0.12em', color:C.tx, textTransform:'uppercase' }}>{warmupMode ? 'Copy warm-up to…' : `Copy day${count===1?'':'s'} to…`}</span>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:C.tm, fontSize:20, lineHeight:1, cursor:'pointer' }}>×</button>
        </div>
        <div style={{ overflowY:'auto', padding:'12px 18px', display:'flex', flexDirection:'column', gap:14 }}>
          {/* what to copy — the day checklist, or (warm-up mode) a summary */}
          <div>
            <div style={{ fontFamily:FN, fontSize:9, color:C.td, letterSpacing:'0.16em', fontWeight:700, marginBottom:8, textTransform:'uppercase' }}>{warmupMode ? 'Warm-up to copy' : 'Days to copy'}</div>
            {warmupMode ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:`1px solid ${C.ac}`, background:`${C.ac}1f` }}>
                <span style={{ color:C.or, fontFamily:FN, fontSize:12, fontWeight:700, letterSpacing:'0.06em' }}>WARM-UP</span>
                <span style={{ flex:1, color:C.tx, fontFamily:FB, fontSize:13 }}>{wuSteps} step{wuSteps===1?'':'s'}</span>
              </div>
            ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {days.map((d,i) => {
                const on = picked.has(i);
                const n = (d.exercises || d.ex || []).length;
                return (
                  <button key={d.id||i} onClick={()=>toggle(i)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background: on ? `${C.ac}1f` : 'transparent', border:`1px solid ${on?C.ac:C.cardBd}`, borderRadius:0, cursor:'pointer', textAlign:'left' }}>
                    <span aria-hidden="true" style={{ width:15, height:15, flexShrink:0, border:`1px solid ${on?C.ac:C.tm}`, background: on?C.ac:'transparent', color:'#000', fontSize:11, fontWeight:800, lineHeight:'14px', textAlign:'center' }}>{on?'✓':''}</span>
                    <span style={{ flex:1, minWidth:0, color:C.tx, fontFamily:FB, fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.name || `Day ${i+1}`}</span>
                    <span style={{ color:C.td, fontFamily:FN, fontSize:10, flexShrink:0 }}>{n} ex</span>
                  </button>
                );
              })}
            </div>
            )}
          </div>
          {/* target mode toggle */}
          <div style={{ display:'flex', gap:0, border:`1px solid ${C.cardBd}` }}>
            {[['existing','EXISTING PROGRAM'],['new','NEW PROGRAM']].map(([m,l],mi) => (
              <button key={m} onClick={()=>setMode(m)} style={{ flex:1, padding:'9px 4px', border:'none', borderLeft: mi?`1px solid ${C.cardBd}`:'none', background: mode===m?C.ac:'transparent', color: mode===m?'#000':C.tm, fontFamily:FN, fontSize:10, fontWeight:700, letterSpacing:'0.1em', cursor:'pointer' }}>{l}</button>
            ))}
          </div>
          {mode === 'existing' ? (
            /* Two cascading pickers — athlete → block — like the Sessions
               add-athletes row (Ohad: "two pickers like in groups"). */
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <div style={fieldLbl}>Athlete</div>
                <select value={existAthlete} onChange={e=>{ setExistAthlete(e.target.value); setTargetId(''); }} style={sel}>
                  <option value="">— athlete —</option>
                  {athletesWithTargets.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <div style={fieldLbl}>Block</div>
                <select value={targetId} onChange={e=>setTargetId(e.target.value)} style={{ ...sel, opacity: existAthlete ? 1 : 0.5 }} disabled={!existAthlete}>
                  <option value="">{existAthlete ? '— block —' : '— pick athlete —'}</option>
                  {programsForAthlete.map(p => <option key={p.id} value={p.id}>{p.name || 'Untitled'}</option>)}
                </select>
              </div>
            </div>
          ) : (
            /* New program — same two-picker rhythm: athlete select + block name. */
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <div style={fieldLbl}>Athlete</div>
                <select value={newAthlete} onChange={e=>setNewAthlete(e.target.value)} style={sel}>
                  <option value="">Unassigned</option>
                  {(athleteOptions||[]).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <div style={fieldLbl}>Block name</div>
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder='e.g. "Block #10"' style={{ ...sel, cursor:'text' }} />
              </div>
            </div>
          )}
        </div>
        <div style={{ padding:'12px 18px', borderTop:`1px solid ${C.cardBd}`, display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onClose} style={{ padding:'8px 16px', background:'transparent', border:`1px solid ${C.cardBd}`, borderRadius:0, color:C.tm, fontFamily:FN, fontSize:11, fontWeight:700, letterSpacing:'0.09em', cursor:'pointer' }}>CANCEL</button>
          <button onClick={doCopy} disabled={!canCopy} style={{ padding:'8px 18px', background: canCopy?C.ac:'transparent', border:`1px solid ${canCopy?C.ac:C.cardBd}`, borderRadius:0, color: canCopy?'#000':C.td, fontFamily:FN, fontSize:11, fontWeight:700, letterSpacing:'0.09em', cursor: canCopy?'pointer':'default' }}>{busy?'COPYING…':(warmupMode ? 'COPY WARM-UP →' : `COPY ${count||''} DAY${count===1?'':'S'} →`)}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Build the SAME visibility key the athlete portal (ClientPortal.visKeyFor)
// and TraineeDetail read: couples use `${parent.name}:${plan.name}:m${i}`,
// but SOLO athletes use `${name}:${plan.name}` with NO suffix. Writing ":m0"
// for solos (the old bug) produced a key the portal never reads, so the
// ON-PORTAL / SHOW-ONLY toggles silently did nothing for solo athletes.
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
  return `${trainee.name}:${p.name}`;
}

// ────────────────────────────────────────────────────────────────────────
// TRAINING LINEAGE — cross-block lift progression for one athlete.
//
// The coach view no other app has: instead of looking at one block in
// isolation, lay every block for an athlete side-by-side and read each lift's
// LINEAGE across them — is the load climbing, has it plateaued, did a pattern
// drop out. Reads the athlete's full plans (useAthletePlans), extracts a
// per-lift × per-block matrix, and flags plateaus / progressions / gaps.
// Pure read + derived UI — writes nothing.
// ────────────────────────────────────────────────────────────────────────

// Parse a free-text load cell into a comparable number. Loads in this data are
// prescriptions, not logs: "80", "80kg", "60/70/80" (ramping), "BW", "RPE8",
// "20 each". Take the MAX number present as the top working load; recognise
// bodyweight; return raw for display. num=null when nothing numeric is found.
function parseLoad(str) {
  const raw = (str == null ? '' : String(str)).trim();
  if (!raw) return { num: null, bw: false, raw: '' };
  const bw = /\b(bw|bodyweight|body\s*weight|גוף)\b/i.test(raw);
  const nums = (raw.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(n => !isNaN(n));
  // Drop obvious non-load numbers that ride along in the string (e.g. "RPE 8",
  // "x3"): if a number is immediately preceded by rpe/@/x it's not a load.
  const num = nums.length ? Math.max(...nums) : null;
  return { num, bw, raw };
}

// A stable key that groups the "same" lift across blocks. Prefer the library
// exerciseId; fall back to the normalized display title so free-text rows still
// line up block-to-block.
function lineageKey(ex, exMap) {
  if (ex.exerciseId && exMap.has(ex.exerciseId)) return 'id:' + ex.exerciseId;
  const t = (ex.title || (ex.exerciseId && exMap.get(ex.exerciseId)?.title) || '').trim().toLowerCase();
  return t ? 'title:' + t : (ex.exerciseId ? 'id:' + ex.exerciseId : '');
}

// Block chronology — imported plans all share one created_at (the import
// timestamp), so time order is useless; the real training order is the block
// NUMBER in the name ("Block #12", "בלוק 3", "#5"). Return it, or null.
export function blockNum(name) {
  const m = (name || '').match(/(?:block|בלוק)\s*#?\s*(\d+)|#\s*(\d+)/i);
  return m ? Number(m[1] || m[2]) : null;
}

// Reps can be "8", "8-10", "8/6/4", "12,12,10", "AMRAP". Return a representative
// integer (the max prescribed rep) for volume math, plus the raw label.
export function repsTop(reps) {
  const r = (reps == null ? '' : String(reps)).trim();
  const nums = (r.match(/\d+/g) || []).map(Number);
  return nums.length ? Math.max(...nums) : null;
}

// Classify an exercise into a movement pattern from its TITLE (the library
// taxonomy is only ~9% populated, so title keywords are the reliable signal).
// Order = priority: more specific patterns first, so e.g. "SL Pogo Jump" →
// Jump, "Split Squat" → Lunge (not Squat), "Hip Thrust" → Hinge (not Squat).
// Used for the pattern-lane lineage. Falls back to library category if present.
const PATTERN_RULES = [
  ['Jump / Plyo', /jump|pogo|\bhop|bound|plyo|depth|broad|box\s*jump|reactive|throw|slam|toss|med[\s-]*ball|medicine\s*ball|wall\s*ball|skip|snap[\s-]*down|\bcmj\b|\bdj\b|rebound|\btuck\b|scissor|elastic|ankle\s*stiff|stiff[\s-]*ness|bounce|drop\s*(jump|land)|landing/],
  ['Olympic', /snatch|\bclean\b|jerk|power\s*(clean|snatch)|hang\s*(clean|snatch|pull)|high\s*pull|\bc&j\b/],
  ['Conditioning', /sprint|\brun\b|\bjog|bike|assault|\berg\b|\bski\b|rower|shuttle|tempo\s*run|interval|conditioning|\bmile\b|prowler\s*(push|sprint)|sled\s*(sprint|push|drag)/],
  ['Hinge', /deadlift|\bdl\b|\brdl\b|\bsldl\b|romanian|stiff[\s-]*leg|hip\s*thrust|thrust|good\s*morning|\bgm\b|\bswing|kettlebell\s*swing|\bkb\s*swing|hinge|pull[\s-]*through|back\s*ext|hip\s*ext|glute\s*(bridge|ham)|\bham(string)?\b|nordic|\bghr\b|reverse\s*hyper|hyperext|kickback|\brack\s*pull/],
  ['Squat', /squat|\bhack\b|leg\s*press|goblet|kossac|pistol|sissy|wall\s*sit|step[\s-]*down|leg\s*ext|knee\s*ext|\bzercher\b|front\s*squat|back\s*squat/],
  ['Lunge / SL', /lunge|split\s*squat|\brfess\b|bulgarian|step[\s-]*up|single[\s-]*leg|1[\s-]*leg|skater|shrimp|\bcossac|cossack|copenhagen|reverse\s*lunge|walking\s*lunge|\bsl\s/],
  ['Vertical Pull', /pull[\s-]*up|chin[\s-]*up|pull[\s-]*down|pulldown|\blat\s*(pull|raise)?|muscle[\s-]*up|\blat\b/],
  ['Horizontal Pull', /\brow\b|face[\s-]*pull|rear\s*delt|inverted|seal\s*row|t[\s-]*bar|ring\s*row|pull[\s-]*apart|\brow(ing)?\b|meadows|pendlay|chest[\s-]*support/],
  ['Vertical Push', /overhead|\bohp\b|shoulder\s*press|military|\bz[\s-]*press|pike|handstand|landmine\s*press|arnold|push\s*press|bradford|cuban/],
  ['Horizontal Push', /bench|chest\s*press|push[\s-]*up|\bdip\b|chest\s*fly|\bpec\b|floor\s*press|db\s*press|dumbbell\s*press|incline\s*press|\bcgbp\b|close[\s-]*grip\s*bench/],
  ['Core / Carry', /plank|\bab\b|\bcore\b|leg\s*raise|knee\s*raise|pallof|rollout|carry|farmer|suitcase|waiter|crunch|hollow|dead\s*bug|bird\s*dog|anti[\s-]|rotation|twist|woodchop|chop|sit[\s-]*up|\bl[\s-]*sit|hang|sled\s*(drag|pull)?|prowler|crawl|bear|get[\s-]*up|turkish|copenhagen\s*plank|side\s*plank|\bohc\b/],
  ['Arms / Iso', /curl|tricep|bicep|extension|pushdown|skull|preacher|hammer|forearm|wrist|lateral\s*raise|front\s*raise|\bfly\b|reverse\s*fly|\bcalf\b|shrug|adduction|abduction|delt\s*raise|\braise\b/],
];
export function classifyPattern(title, lib) {
  const t = (title || '').toLowerCase();
  for (const [name, re] of PATTERN_RULES) if (re.test(t)) return name;
  // Fall back to a library movement/category hint if the title had no keyword.
  const cat = (lib?.movementPattern || lib?.movementType || lib?.category || '').toLowerCase();
  if (cat) {
    if (/squat/.test(cat)) return 'Squat';
    if (/hinge|deadlift/.test(cat)) return 'Hinge';
    if (/push/.test(cat)) return /vert/.test(cat) ? 'Vertical Push' : 'Horizontal Push';
    if (/pull|row/.test(cat)) return /vert/.test(cat) ? 'Vertical Pull' : 'Horizontal Pull';
    if (/lunge/.test(cat)) return 'Lunge / SL';
    if (/olympic/.test(cat)) return 'Olympic';
    if (/carry|core|rotation|anti/.test(cat)) return 'Core / Carry';
  }
  return 'Other';
}

// Map classifyPattern's output onto the 9 REQUIRED_PATTERNS the coverage widget
// tracks. classifyPattern collapses carry + rotation into one 'Core / Carry'
// bucket, so re-split those two with dedicated title regexes. Title-based (like
// the Overload chart) so it works on the ~91%-unclassified library. Returns null
// for non-primary buckets (Jump/Olympic/Conditioning/Arms/Other) so they don't
// falsely fill a primary slot.
const COVERAGE_CARRY_RE = /carry|farmer|suitcase|waiter|yoke|sled\s*(drag|push|pull)|prowler|loaded\s*carry|bear\s*crawl/;
const COVERAGE_ROT_RE = /pallof|rotation|rotat|twist|woodchop|chop|anti[\s-]*rot|russian\s*twist|landmine\s*(rot|twist)|oblique/;
const COVERAGE_MAP = { 'Squat': 'Squat', 'Hinge': 'Hip Hinge', 'Lunge / SL': 'Lunge', 'Horizontal Push': 'Horizontal Push', 'Horizontal Pull': 'Horizontal Pull', 'Vertical Push': 'Vertical Push', 'Vertical Pull': 'Vertical Pull' };
function coveragePattern(title, lib) {
  const p = classifyPattern(title, lib);
  if (COVERAGE_MAP[p]) return COVERAGE_MAP[p];
  if (p === 'Core / Carry') {
    const t = (title || '').toLowerCase();
    if (COVERAGE_CARRY_RE.test(t)) return 'Carry/Loaded Locomotion';
    if (COVERAGE_ROT_RE.test(t)) return 'Rotation/Anti-Rotation';
  }
  return null;
}

// ── Periodization science (grounded in the athlete's own sets+reps, since the
// load field is mostly empty). Sources folded in: NSCA goal table, Issurin block
// periodization, RP volume landmarks, Zatsiorsky load zones, Mujika taper.
// Reps are the intensity proxy — the reliable signal when %1RM isn't logged.
const POWER_PATTERNS = new Set(['Jump / Plyo', 'Olympic']);
// Training emphasis from the volume-weighted mean reps (NSCA goal table).
function emphasisFromReps(avgReps) {
  if (avgReps == null || !isFinite(avgReps)) return { key: 'mixed', label: 'Mixed', reps: '', pct: '' };
  if (avgReps <= 5.5) return { key: 'strength', label: 'Max strength', reps: '≤5', pct: '85–100%' };
  if (avgReps <= 8)   return { key: 'func',     label: 'Strength',     reps: '6–8',  pct: '80–85%' };
  if (avgReps <= 12)  return { key: 'hyper',    label: 'Hypertrophy',  reps: '8–12', pct: '67–80%' };
  return { key: 'endur', label: 'Endurance', reps: '12+', pct: '<67%' };
}
// %1RM proxy from reps — Epley inverse. 10 reps → 75% (matches Zatsiorsky's
// elite 10RM≈75%), 5→85.7, 3→90.9, 12→71.4. Drives the intensity line.
function pctFromReps(reps) {
  if (reps == null || !isFinite(reps) || reps <= 0) return null;
  return Math.round(100 / (1 + reps / 30));
}
// Detect a block's periodization phase: explicit name keywords first, else infer
// from the numbers (relative volume + rep emphasis + power share).
function detectPhase(name, { avgReps, totalSets, avgSets, peakSets, powerShare }) {
  const n = (name || '').toLowerCase();
  if (/deload|de-load|taper|recover|back[\s-]*off|unload|rest\s*week|פריקה|דילоуд/.test(n)) return 'Deload';
  if (/peak|realiz|test\s*week|compet|max\s*out/.test(n)) return 'Peak';
  if (/power|\bpwr\b|plyo|speed|explos|dynamic|convert|conversion|\brfd\b|ballistic/.test(n)) return 'Power';
  if (/strength|\bstr\b|\bint\b|\bmxs\b|intensif|max\s*str|\bheavy\b|כוח/.test(n)) return 'Strength';
  // \bvol\b catches the "VOL" abbrev (VOL I / UNI VOL / VOL Ramp) without matching
  // the full word "volume" (no word boundary mid-word). Ohad's naming — verified
  // by the roster phase audit. INT / RP-landmarks (MAV/MEV/MRV/MED) left to numeric
  // inference pending his phase-mapping call.
  if (/hyper|\bhyp\b|mass|volume|\bvol\b|accumul|\bgpp\b|\bbase\b|\bprep\b|anatom|foundation|היפרטרופיה|נפח/.test(n)) return 'Hypertrophy';
  if (/endu|metcon|capacity|work\s*cap/.test(n)) return 'Hypertrophy';
  // Numeric inference.
  if (avgSets && totalSets <= avgSets * 0.72) return 'Deload';
  if (powerShare > 0.30) return 'Power';
  const emp = emphasisFromReps(avgReps).key;
  if (emp === 'strength') return (peakSets && totalSets <= peakSets * 0.72) ? 'Peak' : 'Strength';
  if (emp === 'func') return 'Strength';
  if (emp === 'hyper' || emp === 'endur') return 'Hypertrophy';
  return 'Mixed';
}
// Phase → display metadata. Palette stays inside the brand (cyan family +
// neutrals + one warm for peak/warning); readable on both themes.
const PHASE_META = {
  Accumulation: { code: 'ACC', color: '#5aa9c9', label: 'Accumulation', hint: 'Volume base' },
  Hypertrophy:  { code: 'HYP', color: '#39BDFF', label: 'Hypertrophy',  hint: 'Muscle · volume' },
  Strength:     { code: 'STR', color: '#3f7ce0', label: 'Strength',     hint: 'Heavy · low reps' },
  Power:        { code: 'PWR', color: '#8b7cf0', label: 'Power',        hint: 'Fast · explosive' },
  Peak:         { code: 'PK',  color: '#f0b429', label: 'Peak',         hint: 'Realize · test' },
  Deload:       { code: 'DL',  color: '#8a8f98', label: 'Deload',       hint: 'Recover' },
  Mixed:        { code: 'MIX', color: '#6b7280', label: 'Mixed',        hint: 'Mixed emphasis' },
};
const phaseMeta = (p) => PHASE_META[p] || PHASE_META.Mixed;
// Shorter labels for the matrix so the two Horizontal/Vertical lanes don't both
// truncate to an ambiguous "HORIZONTA…".
const PAT_SHORT = { 'Horizontal Push': 'Horiz. Push', 'Horizontal Pull': 'Horiz. Pull', 'Vertical Push': 'Vert. Push', 'Vertical Pull': 'Vert. Pull' };
const patLabel = (p) => PAT_SHORT[p] || p;

export function TrainingLineage({ traineeId, traineeName, exercises, plans, loading, onOpenPlan }) {
  const [metric, setMetric] = useState('sets'); // 'sets' | 'volume'
  const [briefCopied, setBriefCopied] = useState(false); // next-block brief → clipboard toast
  const [reportOpen, setReportOpen] = useState(false); // full-page next-block report overlay
  const exMap = exById(exercises);

  // Aggregate by MOVEMENT PATTERN, not by exercise. Ohad programs with near-
  // total exercise variety (most lifts appear in one block only), so a per-lift
  // matrix is 300+ sparse rows of noise. Collapsing to ~10 pattern lanes shows
  // the actual periodization story: which patterns ramp, hold, or drop across
  // blocks. Pattern is classified from the exercise TITLE (library taxonomy is
  // only ~9% populated), so it works regardless of classification coverage.
  const model = useMemo(() => {
    if (!plans || !plans.length) return null;
    const blocks = plans
      .filter(p => (p.days || []).some(d => (d.exercises || []).length))
      .map((p, idx) => ({ id: p.id, name: p.name || 'Block', phase: p.phase, createdAt: p.createdAt, weeks: p.weeks, num: blockNum(p.name), _idx: idx }));
    if (!blocks.length) return null;
    // Chronological total-order: block NUMBER is the real training order (imported
    // #N blocks share one created_at import stamp → time-sort useless). Numbered
    // blocks sort ascending by number; any un-numbered block (e.g. "Morning
    // Routine") appends at the end in query order — so a single un-numbered block
    // no longer scrambles the whole numbered timeline.
    blocks.sort((a, b) => {
      if (a.num != null && b.num != null) return a.num - b.num;
      if (a.num != null) return -1;
      if (b.num != null) return 1;
      return a._idx - b._idx;
    });
    const blockOrder = blocks.map(b => b.id);

    // pattern -> { pattern, cells: {blockId: {sets, vol}}, total }
    const pats = new Map();
    const blockEx = new Map();   // blockId -> Set of normalized lift keys (novelty)
    plans.forEach((p) => {
      if (!blockOrder.includes(p.id)) return;
      (p.days || []).forEach(d => (d.exercises || []).forEach(ex => {
        const lib = ex.exerciseId ? exMap.get(ex.exerciseId) : null;
        const title = (ex.title || lib?.title || '').trim();
        const pattern = classifyPattern(title, lib);
        const sets = Number(ex.sets) || 0;
        const rt = repsTop(ex.reps);
        const vol = (sets && rt) ? sets * rt : 0;
        if (!sets) return;
        if (title) { let bx = blockEx.get(p.id); if (!bx) { bx = new Set(); blockEx.set(p.id, bx); } bx.add(title.toLowerCase().replace(/\s+/g, ' ').trim()); }
        let row = pats.get(pattern);
        if (!row) { row = { pattern, cells: {}, total: 0 }; pats.set(pattern, row); }
        let cell = row.cells[p.id];
        if (!cell) { cell = { sets: 0, vol: 0, repSets: 0 }; row.cells[p.id] = cell; }
        cell.sets += sets; cell.vol += vol; cell.repSets += rt ? sets : 0;
        row.total += sets;
      }));
    });

    const val = (c) => c ? (metric === 'volume' ? c.vol : c.sets) : null;
    const rows = [...pats.values()].map(row => {
      const seq = blockOrder.map(bid => row.cells[bid]).filter(Boolean);
      const nums = seq.map(val).filter(v => v != null && v > 0);
      let trend = 'flat';
      if (nums.length >= 2) {
        const a = nums[0], b = nums[nums.length - 1];
        trend = b > a * 1.05 ? 'up' : b < a * 0.95 ? 'down' : 'flat';
      } else if (nums.length === 1) trend = 'single';
      const inLatest = !!row.cells[blockOrder[blockOrder.length - 1]];
      return { ...row, trend, inLatest, appears: seq.length };
    });
    // Sort by total volume desc — the athlete's biggest emphasis rises to the
    // top; "Other" (unclassifiable) always sinks to the bottom.
    rows.sort((a, b) => (a.pattern === 'Other') - (b.pattern === 'Other') || b.total - a.total);

    // Per-block totals — working sets (volume), volume-load, and the intensity
    // proxy (volume-weighted mean reps → %1RM). Powers the wave + phase detection.
    blocks.forEach(b => {
      let sets = 0, vol = 0, pwr = 0, repSets = 0;
      rows.forEach(r => { const c = r.cells[b.id]; if (!c) return; sets += c.sets; vol += c.vol; repSets += c.repSets; if (POWER_PATTERNS.has(r.pattern)) pwr += c.sets; });
      b.totalSets = sets;
      b.totalVol = vol;
      // Intensity proxy = volume-weighted mean reps, divided by the sets that
      // ACTUALLY carried reps (blank-rep sets must not drag it toward "strength").
      b.avgReps = repSets ? vol / repSets : null;
      b.powerShare = sets ? pwr / sets : 0;
      b.intensityPct = pctFromReps(b.avgReps);          // %1RM proxy (Epley inverse)
      b.emphasis = emphasisFromReps(b.avgReps);
    });
    const setsSeries = blocks.map(b => b.totalSets);
    const latestSets = setsSeries[setsSeries.length - 1] || 0;
    const prevSets = setsSeries.length >= 2 ? setsSeries[setsSeries.length - 2] : null;
    const peakSets = setsSeries.length ? Math.max(...setsSeries) : 0;
    const peakBlock = blocks[setsSeries.indexOf(peakSets)];
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const avgSetsAll = mean(setsSeries);
    const win = Math.min(3, setsSeries.length);
    const eAvg = mean(setsSeries.slice(0, win)), lAvg = mean(setsSeries.slice(-win));
    const volTrendPct = eAvg ? Math.round(((lAvg - eAvg) / eAvg) * 100) : 0;
    // Detect each block's phase (needs the series-level avg/peak).
    blocks.forEach(b => { b.phase = detectPhase(b.name, { avgReps: b.avgReps, totalSets: b.totalSets, avgSets: avgSetsAll, peakSets, powerShare: b.powerShare }); });
    // ACWR — acute (latest block) : chronic (mean of the last ≤4 blocks incl the
    // latest). Sweet spot 0.8–1.3; caution >1.3; danger >1.5 (injury-risk model).
    const chronic = mean(setsSeries.slice(-Math.min(4, setsSeries.length)));
    // Needs a real chronic window — a single block gives a meaningless 1.00.
    const acwr = (chronic && setsSeries.length >= 2) ? +(latestSets / chronic).toFixed(2) : null;
    const intensitySeries = blocks.map(b => b.intensityPct);
    // Top focus = the pattern with the most sets in the LATEST block.
    const latestId = blockOrder[blockOrder.length - 1];
    let topFocus = '—', topFocusN = -1;
    rows.forEach(r => { const s = r.cells[latestId]?.sets || 0; if (s > topFocusN && r.pattern !== 'Other') { topFocusN = s; topFocus = r.pattern; } });

    // ── NEXT-BLOCK GUIDANCE — turn the history into a plan for the block you're
    // about to build. Per-pattern set targets (progress / hold / vary / fill a
    // gap), grounded in the athlete's own recent density + the programming rules
    // (cover every primary pattern; cap weekly volume growth ~10%).
    const PRIMARY = new Set(['Squat', 'Hinge', 'Horizontal Push', 'Horizontal Pull', 'Vertical Push', 'Vertical Pull', 'Core / Carry']);
    const recentIds = blockOrder.slice(-Math.min(3, blockOrder.length));
    rows.forEach(r => {
      const latest = r.cells[latestId]?.sets || 0;
      const recentAvg = recentIds.reduce((a, bid) => a + (r.cells[bid]?.sets || 0), 0) / recentIds.length;
      const present = blockOrder.map(bid => r.cells[bid]?.sets).filter(v => v > 0);
      const typical = present.length ? Math.round(present.reduce((a, v) => a + v, 0) / present.length) : 0;
      // Plateau: trained ≥3 times and the last 3 trained values didn't climb.
      let plateau = false;
      if (present.length >= 3) { const t = present.slice(-3); plateau = t[2] <= t[0] * 1.03 && t[1] <= t[0] * 1.03; }
      r.plateau = plateau;
      // Volume band (RP landmarks, proxied from the athlete's own history):
      // MRV = the most sets they've recovered from for this pattern; MEV = a
      // rough productive floor (~half of MRV). latest positioned in the band.
      r.mrv = present.length ? Math.max(...present) : 0;
      r.mev = r.mrv ? Math.max(2, Math.round(r.mrv * 0.5)) : 0;
      // Accommodation (Zatsiorsky) — response decays to an unchanging stimulus.
      // Flag if the last two trained blocks held ~equal sets AND ~equal reps.
      const tc = blockOrder.map(bid => r.cells[bid]).filter(Boolean);
      let accommodation = false;
      if (tc.length >= 2) {
        const a = tc[tc.length - 2], b2 = tc[tc.length - 1];
        const ar = a.sets ? a.vol / a.sets : 0, br = b2.sets ? b2.vol / b2.sets : 0;
        accommodation = Math.abs(b2.sets - a.sets) <= 1 && Math.abs(br - ar) <= 1;
      }
      r.accommodation = accommodation;
      // Recency — blocks since last trained (0 = present in the latest block).
      let since = 0; for (let i = blockOrder.length - 1; i >= 0; i--) { if ((r.cells[blockOrder[i]]?.sets || 0) > 0) break; since++; }
      r.since = since;
      // Trend for the RECOMMENDATION is always sets-based (the target is in sets),
      // so flipping the Sets/Volume display toggle can't change the prescription.
      const setsUp = present.length >= 2 && present[present.length - 1] > present[0] * 1.05;
      let target, tag, tone;
      if (PRIMARY.has(r.pattern) && latest === 0) { target = Math.max(3, typical || 4); tag = 'fill gap'; tone = 'gap'; }
      else if (latest === 0) { target = 0; tag = ''; tone = 'none'; }
      else if ((plateau || accommodation)) { target = latest; tag = 'vary'; tone = 'vary'; }
      else if (setsUp) { target = Math.min(latest + Math.max(1, Math.round(latest * 0.1)), Math.max(latest, r.mrv)); tag = 'progress'; tone = 'up'; }
      else if (latest < recentAvg * 0.85) { target = Math.round(recentAvg); tag = 'rebuild'; tone = 'up'; }
      else { target = latest; tag = 'hold'; tone = 'hold'; }
      r.next = { target, tag, tone };
    });
    const coverageGaps = [...PRIMARY].filter(pat => {
      const row = rows.find(r => r.pattern === pat);
      return !(row && (row.cells[latestId]?.sets || 0) > 0);
    });
    // ── Block composition — variety & balance per block (analysis-only). Ohad
    // programs with high exercise variety; quantify it: distinct patterns trained,
    // primary-pattern coverage, and how many lifts are NEW vs everything trained in
    // earlier blocks. Variety score 0–100 = primary coverage (55%) + spread (45%).
    const seenLifts = new Set();
    blocks.forEach((b) => {
      let distinct = 0, primaryCov = 0;
      rows.forEach(r => {
        if (r.pattern === 'Other') return;
        if ((r.cells[b.id]?.sets || 0) > 0) { distinct++; if (PRIMARY.has(r.pattern)) primaryCov++; }
      });
      const ex = blockEx.get(b.id) || new Set();
      let novel = 0; ex.forEach(k => { if (!seenLifts.has(k)) novel++; });
      ex.forEach(k => seenLifts.add(k));
      b.distinctPatterns = distinct;
      b.primaryCovered = primaryCov;
      b.exCount = ex.size;
      b.novelPct = ex.size ? Math.round((novel / ex.size) * 100) : 0;
      b.varietyScore = Math.round(100 * (0.55 * (primaryCov / PRIMARY.size) + 0.45 * Math.min(1, distinct / 8)));
    });
    const latestComp = blocks[blocks.length - 1];
    const sumRecent = (names) => names.reduce((a, n) => { const row = rows.find(r => r.pattern === n); return a + recentIds.reduce((s, bid) => s + (row?.cells[bid]?.sets || 0), 0); }, 0);
    const pushSets = sumRecent(['Horizontal Push', 'Vertical Push']);
    const pullSets = sumRecent(['Horizontal Pull', 'Vertical Pull']);
    const pushPull = pullSets > 0 ? +(pushSets / pullSets).toFixed(2) : null;
    // ── Next-block PHASE + volume prescription. Phase potentiation (each block
    // sets up the next), interrupted by a deload when fatigue is due (ACWR hot,
    // just peaked, or the 3:1/4:1 loading clock ran out). Deload = cut volume
    // ~50%, keep intensity (Mujika). Building phases ramp toward MRV, ACWR-capped.
    const latestBlock = blocks[blocks.length - 1];
    const latestPhase = latestBlock?.phase || 'Mixed';
    let sinceDeload = 0; for (let i = blocks.length - 1; i >= 0; i--) { if (blocks[i].phase === 'Deload') break; sinceDeload++; }
    // Deload is driven by FATIGUE/timing (ACWR hot, or the 3:1/4:1 clock ran out) —
    // NOT by the latest block merely being the highest-volume one, which is the
    // normal accumulation state. A post-peak deload comes from the phase sequence.
    const acwrHot = acwr != null && acwr > 1.3;
    const NEXT_PHASE = { Accumulation: 'Strength', Hypertrophy: 'Strength', Strength: 'Peak', Power: 'Peak', Peak: 'Deload', Deload: 'Hypertrophy', Mixed: 'Hypertrophy' };
    const fatigueDeload = latestPhase !== 'Deload' && (acwrHot || sinceDeload >= 4);
    const suggestedPhase = fatigueDeload ? 'Deload' : (NEXT_PHASE[latestPhase] || 'Hypertrophy');
    const deloadDue = suggestedPhase === 'Deload';   // banner + volTarget key on the recommendation
    let volTarget, volNote;
    if (suggestedPhase === 'Deload') {
      volTarget = Math.round(latestSets * 0.5);
      volNote = acwrHot ? 'cut ~50%, hold intensity — load ratio is hot' : sinceDeload >= 4 ? 'planned deload — cut ~50%, hold intensity' : 'post-peak deload — cut ~50%, hold intensity';
    } else if (suggestedPhase === 'Peak') {
      volTarget = Math.round(latestSets * 0.8);
      volNote = 'trim volume, drive intensity (1–3 reps)';
    } else {
      const acwrCap = chronic ? Math.round(chronic * 1.3) : Math.round(latestSets * 1.1);
      volTarget = Math.min(Math.round(latestSets + Math.max(2, latestSets * 0.1)), Math.max(latestSets, acwrCap));
      const pct = Math.round(((volTarget - latestSets) / (latestSets || 1)) * 100);
      volNote = `ramp ${pct > 0 ? '+' + pct + '%' : 'hold'} toward MRV · load-ratio safe`;
    }
    const PHASE_REPS = { Hypertrophy: '8–12 reps · 67–80%', Accumulation: '8–12 reps · 67–80%', Strength: '3–6 reps · ≥85%', Peak: '1–3 reps · ~90%+', Power: '1–5 fast · 75–90%', Deload: 'hold reps · cut sets', Mixed: 'mixed emphasis' };
    const repBand = PHASE_REPS[suggestedPhase] || '';

    return {
      blocks, rows, acwr, latestPhase, intensitySeries,
      nextPlan: { coverageGaps, pushPull, pushSets, pullSets, volTarget, volNote, suggestedPhase, repBand, deloadDue, acwr, nextNum: (blocks[blocks.length - 1]?.num != null ? blocks[blocks.length - 1].num + 1 : null) },
      stats: {
        blocks: blocks.length,
        avgSets: Math.round(mean(setsSeries)),
        latestSets,
        deltaSets: prevSets == null ? null : latestSets - prevSets,
        peakSets,
        peakLabel: peakBlock ? (peakBlock.num != null ? `#${peakBlock.num}` : (peakBlock.name || '').slice(0, 8)) : '—',
        volTrendPct,
        topFocus,
        latestPhase,
        latestEmphasis: latestBlock?.emphasis?.label || '—',
        latestIntensity: latestBlock?.intensityPct || null,
        variety: latestComp ? { score: latestComp.varietyScore, primaryCovered: latestComp.primaryCovered, primaryTotal: PRIMARY.size, distinctPatterns: latestComp.distinctPatterns, novelPct: latestComp.novelPct, exCount: latestComp.exCount } : null,
      },
    };
  }, [plans, metric, exMap]);

  const stripHead = (label) => (
    <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '7px 12px', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>{label}</div>
  );

  if (!traineeId) {
    return (
      <div style={{ border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)' }}>
        {stripHead('Training Analysis')}
        <div style={{ padding: '48px 24px', textAlign: 'center', color: C.tm, fontFamily: FB, fontSize: 13, lineHeight: 1.6 }}>
          Pick an athlete from the rail to trace every lift's load & volume
          <br />across all their blocks — plateaus, progressions and dropped patterns at a glance.
        </div>
      </div>
    );
  }
  if (loading) {
    return <div style={{ border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)' }}>{stripHead(`Training Analysis · ${traineeName || ''}`)}<div style={{ padding: '48px 24px', textAlign: 'center', color: C.tm, fontFamily: FN, fontSize: 11, letterSpacing: '0.1em' }}>LOADING BLOCKS…</div></div>;
  }
  if (!model) {
    return <div style={{ border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)' }}>{stripHead(`Training Analysis · ${traineeName || ''}`)}<div style={{ padding: '48px 24px', textAlign: 'center', color: C.tm, fontFamily: FB, fontSize: 13 }}>No block content to trace yet for this athlete.</div></div>;
  }

  const { blocks, rows, stats, nextPlan, acwr } = model;
  // Imported blocks share one created_at (the import stamp) → the per-column
  // date reads identically on every column (noise). Show it only when dates differ.
  const allSameDate = blocks.length > 1 && blocks.every(b => fmtPrettyDate(b.createdAt) === fmtPrettyDate(blocks[0].createdAt));
  const heb = isHebrew(traineeName);
  const val = (c) => c ? (metric === 'volume' ? c.vol : c.sets) : null;
  const trendGlyph = (t) => t === 'up' ? '▲' : t === 'down' ? '▼' : t === 'flat' ? '＝' : '·';
  const trendColor = (t) => t === 'up' ? '#39BDFF' : t === 'down' ? C.rd : C.tm;
  // Colour for a next-block suggestion tone.
  const nextTone = (tone) => tone === 'up' ? '#39BDFF' : tone === 'gap' ? C.rd : tone === 'vary' ? C.or : C.tm;
  // ACWR tone — sweet spot 0.8–1.3 (green), caution outside, danger >1.5 (red).
  const acwrTone = acwr == null ? C.tm : (acwr >= 0.8 && acwr <= 1.3) ? C.gn : acwr > 1.5 ? C.rd : C.or;
  const acwrWord = acwr == null ? '—' : (acwr >= 0.8 && acwr <= 1.3) ? 'optimal' : acwr > 1.5 ? 'spike risk' : acwr < 0.8 ? 'detraining' : 'watch';
  const curPhase = phaseMeta(stats.latestPhase);

  const kpi = (label, value, sub, accent) => (
    <div style={{ flex: '1 1 0', minWidth: 100, border: `1px solid ${C.cardBd}`, background: 'var(--c-sf2)', padding: '9px 12px' }}>
      <div style={{ fontFamily: FN, fontSize: 22, fontWeight: 700, lineHeight: 1, color: accent || C.tx, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginTop: 5 }}>{label}</div>
      {sub != null && <div style={{ fontFamily: FB, fontSize: 10, color: C.td, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  );

  // Next-block BRIEF — the analysis as a copyable periodization starting point.
  // It prescribes phase, volume & per-pattern set targets; it deliberately does
  // NOT choose exercises or loads (that stays the coach's value-add).
  const buildBrief = () => {
    const L = [];
    L.push(`EXPO · Next-block brief — ${traineeName || ''}${nextPlan.nextNum != null ? ` · #${nextPlan.nextNum}` : ''}`);
    L.push(`Phase: ${phaseMeta(nextPlan.suggestedPhase).label}${nextPlan.repBand ? ` (${nextPlan.repBand})` : ''}`);
    L.push(`Total working sets: ~${nextPlan.volTarget} — ${nextPlan.volNote}`);
    if (nextPlan.acwr != null) L.push(`Load ratio (ACWR): ${nextPlan.acwr.toFixed(2)} — aim 0.8–1.3 (${acwrWord})`);
    if (nextPlan.pushPull != null) L.push(`Push:Pull: ${nextPlan.pushPull} — ${nextPlan.pushPull > 1.3 ? 'add pulling' : nextPlan.pushPull < 0.77 ? 'add pushing' : 'balanced'}`);
    L.push(`Coverage gaps to add: ${nextPlan.coverageGaps.length ? nextPlan.coverageGaps.join(', ') : 'none — every primary pattern covered'}`);
    const targets = rows.filter(r => r.pattern !== 'Other' && r.next && r.next.target > 0).map(r => `  · ${patLabel(r.pattern)} → ~${r.next.target} sets (${r.next.tag})`);
    if (targets.length) { L.push('Per-pattern set targets:'); L.push(...targets); }
    L.push('— Exercise selection & loads are yours; this is a periodization starting point, not a prescription.');
    return L.join('\n');
  };
  const copyBrief = () => {
    // Only flip to "Copied ✓" on a REAL success — writeText returns a Promise, so a
    // sync try/catch alone would show a false success on async permission failure.
    const flag = () => { setBriefCopied(true); setTimeout(() => setBriefCopied(false), 1800); };
    try { const r = navigator.clipboard?.writeText(buildBrief()); if (r && typeof r.then === 'function') r.then(flag).catch(() => { /* denied — no false toast */ }); else if (r !== undefined) flag(); } catch { /* clipboard unavailable — no false success */ }
  };

  const NAME_W = 208;
  const COL_W = 62;

  // ── Periodization-wave geometry (one SVG: volume bars + intensity line + phase
  // ribbon). Fixed px so it never distorts; the container scrolls horizontally.
  const n = blocks.length;
  const SLOT = 46, PADX = 20, PADT = 16, CHARTH = 116, RIBH = 20, LBLH = 16, BARW = 24;
  const svgW = PADX * 2 + n * SLOT;
  const svgH = PADT + CHARTH + 8 + RIBH + LBLH;
  const cx = (i) => PADX + i * SLOT + SLOT / 2;
  const yBar = (s) => stats.peakSets ? (PADT + CHARTH - Math.max(2, (s / stats.peakSets) * (CHARTH - 4))) : PADT + CHARTH;
  const yInt = (p) => { const lo = 55, hi = 100; const t = (Math.min(hi, Math.max(lo, p)) - lo) / (hi - lo); return PADT + (CHARTH - 6) - t * (CHARTH - 18); };
  const intPts = blocks.map((b, i) => b.intensityPct != null ? { x: cx(i), y: yInt(b.intensityPct) } : null);
  const intLine = intPts.filter(Boolean).map(pt => `${pt.x},${pt.y}`).join(' ');

  return (
    <div style={{ border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)' }}>
      {stripHead(<>
        <span>Training Analysis · <span style={{ color: '#fff', fontFamily: heb ? FH : FN }}>{traineeName}</span></span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['sets', 'Sets'], ['volume', 'Volume']].map(([v, l]) => {
            const on = metric === v;
            return <button key={v} onClick={() => setMetric(v)} title={v === 'sets' ? 'Working sets per pattern per block' : 'Volume = sets × top reps'} style={{ height:24, padding: '0 10px', border: `1px solid ${on ? '#39BDFF' : 'rgba(255,255,255,0.25)'}`, background: on ? '#39BDFF' : 'transparent', color: on ? '#06131b' : '#fff', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{l}</button>;
          })}
        </div>
      </>)}

      {/* KPI band — the athlete's current periodization state at a glance. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 12px 4px' }}>
        {kpi('Blocks', blocks.length, `avg ${stats.avgSets} sets`)}
        {kpi(stats.deltaSets == null ? 'This block' : `This block · ${stats.deltaSets >= 0 ? '+' : ''}${stats.deltaSets}`, stats.latestSets, 'working sets', stats.deltaSets == null ? C.tx : stats.deltaSets > 0 ? '#39BDFF' : stats.deltaSets < 0 ? C.or : C.tx)}
        {kpi('Intensity', stats.latestIntensity ? `${stats.latestIntensity}%` : '—', stats.latestEmphasis)}
        {kpi('Load ratio', acwr != null ? acwr.toFixed(2) : '—', `ACWR · ${acwrWord}`, acwrTone)}
        <div style={{ flex: '1 1 0', minWidth: 130, border: `1px solid ${C.cardBd}`, background: 'var(--c-sf2)', padding: '9px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 11, height: 11, background: curPhase.color, flexShrink: 0 }} />
            <span style={{ fontFamily: FN, fontSize: 16, fontWeight: 700, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{curPhase.label}</span>
          </div>
          <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginTop: 6 }}>Current phase</div>
          <div style={{ fontFamily: FB, fontSize: 10, color: C.td, marginTop: 2 }}>{curPhase.hint}</div>
        </div>
      </div>

      {/* Periodization wave — volume (bars) vs intensity (%1RM line) with a phase
          ribbon. Reads the load story: does volume ramp then taper, does intensity
          climb across blocks, where do the deloads fall. Click a block to open it. */}
      <div style={{ padding: '10px 12px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>Periodization wave</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontFamily: FN, fontSize: 9, letterSpacing: '0.06em', color: C.tm }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, background: 'color-mix(in srgb, #39BDFF 40%, transparent)' }} />VOLUME</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 2, background: '#f0b429' }} />INTENSITY %1RM</span>
          </div>
        </div>
        <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
          <svg width={svgW} height={svgH} style={{ display: 'block' }}>
            {/* 75% intensity reference line */}
            <line x1={PADX} y1={yInt(75)} x2={svgW - PADX} y2={yInt(75)} style={{ stroke: C.cardBd }} strokeWidth="1" strokeDasharray="3 3" />
            <text x={2} y={yInt(75) + 3} textAnchor="start" style={{ fontFamily: FN, fontSize: 8, fill: C.tm }}>75%</text>
            {blocks.map((b, i) => {
              const last = i === n - 1;
              const bx = cx(i) - BARW / 2;
              const by = yBar(b.totalSets);
              const pm = phaseMeta(b.phase);
              return (
                <g key={b.id} style={{ cursor: 'pointer' }} onClick={() => onOpenPlan && onOpenPlan(b.id)}>
                  <title>{`${b.name} — ${b.totalSets} sets${b.intensityPct != null ? ' · ' + b.intensityPct + '% 1RM' : ''} · ${pm.label}`}</title>
                  <rect x={PADX + i * SLOT} y={PADT} width={SLOT} height={CHARTH + 8 + RIBH} fill="transparent" />
                  <rect x={bx} y={by} width={BARW} height={Math.max(0, (PADT + CHARTH) - by)} style={{ fill: last ? '#39BDFF' : 'color-mix(in srgb, #39BDFF 34%, transparent)' }} />
                  <text x={cx(i)} y={by - 4} textAnchor="middle" style={{ fontFamily: FN, fontSize: 8.5, fill: last ? '#39BDFF' : C.tm, fontVariantNumeric: 'tabular-nums' }}>{b.totalSets}</text>
                  <rect x={PADX + i * SLOT + 2} y={PADT + CHARTH + 8} width={SLOT - 4} height={RIBH} style={{ fill: pm.color, opacity: last ? 0.95 : 0.6 }} />
                  <text x={cx(i)} y={PADT + CHARTH + 8 + RIBH / 2 + 3} textAnchor="middle" style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, fill: '#06131b' }}>{pm.code}</text>
                  <text x={cx(i)} y={svgH - 4} textAnchor="middle" style={{ fontFamily: FN, fontSize: 8.5, fill: last ? '#39BDFF' : C.td, fontVariantNumeric: 'tabular-nums' }}>{b.num ?? (i + 1)}</text>
                </g>
              );
            })}
            {intLine && <polyline points={intLine} fill="none" stroke="#f0b429" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            {intPts.map((pt, i) => pt && <circle key={i} cx={pt.x} cy={pt.y} r={i === n - 1 ? 3.5 : 2.5} fill="#f0b429" style={{ stroke: 'var(--c-sf)' }} strokeWidth="1" />)}
          </svg>
        </div>
      </div>

      {/* Movement-pattern matrix — ~10 lanes, not 300 lifts. Each cell = working
          sets for that pattern that block; the periodization at a glance. */}
      <div style={{ padding: '12px 12px 0', fontFamily: FN, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>
        Movement patterns · {metric === 'volume' ? 'volume' : 'sets'} per block
      </div>
      <div style={{ overflowX: 'auto', padding: '6px 12px 12px' }}>
        <div style={{ minWidth: NAME_W + blocks.length * COL_W }}>
          {/* header row */}
          <div style={{ display: 'grid', gridTemplateColumns: `${NAME_W}px repeat(${blocks.length}, ${COL_W}px)`, gap: 0, alignItems: 'stretch' }}>
            <div style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--c-sf)', borderBottom: `2px solid ${C.cardBd}`, padding: '6px 8px', fontFamily: FN, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}><span>Pattern</span><span style={{ color: '#39BDFF' }}>→ next</span></div>
            {blocks.map((b, i) => (
              <button key={b.id} onClick={() => onOpenPlan && onOpenPlan(b.id)} title={`Open ${b.name}`}
                style={{ textAlign: 'center', border: 'none', borderBottom: `2px solid ${i === blocks.length - 1 ? '#39BDFF' : C.cardBd}`, borderLeft: `1px solid ${C.cardBd}`, background: i === blocks.length - 1 ? 'color-mix(in srgb, var(--c-ac) 8%, transparent)' : 'transparent', padding: '6px 4px', cursor: 'pointer', overflow: 'hidden' }}>
                <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: i === blocks.length - 1 ? '#39BDFF' : C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.name}>{b.num != null ? `#${b.num}` : (b.name || '')}</div>
                {!allSameDate && b.createdAt && <div style={{ fontFamily: FB, fontSize: 8, color: C.tm, marginTop: 2 }}>{fmtPrettyDate(b.createdAt)}</div>}
              </button>
            ))}
          </div>
          {/* pattern rows — one lane per movement pattern. No per-exercise drill-down:
              the exercise inventory underneath is the noise the lanes exist to escape. */}
          {rows.map((r, ri) => (
            <div key={r.pattern} style={{ display: 'grid', gridTemplateColumns: `${NAME_W}px repeat(${blocks.length}, ${COL_W}px)`, alignItems: 'stretch', opacity: r.pattern === 'Other' ? 0.6 : 1 }}>
              <div style={{ position: 'sticky', left: 0, zIndex: 1, background: ri % 2 ? 'var(--c-sf)' : 'var(--c-sf2)', borderBottom: `1px solid ${C.cardBd}`, padding: '7px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, minWidth: 0 }}>
                {/* Line 1 — the pattern name gets the full width so it never truncates. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span style={{ color: trendColor(r.trend), fontSize: 10, width: 11, textAlign: 'center', flexShrink: 0 }}>{trendGlyph(r.trend)}</span>
                  <span style={{ fontFamily: FB, fontSize: 12.5, fontWeight: 600, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }} title={r.pattern}>{patLabel(r.pattern)}</span>
                </div>
                {/* Line 2 — MEV→MRV band + accommodation flag + next-block target chip. */}
                {r.pattern !== 'Other' && (r.mrv > 0 || r.accommodation || (r.next && r.next.target > 0)) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 27, minWidth: 0 }}>
                    {r.mrv > 0 ? (() => {
                      const latest = r.cells[blocks[blocks.length - 1].id]?.sets || 0;
                      const fillPct = Math.min(100, Math.round((latest / r.mrv) * 100));
                      const mevPct = Math.min(100, Math.round((r.mev / r.mrv) * 100));
                      const productive = latest >= r.mev;
                      return (
                        <div title={`Latest ${latest} sets · your productive band ≈ ${r.mev}–${r.mrv} (MEV–MRV)`} style={{ position: 'relative', flex: 1, height: 4, minWidth: 0, background: 'color-mix(in srgb, var(--c-tx) 8%, transparent)' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fillPct}%`, background: latest === 0 ? 'transparent' : productive ? '#39BDFF' : C.or, opacity: 0.8 }} />
                          <div style={{ position: 'absolute', left: `${mevPct}%`, top: -1, bottom: -1, width: 1, background: C.tm }} />
                        </div>
                      );
                    })() : <div style={{ flex: 1 }} />}
                    {r.accommodation && <span title="Accommodation — same sets & reps ≥2 blocks. Change the load or the drill." style={{ flexShrink: 0, color: C.or, fontSize: 11, lineHeight: 1 }}>⚠</span>}
                    {r.next && r.next.target > 0 && (
                      <span title={`Next block — ${r.next.tag}: ~${r.next.target} sets`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0, fontFamily: FN, fontSize: 10, fontWeight: 700, color: nextTone(r.next.tone), border: `1px solid ${nextTone(r.next.tone)}`, padding: '2px 5px', borderRadius: 0, fontVariantNumeric: 'tabular-nums' }}>→ {r.next.target}</span>
                    )}
                  </div>
                )}
              </div>
              {blocks.map((b, ci) => {
                const c = r.cells[b.id];
                const prev = ci > 0 ? r.cells[blocks[ci - 1].id] : null;
                let tint = 'transparent';
                if (c && prev) {
                  const cv = val(c), pv = val(prev);
                  if (cv != null && pv != null) tint = cv > pv ? 'color-mix(in srgb, #39BDFF 13%, transparent)' : cv < pv ? 'color-mix(in srgb, #ef4444 8%, transparent)' : 'transparent';
                }
                const num = c ? val(c) : null;
                return (
                  <div key={b.id} style={{ borderBottom: `1px solid ${C.cardBd}`, borderLeft: `1px solid ${C.cardBd}`, background: tint, padding: '8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: num ? C.tx : C.td, fontVariantNumeric: 'tabular-nums' }} title={c ? `${r.pattern} · ${b.name} — ${c.sets} sets, ${c.vol} volume` : ''}>{num || '·'}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* Block composition — variety & balance of the LATEST block (analysis-only).
          Quantifies Ohad's high-variety style: patterns covered, movement spread,
          and how much of the block is fresh vs recycled from earlier blocks. */}
      {stats.variety && (
        <>
          <div style={{ padding: '4px 12px 0', fontFamily: FN, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>Block composition · latest</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '6px 12px 4px' }}>
            {kpi('Variety score', stats.variety.score, `${stats.variety.exCount} lifts`, stats.variety.score >= 66 ? C.gn : stats.variety.score >= 40 ? C.tx : C.or)}
            {kpi('Primary patterns', `${stats.variety.primaryCovered}/${stats.variety.primaryTotal}`, stats.variety.primaryCovered >= stats.variety.primaryTotal - 1 ? 'well covered' : 'gaps to fill', stats.variety.primaryCovered >= stats.variety.primaryTotal - 1 ? C.gn : C.or)}
            {kpi('Distinct patterns', stats.variety.distinctPatterns, 'movement spread')}
            {kpi('New lifts', `${stats.variety.novelPct}%`, 'vs earlier blocks', stats.variety.novelPct >= 60 ? '#39BDFF' : C.tx)}
          </div>
        </>
      )}
      {/* BUILD THE NEXT BLOCK — the lineage as a forward-looking tool: the next
          phase (potentiation), a volume target (ramp toward MRV & ACWR-capped, or
          a deload when fatigue is due), the rep/%1RM band, and coverage/balance. */}
      <div style={{ margin: '4px 12px 12px', border: `1px solid ${C.cardBd}`, background: 'var(--c-sf2)' }}>
        <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 88%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '7px 12px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span>Build the next block{nextPlan.nextNum != null ? ` · #${nextPlan.nextNum}` : ''}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button onClick={() => setReportOpen(true)} title="Open the full next-block report — goals, parameters, weekly progression, per-movement targets" style={{ height:24, padding: '0 10px', border: '1px solid #39BDFF', background: '#39BDFF', color: '#06131b', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>⤢ Full report →</button>
            <button onClick={copyBrief} title="Copy this analysis as a next-block brief — a periodization starting point (you choose the exercises & loads)" style={{ height:24, padding: '0 10px', border: `1px solid ${briefCopied ? C.gn : 'rgba(255,255,255,0.35)'}`, background: 'transparent', color: briefCopied ? C.gn : '#fff', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{briefCopied ? 'Copied ✓' : '⧉ Copy brief'}</button>
          </div>
        </div>
        {nextPlan.deloadDue && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${C.cardBd}`, background: 'color-mix(in srgb, #f0b429 12%, transparent)', fontFamily: FB, fontSize: 12 }}>
            <span style={{ color: '#f0b429', fontSize: 13, flexShrink: 0 }}>⚠</span>
            <span style={{ color: C.tx }}>Deload due — cut volume ~50% and hold intensity to shed fatigue before the next hard block.</span>
          </div>
        )}
        <div style={{ padding: 12, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 132 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 11, height: 11, background: phaseMeta(nextPlan.suggestedPhase).color, flexShrink: 0 }} />
              <span style={{ fontFamily: FN, fontSize: 18, fontWeight: 700, color: C.tx, lineHeight: 1 }}>{phaseMeta(nextPlan.suggestedPhase).label}</span>
            </div>
            <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, marginTop: 6 }}>Suggested phase</div>
            <div style={{ fontFamily: FB, fontSize: 11, color: '#39BDFF', marginTop: 2 }}>{nextPlan.repBand}</div>
          </div>
          <div style={{ minWidth: 104 }}>
            <div style={{ fontFamily: FN, fontSize: 22, fontWeight: 700, color: '#39BDFF', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>~{nextPlan.volTarget}</div>
            <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, marginTop: 6 }}>Total sets</div>
            <div style={{ fontFamily: FB, fontSize: 10, color: C.td, marginTop: 2 }}>{nextPlan.volNote}</div>
          </div>
          {nextPlan.acwr != null && (
            <div style={{ minWidth: 84 }}>
              <div style={{ fontFamily: FN, fontSize: 22, fontWeight: 700, color: acwrTone, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{nextPlan.acwr.toFixed(2)}</div>
              <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, marginTop: 6 }}>Load ratio</div>
              <div style={{ fontFamily: FB, fontSize: 10, color: C.td, marginTop: 2 }}>{acwrWord} · aim 0.8–1.3</div>
            </div>
          )}
          {nextPlan.pushPull != null && (
            <div style={{ minWidth: 84 }}>
              <div style={{ fontFamily: FN, fontSize: 22, fontWeight: 700, color: (nextPlan.pushPull > 1.3 || nextPlan.pushPull < 0.77) ? C.or : C.tx, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{nextPlan.pushPull}</div>
              <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, marginTop: 6 }}>Push : Pull</div>
              <div style={{ fontFamily: FB, fontSize: 10, color: C.td, marginTop: 2 }}>{nextPlan.pushPull > 1.3 ? 'add pulling' : nextPlan.pushPull < 0.77 ? 'add pushing' : 'balanced'}</div>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, marginBottom: 7 }}>Primary-pattern coverage · latest block</div>
            {nextPlan.coverageGaps.length === 0 ? (
              <div style={{ fontFamily: FB, fontSize: 12.5, color: C.gn }}>✓ Every primary pattern is covered.</div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {nextPlan.coverageGaps.map(p => <span key={p} title="Not trained in the latest block — add it to the next one" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: C.rd, border: `1px solid ${C.rd}`, padding: '2px 7px', whiteSpace: 'nowrap' }}>+ {p}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>
      {reportOpen && <NextBlockReport model={model} plans={plans} exercises={exercises} traineeName={traineeName} onClose={() => setReportOpen(false)} />}
      <div style={{ padding: '2px 12px 14px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontFamily: FN, fontSize: 10, letterSpacing: '0.04em', color: C.tm }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, background: 'color-mix(in srgb, #39BDFF 40%, transparent)' }} />Volume (sets)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 13, height: 2, background: '#f0b429' }} />Intensity (%1RM from reps)</span>
        <span style={{ color: C.or }}>⚠ accommodation</span>
        <span>bar under each pattern = your MEV→MRV band</span>
        <span style={{ color: C.td }}>· click a block to open it</span>
      </div>
    </div>
  );
}

// BHBC team badge — shown next to a Bnei Herzliya-tagged athlete's name on the
// Programs list (table + grid), matching the athlete-card badge in TraineesView.
function BhbcBadge({ tid, trainees }) {
  const base = String(tid || '').split('__')[0];
  const t = (trainees || []).find((x) => x.id === base);
  if (!t || !(t.format === 'Bnei Herzliya' || t.branch === 'Bnei Herzliya' || t.team === 'BHBC')) return null;
  return (
    <span title="Bnei Herzliya" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#0E1A2B', flexShrink: 0 }}>
      <img src="/bnei-herzliya-logo-w.png" alt="" style={{ height: 15 }} />
    </span>
  );
}

export default function PlansView({ planIndex, reloadIndex, trainees, exercises, setExercises, clientWorkouts, weeklyFocus, setWeeklyFocus, openPlanId, onPlanOpened, onEditorOpen, onEditorClose, onPreviewPlan, portalVis, setPortalVis, onCloseEditor }) {
  const { plan: editPlanData, loading: editLoading, load: loadFullPlan, clear: clearPlan, setPlan: setEditPlan } = useFullPlan();
  const [linkedTaskId, setLinkedTaskId] = useState(null);
  const { plan: previewPlan, load: loadPreviewPlan, clear: clearPreviewPlan } = useFullPlan();
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);   // planId being shared → opens the athlete picker
  const [shareSearch, setShareSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null); // {id,name,fromEditor} → styled type-"delete" modal
  const editorApiRef = useRef(null); // PlanEditor registers {flush, markClean} here (see doDelete)
  const [deleteTyped, setDeleteTyped] = useState('');
  const [newProgramPrompt, setNewProgramPrompt] = useState(null); // {id,name} → "create a new program?" menu
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filterTrainee, setFilterTrainee] = useState("");
  // Multi-toggle FLAGS (AND-combined) — segment the list down to programs that
  // need finishing/assigning. `unassigned` = no traineeId; `empty` = 0 exercises
  // or 0 days. Passing = matches ALL active flags.
  const [flags, setFlags] = useState({ unassigned: false, empty: false });
  const [hoverPos, setHoverPos] = useState(null);
  const hoverTimerRef = useRef(null);
  // Sort: field is 'name' | 'created' | 'updated'; dir is 'asc' | 'desc'.
  // Default 'created desc' matches the old creation-order-newest-first list.
  const [sortField, setSortField] = useState('created');
  const [sortDir, setSortDir] = useState('desc');
  // View mode for the grouped default view: 'table' (dense athlete rows) or
  // 'grid' (one card per athlete, double-click to expand earlier blocks).
  // Persisted so Ohad's pick survives reloads. Only affects the grouped
  // (unfiltered) view — search/trainee-filter always fall back to the flat list.
  const [progView, setProgView] = usePersistentState('programs-view-mode', 'table');
  // Migrate a stale persisted 'lineage' (a removed view mode — Lineage is now a
  // per-athlete modal) back to a real view so the list still renders.
  useEffect(() => { if (progView !== 'table' && progView !== 'grid') setProgView('table'); }, [progView, setProgView]);
  // Training Analysis — opened per-athlete from a button on their card (not a
  // top-level view mode). Loads that athlete's full plans on demand into a modal.
  const [lineageTraineeId, setLineageTraineeId] = useState(null);
  const { plans: lineagePlans, loading: lineageLoading, load: loadLineage, clear: clearLineage } = useAthletePlans();
  useEffect(() => {
    if (lineageTraineeId) loadLineage(lineageTraineeId);
    else clearLineage();
  }, [lineageTraineeId, loadLineage, clearLineage]);
  useEffect(() => {
    if (!lineageTraineeId) return;
    const onKey = (e) => { if (e.key === 'Escape') setLineageTraineeId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lineageTraineeId]);
  // On a phone the filter rail stacked full-width ON TOP of the program cards,
  // so you scrolled through the whole Search / Athlete / Flags / Sort / +New
  // panel before reaching a single program. Collapse it behind a "FILTERS"
  // toggle on narrow (cards first), mirroring the tasks page; on desktop the
  // rail stays a 210px sticky side column, fully open. (Ohad 2026-08 mobile pass)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 760);
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Single-vs-double click reconciler for grid cards: a single click opens the
  // current program after a short delay; a double click cancels that and
  // expands the card's earlier blocks instead (Ohad: "expandable on a double
  // click in the grid option").
  const cardClickTimerRef = useRef(null);
  // FLIP shove animation for the card grid: when a card expands to full width,
  // the cards after it reflow to new positions (right-of-it cards drop to the
  // next row, everything below shifts down). CSS grid doesn't transition that
  // reflow, so we measure each card's position before/after the expand and
  // animate the delta with a transform (Ohad: "animation where the other cards
  // get shoved down to clear the space"). Keyed on expandedAthletes/progView so
  // it only fires on an actual expand/collapse, not on hover re-renders.
  const gridRef = useRef(null);
  const prevRectsRef = useRef(new Map());

  // Auto-open plan if requested from TraineeDetail
  React.useEffect(() => {
    if (openPlanId && !editMode) {
      // Only enter edit mode if the plan actually loaded. A deleted / RLS-denied
      // id resolves to null (load swallows the error) — without this guard we'd
      // setEditMode(true) with no plan and hang forever on "Loading…". On a
      // null load we clear openPlanId and fall back to the list.
      loadFullPlan(openPlanId).then((p) => { if (p) setEditMode(true); if (onPlanOpened) onPlanOpened(); });
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

  // FLIP: animate grid cards from their previous positions to their new ones
  // whenever an expand/collapse changes the layout. Runs synchronously after
  // the DOM mutates (useLayoutEffect) so the browser never paints the jumped
  // positions — we invert with a transform, then release it next frame.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) { prevRectsRef.current = new Map(); return; }
    const cards = grid.querySelectorAll('[data-prog-card]');
    const newRects = new Map();
    cards.forEach(el => newRects.set(el.getAttribute('data-prog-card'), el.getBoundingClientRect()));
    const prev = prevRectsRef.current;
    cards.forEach(el => {
      const key = el.getAttribute('data-prog-card');
      const a = prev.get(key), b = newRects.get(key);
      if (!a || !b) return;
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 320ms cubic-bezier(0.22,0.61,0.36,1)';
        el.style.transform = '';
      });
    });
    prevRectsRef.current = newRects;
  }, [expandedAthletes, progView]);

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

  // Flag predicates — shared by the filter pipeline and the rail counts so the
  // count on a flag always equals what turning it on would show.
  const isUnassigned = (p) => !p.traineeId;
  const isEmpty = (p) => !p.exerciseCount || !p.dayCount;

  const filtered = useMemo(() => {
    let result = planIndex;
    // Pipeline: athlete → flags → search → sort.
    if (filterTrainee) result = result.filter(p => p.traineeId === filterTrainee);
    if (flags.unassigned) result = result.filter(isUnassigned);
    if (flags.empty) result = result.filter(isEmpty);
    if (search) { const q = search.toLowerCase(); result = result.filter(p => (p.name||'').toLowerCase().includes(q) || (traineeMap[p.traineeId]||'').toLowerCase().includes(q)); }
    // Apply the user-chosen sort. 'created' uses sortProgramsRecent — last
    // created/added first (so a just-made un-numbered block floats to the top),
    // with Block #N as the tiebreak for Drive-import batches that share one
    // import timestamp. Hebrew-aware localeCompare for names.
    // Date fields fall back to 0 when missing.
    const dirMul = sortDir === 'asc' ? 1 : -1;
    const sorted = result.slice().sort((a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '', 'he') * dirMul;
      if (sortField === 'created') return sortProgramsRecent(a, b) * (sortDir === 'asc' ? -1 : 1);
      const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return (ta - tb) * dirMul;
    });
    return sorted;
  }, [planIndex, search, filterTrainee, flags, traineeMap, sortField, sortDir]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  // Open = fetch the full plan, then flip to the editor. Two lag killers:
  // (1) the hover preview (220ms timer) has usually ALREADY fetched this
  //     exact plan — reuse it and open instantly instead of re-fetching;
  // (2) while a fetch is unavoidable, openingId dims the clicked row so the
  //     click acknowledges immediately instead of feeling dead for the
  //     round-trip (the "sometimes slightly laggy" report).
  const [openingId, setOpeningId] = useState(null);
  const handleOpenPlan = async (planId) => {
    clearTimeout(hoverTimerRef.current); setHoverPos(null);
    if (previewPlan?.id === planId) { setEditPlan(previewPlan); setEditMode(true); return; }
    setOpeningId(planId);
    try { await loadFullPlan(planId); setEditMode(true); }
    finally { setOpeningId(null); }
  };
  const handleNewPlan = async (presetTraineeId = '') => {
    // Default name "New Program" + persist on creation so the program lands in
    // planIndex and is selectable in the top block picker immediately — before
    // the coach types anything. Previously a fresh plan lived only in editor
    // state (useAutosave has skipFirst, so it persisted only on the first edit,
    // typically naming it), which is why a blank program was invisible in the
    // picker until renamed. New plans are always new-shape (days/exercises), so
    // no dual-shape handling is needed here.
    const fresh = { id: 'pl_' + uid(), name: "New Program", traineeId: presetTraineeId || "", phase: "", notes: "", active: true, createdAt: new Date().toISOString(), days: [defaultDay(1)], warmup: [], weeks: 4 };
    setEditPlan(fresh);
    setEditMode(true);
    await savePlan(fresh);
    await reloadIndex();
  };
  const handleSave = async (plan) => {
    // savePlan returns false on a failed upsert. Swallowing that told the
    // editor the plan was safely on disk (audit 08-22 #38) and, worse, marked
    // the linked task done against a plan the DB never got.
    const saved = await savePlan(plan);
    if (saved === false) return false;
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
    return true;
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
  // Toast both outcomes: inside the EDITOR the coach stays on the original
  // program after duplicating, so without feedback the click looks dead —
  // that read as "duplicate is broken" (Ohad, 2026-07-05).
  const handleDuplicate = async (planId) => {
    const { supabase: sb } = await import('./supabase');
    const { data } = await sb.from('plans').select('*').eq('id', planId).single();
    if (!data) { toast('Duplicate failed — could not load the program.', 'error'); return; }
    const copy = await duplicatePlan({ id: data.id, name: data.name, traineeId: data.trainee_id, phase: data.phase, notes: data.notes, active: data.active, createdAt: data.created_at, days: data.data?.days||[], warmup: data.data?.warmup||[], weeks: data.data?.weeks, kind: data.data?.kind, isTemplatePurchase: data.data?.isTemplatePurchase });
    await reloadIndex();
    if (copy) toast(`Duplicated — "${copy.name}"`, 'success', { ttl: 3000 });
    else toast('Duplicate failed — the save was refused. See console.', 'error');
  };
  const handleDelete = async (planId) => { const ok = await deletePlan(planId); setConfirmDelete(null); await reloadIndex(); if (!ok) { try { toast('Could not delete the program — try again.', 'error'); } catch { /* noop */ } } };
  // Delete from inside the editor (the DELETE button between PORTAL + Save).
  // Delete = a styled WEBSITE modal (not a Chrome dialog, Ohad) that needs the
  // coach to TYPE "delete" — second verification so a stray click can't wipe a
  // program. Both the editor DELETE and the list-row DELETE open it.
  const handleEditorDelete = () => {
    if (!editPlanData?.id) return;
    setPendingDelete({ id: editPlanData.id, name: editPlanData.name, fromEditor: true });
    setDeleteTyped('');
  };
  const doDelete = async () => {
    if (!pendingDelete || deleteTyped.trim().toLowerCase() !== 'delete') return;
    const { id, fromEditor } = pendingDelete;
    setPendingDelete(null); setDeleteTyped('');
    if (fromEditor) {
      // Neutralize the editor's autosave BEFORE deleting: flush lets any
      // pending/in-flight save land now, markClean stops the unmount write.
      // Without this, an autosave landing after the DELETE upserts the plan
      // right back into the DB (resurrection).
      await editorApiRef.current?.flush?.();
      editorApiRef.current?.markClean?.();
    }
    const ok = await deletePlan(id);
    if (fromEditor) handleCancel(); else await reloadIndex();
    if (!ok) { try { toast('Could not delete the program — try again.', 'error'); } catch { /* noop */ } }
  };
  // SHARE → athlete picker → create a DUPLICATE of the program assigned to the
  // picked athlete (Ohad). They then have their own independent copy.
  const handleShareToAthlete = async (athlete) => {
    if (!shareTarget) return;
    const { supabase: sb } = await import('./supabase');
    const { data } = await sb.from('plans').select('*').eq('id', shareTarget).single();
    if (data) {
      // Check the write actually landed — duplicatePlan returns null on an RLS
      // denial / network drop / blank-overwrite guard. Firing the success toast
      // unconditionally told the coach the athlete had the program when the copy
      // never happened.
      const copy = await duplicatePlan({ id: data.id, name: data.name, traineeId: athlete.id, phase: data.phase, notes: data.notes, active: true, createdAt: data.created_at, days: data.data?.days || [], warmup: data.data?.warmup || [], weeks: data.data?.weeks, kind: data.data?.kind, isTemplatePurchase: data.data?.isTemplatePurchase });
      await reloadIndex();
      if (copy) { try { toast(`Program copied to ${athlete.name}`, 'success', { ttl: 3000 }); } catch { /* noop */ } }
      else { toast(`Could not copy the program to ${athlete.name} — try again.`, 'error'); }
    } else {
      toast('Share failed — could not load the program.', 'error');
    }
    setShareTarget(null); setShareSearch('');
  };
  // COPY DAY(S) → append selected day(s) from the open program to another
  // program (existing or a brand-new one) as new days at the BOTTOM. Days are
  // deep-cloned with fresh ids and FULL exercise fields. NOTE: the spread
  // alone does NOT preserve the video — a row inheriting its video from the
  // library carries no videoUrl at all, and the receiving athlete cannot read
  // the library. cloneDayForCopy materialises it. Target is written directly to the DB (savePlan) so the open
  // editor's own plan is untouched; a "new" target is created unassigned.
  // Cloning lives in src/planCopy.js so it can be tested in node. A plain
  // spread is NOT enough: a plan row stores an exerciseId and resolves its
  // video out of the library at render time, and the library is staff-RLS'd —
  // so a day copied to another athlete reached that athlete with every
  // exercise intact and zero videos. cloneDayForCopy snapshots the library's
  // video (and name) onto the row. Pinned by scripts/verify-plan-copy.mjs.
  const cloneDayFresh = (day) => cloneDayForCopy(day, exercises, uid);
  const handleCopyDays = async (days, target) => {
    const cloned = (days || []).map(cloneDayFresh);
    if (!cloned.length) return { ok: false };
    try {
      if (target.kind === 'new') {
        // Inherit the SOURCE program's week count so per-week programming
        // (ex.wk arrays sized to the source's weeks) stays fully visible in
        // the new program — hardcoding 4 hid weeks 5+ of a longer block.
        const newWeeks = Math.max(1, Number(target.weeks) || 4);
        const fresh = { id: 'pl_' + uid(), name: target.name?.trim() || 'New Program', traineeId: target.traineeId || '', phase: '', notes: '', active: true, createdAt: new Date().toISOString(), days: cloned, warmup: [], weeks: newWeeks };
        const saved = await savePlan(fresh);
        await reloadIndex();
        if (saved) { const whoName = target.traineeId ? (trainees.flatMap(t=>t.members&&t.members.length===2?t.members.map((m,i)=>({v:t.id+'__'+i,n:m.name})):[{v:t.id,n:t.name}]).find(o=>o.v===target.traineeId)?.n) : null; toast(`Created "${fresh.name}"${whoName?` for ${whoName}`:''} with ${cloned.length} day${cloned.length===1?'':'s'}`, 'success', { ttl: 3000 }); return { ok: true, name: fresh.name }; }
        toast('Copy failed — the new program was refused. See console.', 'error'); return { ok: false };
      }
      // existing: re-read the target from the DB (freshest), append, save.
      const { supabase: sb } = await import('./supabase');
      const { data } = await sb.from('plans').select('*').eq('id', target.planId).single();
      if (!data) { toast('Copy failed — could not load the target program.', 'error'); return { ok: false }; }
      // Keep the target's existing days EXACTLY as stored (old d.ex shape or
      // new d.exercises shape) — appending, never rewriting them. Each day is
      // independently valid; read paths handle both shapes ([[plan_dual_shape]]).
      const existingDays = data.data?.days || [];
      const merged = {
        id: data.id, name: data.name, traineeId: data.trainee_id, phase: data.phase || '', notes: data.notes || '',
        active: data.active, createdAt: data.created_at,
        days: [...existingDays, ...cloned],
        warmup: data.data?.warmup || [], weeks: data.data?.weeks || 4, kind: data.data?.kind,
        isTemplatePurchase: data.is_template_purchase === true || data.data?.isTemplatePurchase === true,
      };
      const saved = await savePlan(merged);
      await reloadIndex();
      if (saved) { toast(`Copied ${cloned.length} day${cloned.length===1?'':'s'} to "${data.name}"`, 'success', { ttl: 3000 }); return { ok: true, name: data.name }; }
      toast('Copy failed — the save was refused. See console.', 'error'); return { ok: false };
    } catch (e) {
      console.error('handleCopyDays error:', e);
      toast('Copy failed — see console.', 'error'); return { ok: false };
    }
  };

  // Copy THIS program's warm-up onto another program — the warm-up analog of
  // handleCopyDays (Ohad: "share a warmup like a day"). Existing target →
  // append this warm-up's steps to theirs; new target → a fresh program with
  // the warm-up + one empty day. Never rewrites the target's days.
  const handleCopyWarmup = async (warmup, target) => {
    const steps = (warmup || []).map(w => ({ ...w }));
    if (!steps.length) return { ok: false };
    try {
      if (target.kind === 'new') {
        const newWeeks = Math.max(1, Number(target.weeks) || 4);
        const fresh = { id: 'pl_' + uid(), name: target.name?.trim() || 'New Program', traineeId: target.traineeId || '', phase: '', notes: '', active: true, createdAt: new Date().toISOString(), days: [defaultDay(1)], warmup: steps, weeks: newWeeks };
        const saved = await savePlan(fresh);
        await reloadIndex();
        if (saved) { toast(`Created "${fresh.name}" with the warm-up (${steps.length} step${steps.length===1?'':'s'})`, 'success', { ttl: 3000 }); return { ok: true, name: fresh.name }; }
        toast('Copy failed — the new program was refused. See console.', 'error'); return { ok: false };
      }
      const { supabase: sb } = await import('./supabase');
      const { data } = await sb.from('plans').select('*').eq('id', target.planId).single();
      if (!data) { toast('Copy failed — could not load the target program.', 'error'); return { ok: false }; }
      const existingWarmup = data.data?.warmup || [];
      const merged = {
        id: data.id, name: data.name, traineeId: data.trainee_id, phase: data.phase || '', notes: data.notes || '',
        active: data.active, createdAt: data.created_at,
        days: data.data?.days || [],
        warmup: [...existingWarmup, ...steps], weeks: data.data?.weeks || 4, kind: data.data?.kind,
        isTemplatePurchase: data.is_template_purchase === true || data.data?.isTemplatePurchase === true,
      };
      const saved = await savePlan(merged);
      await reloadIndex();
      if (saved) { toast(`Copied the warm-up (${steps.length} step${steps.length===1?'':'s'}) to "${data.name}"`, 'success', { ttl: 3000 }); return { ok: true, name: data.name }; }
      toast('Copy failed — the save was refused. See console.', 'error'); return { ok: false };
    } catch (e) {
      console.error('handleCopyWarmup error:', e);
      toast('Copy failed — see console.', 'error'); return { ok: false };
    }
  };

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
  const LabeledBtn = ({ onClick, title, label, danger, block }) => (
    <button onClick={onClick} title={title}
      style={{
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        height:30, width: block ? '100%' : 76, padding:0, lineHeight:1, flexShrink:0,
        background: isRefined5b() ? 'transparent' : 'var(--c-sf)',
        border:`1px solid ${danger ? 'rgba(255,71,87,0.5)' : C.ac}`, borderRadius:0,
        color: danger ? C.rd : C.ac, cursor:'pointer',
        fontFamily:FN, fontSize:9, fontWeight:700, letterSpacing:'0.05em', whiteSpace:'nowrap',
      }}>{label}</button>
  );

  // Portal-visibility as a single-line pill (status dot + text) at the same
  // height as the action buttons — replaces the 2-line switch+caption column
  // that didn't vertically align with the rest of the row.
  // PORTAL visibility control — the SAME toggle switch on every block (current
  // AND earlier ones), Ohad: "prefer the portal switch everywhere instead of
  // HIDDEN". Was a bordered ON PORTAL / HIDDEN text pill.
  const PortalPill = ({ on, onClick, title, block }) => (
    <button onClick={onClick}
      title={title || (on ? 'On the athlete portal — click to hide' : 'Hidden from the athlete portal — click to show')}
      style={{ display:'inline-flex', alignItems:'center', justifyContent: block ? 'center' : 'flex-start', gap:8, width: block ? '100%' : 'auto', height:28, padding:0, background:'none', border:'none', cursor:'pointer', flexShrink:0 }}>
      <span style={{ fontFamily:FN, fontSize:11, fontWeight:700, letterSpacing:'0.06em', color: on ? C.gn : C.td }}>PORTAL</span>
      <span style={{ width:32, height:18, borderRadius:9, background: on ? 'rgba(46,213,115,0.25)' : 'rgba(255,255,255,0.06)', border:`1px solid ${on ? 'rgba(46,213,115,0.5)' : C.cardBd}`, position:'relative', flexShrink:0, transition:'background .15s, border-color .15s' }}>
        <span style={{ width:14, height:14, borderRadius:7, background: on ? C.gn : C.td, position:'absolute', top:1, left: on ? 15 : 1, transition:'left .15s' }} />
      </span>
    </button>
  );

  // ATHLETE rail rows: one per athlete (parent or couple sub-id) that HAS
  // programs, with that athlete's program count. Sorted ALPHABETICALLY — Hebrew
  // names first (aleph-bet), then English (A–Z) — per Ohad; a name list should
  // read as a name list, not a leaderboard by program count.
  const athleteRail = useMemo(() => {
    const counts = new Map();
    for (const p of planIndex) { const tid = p.traineeId; if (!tid) continue; counts.set(tid, (counts.get(tid) || 0) + 1); }
    const isHeb = (s) => /[֐-׿]/.test(s || '');
    return [...counts.entries()]
      .map(([id, count]) => ({ id, label: traineeMap[id] || id, count }))
      .sort((a, b) => {
        const ah = isHeb(a.label), bh = isHeb(b.label);
        if (ah !== bh) return ah ? -1 : 1; // Hebrew names first
        return a.label.localeCompare(b.label, ah ? 'he' : 'en');
      });
  }, [planIndex, traineeMap]);
  // FLAG counts over the FULL index (each flag independent) so a count always
  // reflects what turning that one flag on would surface.
  const flagCounts = useMemo(() => ({
    unassigned: planIndex.filter(p => !p.traineeId).length,
    empty: planIndex.filter(p => !p.exerciseCount || !p.dayCount).length,
  }), [planIndex]);
  const anyFilterActive = !!filterTrainee || !!search || flags.unassigned || flags.empty;
  const clearFilters = () => { setFilterTrainee(''); setSearch(''); setFlags({ unassigned: false, empty: false }); setVisibleCount(PAGE_SIZE); };

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
  const sortByRecency = sortProgramsRecent;
  const grouped = useMemo(() => {
    // Bucket the FILTERED plans by athlete, so search + flags STILL render as
    // athlete groups (Ohad: searching "omer" must show ONE Omer group — current
    // block + a "N previous" expander — not the athlete strip repeated per
    // block). A text search matches by program OR athlete name, so searching a
    // name pulls in all that athlete's blocks and the group shows in full.
    const buckets = new Map();
    for (const p of filtered) {
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
      // Headline = the block the athlete actually trains: prefer the top-ranked
      // block that's VISIBLE on the portal. A hidden block (e.g. an old Comeback
      // block that floats to the top by sort but isn't on the portal) shouldn't
      // be shown as "current" when a visible one exists. Falls back to sorted[0]
      // if every block is hidden. (Ohad: "show the active plan, not a hidden one")
      const isOnPortal = (p) => { const vk = visKeyForPlan(p, trainees); return !vk || portalVis?.[vk] !== false; };
      const current = sorted.find(isOnPortal) || sorted[0];
      const earlier = sorted.filter(p => p.id !== current.id);
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
    // Orphan zero-state rows only belong in the unfiltered default view — when
    // searching/filtering, showing every plan-less athlete would be noise.
    const orphans = anyFilterActive ? [] : (trainees || []).filter(t => {
      if (t.status === 'Archived') return false;
      const ids = [t.id];
      if (t.members && t.members.length === 2) {
        ids.push(t.id + '__0', t.id + '__1');
      }
      return ids.every(id => !covered.has(id));
    });
    for (const t of orphans) {
      // Couples: plans MUST reference a member id (tr_x__0 / tr_x__1). Passing
      // the bare parent id into handleNewPlan stamped the plan onto nobody's
      // member row — portal visibility keys, member plan lists and weekly-focus
      // keys all miss it (audit 08-22 #39; the couples contract exists for
      // exactly this). Carry the members so the CTA can offer one per person.
      const coupleMembers = (t.members && t.members.length === 2)
        ? t.members.map((m, i) => ({ id: t.id + '__' + i, name: m.name || ('Member ' + (i + 1)) }))
        : null;
      rows.push({
        tid: t.id,
        name: t.name || t.id,
        current: null,           // zero-state: no current block
        earlier: [],
        daysSince: null,
        totalCount: 0,
        orphan: true,
        coupleMembers,
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
  }, [filtered, anyFilterActive, clientWorkouts, trainees, search, filterTrainee, flags, traineeMap, sortField, sortDir, portalVis]);

  // Single-athlete filter → render just that athlete's group (auto-expanded) as
  // ONE card, instead of repeating the name across N flat cards (Ohad ref).
  const displayGrouped = useMemo(
    () => (!grouped ? grouped : (filterTrainee ? grouped.filter(r => r.tid === filterTrainee) : grouped)),
    [grouped, filterTrainee]
  );

  // Rendered from BOTH returns below — the editor early-return used to skip
  // these entirely, so SHARE (and the typed-delete confirm) inside the editor
  // silently did nothing.
  const deleteModal = pendingDelete ? (() => {
    const ok = deleteTyped.trim().toLowerCase() === 'delete';
    const close = () => { setPendingDelete(null); setDeleteTyped(''); };
    return (
      <div onClick={close} style={{ position:'fixed', inset:0, zIndex:10001, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
        <div onClick={e=>e.stopPropagation()} style={{ background:'var(--c-sf)', border:`1px solid ${C.rd}`, borderRadius:0, width:'min(420px, 94vw)', boxShadow:C.cardShadow }}>
          <div style={{ padding:'16px 18px 6px', fontFamily:FN, fontSize:13, fontWeight:700, letterSpacing:'0.08em', color:C.tx, textTransform:'uppercase' }}>Delete program?</div>
          <div style={{ padding:'0 18px 12px', fontFamily:FN, fontSize:12, color:C.tm, lineHeight:1.6 }}>
            “{pendingDelete.name || 'this program'}” — logged workouts stay; this can’t be undone. Type <b style={{color:C.tx}}>delete</b> to confirm.
          </div>
          <input value={deleteTyped} onChange={e=>setDeleteTyped(e.target.value)} autoFocus placeholder="type delete"
            onKeyDown={e=>{ if (e.key==='Enter' && ok) doDelete(); if (e.key==='Escape') close(); }}
            style={{ margin:'0 18px', width:'calc(100% - 36px)', boxSizing:'border-box', padding:'9px 12px', background:'transparent', color:C.tx, border:`1px solid ${C.cardBd}`, borderRadius:0, fontFamily:FN, fontSize:13, outline:'none' }} />
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 18px' }}>
            <button onClick={close} style={{ background:'transparent', border:`1px solid ${C.cardBd}`, color:C.tm, borderRadius:0, padding:'8px 16px', fontFamily:FN, fontSize:11, fontWeight:700, letterSpacing:'0.09em', cursor:'pointer', textTransform:'uppercase' }}>Cancel</button>
            <button onClick={doDelete} disabled={!ok} style={{ background: ok ? C.rd : 'transparent', border:`1px solid ${C.rd}`, color: ok ? '#FFFFFF' : C.rd, opacity: ok ? 1 : 0.5, borderRadius:0, padding:'8px 16px', fontFamily:FN, fontSize:11, fontWeight:700, letterSpacing:'0.09em', cursor: ok ? 'pointer' : 'not-allowed', textTransform:'uppercase' }}>Delete</button>
          </div>
        </div>
      </div>
    );
  })() : null;
  const shareModal = shareTarget ? (
    <ShareAthleteModal
      trainees={trainees}
      shareSearch={shareSearch}
      setShareSearch={setShareSearch}
      onPick={handleShareToAthlete}
      onClose={() => { setShareTarget(null); setShareSearch(''); }}
    />
  ) : null;
  // "No programs yet → start one?" prompt — reached from the editor's athlete
  // dropdown too (assigning to an athlete with zero programs), so it must
  // render in edit mode as well.
  const newProgramModal = newProgramPrompt ? (() => {
    const close = () => setNewProgramPrompt(null);
    const create = () => { const id = newProgramPrompt.id; close(); handleNewPlan(id); };
    return (
      <div onClick={close} style={{ position:'fixed', inset:0, zIndex:10001, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
        <div onClick={e=>e.stopPropagation()} style={{ background:'var(--c-sf)', border:`1px solid ${C.ac}`, borderRadius:0, width:'min(420px, 94vw)', boxShadow:C.cardShadow }}>
          <div style={{ padding:'16px 18px 6px', fontFamily:FN, fontSize:13, fontWeight:700, letterSpacing:'0.08em', color:C.tx, textTransform:'uppercase' }}>No programs yet</div>
          <div style={{ padding:'0 18px 14px', fontFamily:FN, fontSize:12, color:C.tm, lineHeight:1.6 }}>
            {newProgramPrompt.name} has no programs. Start a new one for them?
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'4px 18px 16px' }}>
            <button onClick={close} style={{ background:'transparent', border:`1px solid ${C.cardBd}`, color:C.tm, borderRadius:0, padding:'8px 16px', fontFamily:FN, fontSize:11, fontWeight:700, letterSpacing:'0.09em', cursor:'pointer', textTransform:'uppercase' }}>Cancel</button>
            <button onClick={create} style={{ background:C.ac, border:`1px solid ${C.ac}`, color:'#FFFFFF', borderRadius:0, padding:'8px 16px', fontFamily:FN, fontSize:11, fontWeight:700, letterSpacing:'0.09em', cursor:'pointer', textTransform:'uppercase' }}>+ New Program</button>
          </div>
        </div>
      </div>
    );
  })() : null;

  if (editMode) {
    if (editLoading || !editPlanData) return <div style={{textAlign:"center",padding:60,color:C.td}}><div style={{fontSize:14}}>Loading program...</div></div>;
    // key={editPlanData.id} forces a remount when the visitor switches
    // programs via the new in-editor dropdown — PlanEditor's internal `plan`
    // state is initialized from `init` only once, so a remount is the
    // simplest way to load fresh data without rewiring its state plumbing.
    return <>
      <PlanEditor key={editPlanData.id} plan={editPlanData} onSave={handleSave} onCancel={handleCancel} onSwitchProgram={loadFullPlan} trainees={trainees} exercises={exercises} setExercises={setExercises} planIndex={planIndex} onPreviewPlan={onPreviewPlan} onDelete={handleEditorDelete} onNewProgramFor={(tid, name) => setNewProgramPrompt({ id: tid, name: name || 'this athlete' })} onShare={() => setShareTarget(editPlanData.id)} onDuplicate={() => handleDuplicate(editPlanData.id)} onCopyDays={handleCopyDays} onCopyWarmup={handleCopyWarmup} clientWorkouts={clientWorkouts} portalVis={portalVis} setPortalVis={setPortalVis} editorApiRef={editorApiRef} />
      {shareModal}
      {deleteModal}
      {newProgramModal}
    </>;
  }

  // Auto-opening a program (deep-link / from TraineeDetail): editMode only flips
  // true AFTER loadFullPlan resolves, so for the duration of that async fetch
  // the render fell through to the LIST — which read as the programs page
  // flashing up for a moment before the program opened (Ohad). While an open is
  // pending, show the same loading state the editor uses instead of the list.
  if (openPlanId && !editMode) return <div style={{textAlign:"center",padding:60,color:C.td}}><div style={{fontSize:14}}>Loading program...</div></div>;

  return (
    <div>
      {/* Whole-card hover affordance — the card opens the editor, so it lifts
          subtly on hover (the left cyan edge brightens + a faint surface lift). */}
      <style>{`
        .prog-card { transition: background 140ms ease; }
        .prog-card:hover { background: var(--c-sf2); }
        .prog-txtbtn:hover { text-decoration: underline; }
        /* Mobile: drop the flex-spacer that pushes the actions right (which made
           DELETE wrap onto its own line) and tighten the gap so PORTAL + the
           text actions group left and wrap evenly (Ohad mobile OCD pass). */
        @media (max-width: 560px) {
          .prog-actions { gap: 12px !important; }
          .prog-actions .prog-spacer { display: none !important; }
        }
        /* Smooth reveal for the previous-blocks list so expanding feels as
           deliberate as collapsing (Ohad). Reduced-motion users get none. */
        @keyframes progReveal { 0% { opacity: 0; transform: translateY(-10px); } 40% { opacity: 0.5; } 100% { opacity: 1; transform: none; } }
        .prog-reveal { animation: progReveal 0.38s cubic-bezier(0.22,0.61,0.36,1) both; transform-origin: top; }
        @media (prefers-reduced-motion: reduce) { .prog-reveal { animation: none; } }
        @media (max-width: 620px) { .prog-actions .prog-spacer { display: none !important; } }
        /* Mobile: stack the rail ABOVE the list (full-width each) instead of a
           fixed 210px side column that crushes the cards off-screen (Ohad — mobile
           fit). The rail's athlete list already scrolls inside its own maxHeight. */
        @media (max-width: 760px) {
          .programs-rail { width: 100% !important; position: static !important; top: auto !important; }
          .programs-rail-athletes { max-height: 220px !important; overflow-y: auto !important; }
        }
      `}</style>
      {/* Top header row — PROGRAMS title (left) + TABLE/GRID view toggle (right),
          mirroring the tasks-page "TASKS … LIST/BOARD" placement exactly (Ohad).
          The toggle used to live buried in the left rail among filters; a
          view-mode switch is a primary control, so it belongs top-right above the
          list — same spot, same segmented style as tasks. Sitting above BOTH
          columns keeps the rail's Search box top-aligned with the first card. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.tx }}>Programs</h2>
        <div style={{ display: 'flex', gap: 6, width: 168 }}>
          {[['table','Table','Dense list — one row per athlete'],['grid','Grid','Card grid — double-click a card to expand earlier blocks']].map(([v,label,tip]) => {
            const on = progView === v;
            return (
              <button key={v} onClick={()=>setProgView(v)} title={tip}
                style={{ flex: 1, height: 30, boxSizing: 'border-box', borderRadius: 0, cursor: 'pointer', border: `1px solid ${on ? '#39BDFF' : C.cardBd}`, background: on ? '#39BDFF' : 'var(--c-sf)', color: on ? '#FFFFFF' : C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{label}</button>
            );
          })}
        </div>
      </div>

      {/* Two-column layout: persistent LEFT filter RAIL + list. Mirrors the
          athletes list (TraineesView) — SEARCH / ATHLETE / FLAGS / SORT
          live in the slim sticky left column; the program list fills the right. */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* LEFT: filter rail — sticky so the controls stay pinned as the (long)
            list scrolls. Fixed 210px; wraps to full-width when the viewport
            can't fit both columns. */}
        {/* LEFT filter rail — the shared SideRail (literally the Tasks-page
            sidebar; see SideRail.jsx). Only the DATA differs. */}
        <SideRail
          className="programs-rail"
          width={204} top={64} maxHeight="calc(100vh - 76px)"
          narrow={narrow} railOpen={railOpen} setRailOpen={setRailOpen}
          search={search} onSearch={(v) => { setSearch(v); setVisibleCount(PAGE_SIZE); }}
          searchPlaceholder="Search programs…"
          searchTitle="Search programs by name or block (e.g. “Block #5”, “GPP”)"
          groups={[
            {
              label: 'Athlete',
              opts: [
                { key: 'all', label: 'All', count: planIndex.length, active: !filterTrainee, onClick: () => { setFilterTrainee(''); setVisibleCount(PAGE_SIZE); } },
                ...athleteRail.map(a => ({ key: a.id, label: a.label, count: a.count, title: a.label, active: filterTrainee === a.id, onClick: () => { setFilterTrainee(a.id); setVisibleCount(PAGE_SIZE); } })),
              ],
            },
            {
              label: 'Flags',
              opts: [
                { key: 'unassigned', label: 'Unassigned', count: flagCounts.unassigned, title: 'Programs with no athlete assigned', accent: C.or, active: flags.unassigned, onClick: () => { setFlags(m => ({ ...m, unassigned: !m.unassigned })); setVisibleCount(PAGE_SIZE); } },
                { key: 'empty', label: '∅ Empty', count: flagCounts.empty, title: 'Programs with no exercises or no days', accent: C.or, active: flags.empty, onClick: () => { setFlags(m => ({ ...m, empty: !m.empty })); setVisibleCount(PAGE_SIZE); } },
              ],
            },
            {
              label: 'Sort',
              opts: [
                ['created', 'Uploaded', 'Sort by when the program was created/imported. Click again to flip newest/oldest.'],
                ['name', 'Name', 'Sort by program name. Click again to flip A–Z / Z–A.'],
                ['updated', 'Last edited', 'Sort by when the program was last edited. Click again to flip newest/oldest.'],
              ].map(([field, label, tip]) => {
                const active = sortField === field;
                return { key: field, title: tip, active, label: active ? `${sortDir === 'asc' ? '↑' : '↓'} ${label}` : label, onClick: () => { if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else setSortField(field); } };
              }),
            },
          ]}
          footer={<Btn variant="solid" title="Create a new, empty program — you pick the athlete inside the editor" onClick={() => handleNewPlan()} style={{ width: '100%', boxSizing: 'border-box', padding: '0 14px', height: 38, marginTop: 'auto', background: 'transparent', color: 'var(--c-acText, #39BDFF)', whiteSpace: 'nowrap', justifyContent: 'center' }}>+ New Program</Btn>}
        />

        {/* RIGHT: the program list — grouped (table/grid) or flat, unchanged. */}
        <div style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}>
          {/* Count line removed from the main-column top so the first program
              card top-aligns with the rail's Search box (Ohad OCD). The rail's
              ATHLETE "All" already shows the program total. */}
      {/* Athlete-grouped default view. Each row = one athlete, current block
          surfaced prominently with last-session signal. (N earlier blocks)
          chevron expands the older blocks inline so nothing is lost — they
          just stay out of the daily scan path. */}
      {displayGrouped && displayGrouped.length > 0 && progView === 'table' && (
        // gap 14 = SAME as the grid view — toggling table↔grid must not shift
        // the vertical rhythm (Ohad 2026-08-21).
        <div style={{display:"grid",gap:14}}>
          {displayGrouped.map(row => {
            const expanded = expandedAthletes.has(row.tid) || !!filterTrainee;
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
                  <div style={{minWidth:0,flex:1,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                    <BhbcBadge tid={row.tid} trainees={trainees} />
                    <div style={{fontWeight:700,fontSize:15,color:C.tx,whiteSpace:'nowrap',letterSpacing:'0.01em',flexShrink:0}}><bdi>{row.name}</bdi></div>
                    <div style={{fontSize:11,color:C.or,fontFamily:FN,letterSpacing:'0.18em',textTransform:'uppercase',fontWeight:700}}>NO PROGRAM ASSIGNED</div>
                  </div>
                  {row.coupleMembers
                    ? row.coupleMembers.map(m => (
                      <button key={m.id} onClick={()=>handleNewPlan(m.id)} style={{background:'var(--c-sf)',border:`1px solid ${C.or}`,borderRadius:0,color:C.or,cursor:'pointer',padding:'3px 10px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.18em',whiteSpace:'nowrap',marginInlineEnd:6}}>+ {String(m.name).toUpperCase()}</button>
                    ))
                    : <button onClick={()=>handleNewPlan(row.tid)} style={{background:'var(--c-sf)',border:`1px solid ${C.or}`,borderRadius:0,color:C.or,cursor:'pointer',padding:'3px 10px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.18em',whiteSpace:'nowrap'}}>+ ASSIGN PROGRAM</button>}
                </div>
              );
            }
            return (
              <div key={row.tid} className="prog-card" style={{background: 'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,minWidth:0}}>
                {/* Redesigned card (Ohad: the boxed-button pile read as ugly/tight).
                    Now uses the app's card grammar: a cyan STRIP HEADER (athlete +
                    recency dot), a calm clickable body (block name + spelled-out
                    meta), and LIGHT text actions instead of a row of bordered boxes.
                    The demo (CoachDemo DemoPrograms) mirrors this exactly. */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,background:'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))',borderBottom:`1px solid ${C.cardBd}`,padding:'8px 14px'}}>
                  <span style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}>
                    <span aria-hidden style={{width:3,height:14,background:C.ac,flexShrink:0}} />
                    <BhbcBadge tid={row.tid} trainees={trainees} />
                    <bdi style={{fontWeight:700,fontSize:13,letterSpacing:'0.04em',color:'#FFFFFF',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{row.name}</bdi>
                  </span>
                  <span style={{display:'inline-flex',alignItems:'center',gap:10,flexShrink:0}}>
                    <button onClick={e=>{e.stopPropagation();setLineageTraineeId(row.tid);}} title="Training Analysis — this athlete's movement-pattern volume across every block"
                      style={{display:'inline-flex',alignItems:'center',gap:5,height:24,padding:'0 8px',background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:0,color:'#fff',cursor:'pointer',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.08em',whiteSpace:'nowrap'}}>◫ ANALYSIS</button>
                    {/* Recency: the DOT carries the colour signal, the text is muted
                        (Ohad #195 "colored but less colorful") and the pill has a
                        fixed min-width so '18D AGO' and 'TRAINED TODAY' are the same
                        size regardless of length. */}
                    <span title={`Last session: ${tagText.toLowerCase()}`} style={{display:'inline-flex',alignItems:'center',justifyContent:'flex-end',gap:6,minWidth:104,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',color:'var(--c-tm)',whiteSpace:'nowrap'}}>
                      <span style={{width:6,height:6,borderRadius:'50%',background:tagColor,flexShrink:0}} />{tagText}
                    </span>
                  </span>
                </div>
                <div onClick={()=>handleOpenPlan(cur.id)}
                  role="button" tabIndex={0}
                  onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); handleOpenPlan(cur.id); } }}
                  onMouseEnter={e => {
                    const x = e.clientX, y = e.clientY;
                    clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = setTimeout(() => { setHoverPos({ x, y }); loadPreviewPlan(cur.id); }, 220);
                  }}
                  onMouseLeave={() => { clearTimeout(hoverTimerRef.current); setHoverPos(null); clearPreviewPlan(); }}
                  style={{cursor:openingId===cur.id?'progress':'pointer',opacity:openingId===cur.id?0.55:1,transition:'opacity 0.12s',padding:'12px 14px 4px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',minHeight:24}}>
                    <span style={{fontWeight:700,fontSize:15,color:C.ac,fontFamily:FN,letterSpacing:'0.04em',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cur.name||"Untitled"}</span>
                    {row.earlier.length > 0 && (
                      <button onClick={e=>{e.stopPropagation();toggleAthlete(row.tid);}}
                        title={expanded?`Hide ${row.earlier.length} previous block${row.earlier.length===1?'':'s'}`:`Show ${row.earlier.length} previous block${row.earlier.length===1?'':'s'}`}
                        className="prog-plusn"
                        style={{display:'inline-flex',alignItems:'center',gap:5,height:24,padding:'0 9px',background: expanded ? 'rgba(127,127,138,0.14)' : 'transparent',border:`1px solid ${C.cardBd}`,borderRadius:0,color: C.tm,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.05em',whiteSpace:'nowrap',flexShrink:0,fontVariantNumeric:'tabular-nums'}}>
                        {row.earlier.length} previous
                        <span aria-hidden style={{display:'inline-block',transform: expanded?'rotate(180deg)':'none',transition:'transform .15s',fontSize:8,lineHeight:1}}>▾</span>
                      </button>
                    )}
                  </div>
                  <div style={{fontSize:12,color:C.tm,fontFamily:FN,letterSpacing:'0.04em',marginTop:5}}>{plural(cur.dayCount, 'day')} · {plural(cur.exerciseCount, 'exercise')}</div>
                </div>
                {/* Light text actions — hovering here cancels the plan hover-preview. */}
                <div className="prog-actions" onMouseEnter={() => { clearTimeout(hoverTimerRef.current); setHoverPos(null); clearPreviewPlan(); }}
                  style={{padding:'8px 14px 12px',display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
                  {setPortalVis && (() => {
                    const vk = visKeyForPlan(cur, trainees);
                    if (!vk) return null;
                    const isVis = portalVis?.[vk] !== false;
                    return <button onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis})}} title={isVis?'On the athlete portal — click to hide':'Hidden from the athlete portal — click to show'} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:8}}>
                      <span style={{fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.06em',color:isVis?C.gn:C.td}}>PORTAL</span>
                      <span style={{width:32,height:18,borderRadius:9,background:isVis?'rgba(46,213,115,0.25)':'rgba(255,255,255,0.06)',border:`1px solid ${isVis?'rgba(46,213,115,0.5)':C.cardBd}`,position:'relative',transition:'background .15s, border-color .15s',flexShrink:0}}>
                        <span style={{width:14,height:14,borderRadius:7,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?15:1,transition:'left .15s'}} />
                      </span>
                    </button>;
                  })()}
                  <div className="prog-spacer" style={{flex:1,minWidth:8}} />
                  {onPreviewPlan && <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();onPreviewPlan(cur.id);}} title="Preview as trainee" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Preview</button>}
                  <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();handleDuplicate(cur.id);}} title="Duplicate program" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Duplicate</button>
                  <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();setShareTarget(cur.id);}} title="Share to an athlete — duplicates this program for them" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Share</button>
                  <button className="prog-txtbtn" onClick={e=>{e.stopPropagation(); setPendingDelete({ id: cur.id, name: cur.name, fromEditor: false }); setDeleteTyped('');}} title="Delete program" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.rd}}>Delete</button>
                </div>
                {/* Expanded earlier blocks — same hover preview, slightly compressed
                    visual treatment so the eye stays on the current block. */}
                {expanded && row.earlier.length > 0 && (
                  <div className="prog-reveal" style={{borderTop:`1px solid ${C.cardBd}`,padding:'4px 0'}}>
                    {row.earlier.map(p => (
                      <div key={p.id} onClick={()=>handleOpenPlan(p.id)}
                        onMouseEnter={e => {
                          const x = e.clientX, y = e.clientY;
                          clearTimeout(hoverTimerRef.current);
                          hoverTimerRef.current = setTimeout(() => { setHoverPos({ x, y }); loadPreviewPlan(p.id); }, 220);
                        }}
                        onMouseLeave={() => { clearTimeout(hoverTimerRef.current); setHoverPos(null); clearPreviewPlan(); }}
                        style={{cursor:openingId===p.id?'progress':'pointer',padding:'7px 14px 7px 32px',display:'flex',alignItems:'center',gap:8,opacity:openingId===p.id?0.45:0.78,transition:'opacity 0.12s',borderTop:`1px solid rgba(57,189,255,0.102)`}}>
                        <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:8}}>
                          {/* older blocks read in faded cyan (Ohad) — same
                              brand colour as the current block, dropped to ~72%
                              so the eye still lands on the current row first. */}
                          <div style={{flex:1,minWidth:0,fontSize:13,color:C.ac,opacity:0.72,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'0.04em',fontFamily:FN,fontWeight:700}}>{p.name||"Untitled"}</div>
                          <div style={{fontSize:11,color:C.td,fontFamily:FN,letterSpacing:'0.04em',fontWeight:500,flexShrink:0,whiteSpace:'nowrap'}}>{p.dayCount}d · {p.exerciseCount}ex</div>
                        </div>
                        {/* hovering the actions cancels the preview (Ohad) */}
                        <div onMouseEnter={() => { clearTimeout(hoverTimerRef.current); setHoverPos(null); clearPreviewPlan(); }} style={{display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
                        {setPortalVis && (() => {
                          const vk = visKeyForPlan(p, trainees);
                          if (!vk) return null;
                          const isVis = portalVis?.[vk] !== false;
                          return <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis})}} title={isVis?'On the athlete portal — click to hide':'Hidden from the athlete portal — click to show'} style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.04em',color:isVis?C.gn:C.td,display:'inline-flex',alignItems:'center',gap:5}}><span style={{width:5,height:5,borderRadius:'50%',background:isVis?C.gn:C.td}} />{isVis?'On portal':'Hidden'}</button>;
                        })()}
                        {onPreviewPlan && <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();onPreviewPlan(p.id);}} title="Preview as trainee" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Preview</button>}
                        <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();handleDuplicate(p.id);}} title="Duplicate program" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Duplicate</button>
                        <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();setShareTarget(p.id);}} title="Share to an athlete — duplicates this program for them" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Share</button>
                        <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();setConfirmDelete(p.id);}} title="Delete program" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.04em',color:C.rd}}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Card-grid view (Ohad's design B): one card per athlete, current block
          front-and-centre. Single click opens the current program; double
          click expands the card to reveal earlier blocks inline. Same data,
          same actions, same hover-preview as the table. */}
      {displayGrouped && displayGrouped.length > 0 && progView === 'grid' && (
        <div ref={gridRef} style={{display:'grid',gap:14,gridTemplateColumns:'repeat(auto-fill,minmax(min(360px,100%),1fr))'}}>
          {displayGrouped.map(row => {
            const expanded = expandedAthletes.has(row.tid) || !!filterTrainee;
            const cur = row.current;
            const tagColor = row.daysSince == null ? C.td : row.daysSince <= 3 ? C.gn : row.daysSince <= 7 ? C.tm : row.daysSince <= 14 ? C.or : C.rd;
            const tagText = row.daysSince == null ? 'never logged' : row.daysSince === 0 ? 'trained today' : `${row.daysSince}d ago`;
            // Orphan (active athlete, no program) — dashed card mirroring the
            // table's zero-state row.
            if (row.orphan) {
              // No fixed minHeight — cards are content-height now (2026-08-21);
              // grid auto-stretch still equalises an orphan sharing a row with
              // a full card.
              return (
                <div key={row.tid} data-prog-card={row.tid} style={{background:'var(--c-sf)',border:'0.25px dashed rgba(255,165,2,0.502)',borderRadius:0,padding:'14px',display:'flex',flexDirection:'column',gap:12,boxSizing:'border-box'}}>
                  <div style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}><BhbcBadge tid={row.tid} trainees={trainees} /><div style={{fontWeight:700,fontSize:16,color:C.tx,letterSpacing:'0.01em'}}><bdi>{row.name}</bdi></div></div>
                  <div style={{fontSize:11,color:C.or,fontFamily:FN,letterSpacing:'0.18em',textTransform:'uppercase',fontWeight:700}}>No program assigned</div>
                  <div style={{flex:1}} />
                  {row.coupleMembers
                    ? <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{row.coupleMembers.map(m => (
                        <button key={m.id} onClick={()=>handleNewPlan(m.id)} style={{background:'var(--c-sf)',border:`1px solid ${C.or}`,borderRadius:0,color:C.or,cursor:'pointer',padding:'5px 12px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.18em',whiteSpace:'nowrap'}}>+ {String(m.name).toUpperCase()}</button>
                      ))}</div>
                    : <button onClick={()=>handleNewPlan(row.tid)} style={{alignSelf:'flex-start',background:'var(--c-sf)',border:`1px solid ${C.or}`,borderRadius:0,color:C.or,cursor:'pointer',padding:'5px 12px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.18em',whiteSpace:'nowrap'}}>+ ASSIGN PROGRAM</button>}
                </div>
              );
            }
            // Shared handlers + action builders so the collapsed (narrow,
            // stacked) and expanded (full-width, table-like) layouts stay in
            // sync without duplicating the wiring.
            const cancelHover = () => { clearTimeout(hoverTimerRef.current); setHoverPos(null); clearPreviewPlan(); };
            const openHandlers = {
              role:'button', tabIndex:0,
              // Clear+reset the (grid-wide) timer on every click so the LAST
              // card clicked wins — clicking A then B within 280ms opens B, not
              // A. Double-click expands earlier blocks, or opens the plan when
              // there are none (so a card is never inert to a double-click).
              onClick:()=>{ clearTimeout(cardClickTimerRef.current); cardClickTimerRef.current = setTimeout(()=>{ cardClickTimerRef.current = null; handleOpenPlan(cur.id); }, 280); },
              onDoubleClick:()=>{ clearTimeout(cardClickTimerRef.current); cardClickTimerRef.current = null; if (row.earlier.length > 0) toggleAthlete(row.tid); else handleOpenPlan(cur.id); },
              onKeyDown:e=>{ if(e.key==='Enter'){ e.preventDefault(); handleOpenPlan(cur.id); } },
              onMouseEnter:e => { const x = e.clientX, y = e.clientY; clearTimeout(hoverTimerRef.current); hoverTimerRef.current = setTimeout(() => { setHoverPos({ x, y }); loadPreviewPlan(cur.id); }, 260); },
              onMouseLeave:cancelHover,
            };
            const portalToggle = (p) => {
              if (!setPortalVis) return null;
              const vk = visKeyForPlan(p, trainees);
              if (!vk) return null;
              const isVis = portalVis?.[vk] !== false;
              return <button onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis})}} title={isVis?'On the athlete portal — click to hide':'Hidden from the athlete portal — click to show'} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:8}}>
                <span style={{fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.06em',color:isVis?C.gn:C.td}}>PORTAL</span>
                <span style={{width:32,height:18,borderRadius:9,background:isVis?'rgba(46,213,115,0.25)':'rgba(255,255,255,0.06)',border:`1px solid ${isVis?'rgba(46,213,115,0.5)':C.cardBd}`,position:'relative',flexShrink:0}}>
                  <span style={{width:14,height:14,borderRadius:7,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?15:1,transition:'left .15s'}} />
                </span>
              </button>;
            };
            const txtActs = (id, delFn) => <>
              {onPreviewPlan && <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();onPreviewPlan(id);}} title="Preview as trainee" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Preview</button>}
              <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();handleDuplicate(id);}} title="Duplicate program" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Duplicate</button>
              <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();setShareTarget(id);}} title="Share to an athlete — duplicates this program for them" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Share</button>
              <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();delFn();}} title="Delete program" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.rd}}>Delete</button>
            </>;
            const plusBtn = row.earlier.length > 0 && (
              <button onClick={e=>{e.stopPropagation();toggleAthlete(row.tid);}}
                title={expanded?`Hide ${row.earlier.length} previous block${row.earlier.length===1?'':'s'}`:`Show ${row.earlier.length} previous block${row.earlier.length===1?'':'s'} (or double-click the card)`}
                style={{display:'inline-flex',alignItems:'center',gap:5,height:24,padding:'0 9px',background:expanded?'rgba(127,127,138,0.14)':'transparent',border:`1px solid ${C.cardBd}`,borderRadius:0,color:C.tm,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.05em',whiteSpace:'nowrap',flexShrink:0,fontVariantNumeric:'tabular-nums'}}>
                {row.earlier.length} previous
                <span aria-hidden style={{display:'inline-block',transform:expanded?'rotate(180deg)':'none',transition:'transform .15s',fontSize:8,lineHeight:1}}>▾</span>
              </button>
            );
            const stripHeader = (
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,background:'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))',borderBottom:`1px solid ${C.cardBd}`,padding:'8px 14px'}}>
                <span style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}>
                  <span aria-hidden style={{width:3,height:14,background:C.ac,flexShrink:0}} />
                  <BhbcBadge tid={row.tid} trainees={trainees} />
                  <bdi style={{fontWeight:700,fontSize:13,letterSpacing:'0.04em',color:'#FFFFFF',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{row.name}</bdi>
                </span>
                <span style={{display:'inline-flex',alignItems:'center',gap:10,flexShrink:0}}>
                  <button onClick={e=>{e.stopPropagation();setLineageTraineeId(row.tid);}} title="Training Analysis — this athlete's movement-pattern volume across every block"
                    style={{display:'inline-flex',alignItems:'center',gap:5,height:24,padding:'0 8px',background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:0,color:'#fff',cursor:'pointer',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.08em',whiteSpace:'nowrap'}}>◫ ANALYSIS</button>
                  <span title={`Last session: ${tagText}`} style={{display:'inline-flex',alignItems:'center',justifyContent:'flex-end',gap:6,minWidth:96,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',color:'var(--c-tm)',whiteSpace:'nowrap'}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:tagColor,flexShrink:0}} />{tagText}
                  </span>
                </span>
              </div>
            );
            return (
              <div key={row.tid} data-prog-card={row.tid} className="prog-card"
                style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,display:'flex',flexDirection:'column',gridColumn:expanded?'1 / -1':'auto',willChange:'transform',boxShadow:C.cardShadow,minWidth:0}}>
                {stripHeader}
                {/* No minHeight / flex stretch — grid cards compress to the same
                    natural height as the table rows (Ohad 2026-08-21). */}
                <div {...openHandlers} style={{cursor:openingId===cur.id?'progress':'pointer',opacity:openingId===cur.id?0.55:1,transition:'opacity 0.12s',padding:'12px 14px 4px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',minHeight:24}}>
                    <span style={{fontWeight:700,fontSize:15,color:C.ac,fontFamily:FN,letterSpacing:'0.04em',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cur.name||"Untitled"}</span>
                    {plusBtn}
                  </div>
                  <div style={{fontSize:12,color:C.tm,fontFamily:FN,letterSpacing:'0.04em',marginTop:5}}>{plural(cur.dayCount, 'day')} · {plural(cur.exerciseCount, 'exercise')}</div>
                </div>
                <div className="prog-actions" onMouseEnter={cancelHover} style={{padding:'8px 14px 12px',display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
                  {portalToggle(cur)}
                  <div className="prog-spacer" style={{flex:1,minWidth:8}} />
                  {txtActs(cur.id, () => { setPendingDelete({ id: cur.id, name: cur.name, fromEditor: false }); setDeleteTyped(''); })}
                </div>
                {/* Expanded previous blocks — light stacked rows matching the card. */}
                {expanded && row.earlier.length > 0 && (
                  <div className="prog-reveal" style={{borderTop:`1px solid ${C.cardBd}`}}>
                    {row.earlier.map((p, i) => (
                      <div key={p.id} role="button" tabIndex={0} onClick={()=>handleOpenPlan(p.id)}
                        onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); handleOpenPlan(p.id); } }}
                        onMouseEnter={e => { const x = e.clientX, y = e.clientY; clearTimeout(hoverTimerRef.current); hoverTimerRef.current = setTimeout(() => { setHoverPos({ x, y }); loadPreviewPlan(p.id); }, 260); }}
                        onMouseLeave={cancelHover}
                        style={{cursor:openingId===p.id?'progress':'pointer',opacity:openingId===p.id?0.45:0.9,transition:'opacity 0.12s',padding:'10px 14px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',borderTop:i===0?'none':`1px solid rgba(57,189,255,0.102)`}}>
                        <div style={{fontSize:13,color:C.ac,opacity:0.72,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'0.04em',fontFamily:FN,fontWeight:700,minWidth:0,flex:'0 1 auto'}}>{p.name||"Untitled"}</div>
                        <div style={{fontSize:11,color:C.td,fontFamily:FN,letterSpacing:'0.04em',fontWeight:500,flexShrink:0,whiteSpace:'nowrap'}}>{p.dayCount}d · {p.exerciseCount}ex</div>
                        <div style={{flex:1,minWidth:12}} />
                        <div onMouseEnter={cancelHover} style={{display:'flex',gap:14,alignItems:'center',flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end'}}>
                          {portalToggle(p)}
                          {txtActs(p.id, () => setConfirmDelete(p.id))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* LINEAGE — cross-block lift progression for the selected athlete.
          Replaces the list entirely while active; reads full plans on demand. */}
      {/* Training Analysis — opened per-athlete from the ◫ ANALYSIS button on a
          card. Modal so it works identically from Table and Grid, and doesn't
          disturb the list. */}
      {lineageTraineeId && createPortal(
        // Full PAGE, not a pop-up (Ohad): opaque full-viewport surface + sticky Back bar.
        <div role="dialog" aria-modal="true" aria-label="Training Analysis"
          style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'var(--c-bg, #0a0a0b)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--c-sf2)', borderBottom: `1px solid ${C.cardBd}`, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => setLineageTraineeId(null)} title="Back (Esc)"
              style={{ background: 'none', border: 'none', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Back</button>
          </div>
          <div style={{ flex: 1, padding: '18px 16px 60px' }}>
            <div style={{ width: 'min(1180px, 96vw)', margin: '0 auto' }}>
              <TrainingLineageV2
                traineeId={lineageTraineeId}
                traineeName={traineeMap[lineageTraineeId] || 'Athlete'}
                exercises={exercises}
                plans={lineagePlans}
                clientWorkouts={clientWorkouts}
                loading={lineageLoading}
                onOpenPlan={(id) => { setLineageTraineeId(null); handleOpenPlan(id); }}
              />
            </div>
          </div>
        </div>, document.body)}
      {/* Zero-match empty state — search/flags render as athlete groups above
          (never a flat list), so the only remaining case is "nothing matched". */}
      {displayGrouped && displayGrouped.length === 0 && (
        <EmptyState icon="" message={anyFilterActive ? "No programs match your search." : "No programs yet — add one to get started."} />
      )}
      {/* Flat-list fallback — dead code (grouped is never null); retained. */}
      {!grouped && (filtered.length===0?<EmptyState icon="" message="No programs match your search." />:(
        /* minmax(0,1fr) + minWidth:0 on every card: grid items' automatic min
           size is their min-content, so a long nowrap block name made the
           whole card ~470px wide on a 390px phone (mobile audit 08-22). */
        <div style={{display:"grid",gap: progView==='grid'?14:8, gridTemplateColumns: progView==='grid'?'repeat(auto-fill,minmax(min(360px,100%),1fr))':'minmax(0,1fr)'}}>{visible.map(p => {
          const tName = traineeMap[p.traineeId] || "Unassigned";
          // Same redesigned card as the grouped list (Ohad: filtering must not
          // change how programs are shown) — strip header (athlete) + clickable
          // body (block + meta) + light text actions.
          return <div key={p.id} className="prog-card" style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,minWidth:0,opacity:openingId===p.id?0.55:1,transition:'opacity 0.12s'}}>
            <div style={{display:'flex',alignItems:'center',gap:9,background:'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))',borderBottom:`1px solid ${C.cardBd}`,padding:'8px 14px'}}>
              <span aria-hidden style={{width:3,height:14,background:C.ac,flexShrink:0}} />
              <bdi style={{fontWeight:700,fontSize:13,letterSpacing:'0.04em',color:'#FFFFFF',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tName}</bdi>
            </div>
            <div onClick={()=>handleOpenPlan(p.id)} role="button" tabIndex={0}
              onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); handleOpenPlan(p.id); } }}
              onMouseEnter={e => { const x=e.clientX, y=e.clientY; clearTimeout(hoverTimerRef.current); hoverTimerRef.current=setTimeout(()=>{ setHoverPos({x,y}); loadPreviewPlan(p.id); },220); }}
              onMouseLeave={() => { clearTimeout(hoverTimerRef.current); setHoverPos(null); clearPreviewPlan(); }}
              style={{cursor:openingId===p.id?'progress':'pointer',padding:'12px 14px 4px'}}>
              <div style={{fontWeight:700,fontSize:15,color:C.ac,fontFamily:FN,letterSpacing:'0.04em',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name||"Untitled"}</div>
              <div style={{fontSize:12,color:C.tm,fontFamily:FN,letterSpacing:'0.04em',marginTop:5}}>{plural(p.dayCount, 'day')} · {plural(p.exerciseCount, 'exercise')}{p.phase?` · ${p.phase}`:''}</div>
            </div>
            <div className="prog-actions" onMouseEnter={() => { clearTimeout(hoverTimerRef.current); setHoverPos(null); clearPreviewPlan(); }} style={{padding:'8px 14px 12px',display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
              {setPortalVis && (() => {
                const vk = visKeyForPlan(p, trainees);
                if (!vk) return null;
                const isVis = portalVis?.[vk] !== false;
                return <button onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis})}} title={isVis?'On the athlete portal — click to hide':'Hidden from the athlete portal — click to show'} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:8}}>
                  <span style={{fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.06em',color:isVis?C.gn:C.td}}>PORTAL</span>
                  <span style={{width:32,height:18,borderRadius:9,background:isVis?'rgba(46,213,115,0.25)':'rgba(255,255,255,0.06)',border:`1px solid ${isVis?'rgba(46,213,115,0.5)':C.cardBd}`,position:'relative',flexShrink:0}}>
                    <span style={{width:14,height:14,borderRadius:7,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?15:1,transition:'left .15s'}} />
                  </span>
                </button>;
              })()}
              <div className="prog-spacer" style={{flex:1,minWidth:8}} />
              {onPreviewPlan && <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();onPreviewPlan(p.id)}} title="Preview as trainee" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Preview</button>}
              <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();handleDuplicate(p.id)}} title="Duplicate program" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Duplicate</button>
              <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();setShareTarget(p.id)}} title="Share to an athlete — duplicates this program for them" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Share</button>
              <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();setConfirmDelete(p.id)}} title="Delete program" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',color:C.rd}}>Delete</button>
            </div>
          </div>})}
          {hasMore && <Btn variant="ghost" onClick={()=>setVisibleCount(c=>c+PAGE_SIZE)} style={{width:"100%",justifyContent:"center",marginTop:8}}>Load more ({filtered.length - visibleCount} remaining)</Btn>}
        </div>))}
        </div>{/* /RIGHT main column */}
      </div>{/* /two-column layout */}
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
            <div style={{fontFamily:FN,fontSize:10,color:C.tm,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:12}}>{(previewPlan.days||[]).length} DAYS · {(previewPlan.days||[]).reduce((n,d)=>n+((d?.exercises||[]).length),0)} EX{previewPlan.phase?` · ${previewPlan.phase}`:''}</div>
            {(previewPlan.days||[]).map((d,di) => (
              <div key={d?.id||di} style={{marginBottom:10}}>
                <div style={{fontFamily:FN,fontSize:10,fontWeight:700,color:C.tx,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>{d?.name}</div>
                {(d?.exercises||[]).filter(Boolean).slice(0,8).map((pe,ei) => {
                  const ex = exById(exercises).get(pe.exerciseId);
                  const title = ex?.title || pe.title || '—';
                  return (
                    <div key={pe.id||ei} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,padding:'2px 0',borderBottom:`1px solid rgba(57,189,255,0.102)`}}>
                      <span style={{fontSize:11,color:C.tm,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ei+1}. {title}</span>
                      <span style={{fontSize:10,fontFamily:FN,color:C.ac,flexShrink:0}}>{pe.sets}×{pe.reps}</span>
                    </div>
                  );
                })}
                {(d?.exercises||[]).length > 8 && <div style={{fontSize:10,color:C.td,fontFamily:FN,marginTop:3}}>+{(d?.exercises||[]).length-8} more</div>}
              </div>
            ))}
          </div>
        );
      })()}
      <ConfirmDialog open={!!confirmDelete} title="Delete Program?" message="Existing workouts will remain." onConfirm={()=>handleDelete(confirmDelete)} onCancel={()=>setConfirmDelete(null)} />
      {deleteModal}
      {newProgramModal}
      {shareModal}
    </div>);
}

// Athlete-picker modal for SHARE. Factored out of PlansView's JSX so it can
// render from BOTH returns — the programs list AND the editor (edit mode
// early-returns <PlanEditor/>, which used to make the modal unreachable: the
// editor's SHARE button set state and nothing ever appeared).
// Searchable athlete picker for the editor header (Ohad: "not just picker").
// Same 42px trigger box as the native select it replaced; opening drops an
// anchored panel with a filter input + option list. Search state lives inside
// so typing only re-renders the combo (input focus-loss rule).
function AthleteCombo({ value, options, onPick, title }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const current = options.find(o => o.value === value);
  const filtered = q ? options.filter(o => (o.label || '').toLowerCase().includes(q.toLowerCase())) : options;
  useEffect(() => {
    if (open) { setQ(''); setIdx(0); const t = setTimeout(() => inputRef.current?.focus(), 0); return () => clearTimeout(t); }
  }, [open]);
  const pick = (o) => { setOpen(false); if (o && o.value !== value) onPick(o.value, o.label); };
  return (
    <div style={{position:'relative',display:'flex',minWidth:0,flex:'1 1 240px',maxWidth:360}}>
      <button onClick={()=>setOpen(v=>!v)} title={title}
        style={{background:'var(--c-sf)',border:`1px solid ${open?C.ac:C.cardBd}`,color:C.tx,fontFamily:FN,fontSize:13,fontWeight:700,letterSpacing:'0.04em',cursor:'pointer',height:42,padding:'0 36px 0 18px',borderRadius:0,outline:'none',flex:1,minWidth:0,boxSizing:'border-box',textAlign:'center',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
        <bdi>{current?.label || 'Unassigned'}</bdi>
      </button>
      <span style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:C.tm,fontSize:12,lineHeight:1}}>▾</span>
      {open && <>
        <div onClick={()=>setOpen(false)} style={{position:'fixed',inset:0,zIndex:9998}} />
        <div style={{position:'absolute',top:44,left:0,right:0,zIndex:9999,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,boxShadow:C.cardShadow,display:'flex',flexDirection:'column',maxHeight:'min(420px, 60vh)'}}>
          <input ref={inputRef} value={q}
            onChange={e=>{ setQ(e.target.value); setIdx(0); }}
            onKeyDown={e=>{
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); pick(filtered[idx]); }
              else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
            }}
            placeholder="Search athletes…"
            style={{width:'100%',boxSizing:'border-box',padding:'10px 14px',background:'transparent',color:C.tx,border:'none',borderBottom:`1px solid ${C.cardBd}`,fontFamily:FN,fontSize:13,outline:'none'}} />
          <div style={{overflowY:'auto'}}>
            {filtered.map((o, i) => (
              <button key={o.value || '__none__'} onClick={()=>pick(o)} onMouseEnter={()=>setIdx(i)}
                style={{display:'block',width:'100%',padding:'9px 14px',background:i===idx?`${C.ac}1f`:'transparent',border:'none',borderBottom:`1px solid ${C.cardBd}`,color:o.value===value?C.ac:C.tx,fontFamily:FN,fontSize:13,fontWeight:o.value===value?700:500,cursor:'pointer',textAlign:'center',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                <bdi>{o.label}</bdi>
              </button>
            ))}
            {filtered.length === 0 && <div style={{padding:'14px',textAlign:'center',color:C.tm,fontFamily:FN,fontSize:12}}>No athletes match.</div>}
          </div>
        </div>
      </>}
    </div>
  );
}

function ShareAthleteModal({ trainees, shareSearch, setShareSearch, onPick, onClose }) {
  // Build the athlete list EXACTLY like the editor's assignment dropdown so
  // the trainee_id matches: couples expand to per-member ids (t.id__0/__1),
  // singles use t.id. Assigning to the parent couple id would be wrong.
  const q = shareSearch.toLowerCase();
  const list = (trainees || [])
    .filter(t => t.status !== 'Archived')
    .flatMap(t => (t.members && t.members.length === 2)
      ? t.members.map((m, i) => ({ id: t.id + '__' + i, name: m.name || ('Member ' + (i + 1)) }))
      : [{ id: t.id, name: t.name }])
    .filter(o => (o.name || '').toLowerCase().includes(q));
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:10000, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--c-sf)', border:`1px solid ${C.cardBd}`, borderRadius:0, width:'min(440px, 94vw)', maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:C.cardShadow }}>
        <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.cardBd}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontFamily:FN, fontSize:13, fontWeight:700, letterSpacing:'0.12em', color:C.tx, textTransform:'uppercase' }}>Share program to…</span>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:C.tm, fontSize:20, lineHeight:1, cursor:'pointer' }}>×</button>
        </div>
        <input value={shareSearch} onChange={e=>setShareSearch(e.target.value)} placeholder="Search athletes…" autoFocus style={{ width:'100%', boxSizing:'border-box', padding:'10px 18px', background:'transparent', color:C.tx, border:'none', borderBottom:`1px solid ${C.cardBd}`, fontFamily:FN, fontSize:13, outline:'none' }} />
        <div style={{ overflowY:'auto' }}>
          {list.map(t => (
            <button key={t.id} onClick={()=>onPick(t)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%', padding:'11px 18px', background:'transparent', border:'none', borderBottom:`1px solid ${C.cardBd}`, color:C.tx, fontFamily:FN, fontSize:13, cursor:'pointer', textAlign:'left' }}>
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.name}</span>
              <span style={{ color:C.ac, fontSize:10, fontWeight:700, letterSpacing:'0.1em', flexShrink:0, marginLeft:10 }}>DUPLICATE →</span>
            </button>
          ))}
          {list.length === 0 && <div style={{ padding:'18px', textAlign:'center', color:C.tm, fontFamily:FN, fontSize:12 }}>No athletes match.</div>}
        </div>
      </div>
    </div>
  );
}
