import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { C, FN, FB, uid, ytId, RESISTANCE_TYPES, BODY_POSITIONS, MOVEMENT_TYPES } from './theme';
import { Btn, Input, Select, TextArea, Modal, ConfirmDialog, EmptyState, baseInput } from './ui';
import { classify, isUnclassified } from './exerciseClassify';
import { useT as useAppT } from './i18n';

// Grid-card video: a lightweight YouTube FACADE. The grid can show 200 cards, so
// it must NOT mount 200 iframes — it paints the lazy poster thumbnail and only
// swaps to an inline player when clicked. That player is deliberately NON-
// fullscreen: no allowFullScreen attribute + fs=0, so neither the control nor a
// double-click can take it fullscreen (Ohad). Non-YouTube / no video get a quiet
// tile so every card keeps the same half-video / half-notes shape.
function GridVideo({ url }) {
  const [play, setPlay] = useState(false);
  const yid = ytId(url);
  const box = { position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', overflow: 'hidden', borderBottom: `1px solid ${C.cardBd}`, flexShrink: 0 };
  if (yid) {
    if (play) return (
      <div style={box}>
        <iframe title="exercise demo" src={`https://www.youtube.com/embed/${yid}?fs=0&rel=0&modestbranding=1&playsinline=1&autoplay=1`}
          style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay; encrypted-media" />
      </div>
    );
    return (
      <div style={{ ...box, cursor: 'pointer' }} onClick={() => setPlay(true)} title="Play inline (no fullscreen)" role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlay(true); } }}>
        <img src={`https://img.youtube.com/vi/${yid}/hqdefault.jpg`} loading="lazy" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92, display: 'block' }} />
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.85)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #fff', marginLeft: 2 }} />
          </span>
        </span>
      </div>
    );
  }
  const embeddable = typeof url === 'string' && /^https?:\/\//i.test(url) && (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || /(photos\.app\.goo\.gl|photos\.google\.com|lh3\.googleusercontent\.com)/i.test(url));
  return (
    <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: embeddable ? C.ac : C.td, opacity: embeddable ? 0.9 : 0.5 }}>
        {embeddable ? '▶ Video' : 'No video'}
      </span>
    </div>
  );
}

// Exercise shape aligned to the canonical library xlsx (Last Draft Exercise
// Library.xlsx): Resistance Type · Body Position · Movement Type · Primary Joints
// · Joint Movements · Primary/Secondary Muscle Groups · Coaching Notes(=cues).
// Legacy fields (category / movementPattern / laterality) are preserved on
// existing rows via the {...ex} spread but no longer authored — they aren't
// columns in the library.
const defaultExercise = () => ({ id: uid(), title: "", resistanceType: "", bodyPosition: "", movementType: "", primaryJoints: "", jointMovements: "", primaryMuscles: "", secondaryMuscles: "", videoLink: "", cues: "", notes: "" });

const hasVideo = e => !!(e.videoLink && String(e.videoLink).trim());
const hasNotes = e => !!(e.cues && String(e.cues).trim());
// Shared any-field-missing definition — MUST match the Classify screen's count
// so the banner number and the screen it opens agree (audit 08-22).
const isMissing = e => isUnclassified(e);
const splitVals = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

export default function ExercisesView({ exercises, setExercises, onOpenClassify }) {
  const tt = useAppT();
  const unclassifiedCount = useMemo(() => (exercises || []).filter(isMissing).length, [exercises]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultExercise());
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  // Every xlsx column is a filter (Ohad), each MULTI-select (arrays). Single-value
  // fields OR together; multi-value fields (joints/movements/muscles) require ALL
  // picked values to be present on the exercise (AND) — an exercise lists several.
  const EMPTY_F = { resistanceType: [], bodyPosition: [], movementType: [], primaryJoints: [], jointMovements: [], primaryMuscles: [], secondaryMuscles: [] };
  const MULTI_VALUE = new Set(['primaryJoints', 'jointMovements', 'primaryMuscles', 'secondaryMuscles']);
  const [f, setF] = useState(EMPTY_F);
  const [flags, setFlags] = useState({ video: false, notes: false, missing: false });
  const [openKey, setOpenKey] = useState(null); // which filter pill's menu is open
  const [sortKey, setSortKey] = useState('title');
  const [sortDir, setSortDir] = useState('asc');
  const [view, setView] = useState('table'); // 'table' | 'grid' — mirrors Programs
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const ROW_CAP = 200;

  // Toggle a value in/out of a filter's selection set.
  const toggleFilter = (k, v) => { setF(prev => { const cur = prev[k] || []; return { ...prev, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }; }); setShowAll(false); };
  const clearFilter = (k) => { setF(prev => ({ ...prev, [k]: [] })); setShowAll(false); };
  const toggleFlag = k => { setFlags(m => ({ ...m, [k]: !m[k] })); setShowAll(false); };
  const onSort = (k) => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc'); } };
  const activeFilterCount = Object.values(f).filter(a => a.length).length + Object.values(flags).filter(Boolean).length;
  const anyFilter = !!(search.trim() || activeFilterCount);
  const clearAll = () => { setSearch(''); setF(EMPTY_F); setFlags({ video: false, notes: false, missing: false }); setOpenKey(null); setShowAll(false); };

  // Close any open filter menu on Escape.
  useEffect(() => {
    if (!openKey) return;
    const onKey = e => { if (e.key === 'Escape') setOpenKey(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openKey]);

  // The filter predicate, shared by the result list AND the faceted option counts.
  // `skip` omits one dimension's own selection so that dimension's counts reflect
  // every OTHER active filter but not itself — the standard faceted-search rule.
  const passFilters = useCallback((e, skip) => {
    const q = search.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    if (tokens.length) {
      const hay = [e.title, e.resistanceType, e.bodyPosition, e.movementType, e.primaryJoints, e.jointMovements, e.primaryMuscles, e.secondaryMuscles].filter(Boolean).join(' ').toLowerCase();
      if (!tokens.every(t => hay.includes(t))) return false;
    }
    // Single-value fields: OR — the row's value must be one of the picked.
    if (skip !== 'resistanceType' && f.resistanceType.length && !f.resistanceType.includes(e.resistanceType)) return false;
    if (skip !== 'bodyPosition' && f.bodyPosition.length && !f.bodyPosition.includes(e.bodyPosition)) return false;
    if (skip !== 'movementType' && f.movementType.length && !f.movementType.includes(e.movementType)) return false;
    // Multi-value fields: AND — the row must contain ALL picked values.
    if (skip !== 'primaryJoints' && f.primaryJoints.length) { const v = splitVals(e.primaryJoints); if (!f.primaryJoints.every(s => v.includes(s))) return false; }
    if (skip !== 'jointMovements' && f.jointMovements.length) { const v = splitVals(e.jointMovements); if (!f.jointMovements.every(s => v.includes(s))) return false; }
    if (skip !== 'primaryMuscles' && f.primaryMuscles.length) { const v = splitVals(e.primaryMuscles); if (!f.primaryMuscles.every(s => v.includes(s))) return false; }
    if (skip !== 'secondaryMuscles' && f.secondaryMuscles.length) { const v = splitVals(e.secondaryMuscles); if (!f.secondaryMuscles.every(s => v.includes(s))) return false; }
    if (skip !== 'video' && flags.video && !hasVideo(e)) return false;
    if (skip !== 'notes' && flags.notes && !hasNotes(e)) return false;
    if (skip !== 'missing' && flags.missing && !isMissing(e)) return false;
    return true;
  }, [search, f, flags]);

  // FACETED counts (Ohad): each parameter's count reflects the CURRENT selection,
  // not the whole library — pick "notes", and every muscle/joint/type count updates
  // to the notes∩value total. OR facets (single-value) skip their own dimension so
  // their options still show switchable counts; AND facets (multi-value) apply their
  // own selection so an unselected option shows the true intersection you'd land on.
  const counts = useMemo(() => {
    const rt = {}, bp = {}, mt = {}, pj = {}, jm = {}, pm = {}, sm = {}; let vid = 0, note = 0, miss = 0;
    const bump = (map, v) => { map[v] = (map[v] || 0) + 1; };
    for (const e of (exercises || [])) {
      if (e.resistanceType && passFilters(e, 'resistanceType')) bump(rt, e.resistanceType);
      if (e.bodyPosition && passFilters(e, 'bodyPosition')) bump(bp, e.bodyPosition);
      if (e.movementType && passFilters(e, 'movementType')) bump(mt, e.movementType);
      if (passFilters(e, null)) {
        new Set(splitVals(e.primaryJoints)).forEach(v => bump(pj, v));
        new Set(splitVals(e.jointMovements)).forEach(v => bump(jm, v));
        new Set(splitVals(e.primaryMuscles)).forEach(v => bump(pm, v));
        new Set(splitVals(e.secondaryMuscles)).forEach(v => bump(sm, v));
      }
      if (hasVideo(e) && passFilters(e, 'video')) vid++;
      if (hasNotes(e) && passFilters(e, 'notes')) note++;
      if (isMissing(e) && passFilters(e, 'missing')) miss++;
    }
    return { rt, bp, mt, pj, jm, pm, sm, vid, note, miss };
  }, [exercises, passFilters]);

  const filtered = useMemo(() => {
    let out = (exercises || []).filter(e => passFilters(e, null));
    out = out.slice().sort((a, b) => {
      const av = String(a[sortKey] || ''), bv = String(b[sortKey] || '');
      const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [exercises, passFilters, sortKey, sortDir]);

  const rows = showAll ? filtered : filtered.slice(0, ROW_CAP);

  const handleSave = () => {
    if (!form.title) return;
    if (editId) setExercises(prev => prev.map(e => e.id === editId ? form : e));
    else setExercises(prev => [...prev, form]);
    setForm(defaultExercise()); setEditId(null); setShowForm(false);
  };
  const openNew = () => { setForm(defaultExercise()); setEditId(null); setShowForm(true); };

  // Dropdown option lists ([value, count]) sorted by (faceted) count. Always
  // include currently-selected values even if their residual count is 0, so a
  // selection can never disappear from its own menu and become un-uncheckable.
  const dynOpts = (cm, sel = []) => {
    const keys = new Set([...Object.keys(cm), ...sel]);
    return [...keys].sort((a, b) => (cm[b] || 0) - (cm[a] || 0) || a.localeCompare(b)).map(v => [v, cm[v] || 0]);
  };

  // Filter controls are UNDERLINE text (per the control-material differentiation
  // rule: filters = underline, not solid boxes) — light, inline, hug their label.
  const railBase = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 1px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' };
  // Muted role-label that leads each filter row (Show / Filter by) — a fixed-width
  // spine so the two rows' controls start at the same x and read as two jobs.
  // 58 was 6px short of "FILTER BY" at 9px/0.14em, so the label spilled its own
  // box; 66 fits it. Both rows share the constant, so the spine still lines up.
  const rowLabel = { flexShrink: 0, width: 66, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.tm, textTransform: 'uppercase', whiteSpace: 'nowrap' };
  // Shared width for the two stacked right-side controls (Table/Grid toggle group
  // and the Add Exercise button) so their right edges line up as an equal column
  // (Ohad: "table + grid together = same hoz space as add exercise button").
  const RIGHT_CTL_W = 200;

  // A multi-select filter trigger: label + ▾, cyan underline when active, opens a
  // checklist menu. Single menu open at a time (openKey).
  const FilterPill = ({ label, k, options }) => {
    const sel = f[k] || [];
    const active = sel.length > 0;
    const isOpen = openKey === k;
    const faceLabel = sel.length === 1 ? sel[0] : (sel.length > 1 ? `${label} · ${sel.length}` : label);
    return (
      <div style={{ position: 'relative' }}>
        {/* Inactive filters carry NO underline (transparent) — cyan only when
            active/open, hover-revealed via the .filt CSS. Was a permanent
            cyan-30% underline on every one, so the row read as a busy wall of
            look-alike underlined labels (Ohad #230). Now it's calm plain text
            with a caret; the active filter is the only lit one. */}
        <button className={`filt${active || isOpen ? ' filt-on' : ''}`} onClick={() => setOpenKey(isOpen ? null : k)} title={label}
          style={{ ...railBase, borderBottomColor: (active || isOpen) ? C.ac : 'transparent', color: active ? C.ac : C.tx }}>
          <span style={{ maxWidth: 220, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{faceLabel}</span>
          {active
            ? <span onClick={e => { e.stopPropagation(); clearFilter(k); }} title="Clear" style={{ fontSize: 13, lineHeight: 1, opacity: 0.85 }}>×</span>
            : <span style={{ color: (active || isOpen) ? C.ac : C.tm, fontSize: 9 }}>▾</span>}
        </button>
        {isOpen && (
          <div style={{ position: 'absolute', top: 32, left: 0, minWidth: 'max(100%, 248px)', maxHeight: 366, overflowY: 'auto', background: 'var(--c-sf)', border: `1px solid ${C.ac}`, zIndex: 50, boxShadow: '0 12px 30px rgba(0,0,0,0.55)' }}>
            {/* Cyan strip header — same card-strip-header language as the rest of
                the site (parameter name left, selected/total count right). */}
            <div style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 28, padding: '0 11px', background: 'color-mix(in srgb, var(--c-ac) 15%, var(--c-sf))', borderBottom: `1px solid ${C.ac}`, zIndex: 1 }}>
              <span style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', color: C.ac, textTransform: 'uppercase' }}>{label}</span>
              {sel.length > 0
                ? <span onClick={e => { e.stopPropagation(); clearFilter(k); }} title="Clear selection" style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.tm, cursor: 'pointer' }}>CLEAR · {sel.length}</span>
                : <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: C.td, fontVariantNumeric: 'tabular-nums' }}>{options.length}</span>}
            </div>
            {options.length === 0 && <div style={{ padding: '10px 12px', color: C.td, fontFamily: FN, fontSize: 10, letterSpacing: '0.04em' }}>{tt("No values in library")}</div>}
            {options.map(([v, c], idx) => {
              const on = sel.includes(v);
              return (
                <div key={v} onClick={() => toggleFilter(k, v)}
                  style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 10, alignItems: 'center', height: 30, padding: '0 11px', cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', color: on ? C.ac : C.tx, background: on ? 'color-mix(in srgb, var(--c-ac) 12%, transparent)' : 'transparent', borderTop: idx === 0 ? 'none' : '1px solid var(--c-cardBd)', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--c-sf2)'; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
                  {/* Real checkbox — fills cyan when selected (OCD: fixed column). */}
                  <span style={{ width: 13, height: 13, boxSizing: 'border-box', border: `1px solid ${on ? C.ac : 'var(--c-cardBd)'}`, background: on ? C.ac : 'transparent', color: 'var(--c-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, lineHeight: 1 }}>{on ? '✓' : ''}</span>
                  <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{v}</span>
                  <span style={{ color: on ? C.ac : C.tm, fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const flagChip = (k, label, color = C.ac) => (
    <button key={k} className={`filt${flags[k] ? ' filt-on' : ''}`} onClick={() => toggleFlag(k)}
      style={{ ...railBase, borderBottomColor: flags[k] ? color : 'transparent', color: flags[k] ? color : C.tm }}>{label}</button>
  );

  // A faint dot for empty cells so blanks recede instead of a loud "—".
  const emptyDot = <span style={{ color: C.td, opacity: 0.4, fontSize: 12 }}>·</span>;
  // Single-value classification — quiet uppercase mono, or a faint dot.
  const oneCell = (v, extra = {}) => (
  // Wrap, never ellipsise. Ohad: "i cant see some of the words... never do."
  // A classification value cut to "Shoulder Horizontal Adducti…" is not a
  // classification. The row gets taller; the word stays whole.
    <td title={v || undefined} style={{ padding: '9px 12px', whiteSpace: 'normal', overflowWrap: 'anywhere', ...extra }}>
      {v ? <span style={{ fontFamily: FN, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em', color: C.tm }}>{v}</span> : emptyDot}
    </td>
  );
  // Multi-value classification — small chips (up to 3) + "+N", or a faint dot.
  const chipCell = (v, max = 320) => {
    const vals = splitVals(v);
    return (
      <td title={vals.join(', ') || undefined} style={{ padding: '9px 12px', maxWidth: max, overflow: 'hidden' }}>
        {vals.length === 0 ? emptyDot : (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', rowGap: 3 }}>
            {/* The ROW wraps instead of the chips being cut. Ohad: never
                truncate - "i cant see some of the words". Letting a chip
                ellipsise hid the muscle it names; letting it overflow a
                nowrap row spilled it over the next column. Wrapping keeps
                every chip whole and grows the row instead. */}
            {vals.slice(0, 3).map((x, i) => (
              <span key={i} style={{ display: 'inline-block', minWidth: 0, flexShrink: 1, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1, fontFamily: FN, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.02em', color: C.tm, background: 'var(--c-sf2)', border: `1px solid ${C.cardBd}`, padding: '2px 6px' }}>{x}</span>
            ))}
            {vals.length > 3 && <span style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, color: C.td, padding: '2px 3px', whiteSpace: 'nowrap', flexShrink: 0 }}>+{vals.length - 3}</span>}
          </div>
        )}
      </td>
    );
  };
  // Left-rail status dot: cyan=has video, amber ring=notes only, hollow=bare.
  const statusDot = (ex) => {
    const vid = hasVideo(ex), note = hasNotes(ex);
    const color = vid ? C.ac : note ? C.or : C.td;
    return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: (vid || note) ? color : 'transparent', border: (vid || note) ? 'none' : `1px solid ${C.td}`, opacity: (vid || note) ? 1 : 0.4 }} />;
  };

  return (
    // data-allow-copy: same copyGuard opt-out as the program editor — Ohad wants
    // to select/copy exercise data while managing the library.
    <div data-allow-copy>
      <style>{`
        .ex-row:nth-child(odd) td { background: rgba(127,127,138,0.04); }
        .ex-row:hover td { background: color-mix(in srgb, var(--c-ac) 7%, var(--c-sf)); }
        .ex-row td:first-child { box-shadow: inset 2px 0 0 transparent; transition: box-shadow .12s; }
        .ex-row:hover td:first-child { box-shadow: inset 2px 0 0 var(--c-ac); }
        .ex-table thead th { background: var(--c-sf2) !important; }
        .filt { transition: color .12s, border-color .12s; }
        .filt:not(.filt-on):hover { color: var(--c-tx) !important; border-bottom-color: var(--c-tm) !important; }
        .ex-card { transition: border-color .12s, transform .12s; }
        .ex-card:hover { border-color: var(--c-ac) !important; }
      `}</style>

      {/* Header — title + live count (left) + TABLE/GRID toggle (right),
          mirroring the Programs page toggle EXACTLY (Ohad: "like in programs"). */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: C.tx, textTransform: 'uppercase' }}>
          {tt("Exercises")} <span style={{ color: C.tm, fontWeight: 700 }}>· {filtered.length.toLocaleString()}{anyFilter ? ` of ${(exercises || []).length.toLocaleString()}` : ''}</span>
        </h2>
        <div style={{ display: 'flex', gap: 6, width: RIGHT_CTL_W }}>
          {[['table', 'Table'], ['grid', 'Grid']].map(([v, label]) => {
            const on = view === v;
            return (
              <button key={v} onClick={() => setView(v)} title={v === 'table' ? 'Dense table — every parameter a sortable column' : 'Card grid — one card per exercise'}
                style={{ flex: 1, height: 30, boxSizing: 'border-box', borderRadius: 0, cursor: 'pointer', border: `1px solid ${on ? '#39BDFF' : C.cardBd}`, background: on ? '#39BDFF' : 'var(--c-sf)', color: on ? '#FFFFFF' : C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{label}</button>
            );
          })}
        </div>
      </div>

      {/* Search + Add — prominent, full width. */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, display: 'flex' }}>
          <input placeholder="Search exercises (title, muscle, joint, position…)" value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }}
            style={{ ...baseInput, height: 30, padding: '0 14px', fontSize: 13, lineHeight: '30px', textAlign: 'left', border: `1px solid ${C.ac}`, width: '100%' }} />
        </div>
        <Btn onClick={openNew} style={{ height: 30, width: RIGHT_CTL_W, flexShrink: 0, padding: '0 18px', fontSize: 13, lineHeight: '30px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>+ Add Exercise</Btn>
      </div>

      {onOpenClassify && unclassifiedCount > 0 && (
        <button onClick={onOpenClassify} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, width: '100%', textAlign: 'left', marginBottom: 16, padding: '10px 14px', background: `color-mix(in srgb, ${C.ac} 8%, var(--c-sf))`, border: `1px solid color-mix(in srgb, ${C.ac} 35%, transparent)`, borderLeft: `3px solid ${C.ac}`, borderRadius: 0, cursor: 'pointer' }}>
          <span style={{ fontFamily: FN, fontSize: 12.5, fontWeight: 700, color: C.tx }}><span style={{ color: C.ac, fontVariantNumeric: 'tabular-nums' }}>{unclassifiedCount.toLocaleString()}</span> exercises are unclassified</span>
          <span style={{ fontFamily: FB, fontSize: 12, color: C.td }}>— resolution/movement/position blank</span>
          <span style={{ marginLeft: 'auto', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ac }}>Classify at scale →</span>
        </button>
      )}

      {/* Filter rail — inline UNDERLINE-style controls (filters = underline text,
          per the control-material differentiation rule), no heavy empty box. Two
          deliberate rows, each led by a muted role-label so the coach reads them as
          two DIFFERENT jobs (Ohad polish 2026-08-12): row 1 = quick SHOW toggles
          (has video / has notes / unclassified), row 2 = FILTER BY xlsx parameter.
          Labels give the block a spine instead of a flat wall of look-alike chips;
          "Secondary Muscles" no longer dangles onto its own line. */}
      <div style={{ marginBottom: 16, borderBottom: `1px solid ${C.cardBd}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', padding: '0 1px 10px' }}>
          <span style={rowLabel}>{tt("Show")}</span>
          {flagChip('video', `▶ Video (${counts.vid})`)}
          {flagChip('notes', `☰ Notes (${counts.note})`, C.or)}
          {flagChip('missing', `∅ Unclassified (${counts.miss})`, C.or)}
          {anyFilter && <button className="filt" onClick={clearAll} title="Clear all filters" style={{ ...railBase, color: C.rd, marginLeft: 'auto', letterSpacing: '0.1em' }}>× Clear all</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', padding: '0 1px 12px', borderTop: `1px solid ${C.cardBd}`, paddingTop: 10 }}>
          <span style={rowLabel}>Filter&nbsp;by</span>
          <FilterPill label="Resistance" k="resistanceType" options={dynOpts(counts.rt, f.resistanceType)} />
          <FilterPill label="Position" k="bodyPosition" options={dynOpts(counts.bp, f.bodyPosition)} />
          <FilterPill label="Movement" k="movementType" options={dynOpts(counts.mt, f.movementType)} />
          <FilterPill label="Joints" k="primaryJoints" options={dynOpts(counts.pj, f.primaryJoints)} />
          <FilterPill label="Joint Movements" k="jointMovements" options={dynOpts(counts.jm, f.jointMovements)} />
          <FilterPill label="Primary Muscles" k="primaryMuscles" options={dynOpts(counts.pm, f.primaryMuscles)} />
          <FilterPill label="Secondary Muscles" k="secondaryMuscles" options={dynOpts(counts.sm, f.secondaryMuscles)} />
        </div>
      </div>
      {/* Click-away backdrop to dismiss an open filter menu. */}
      {openKey && <div onClick={() => setOpenKey(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}

      {/* FULL-WIDTH data table — every parameter a sortable column. */}
      {filtered.length === 0 ? (
        <EmptyState icon="" message={anyFilter ? 'No exercises match your search or filters.' : 'No exercises. Build your library.'} />
      ) : view === 'grid' ? (
        // GRID — card per exercise, mirroring the Programs card grammar EXACTLY
        // (cyan strip header + accent bar + name, calm body, light text actions).
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
          {rows.map(ex => {
            const note = hasNotes(ex);
            const meta = [ex.resistanceType, ex.bodyPosition, ex.movementType].filter(Boolean);
            return (
              <div key={ex.id} className="ex-card" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, display: 'flex', flexDirection: 'column', boxShadow: C.cardShadow }}>
                {/* cyan strip header — title only; the video/notes icons are gone
                    now the card shows the thumbnail + cues directly (Ohad). */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '8px 14px', minWidth: 0 }}>
                  <span aria-hidden style={{ width: 3, height: 14, background: C.ac, flexShrink: 0 }} />
                  <bdi title={ex.title} style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', color: '#FFFFFF', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{ex.title}</bdi>
                </div>
                {/* body — half YouTube thumbnail (inline, no fullscreen), half
                    coaching notes (Ohad). Classification recedes to a single meta
                    line so the card reads as demo + cues, not a spec sheet. */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <GridVideo url={ex.videoLink} />
                  <div style={{ padding: '9px 12px', flex: 1, minHeight: 46, maxHeight: 132, overflow: 'auto' }}>
                    {note
                      ? <bdi style={{ display: 'block', fontFamily: FB, fontSize: 12, lineHeight: 1.5, color: C.tm, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ex.cues}</bdi>
                      : <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.td }}>{tt("No coaching cues")}</span>}
                    {meta.length > 0 && <div style={{ marginTop: 8, fontFamily: FN, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em', color: C.td }}>{meta.join('  ·  ')}</div>}
                  </div>
                </div>
                {/* actions — light text buttons, like the program card */}
                <div style={{ padding: '8px 14px 12px', display: 'flex', gap: 16, alignItems: 'center', borderTop: `1px solid ${C.cardBd}` }}>
                  <button onClick={() => { setForm({ ...ex }); setEditId(ex.id); setShowForm(true); }} title="Edit exercise" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: C.ac }}>{tt("Edit")}</button>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setConfirmDelete(ex.id)} title="Delete exercise" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: C.rd }}>{tt("Delete")}</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, overflowX: 'hidden' }}>
          {/* table-layout:fixed + colgroup: every column shares 100% of the width
              so the table NEVER overflows horizontally (Ohad: "too much scrolling
              left and right"). Long comma-lists truncate with … (full on hover). */}
          <table className="ex-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            <colgroup>
              {/* EXERCISE name is the primary identifier — give it real width so
                  full titles read ("5m Reverse Sprint to Full-Court Layup") instead
                  of clipping at ~18 chars. The 7 taxonomy columns are ~91% empty
                  (1,379/1,476 unclassified) so they don't need equal billing; they
                  stay wide enough for their populated values and 2-line headers.
                  All %s still sum to 100 → no horizontal scroll. (Ohad #219.) */}
              <col style={{ width: '30%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '48px' }} />
              <col style={{ width: '56px' }} />
            </colgroup>
            <thead>
              <tr>
                {[['title', 'Exercise'], ['resistanceType', 'Resistance'], ['bodyPosition', 'Position'], ['movementType', 'Movement'], ['primaryJoints', 'Joints'], ['jointMovements', 'Joint Movements'], ['primaryMuscles', 'Primary Muscles'], ['secondaryMuscles', 'Secondary Muscles']].map(([k, l]) => {
                  const active = sortKey === k;
                  return (
                    <th key={k} onClick={() => onSort(k)} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 9, fontFamily: FN, color: active ? C.ac : C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, cursor: 'pointer', whiteSpace: 'normal', lineHeight: 1.25, borderBottom: `1px solid ${C.cardBd}`, userSelect: 'none', position: 'sticky', top: 0, background: 'var(--c-sf)', zIndex: 1 }}>
                      {l}{active && <span style={{ fontSize: 8, marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  );
                })}
                <th style={{ padding: '9px 12px', fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.13em', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.cardBd}`, position: 'sticky', top: 0, background: 'var(--c-sf)', zIndex: 1 }}>{tt("Media")}</th>
                <th style={{ borderBottom: `1px solid ${C.cardBd}`, position: 'sticky', top: 0, background: 'var(--c-sf)', zIndex: 1 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(ex => {
                return (
                  <tr key={ex.id} className="ex-row" style={{ borderBottom: `1px solid ${C.cardBd}` }}>
                    <td style={{ padding: '9px 12px 9px 14px', maxWidth: 320 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        {statusDot(ex)}
                        <span title={ex.title} style={{ fontWeight: 600, fontSize: 13, color: C.tx, whiteSpace: 'normal', overflowWrap: 'anywhere', whiteSpace: 'nowrap' }}>{ex.title}</span>
                      </div>
                    </td>
                    {oneCell(ex.resistanceType)}
                    {oneCell(ex.bodyPosition)}
                    {oneCell(ex.movementType)}
                    {chipCell(ex.primaryJoints, 170)}
                    {chipCell(ex.jointMovements, 210)}
                    {chipCell(ex.primaryMuscles, 230)}
                    {chipCell(ex.secondaryMuscles, 210)}
                    <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {hasVideo(ex) && <span title="Has a demo video" style={{ color: C.ac, marginRight: hasNotes(ex) ? 8 : 0, fontSize: 12 }}>▶</span>}
                      {hasNotes(ex) && <span title="Has coaching cues" style={{ color: C.or, fontSize: 12 }}>☰</span>}
                      {!hasVideo(ex) && !hasNotes(ex) && emptyDot}
                    </td>
                    <td style={{ padding: '9px 8px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button onClick={() => { setForm({ ...ex }); setEditId(ex.id); setShowForm(true); }} title="Edit exercise" style={{ background: 'none', border: 'none', color: C.tm, cursor: 'pointer', padding: 4 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button onClick={() => setConfirmDelete(ex.id)} title="Delete exercise" style={{ background: 'none', border: 'none', color: C.rd, cursor: 'pointer', padding: 4, opacity: 0.7 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Shared row-cap notice — applies to both table and grid. */}
      {filtered.length > 0 && !showAll && filtered.length > ROW_CAP && (
        <div style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontFamily: FN, color: C.tm }}>Showing {ROW_CAP} of {filtered.length.toLocaleString()} — refine the search, or</span>
          <button onClick={() => setShowAll(true)} style={{ background: 'var(--c-sf)', border: `1px solid ${C.ac}`, borderRadius: 0, padding: '3px 12px', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' }}>{tt("SHOW ALL")}</button>
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Exercise' : 'New Exercise'} wide>
        <div data-allow-copy>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}><Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Barbell Back Squat" /></div>
            {(() => { const g = classify(form.title); return (!form.resistanceType || !form.bodyPosition || !form.movementType) && g.filled > 0 ? (
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setForm(f => ({ ...f, resistanceType: f.resistanceType || g.resistanceType, bodyPosition: f.bodyPosition || g.bodyPosition, movementType: f.movementType || g.movementType }))}
                  style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ac, background: `color-mix(in srgb, ${C.ac} 12%, transparent)`, border: `1px solid ${C.ac}`, borderRadius: 0, padding: '6px 12px', cursor: 'pointer' }}>✨ Suggest from title</button>
                <span style={{ fontFamily: FB, fontSize: 11.5, color: C.tm }}>{[g.resistanceType, g.bodyPosition, g.movementType].filter(Boolean).join(' · ')} — fills blank fields only</span>
              </div>
            ) : null; })()}
            <Select label="Resistance Type" options={RESISTANCE_TYPES} value={form.resistanceType} onChange={v => setForm({ ...form, resistanceType: v })} placeholder="Select..." />
            <Select label="Body Position" options={BODY_POSITIONS} value={form.bodyPosition} onChange={v => setForm({ ...form, bodyPosition: v })} placeholder="Select..." />
            <Select label="Movement Type" options={MOVEMENT_TYPES} value={form.movementType} onChange={v => setForm({ ...form, movementType: v })} placeholder="Select..." />
            <Input label="Primary Joints" value={form.primaryJoints} onChange={e => setForm({ ...form, primaryJoints: e.target.value })} placeholder="Shoulder, Elbow" />
            <Input label="Joint Movements" value={form.jointMovements} onChange={e => setForm({ ...form, jointMovements: e.target.value })} placeholder="Shoulder Flexion" />
            <Input label="Primary Muscle Groups" value={form.primaryMuscles} onChange={e => setForm({ ...form, primaryMuscles: e.target.value })} placeholder="Quads, Glutes" />
            <Input label="Secondary Muscle Groups" value={form.secondaryMuscles} onChange={e => setForm({ ...form, secondaryMuscles: e.target.value })} />
            <div style={{ gridColumn: '1 / -1' }}><Input label="Video Link" value={form.videoLink} onChange={e => setForm({ ...form, videoLink: e.target.value })} placeholder="https://..." /></div>
            {/* One note field only. "Coaching Cues" IS the note — hasNotes(), the
                cards, and the athlete portal all read `cues`. The separate "Notes"
                field was a vestigial duplicate that showed the same role twice
                (Ohad: "coaching cues and notes are the same"). */}
            <div style={{ gridColumn: '1 / -1' }}><TextArea label="Coaching Cues" value={form.cues} onChange={e => setForm({ ...form, cues: e.target.value })} placeholder="Brace core, drive through heels..." /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Btn variant="ghost" onClick={() => setShowForm(false)}>{tt("Cancel")}</Btn>
            <Btn onClick={handleSave}>{editId ? 'Update' : 'Create'}</Btn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="Delete Exercise?" message="Plans referencing it will show 'Unknown Exercise'."
        onConfirm={() => { setExercises(p => p.filter(e => e.id !== confirmDelete)); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
