// SmartImportView — coach-side AI-powered XLSX importer.
//
// Flow: pick file → pick sheet → pick target (exercises | athletes | programs)
// → AI proposes a column→field mapping → coach reviews/edits → AI transforms
// rows → coach previews → commit to Supabase.
//
// The /api/smart-import endpoint runs Opus 4.7 with target-specific system
// prompts. This view is purely orchestration + override surface.
import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { C, FN, FB, uid } from './theme';
import { Btn, Input, Select, Badge } from './ui';

const TARGETS = [
  { value: 'exercises', label: 'Exercise Library', hint: 'Add or merge into the shared exercise library.' },
  { value: 'athletes', label: 'Athletes', hint: 'Add or update trainees in expo-trainees.' },
  { value: 'programs', label: 'Programs', hint: 'Import block(s) into the plans table.' },
];

const TARGET_FIELDS = {
  exercises: ['title','videoLink','cues','category','resistanceType','bodyPosition','movementPattern','laterality','primaryMuscles','secondaryMuscles','notes'],
  athletes: ['name','email','phone','age','weight','height','goals','injuries','notes','status','format','package','sessionsRemaining','monthlyPrice','sessionPrice','startDate'],
  programs: ['programName','days'],
};

export default function SmartImportView() {
  const [fileName, setFileName] = useState('');
  const [workbook, setWorkbook] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [target, setTarget] = useState('exercises');
  const [sheetGrid, setSheetGrid] = useState(null);   // { headers, rows, sample, sheetName }
  const [analyzing, setAnalyzing] = useState(false);
  const [mapping, setMapping] = useState(null);       // model output: { mapping, notes, warnings, confidence }
  const [transforming, setTransforming] = useState(false);
  const [transform, setTransform] = useState(null);   // model output: { items, errors, warnings }
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  const onPick = e => {
    const f = e.target.files?.[0]; if (!f) return;
    setFileName(f.name); setErr(''); setMapping(null); setTransform(null); setSheetGrid(null);
    const r = new FileReader();
    r.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        setWorkbook(wb);
        const s0 = wb.SheetNames[0]; setSheetName(s0);
        loadSheet(wb, s0);
      } catch (e) { setErr('Could not read file: ' + e.message); }
    };
    r.readAsArrayBuffer(f);
  };

  const loadSheet = (wb, name) => {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (!aoa.length) { setSheetGrid({ headers: [], rows: [], sample: [], sheetName: name }); return; }
    // Find the first row with ≥3 non-empty cells — that's the header row.
    let headerIdx = 0;
    for (let i = 0; i < Math.min(aoa.length, 8); i++) {
      const nonEmpty = aoa[i].filter(c => String(c || '').trim()).length;
      if (nonEmpty >= 3) { headerIdx = i; break; }
    }
    const headers = aoa[headerIdx].map(h => String(h || '').trim());
    const dataRows = aoa.slice(headerIdx + 1).filter(r => r.some(c => String(c || '').trim()));
    const sample = dataRows.slice(0, 6);
    setSheetGrid({ headers, rows: dataRows, sample, sheetName: name });
  };

  const onSheetChange = v => { setSheetName(v); setMapping(null); setTransform(null); if (workbook) loadSheet(workbook, v); };
  const onTargetChange = v => { setTarget(v); setMapping(null); setTransform(null); };

  const analyze = async () => {
    if (!sheetGrid) return;
    setErr(''); setAnalyzing(true); setMapping(null); setTransform(null);
    try {
      const r = await fetch('/api/smart-import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'analyze', target,
          headers: sheetGrid.headers,
          sampleRows: sheetGrid.sample,
          sheetName: sheetGrid.sheetName,
        }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setMapping(j);
    } catch (e) { setErr('Analyze failed: ' + e.message); }
    setAnalyzing(false);
  };

  const updateMappingSource = (field, source) => {
    setMapping(m => ({ ...m, mapping: { ...m.mapping, [field]: { ...(m.mapping[field] || {}), source: source || null } } }));
    setTransform(null);
  };

  const runTransform = async () => {
    if (!mapping || !sheetGrid) return;
    setErr(''); setTransforming(true); setTransform(null); setCommitMsg('');
    try {
      // Convert AOA rows → array of {header: cellValue} objects so the model
      // doesn't have to track index positions.
      const rowObjs = sheetGrid.rows.map(r => {
        const o = {};
        sheetGrid.headers.forEach((h, i) => { if (h) o[h] = r[i] !== undefined ? String(r[i]) : ''; });
        return o;
      });
      const CHUNK = 100;
      const allItems = [];
      const allErrors = [];
      const allWarnings = mapping.warnings || [];
      for (let i = 0; i < rowObjs.length; i += CHUNK) {
        const chunk = rowObjs.slice(i, i + CHUNK);
        const r = await fetch('/api/smart-import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'transform', target, mapping: mapping.mapping, rows: chunk }),
        });
        const j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
        if (Array.isArray(j.items)) allItems.push(...j.items);
        if (Array.isArray(j.errors)) allErrors.push(...j.errors.map(e => ({ ...e, rowIdx: (e.rowIdx ?? 0) + i })));
        if (Array.isArray(j.warnings)) allWarnings.push(...j.warnings);
      }
      setTransform({ items: allItems, errors: allErrors, warnings: allWarnings });
    } catch (e) { setErr('Transform failed: ' + e.message); }
    setTransforming(false);
  };

  const commit = async () => {
    if (!transform?.items?.length) return;
    setErr(''); setCommitting(true); setCommitMsg('');
    try {
      let summary = '';
      if (target === 'exercises') {
        // Read existing library, merge by title (skip if already present).
        const { data: row } = await supabase.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
        const lib = row?.value || [];
        const titles = new Set(lib.map(e => (e.title || '').toLowerCase().trim()));
        let added = 0;
        for (const item of transform.items) {
          const t = (item.title || '').trim();
          if (!t) continue;
          if (titles.has(t.toLowerCase())) continue;
          lib.push({
            id: 'ex_' + uid(),
            title: t,
            videoLink: item.videoLink || '',
            cues: item.cues || '',
            notes: item.notes || '',
            category: item.category || '',
            resistanceType: item.resistanceType || '',
            bodyPosition: item.bodyPosition || '',
            movementPattern: item.movementPattern || '',
            laterality: item.laterality || '',
            primaryMuscles: item.primaryMuscles || '',
            secondaryMuscles: item.secondaryMuscles || '',
            primaryJoints: '',
            jointMovements: '',
            movementType: '',
          });
          titles.add(t.toLowerCase());
          added++;
        }
        const { error } = await supabase.from('store').upsert({ key: 'expo-exercises', value: lib, updated_at: new Date().toISOString() });
        if (error) throw error;
        summary = `+${added} new exercises (skipped ${transform.items.length - added} duplicates).`;
      } else if (target === 'athletes') {
        const { data: row } = await supabase.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
        const arr = row?.value || [];
        const keyOf = t => `${(t.name || '').toLowerCase().trim()}|${(t.phone || '').replace(/\D/g, '').slice(-9)}`;
        const existing = new Map(arr.map(t => [keyOf(t), t]));
        let added = 0; let updated = 0;
        for (const item of transform.items) {
          const k = keyOf(item);
          if (existing.has(k)) {
            const t = existing.get(k);
            Object.assign(t, item);
            updated++;
          } else {
            arr.push({
              id: 'tr_' + uid(),
              status: 'Active', format: 'In-Person Private', package: '',
              ...item,
            });
            added++;
          }
        }
        const { error } = await supabase.from('store').upsert({ key: 'expo-trainees', value: arr, updated_at: new Date().toISOString() });
        if (error) throw error;
        summary = `+${added} new athletes, ${updated} updated.`;
      } else if (target === 'programs') {
        // items[] is one program (rare: one per sheet). For each, write to plans table.
        // Resolve exercise titles → eids against current library (add new entries as needed).
        const { data: row } = await supabase.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
        const lib = row?.value || [];
        const byTitle = new Map(lib.map(e => [(e.title || '').toLowerCase().trim(), e]));
        const newLibEntries = [];
        const resolveEid = title => {
          const k = (title || '').toLowerCase().trim();
          if (!k) return null;
          if (byTitle.has(k)) return byTitle.get(k).id;
          const entry = { id: 'ex_' + uid(), title: title.trim(), videoLink: '', cues: '', notes: '', category: '', resistanceType: '', bodyPosition: '', movementPattern: '', laterality: '', primaryMuscles: '', secondaryMuscles: '', primaryJoints: '', jointMovements: '', movementType: '' };
          newLibEntries.push(entry); byTitle.set(k, entry); return entry.id;
        };
        let created = 0;
        for (const prog of transform.items) {
          const days = (prog.days || []).map(d => ({
            id: 'pd_' + uid(),
            name: d.name || 'Day',
            exercises: (d.exercises || []).map((ex, i) => ({
              id: 'pe_' + uid(),
              exerciseId: resolveEid(ex.title) || '',
              sets: typeof ex.sets === 'number' ? ex.sets : (parseInt(ex.sets) || 3),
              reps: ex.reps || '',
              load: '', rpe: '', tempo: ex.tempo || '',
              rest: ex.rest || '90',
              notes: ex.notes || '',
              order: i,
              superset: ex.superset || '',
              wk: Array.isArray(ex.wk) && ex.wk.length ? ex.wk : null,
              wkS: null,
            })),
          }));
          const planRow = {
            id: 'plan_' + uid(),
            name: prog.programName || sheetGrid.sheetName || 'Imported Block',
            trainee_id: '',
            phase: '', notes: '',
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_template_purchase: false,
            data: { days, warmup: [], weeks: 4, isTemplatePurchase: false },
          };
          const { error } = await supabase.from('plans').upsert(planRow);
          if (error) throw error;
          created++;
        }
        if (newLibEntries.length) {
          const { error } = await supabase.from('store').upsert({ key: 'expo-exercises', value: [...lib, ...newLibEntries], updated_at: new Date().toISOString() });
          if (error) throw error;
        }
        summary = `+${created} program${created === 1 ? '' : 's'} (${newLibEntries.length} new library entries).`;
      }
      setCommitMsg('✓ ' + summary + ' Reload to see changes.');
    } catch (e) { setErr('Commit failed: ' + e.message); }
    setCommitting(false);
  };

  const targetFields = TARGET_FIELDS[target];
  const lowConf = mapping?.confidence !== undefined && mapping.confidence < 0.7;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 18, fontWeight: 700, color: C.tx }}>Smart Import</div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.td, marginTop: 4 }}>
            Upload any XLSX. AI maps your columns to EXPO's schema and previews before commit.
          </div>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onPick} style={{ display: 'none' }} />
        <Btn onClick={() => inputRef.current?.click()}>{fileName ? 'Replace File' : 'Pick File'}</Btn>
      </div>

      {fileName && (
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 12, marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: FN, color: C.td, marginBottom: 4 }}>FILE</div>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
          </div>
          {workbook?.SheetNames?.length > 1 && (
            <Select label="Sheet" options={workbook.SheetNames.map(n => ({ value: n, label: n }))} value={sheetName} onChange={onSheetChange} />
          )}
          <Select label="Target" options={TARGETS.map(t => ({ value: t.value, label: t.label }))} value={target} onChange={onTargetChange} />
          <Btn onClick={analyze} disabled={analyzing || !sheetGrid?.headers?.length}>{analyzing ? 'Analyzing…' : 'Analyze with AI'}</Btn>
        </div>
      )}

      {sheetGrid && (
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.td, marginBottom: 6, letterSpacing: 1 }}>SHEET PREVIEW · {sheetGrid.headers.length} cols · {sheetGrid.rows.length} rows</div>
          <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto', border: `1px solid ${C.bd}`, borderRadius: 6 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: FB, color: C.tx }}>
              <thead><tr style={{ background: C.sf2 }}>{sheetGrid.headers.map((h, i) => (
                <th key={i} style={{ padding: '6px 10px', textAlign: 'left', fontFamily: FN, fontSize: 10, color: C.tm, borderBottom: `1px solid ${C.bd}`, whiteSpace: 'nowrap' }}>{h || `(col ${i + 1})`}</th>
              ))}</tr></thead>
              <tbody>{sheetGrid.sample.map((r, ri) => (
                <tr key={ri}>{sheetGrid.headers.map((_, ci) => (
                  <td key={ci} style={{ padding: '4px 10px', borderBottom: `1px solid ${C.bd}22`, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(r[ci] ?? '')}</td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {err && <div style={{ background: `${C.rd}15`, border: `1px solid ${C.rd}55`, color: C.rd, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>{err}</div>}

      {mapping && (
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: FN, fontSize: 12, color: C.tx, letterSpacing: 1, fontWeight: 700 }}>AI MAPPING <Badge color={lowConf ? C.or : C.gn}>{Math.round((mapping.confidence ?? 0) * 100)}% confident</Badge></div>
            <Btn onClick={runTransform} disabled={transforming}>{transforming ? 'Transforming…' : 'Preview Transform'}</Btn>
          </div>
          {mapping.notes && <div style={{ fontSize: 12, color: C.tm, lineHeight: 1.5, marginBottom: 8 }}>💡 {mapping.notes}</div>}
          {Array.isArray(mapping.warnings) && mapping.warnings.length > 0 && (
            <ul style={{ margin: '4px 0 10px 16px', padding: 0, color: C.or, fontSize: 12 }}>
              {mapping.warnings.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w}</li>)}
            </ul>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) minmax(160px,2fr) auto', gap: '6px 10px', alignItems: 'center', fontSize: 12 }}>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>TARGET</div>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>SOURCE COLUMN</div>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>CONF</div>
            {targetFields.map(field => {
              const m = mapping.mapping?.[field] || { source: null };
              const conf = m.confidence ?? 0;
              return (
                <React.Fragment key={field}>
                  <div style={{ color: C.tx, fontFamily: FB }}>{field}</div>
                  <select value={m.source || ''} onChange={e => updateMappingSource(field, e.target.value)}
                    style={{ background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '6px 8px', color: C.tx, fontFamily: FB, fontSize: 12 }}>
                    <option value="">— none —</option>
                    {sheetGrid?.headers.filter(Boolean).map((h, i) => <option key={i} value={h}>{h}</option>)}
                  </select>
                  <div style={{ fontFamily: FN, fontSize: 11, color: conf >= 0.8 ? C.gn : conf >= 0.5 ? C.or : C.td }}>{m.source ? Math.round(conf * 100) + '%' : '—'}</div>
                  {m.transform && <div style={{ gridColumn: '2 / 4', fontSize: 11, color: C.tm, fontStyle: 'italic', marginTop: -4, marginBottom: 4 }}>↳ {m.transform}</div>}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {transform && (
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: FN, fontSize: 12, color: C.tx, letterSpacing: 1, fontWeight: 700 }}>
              PREVIEW <Badge color={C.gn}>{transform.items.length} item{transform.items.length === 1 ? '' : 's'}</Badge>
              {transform.errors.length > 0 && <Badge color={C.rd} style={{ marginLeft: 6 }}>{transform.errors.length} error{transform.errors.length === 1 ? '' : 's'}</Badge>}
            </div>
            <Btn onClick={commit} disabled={committing || transform.items.length === 0}>{committing ? 'Writing…' : 'Commit to Database'}</Btn>
          </div>
          {Array.isArray(transform.warnings) && transform.warnings.length > 0 && (
            <ul style={{ margin: '4px 0 10px 16px', padding: 0, color: C.or, fontSize: 12 }}>
              {transform.warnings.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w}</li>)}
            </ul>
          )}
          <div style={{ background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 6, padding: 10, maxHeight: 280, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, color: C.tm, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(transform.items.slice(0, 20), null, 2)}
            {transform.items.length > 20 && `\n…and ${transform.items.length - 20} more`}
          </div>
          {transform.errors.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 11, color: C.rd, cursor: 'pointer' }}>{transform.errors.length} skipped row{transform.errors.length === 1 ? '' : 's'}</summary>
              <ul style={{ margin: '4px 0 0 16px', padding: 0, color: C.tm, fontSize: 11 }}>
                {transform.errors.slice(0, 30).map((e, i) => <li key={i}>row {e.rowIdx}: {e.msg}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {commitMsg && <div style={{ background: `${C.gn}15`, border: `1px solid ${C.gn}55`, color: C.gn, borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>{commitMsg}</div>}
    </div>
  );
}
