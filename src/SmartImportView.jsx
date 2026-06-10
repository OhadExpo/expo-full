// SmartImportView — coach-side AI-powered document importer.
//
// Accepts ANY document the coach has:
//   • XLSX / XLS / ODS / CSV / TSV → parsed locally via xlsx → AOA
//   • PDF → rendered to images via pdfjs → /api/smart-import vision-extract
//   • PNG / JPG / JPEG / WEBP → sent straight to vision-extract
//   • TXT / MD with table-like structure → tab/comma-split locally
//
// Pipeline once we have an AOA per sheet:
//   1. Plan (multi-sheet workbook → per-sheet target classifier, AI)
//   2. Analyze (per-sheet column → field mapping, AI, with existingContext)
//   3. Coach reviews / overrides mapping
//   4. Transform (AI per-row normalization with auto-repair)
//   5. Coach previews JSON
//   6. Commit to Supabase (dedupe on commit)
import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { C, FN, FB, uid } from './theme';
import { Btn, Input, Select, Badge, SectionLabel, isRefined5b } from './ui';

// Drop target rendered below the header when no file has been picked
// yet. The header copy ("Drop any document — XLSX, CSV, PDF, image,
// screenshot.") used to be a lie because the only way to load a file
// was the Pick File button. This component closes the gap: dashed-
// border cyan box that accepts dragenter/dragover/drop, hands the
// first file off to the parent. Doesn't try to validate type itself —
// classifyFile in the parent already does that.
function DropZone({ parsing, onFile }) {
  const [hot, setHot] = useState(false);
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); if (!hot) setHot(true); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setHot(false); };
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setHot(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  };
  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      style={{
        padding: '48px 24px', textAlign: 'center', marginBottom: 16,
        border: `2px dashed ${hot ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
        background: hot ? 'rgba(57,189,255,0.06)' : 'transparent',
        transition: 'border-color 120ms, background 120ms',
        opacity: parsing ? 0.5 : 1, pointerEvents: parsing ? 'none' : 'auto',
      }}>
      <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: 'var(--c-tm)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
        Drop a file here
      </div>
      <div style={{ fontFamily: FB, fontSize: 12, color: 'var(--c-td)', marginTop: 6 }}>
        XLSX · CSV · TSV · PDF · PNG · JPG · screenshot · text. AI maps it into the EXPO schema and previews before commit.
      </div>
    </div>
  );
}

// All smart-import API calls go through this helper so they always carry
// the coach's Supabase JWT — without it, the backend's tool calls hit RLS
// and see an empty library/athlete list.
async function siFetch(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'content-type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return fetch('/api/smart-import', { method: 'POST', headers, body: JSON.stringify(body) });
}

// Text-first parse: a Vercel runtime crash (timeout, OOM, cold-start failure)
// returns PLAINTEXT, and an unconditional r.json() surfaces a useless
// "Unexpected token" SyntaxError instead of the real failure.
async function siJson(r) {
  const raw = await r.text();
  try { return JSON.parse(raw); }
  catch {
    const snippet = raw.replace(/\s+/g, ' ').slice(0, 140);
    throw new Error(`Server error (${r.status})${snippet ? ` — ${snippet}` : ''}`);
  }
}

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

// File-type detection — fall back to extension if mime type is missing.
function classifyFile(file) {
  const name = (file.name || '').toLowerCase();
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/.test(name)) return 'image';
  if (t === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (t.includes('csv') || name.endsWith('.csv') || name.endsWith('.tsv')) return 'sheet';
  if (name.endsWith('.txt') || name.endsWith('.md')) return 'text';
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods') || t.includes('spreadsheet') || t.includes('excel')) return 'sheet';
  // Best-effort: if extension is unknown, try sheet first.
  return 'sheet';
}

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function fileToArrayBuffer(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}

// Render a PDF file to an array of base64-encoded PNG page images.
async function pdfToImages(file, { maxPages = 8, scale = 2 } = {}) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  // Worker — Vite serves the dist worker file as-is.
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const buf = await fileToArrayBuffer(file);
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const n = Math.min(doc.numPages, maxPages);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    const data = dataUrl.split(',')[1] || '';
    out.push({ mediaType: 'image/png', data });
  }
  return out;
}

// Convert AOA → { headers, rows, sample } using the heuristic that the first
// row with ≥3 non-empty cells is the header row.
function aoaToSheetGrid(aoa, sheetName) {
  if (!aoa.length) return { headers: [], rows: [], sample: [], sheetName };
  let headerIdx = 0;
  for (let i = 0; i < Math.min(aoa.length, 8); i++) {
    const nonEmpty = (aoa[i] || []).filter(c => String(c || '').trim()).length;
    if (nonEmpty >= 3) { headerIdx = i; break; }
  }
  const headers = (aoa[headerIdx] || []).map(h => String(h || '').trim());
  const dataRows = aoa.slice(headerIdx + 1).filter(r => r.some(c => String(c || '').trim()));
  return { headers, rows: dataRows, sample: dataRows.slice(0, 6), sheetName };
}

export default function SmartImportView() {
  const [fileName, setFileName] = useState('');
  const [fileKind, setFileKind] = useState('');
  const [parsing, setParsing] = useState(false);
  const [sheets, setSheets] = useState([]);              // [{ headers, rows, sample, sheetName, guessedTarget? }]
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [target, setTarget] = useState('exercises');
  const [analyzing, setAnalyzing] = useState(false);
  const [mapping, setMapping] = useState(null);
  const [transforming, setTransforming] = useState(false);
  const [transform, setTransform] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  const onPick = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    setFileName(f.name); setErr(''); setMapping(null); setTransform(null); setSheets([]); setCommitMsg('');
    const kind = classifyFile(f);
    setFileKind(kind);
    setParsing(true);
    try {
      if (kind === 'sheet') {
        const buf = await fileToArrayBuffer(f);
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const out = wb.SheetNames.map(name => aoaToSheetGrid(
          XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }),
          name,
        ));
        setSheets(out);
        setActiveSheetIdx(0);
      } else if (kind === 'text') {
        const text = await f.text();
        // tab-first, fall back to comma
        const sep = text.includes('\t') ? '\t' : ',';
        const aoa = text.split(/\r?\n/).map(line => line.split(sep));
        setSheets([aoaToSheetGrid(aoa, f.name)]);
        setActiveSheetIdx(0);
      } else if (kind === 'pdf' || kind === 'image') {
        // Vision path — render PDF pages or pass image through directly.
        let images;
        if (kind === 'pdf') {
          images = await pdfToImages(f);
        } else {
          const dataUrl = await fileToDataUrl(f);
          const m = dataUrl.match(/^data:(.+?);base64,(.*)$/);
          if (!m) throw new Error('Could not read image');
          images = [{ mediaType: m[1], data: m[2] }];
        }
        const r = await siFetch({ kind: 'vision-extract', images, target });
        const j = await siJson(r);
        if (!r.ok || j.error) throw new Error(j.error || `vision HTTP ${r.status}`);
        const out = (j.sheets || []).map(s => ({
          headers: s.headers || [], rows: s.rows || [], sample: s.sample || (s.rows || []).slice(0, 6),
          sheetName: s.name || f.name, guessedTarget: s.guessedTarget, guessedTargetConfidence: s.guessedTargetConfidence,
        }));
        setSheets(out); setActiveSheetIdx(0);
        // Auto-pick the strongest guessed target
        const top = out[0];
        if (top?.guessedTarget && ['exercises','athletes','programs'].includes(top.guessedTarget) && top.guessedTargetConfidence >= 0.7) {
          setTarget(top.guessedTarget);
        }
      }
    } catch (e) { setErr('Could not read file: ' + e.message); }
    setParsing(false);
  };

  const sheetGrid = sheets[activeSheetIdx] || null;

  // Build a compact existingContext snapshot the analyze/transform calls can use
  // to dedupe + cross-reference. Cached per-target on first request.
  const ctxRef = useRef({ exercises: null, athletes: null, programs: null });
  const fetchExistingContext = async (t) => {
    if (ctxRef.current[t]) return ctxRef.current[t];
    let ctx = null;
    try {
      if (t === 'exercises' || t === 'programs') {
        const { data: row } = await supabase.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
        const titles = (row?.value || []).map(e => e?.title).filter(Boolean);
        ctx = { exerciseTitles: titles.slice(0, 200) };
      }
      if (t === 'athletes') {
        const { data: row } = await supabase.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
        const names = (row?.value || []).map(e => e?.name).filter(Boolean);
        ctx = { athleteNames: names.slice(0, 100) };
      }
      if (t === 'programs') {
        const { data: plans } = await supabase.from('plans').select('data').limit(50);
        const dayNames = new Set();
        for (const p of (plans || [])) for (const d of (p.data?.days || [])) if (d.name) dayNames.add(d.name);
        ctx = { ...(ctx || {}), commonDayNames: [...dayNames].slice(0, 20) };
      }
    } catch {}
    ctxRef.current[t] = ctx;
    return ctx;
  };

  const onTargetChange = v => { setTarget(v); setMapping(null); setTransform(null); };
  const onSheetChange = v => { setActiveSheetIdx(parseInt(v) || 0); setMapping(null); setTransform(null); };

  const analyze = async () => {
    if (!sheetGrid) return;
    setErr(''); setAnalyzing(true); setMapping(null); setTransform(null);
    try {
      const existingContext = await fetchExistingContext(target);
      const r = await siFetch({
        kind: 'analyze', target,
        headers: sheetGrid.headers,
        sampleRows: sheetGrid.sample,
        sheetName: sheetGrid.sheetName,
        existingContext,
      });
      const j = await siJson(r);
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
      const existingContext = await fetchExistingContext(target);
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
        const r = await siFetch({
          kind: 'transform', target,
          mapping: mapping.mapping,
          enumNormalizations: mapping.enumNormalizations,
          rows: chunk,
          existingContext,
        });
        const j = await siJson(r);
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
        // Resolve Google Photos share URLs to direct googleusercontent streams
        // up-front, so the imported library entries land with stable URLs the
        // trainee portal can embed without re-scraping on every page load.
        // Bounded concurrency so a 200-row import doesn't fan out into 200
        // simultaneous /api/resolve-video calls and trip Vercel's per-region
        // function concurrency cap.
        const resolveGph = async (u) => {
          if (!u || !/photos\.(app\.goo|google)\./i.test(u)) return u;
          try {
            const r = await fetch('/api/resolve-video?url=' + encodeURIComponent(u));
            if (!r.ok) return u;
            const j = await r.json();
            return j?.url || u;
          } catch { return u; }
        };
        const MAX_PARALLEL = 5;
        let cursor = 0;
        const workers = Array.from({ length: Math.min(MAX_PARALLEL, transform.items.length) }, async () => {
          while (cursor < transform.items.length) {
            const i = cursor++;
            const it = transform.items[i];
            it.videoLink = await resolveGph(it.videoLink);
          }
        });
        await Promise.all(workers);
        const { data: row } = await supabase.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
        const lib = row?.value || [];
        const titles = new Set(lib.map(e => (e.title || '').toLowerCase().trim()));
        let added = 0;
        for (const item of transform.items) {
          const t = (item.title || '').trim();
          if (!t || titles.has(t.toLowerCase())) continue;
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
            primaryJoints: '', jointMovements: '', movementType: '',
          });
          titles.add(t.toLowerCase()); added++;
        }
        const { error } = await supabase.from('store').upsert({ key: 'expo-exercises', value: lib, updated_at: new Date().toISOString() });
        if (error) throw error;
        summary = `+${added} new exercises (skipped ${transform.items.length - added} duplicates).`;
      } else if (target === 'athletes') {
        const { data: row } = await supabase.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
        const arr = row?.value || [];
        const keyOf = t => `${(t.name || '').toLowerCase().trim()}|${(t.phone || '').replace(/\D/g, '').slice(-9)}`;
        const existing = new Map(arr.map(t => [keyOf(t), t]));
        let added = 0; let updated = 0; let skippedNameless = 0;
        for (const item of transform.items) {
          // A nameless trainee row crashes every roster filter/sort downstream.
          if (!(item.name || '').trim()) { skippedNameless++; continue; }
          const k = keyOf(item);
          if (existing.has(k)) { Object.assign(existing.get(k), item); updated++; }
          else {
            arr.push({ id: 'tr_' + uid(), status: 'Active', format: 'In-Person Private', package: '', ...item });
            added++;
          }
        }
        const { error } = await supabase.from('store').upsert({ key: 'expo-trainees', value: arr, updated_at: new Date().toISOString() });
        if (error) throw error;
        summary = `+${added} new athletes, ${updated} updated.` + (skippedNameless ? ` Skipped ${skippedNameless} nameless row(s).` : '');
      } else if (target === 'programs') {
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
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.tm, letterSpacing: '0.18em', textTransform: 'uppercase' }}>SMART IMPORT</div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 4 }}>
            Drop any document — XLSX, CSV, PDF, image, screenshot. AI reads it, maps it to EXPO's schema, previews before commit.
          </div>
        </div>
        <input ref={inputRef} type="file"
          accept=".xlsx,.xls,.ods,.csv,.tsv,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onPick} style={{ display: 'none' }} />
        <Btn onClick={() => inputRef.current?.click()} disabled={parsing} style={{ minWidth: 124, justifyContent: 'center' }}>{parsing ? 'Reading…' : (fileName ? 'Replace File' : 'Pick File')}</Btn>
      </div>

      {/* Drop zone — only shown before a file is picked. The header copy
          said "Drop any document" but there was no actual drop target,
          just the Pick File button. The whole page below the header
          now accepts a drag-and-drop; the dashed-border box is the
          visible affordance. Drag-over highlights the border in cyan. */}
      {!fileName && (
        <DropZone parsing={parsing} onFile={(f) => onPick({ target: { files: [f] } })} />
      )}

      {fileName && (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, marginBottom: 12 }}>
          <div style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
            <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>FILE</SectionLabel>
          </div>
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>FILE · {fileKind.toUpperCase()}</div>
              <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
            </div>
            {sheets.length > 1 && (
              <Select label="Sheet/Page" options={sheets.map((s, i) => ({ value: String(i), label: s.sheetName + (s.guessedTarget ? ` · ${s.guessedTarget}` : '') }))} value={String(activeSheetIdx)} onChange={onSheetChange} />
            )}
            <Select label="Target" options={TARGETS.map(t => ({ value: t.value, label: t.label }))} value={target} onChange={onTargetChange} />
            <Btn onClick={analyze} disabled={analyzing || !sheetGrid?.headers?.length} style={{ minWidth: 140, justifyContent: 'center' }}>{analyzing ? 'Analyzing…' : 'Analyze with AI'}</Btn>
          </div>
        </div>
      )}

      {sheetGrid && (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, marginBottom: 12 }}>
          <div style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
            <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>SHEET PREVIEW</SectionLabel>
          </div>
          <div style={{ padding: 12 }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, marginBottom: 6, letterSpacing: '0.18em', fontWeight: 700 }}>{sheetGrid.headers.length} cols · {sheetGrid.rows.length} rows</div>
          <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: FB, color: C.tx }}>
              <thead><tr style={{ background: 'transparent' }}>{sheetGrid.headers.map((h, i) => (
                <th key={i} style={{ padding: '6px 10px', textAlign: 'left', fontFamily: FN, fontSize: 10, color: C.tm, borderBottom: `1px solid ${C.cardBd}`, whiteSpace: 'nowrap' }}>{h || `(col ${i + 1})`}</th>
              ))}</tr></thead>
              <tbody>{sheetGrid.sample.map((r, ri) => (
                <tr key={ri}>{sheetGrid.headers.map((_, ci) => (
                  <td key={ci} style={{ padding: '4px 10px', borderBottom: `1px solid ${C.cardBd}`, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(r[ci] ?? '')}</td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      {err && <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, color: C.rd, borderRadius: 0, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>{err}</div>}

      {mapping && (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, marginBottom: 12 }}>
          <div style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
            <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>AI MAPPING</SectionLabel>
          </div>
          <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}><Badge color={lowConf ? C.or : C.gn}>{Math.round((mapping.confidence ?? 0) * 100)}% confident</Badge></div>
            <Btn onClick={runTransform} disabled={transforming} style={{ minWidth: 160, justifyContent: 'center' }}>{transforming ? 'Transforming…' : 'Preview Transform'}</Btn>
          </div>
          {mapping.notes && <div style={{ fontSize: 12, color: C.tm, lineHeight: 1.5, marginBottom: 8 }}>💡 {mapping.notes}</div>}
          {Array.isArray(mapping.warnings) && mapping.warnings.length > 0 && (
            <ul style={{ margin: '4px 0 10px 16px', padding: 0, color: C.or, fontSize: 12 }}>
              {mapping.warnings.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w}</li>)}
            </ul>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) minmax(160px,2fr) auto', gap: '6px 10px', alignItems: 'center', fontSize: 12 }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>TARGET</div>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>SOURCE COLUMN</div>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>CONF</div>
            {targetFields.map(field => {
              const m = mapping.mapping?.[field] || { source: null };
              const conf = m.confidence ?? 0;
              return (
                <React.Fragment key={field}>
                  <div style={{ color: C.tx, fontFamily: FB }}>{field}</div>
                  <select value={m.source || ''} onChange={e => updateMappingSource(field, e.target.value)}
                    style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '6px 8px', color: C.tx, fontFamily: FB, fontSize: 12 }}>
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
        </div>
      )}

      {transform && (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, marginBottom: 12 }}>
          <div style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
            <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>PREVIEW</SectionLabel>
          </div>
          <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>
              <Badge color={C.gn}>{transform.items.length} item{transform.items.length === 1 ? '' : 's'}</Badge>
              {transform.errors.length > 0 && <Badge color={C.rd} style={{ marginLeft: 6 }}>{transform.errors.length} error{transform.errors.length === 1 ? '' : 's'}</Badge>}
            </div>
            <Btn onClick={commit} disabled={committing || transform.items.length === 0} style={{ minWidth: 168, justifyContent: 'center' }}>{committing ? 'Writing…' : 'Commit to Database'}</Btn>
          </div>
          {Array.isArray(transform.warnings) && transform.warnings.length > 0 && (
            <ul style={{ margin: '4px 0 10px 16px', padding: 0, color: C.or, fontSize: 12 }}>
              {transform.warnings.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w}</li>)}
            </ul>
          )}
          <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 10, maxHeight: 280, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, color: C.tm, whiteSpace: 'pre-wrap' }}>
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
        </div>
      )}

      {commitMsg && <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.gn}`, color: C.gn, borderRadius: 0, padding: '10px 12px', fontSize: 13 }}>{commitMsg}</div>}
    </div>
  );
}
