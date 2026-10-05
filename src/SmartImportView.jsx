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
//   5. Coach previews (programs: a table per day, see below)
//   6. Commit to Supabase (dedupe on commit)
//
// A PROGRAM SHEET IS READ DIRECTLY, NO AI (5.10 #554). The coach's own block
// sheets - a `#|Day name|Sets|Reps|...` header row per day, hyperlinked videos,
// a warm-up grid, 1a/1b supersets - are what his ~210 plans were imported from,
// by a parser that only existed as a CLI. The AI path picked the first 3-cell
// row as THE header, dropped the links, the warm-up and merged cells, matched
// exercises by exact lowercase title (so "DB RDL" became a second library entry
// beside "Dumbbell RDL") and committed the plan to nobody (trainee_id ''). Now
// such a sheet goes through sheetProgramParse (no AI call, no rate limit, blank
// stays blank), every title is ranked against the library on suggestMatches'
// scale (auto-linked only at same-meaning or better, else the coach picks or
// creates), and the plan is committed to the athlete the coach picks.
import { safeUrl } from './VideoEmbed';   // a link read from a sheet cell is http(s) or nothing (5.10, security gate S10/S14)
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { mergeFilled } from './importMerge';
import { useT, tr, readLang } from './i18n';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { C, FN, FB, uid } from './theme';
import { Btn, Input, Select, Badge, SectionLabel, isRefined5b, toast, ChipGrid } from './ui';
import { storeWriteFenced } from './useSupaStore';
import { normTitle } from './exerciseMatch';
import { hasDayHeader, parseSheetProgram, buildLibIndex, rankMatches, autoLinkId, guessAthleteId, draftToPlanRow } from './sheetProgramParse';

// AN IMPORT NEVER WRITES OVER WHAT IT COULD NOT READ (4.10 #524 audit): a failed
// read gave `row` undefined -> [] -> the import upserted ONLY the new rows over the
// whole key (the 25-row anti-wipe trigger spared the library; a small key had no
// such luck), and the write was blind to an edit made meanwhile. Now the read must
// succeed, the base is kept untouched, and the write merges (compare-and-swap).
async function readStoreForImport(key) {
  const { data, error } = await supabase.from('store').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  const v = data ? data.value : undefined;
  return { base: v === undefined ? undefined : JSON.parse(JSON.stringify(v)), value: Array.isArray(v) ? v : [] };
}
async function writeStoreForImport(key, base, value) {
  await storeWriteFenced(key, value, base);
}

// Drop target rendered below the header when no file has been picked
// yet. The header copy ("Drop any document — XLSX, CSV, PDF, image,
// screenshot.") used to be a lie because the only way to load a file
// was the Pick File button. This component closes the gap: dashed-
// border cyan box that accepts dragenter/dragover/drop, hands the
// first file off to the parent. Doesn't try to validate type itself —
// classifyFile in the parent already does that.
function DropZone({ parsing, onFile }) {
  const tt = useT();
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
        {tt('Drop a file here')}
      </div>
      <div style={{ fontFamily: FB, fontSize: 12, color: 'var(--c-td)', marginTop: 6 }}>
        {tt('XLSX · CSV · TSV · PDF · PNG · JPG · screenshot · text. AI maps it into the EXPO schema and previews before commit.')}
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
  // isEvalSupported:false (2.10 #510): text extraction never needs PDF.js to
  // compile font programs with eval, and that path is how a crafted PDF runs
  // script (npm audit, high). The import is owner-only - this is the cheap half
  // until the major upgrade.
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const n = Math.min(doc.numPages, maxPages);
  // Don't let a long PDF truncate silently — the coach needs to know pages 9+
  // weren't read so they can split the file. (deep-logic audit)
  if (doc.numPages > maxPages) toast(readLang() === 'he' ? `ב-PDF יש ${doc.numPages} עמודים — יובאו רק ${maxPages} הראשונים. פצל אותו כדי לייבא את השאר.` : `PDF has ${doc.numPages} pages — only the first ${maxPages} were imported. Split it to import the rest.`, 'info', { ttl: 7000 });
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

// An AI-transformed program in the same draft shape the direct reader returns,
// so both paths share one preview, one matcher and one commit (5.10 #554).
// Blank stays blank: a missing sets cell is '' (never 3).
function aiItemToDraft(prog, sheetName) {
  const days = (prog.days || []).map(d => ({
    name: d.name || '',
    exercises: (d.exercises || []).map(ex => ({
      title: String(ex.title || '').trim(),
      // what the coach wrote: "3-4" stays "3-4", never parsed down to 3 (5.10 review 1005d #8)
      sets: typeof ex.sets === 'number' ? ex.sets : (/^\d+$/.test(String(ex.sets ?? '').trim()) ? Number(String(ex.sets).trim()) : String(ex.sets ?? '').trim()),
      reps: ex.reps || '', tempo: ex.tempo || '', rest: ex.rest || '', notes: ex.notes || '',
      superset: ex.superset || '',
      ...(Array.isArray(ex.wk) && ex.wk.length ? { wk: ex.wk } : {}),
    })),
  }));
  return { name: prog.programName || sheetName || 'Imported Block', days, warmup: [], weeks: 4, warnings: [] };
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'link'; } };
const HE_UI = () => readLang() === 'he';
const thStyle = { padding: '6px 8px', textAlign: 'start', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}`, whiteSpace: 'nowrap' };
const tdStyle = { padding: '6px 8px', fontFamily: FB, fontSize: 12, color: C.tx, borderBottom: `1px solid ${C.cardBd}`, verticalAlign: 'top' };
const cardStyle = { background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, marginBottom: 12 };
const stripStyle = { background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' };
const metaStyle = { fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' };

function warnText(w) {
  if (w.code === 'above-first-day') return HE_UI() ? `${w.n === 1 ? 'שורה ממוספרת אחת' : `${w.n} שורות ממוספרות`} מעל היום הראשון לא ${w.n === 1 ? 'יובאה' : 'יובאו'} כתרגיל.` : `${w.n} numbered row${w.n === 1 ? '' : 's'} above the first day ${w.n === 1 ? 'was' : 'were'} not read as an exercise.`;
  if (w.code === 'unlabelled-columns') return HE_UI() ? `ביום "${w.day}" אין כותרת Sets / Reps, אז העמודות האלה נשארו ריקות.` : `Day "${w.day}" has no Sets / Reps header, so those columns were left blank.`;
  return '';
}

// One day of a program as a readable table: what the sheet says, what it will
// link to. Blanks are blank; an unmatched title is coloured TEXT, never a fill.
function ProgramDayTable({ day, resOf, libById }) {
  const tt = useT();
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...metaStyle, color: C.tx, marginBottom: 6 }}>{day.name || tt('Day')} · {day.exercises.length}</div>
      <div style={{ overflowX: 'auto', border: `1px solid ${C.cardBd}` }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
          <thead><tr>
            {['#', 'Exercise', 'Library match', 'Sets', 'Reps', 'Tempo', 'Rest', 'Video'].map(h => <th key={h} style={thStyle}>{tt(h)}</th>)}
          </tr></thead>
          <tbody>{day.exercises.map((ex, i) => {
            const pick = resOf(ex.title);
            const lib = pick && pick !== 'new' ? libById.get(pick) : null;
            const open = !pick;
            const reps = ex.reps !== '' && ex.reps != null ? String(ex.reps) : (Array.isArray(ex.wk) ? ex.wk.join('>') : '');
            return (
              <tr key={i}>
                <td style={{ ...tdStyle, fontFamily: FN, color: C.tm, whiteSpace: 'nowrap' }}>{i + 1}{ex.superset ? <span style={{ color: C.ac, marginInlineStart: 4 }}>{ex.superset}</span> : null}</td>
                <td style={{ ...tdStyle, color: open ? C.or : C.tx, fontWeight: open ? 700 : 400 }}>{ex.title}</td>
                <td style={{ ...tdStyle, color: open ? C.or : pick === 'new' ? C.ac : C.tm }}>{open ? tt('Not matched') : pick === 'new' ? tt('New') : (lib ? lib.title : '')}</td>
                <td style={{ ...tdStyle, fontFamily: FN }}>{ex.sets === '' || ex.sets == null ? '' : String(ex.sets)}</td>
                <td style={{ ...tdStyle, fontFamily: FN }}>{reps}</td>
                <td style={{ ...tdStyle, fontFamily: FN }}>{ex.tempo || ''}</td>
                <td style={{ ...tdStyle, fontFamily: FN }}>{ex.rest || ''}</td>
                <td style={tdStyle}>{safeUrl(ex.videoUrl) ? <a href={safeUrl(ex.videoUrl)} target="_blank" rel="noopener noreferrer" style={{ color: C.ac, fontFamily: FN, fontSize: 11 }}>{hostOf(ex.videoUrl)}</a> : ''}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

// Every unique title once: auto-linked ones show their match, the rest wait
// for the coach - one of the top 3 library suggestions, or a new entry.
function TitleMatchList({ groups, resOf, onPick }) {
  const tt = useT();
  const ordered = [...groups].sort((a, b) => (resOf(a.title) ? 1 : 0) - (resOf(b.title) ? 1 : 0));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {ordered.map(g => {
        const pick = resOf(g.title);
        const items = [
          ...g.ranked.map(m => ({ k: m.ex.id, label: `${m.ex.title} · ${tt(m.why)}`, title: `${m.score}` })),
          { k: 'new', label: tt('Create new') },
        ];
        return (
          <div key={g.key}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 700, color: pick ? C.tx : C.or }}>{g.title}</span>
              <span style={{ ...metaStyle, letterSpacing: '0.1em' }}>×{g.count}</span>
              {!pick && <span style={{ ...metaStyle, color: C.or }}>{tt('Not matched')}</span>}
              {pick && g.auto && pick === g.auto && <span style={{ ...metaStyle, color: C.tm }}>{tt('Linked automatically')}</span>}
            </div>
            <ChipGrid items={items} value={pick} onChange={(k) => onPick(g.key, k)} prose cols={items.length} phoneCols={1} ariaLabel={g.title} />
          </div>
        );
      })}
    </div>
  );
}

function WarmupTable({ warmup }) {
  const tt = useT();
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...metaStyle, color: C.tx, marginBottom: 6 }}>{tt('Warm-up')} · {warmup.length}</div>
      <div style={{ overflowX: 'auto', border: `1px solid ${C.cardBd}` }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 360 }}>
          <thead><tr>{['Exercise', 'Prescription', 'Video'].map(h => <th key={h} style={thStyle}>{tt(h)}</th>)}</tr></thead>
          <tbody>{warmup.map((w, i) => (
            <tr key={i}>
              <td style={tdStyle}>{w.t}</td>
              <td style={{ ...tdStyle, fontFamily: FN }}>{w.rx || ''}</td>
              <td style={tdStyle}>{safeUrl(w.vid) ? <a href={safeUrl(w.vid)} target="_blank" rel="noopener noreferrer" style={{ color: C.ac, fontFamily: FN, fontSize: 11 }}>{hostOf(w.vid)}</a> : ''}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// The program import: who it is for + commit, the title matching, then the
// program itself day by day. Commit stays disabled while any title is open or
// no athlete is picked (`block` says which).
function ProgramImport({ drafts, source, lib, titleGroups, resOf, onPickMatch, libById, unresolvedCount, rosterOptions, athleteId, onAthlete, block, committing, onCommit }) {
  const tt = useT();
  const he = HE_UI();
  const nDays = drafts.reduce((a, p) => a + p.days.length, 0);
  const nEx = drafts.reduce((a, p) => a + p.days.reduce((b, d) => b + d.exercises.length, 0), 0);
  const nVid = drafts.reduce((a, p) => a + p.days.reduce((b, d) => b + d.exercises.filter(e => e.videoUrl).length, 0), 0);
  const linked = titleGroups.length - unresolvedCount;
  return (
    <>
      <div style={cardStyle} data-si-program="">
        <div className="title-strip" style={stripStyle}>
          <SectionLabel as="div" style={{ color: 'var(--c-stripTx)', fontSize: C.alertLabelSize }}>{tt('PROGRAM IMPORT')}</SectionLabel>
        </div>
        <div style={{ padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignItems: 'end' }}>
            <Select label="Athlete" placeholder={tt('Pick an athlete')} options={rosterOptions} value={athleteId} onChange={onAthlete} />
            <div style={{ ...metaStyle, minHeight: 'var(--btn-h)', display: 'flex', alignItems: 'center', lineHeight: 1.6 }}>
              <span><span style={{ color: source === 'direct' ? C.ac : C.tm }}>{source === 'direct' ? tt('Read directly - no AI') : tt('Read by AI')}</span>{` · ${nDays} ${tt('days')} · ${nEx} ${tt('exercises')} · ${nVid} ${tt('videos')}`}</span>
            </div>
            <Btn onClick={onCommit} disabled={committing || !!block} style={{ minWidth: 168, justifyContent: 'center' }}>{tr(readLang(), committing ? 'Writing…' : 'Commit to Database')}</Btn>
          </div>
          {block && <div data-si-block="" style={{ fontFamily: FB, fontSize: 12, color: lib ? C.or : C.tm, marginTop: 10 }}>{block}</div>}
          {drafts.flatMap(p => p.warnings || []).map((w, i) => <div key={i} style={{ fontFamily: FB, fontSize: 12, color: C.or, marginTop: 6 }}>{warnText(w)}</div>)}
        </div>
      </div>

      <div style={cardStyle} data-si-matching="">
        <div className="title-strip" style={stripStyle}>
          <SectionLabel as="div" style={{ color: 'var(--c-stripTx)', fontSize: C.alertLabelSize }}>{tt('EXERCISE MATCHING')}</SectionLabel>
        </div>
        <div style={{ padding: 12 }}>
          {!lib ? <div style={{ fontFamily: FB, fontSize: 12, color: C.tm }}>{tt('Loading the library…')}</div> : (
            <>
              <div style={{ ...metaStyle, marginBottom: 10 }}>
                {he ? `${linked} מקושרים · ${unresolvedCount} לבחירה` : `${linked} linked · ${unresolvedCount} to pick`}
              </div>
              <TitleMatchList groups={titleGroups} resOf={resOf} onPick={onPickMatch} />
            </>
          )}
        </div>
      </div>

      <div style={cardStyle} data-si-days="">
        <div className="title-strip" style={stripStyle}>
          <SectionLabel as="div" style={{ color: 'var(--c-stripTx)', fontSize: C.alertLabelSize }}>{tt('PROGRAM PREVIEW')}</SectionLabel>
        </div>
        <div style={{ padding: 12 }}>
          {drafts.map((prog, pi) => (
            <div key={pi}>
              <div style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 10 }}>{prog.name}</div>
              {prog.warmup && prog.warmup.length > 0 && <WarmupTable warmup={prog.warmup} />}
              {prog.days.map((d, di) => <ProgramDayTable key={di} day={d} resOf={resOf} libById={libById} />)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function SmartImportView() {
  const tt = useT();
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
        const out = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name];
          const grid = aoaToSheetGrid(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }), name);
          // the coach's own block layout: read it directly, no AI (5.10 #554)
          if (hasDayHeader(ws)) {
            const program = parseSheetProgram(ws, name);
            if (program.days.length) grid.program = program;
          }
          return grid;
        });
        setSheets(out);
        setActiveSheetIdx(0);
        if (out[0]?.program) setTarget('programs');
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
    } catch (e) { setErr((readLang() === 'he' ? 'לא הצלחתי לקרוא את הקובץ: ' : 'Could not read file: ') + e.message); }
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
  const onSheetChange = v => { const i = parseInt(v) || 0; setActiveSheetIdx(i); setMapping(null); setTransform(null); if (sheets[i]?.program) setTarget('programs'); };

  // ── programs: one draft shape for both paths (5.10 #554) ──
  const directProg = target === 'programs' && !transform && sheetGrid?.program ? sheetGrid.program : null;
  const aiDrafts = useMemo(() => (target === 'programs' && transform?.items?.length ? transform.items.map(it => aiItemToDraft(it, sheetGrid?.sheetName)) : null), [transform, target, sheetGrid]);
  const drafts = useMemo(() => aiDrafts || (directProg ? [directProg] : null), [aiDrafts, directProg]);
  const draftKey = drafts ? `${fileName}|${activeSheetIdx}|${aiDrafts ? 'ai' : 'direct'}` : '';
  // The library + roster, read once a program preview needs them (read only;
  // the commit re-reads the library fresh before it writes).
  const [lib, setLib] = useState(null);
  const [roster, setRoster] = useState(null);
  const needLib = !!drafts;
  useEffect(() => {
    if (!needLib || lib) return undefined;
    let alive = true;
    (async () => {
      try {
        const [l, t] = await Promise.all([readStoreForImport('expo-exercises'), readStoreForImport('expo-trainees')]);
        if (!alive) return;
        setLib(l.value); setRoster(t.value);
      } catch (e) { if (alive) setErr((readLang() === 'he' ? 'לא הצלחתי לטעון את הספרייה: ' : 'Could not load the library: ') + (e.message || e)); }
    })();
    return () => { alive = false; };
  }, [needLib, lib]);
  const libIndex = useMemo(() => (lib ? buildLibIndex(lib) : null), [lib]);
  const libById = useMemo(() => new Map((lib || []).map(e => [e.id, e])), [lib]);
  // every unique title once, ranked against a library tokenized ONCE
  const titleGroups = useMemo(() => {
    if (!drafts || !libIndex) return [];
    const map = new Map();
    for (const p of drafts) for (const d of p.days || []) for (const ex of d.exercises || []) {
      const key = normTitle(ex.title); if (!key) continue;
      if (!map.has(key)) map.set(key, { key, title: String(ex.title).trim(), count: 0, video: '' });
      const g = map.get(key); g.count++; if (!g.video && ex.videoUrl) g.video = ex.videoUrl;
    }
    return [...map.values()].map(g => { const ranked = rankMatches(g.title, libIndex, 3); return { ...g, ranked, auto: autoLinkId(ranked) }; });
  }, [drafts, libIndex]);
  const groupByKey = useMemo(() => new Map(titleGroups.map(g => [g.key, g])), [titleGroups]);
  const [picks, setPicks] = useState({ forKey: '', map: {} });
  const pickMap = picks.forKey === draftKey ? picks.map : {};
  // a library id, 'new', or '' (not resolved yet)
  const resOf = (title) => { const k = normTitle(title); return pickMap[k] || groupByKey.get(k)?.auto || ''; };
  const onPickMatch = (key, v) => setPicks(p => ({ forKey: draftKey, map: { ...(p.forKey === draftKey ? p.map : {}), [key]: v } }));
  const unresolvedCount = titleGroups.filter(g => !resOf(g.title)).length;
  const athleteGuess = useMemo(() => (roster && drafts ? guessAthleteId(roster, `${fileName} ${sheetGrid?.sheetName || ''}`) : ''), [roster, draftKey]);
  const [athletePick, setAthletePick] = useState({ forKey: '', id: '' });
  const athleteId = athletePick.forKey === draftKey ? athletePick.id : athleteGuess;
  const rosterOptions = useMemo(() => (roster || []).filter(t => t && t.id && t.name).map(t => ({ value: t.id, label: t.name })).sort((a, b) => a.label.localeCompare(b.label)), [roster]);
  const progBlock = !drafts ? '' : !lib ? tt('Loading the library…') : unresolvedCount ? tt('Pick a library match for every exercise first.') : !athleteId ? tt('Pick the athlete first.') : '';
  // a retry after a partial commit upserts the SAME plan row, never a duplicate
  const planIds = useRef(new WeakMap());
  const planIdFor = (prog) => { if (!planIds.current.has(prog)) planIds.current.set(prog, 'plan_' + uid()); return planIds.current.get(prog); };

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
    } catch (e) { setErr((readLang() === 'he' ? 'הניתוח נכשל: ' : 'Analyze failed: ') + e.message); }
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
    } catch (e) { setErr((readLang() === 'he' ? 'ההמרה נכשלה: ' : 'Transform failed: ') + e.message); }
    setTransforming(false);
  };

  const commit = async () => {
    // a program read directly has no AI transform behind it (5.10 #554)
    if (target === 'programs' ? !drafts : !transform?.items?.length) return;
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
        const libRead = await readStoreForImport('expo-exercises');
        const lib = libRead.value;
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
        await writeStoreForImport('expo-exercises', libRead.base, lib);
        summary = readLang() === 'he' ? `${added === 1 ? 'נוסף תרגיל חדש אחד' : `נוספו ${added} תרגילים חדשים`} (${transform.items.length - added === 1 ? 'כפילות אחת דולגה' : `${transform.items.length - added} כפילויות דולגו`}).` : `+${added} new exercises (skipped ${transform.items.length - added} duplicates).`;
      } else if (target === 'athletes') {
        const rosterRead = await readStoreForImport('expo-trainees');
        const arr = rosterRead.value;
        const keyOf = t => {
          const n = (t.name || '').toLowerCase().trim();
          const p = (t.phone || '').replace(/\D/g, '').slice(-9);
          // When BOTH name+phone are blank, fall back to email so two distinct
          // anonymous rows don't collapse into one (one Object.assign-overwriting
          // the other). Normal name|phone dedup is unchanged. (deep-logic audit)
          if (!n && !p) return `anon|${(t.email || '').toLowerCase().trim()}`;
          return `${n}|${p}`;
        };
        const existing = new Map(arr.map(t => [keyOf(t), t]));
        let added = 0; let updated = 0; let skippedNameless = 0;
        for (const item of transform.items) {
          // A nameless trainee row crashes every roster filter/sort downstream.
          if (!(item.name || '').trim()) { skippedNameless++; continue; }
          const k = keyOf(item);
          // A BLANK CELL NEVER ERASES (5.10 #554 audit): Object.assign wrote every
          // empty column of the sheet over the athlete's existing phone / email /
          // notes. Only a cell that HAS a value updates the athlete.
          if (existing.has(k)) { mergeFilled(existing.get(k), item); updated++; }
          else {
            arr.push({ id: 'tr_' + uid(), status: 'Active', format: 'In-Person Private', package: '', ...item });
            added++;
          }
        }
        await writeStoreForImport('expo-trainees', rosterRead.base, arr);
        summary = readLang() === 'he' ? `${added === 1 ? 'נוסף מתאמן חדש אחד' : `נוספו ${added} מתאמנים חדשים`}, ${updated === 1 ? 'מתאמן אחד עודכן' : `${updated} עודכנו`}.` + (skippedNameless ? ` ${skippedNameless === 1 ? 'דולגה שורה אחת בלי שם' : `דולגו ${skippedNameless} שורות בלי שם`}.` : '') : `+${added} new athletes, ${updated} updated.` + (skippedNameless ? ` Skipped ${skippedNameless} nameless row(s).` : '');
      } else if (target === 'programs') {
        // 5.10 #554: the coach's picks, the athlete, and the plan row are all
        // decided in the preview; nothing here guesses. Refuse if any is open.
        if (!drafts || !titleGroups.length || unresolvedCount || !athleteId) throw new Error(progBlock || 'Nothing to commit');
        // Re-read the library FRESH and resolve against it: a linked entry that
        // was deleted meanwhile stops the commit; a "new" title someone added
        // meanwhile links to that entry instead of making a duplicate.
        const libRead = await readStoreForImport('expo-exercises');
        const fresh = libRead.value;
        const byId = new Map(fresh.map(e => [e.id, e]));
        const byNorm = new Map();
        for (const e of fresh) { const n = normTitle(e && e.title); if (n && !byNorm.has(n)) byNorm.set(n, e); }
        const newLibEntries = [];
        const chosen = new Map();
        for (const g of titleGroups) {
          const pick = resOf(g.title);
          if (pick === 'new') {
            const same = byNorm.get(g.key);
            if (same) { chosen.set(g.key, same); continue; }
            const entry = { id: 'ex_' + uid(), title: g.title, videoLink: g.video || '', cues: '', notes: '', category: '', resistanceType: '', bodyPosition: '', movementPattern: '', laterality: '', primaryMuscles: '', secondaryMuscles: '', primaryJoints: '', jointMovements: '', movementType: '' };
            newLibEntries.push(entry); byNorm.set(g.key, entry); chosen.set(g.key, entry);
          } else {
            const e = byId.get(pick);
            if (!e) throw new Error(readLang() === 'he' ? `התרגיל שקישרת ל"${g.title}" כבר לא בספרייה. תטען מחדש ותבחר שוב.` : `The library exercise "${g.title}" was linked to is gone. Reload and pick again.`);
            chosen.set(g.key, e);
          }
        }
        const now = new Date().toISOString();
        // Build every plan row first, then write the library BEFORE the plans
        // that point at it - a failed plan write must never leave a committed
        // plan referencing a library id that was never written. (audit #2)
        const planRows = drafts.map(prog => draftToPlanRow(prog, {
          resolve: (t) => chosen.get(normTitle(t)) || null,
          traineeId: athleteId, planId: planIdFor(prog), makeId: uid, now,
        }));
        if (newLibEntries.length) {
          await writeStoreForImport('expo-exercises', libRead.base, [...fresh, ...newLibEntries]);
        }
        let created = 0;
        for (const planRow of planRows) {
          const { error } = await supabase.from('plans').upsert(planRow);
          if (error) throw error;
          created++;
        }
        summary = readLang() === 'he' ? `${created === 1 ? 'נוספה תוכנית אחת' : `נוספו ${created} תוכניות`} (${newLibEntries.length === 1 ? 'רשומה חדשה אחת בספרייה' : `${newLibEntries.length} רשומות חדשות בספרייה`}).` : `+${created} program${created === 1 ? '' : 's'} (${newLibEntries.length} new library entries).`;
      }
      // Auto-reload after a successful import. The commit upserted plans/store
      // DIRECTLY to Supabase, so the running app's in-memory useSupaStore arrays
      // are now stale — the next in-app edit (ExercisesView add, TraineeDetail
      // autosave) would upsert the OLD list and silently overwrite this import
      // (data-loss race). A reload re-fetches everything fresh and closes it.
      setCommitMsg('✓ ' + summary + (readLang() === 'he' ? ' טוען מחדש…' : ' Reloading…'));
      setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 1500);
    } catch (e) { setErr((readLang() === 'he' ? 'השמירה נכשלה: ' : 'Commit failed: ') + e.message); }
    setCommitting(false);
  };

  const targetFields = TARGET_FIELDS[target];
  const lowConf = mapping?.confidence !== undefined && mapping.confidence < 0.7;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.tm, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{tt('SMART IMPORT')}</div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 4 }}>
            {tt("Drop any document — XLSX, CSV, PDF, image, screenshot. AI reads it, maps it to EXPO's schema, previews before commit.")}
          </div>
        </div>
        <input ref={inputRef} type="file"
          accept=".xlsx,.xls,.ods,.csv,.tsv,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onPick} style={{ display: 'none' }} />
        <Btn onClick={() => inputRef.current?.click()} disabled={parsing} style={{ minWidth: 124, justifyContent: 'center' }}>{parsing ? tt('Reading…') : (fileName ? tt('Replace File') : tt('Pick File'))}</Btn>
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
          <div className="title-strip" style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
            <SectionLabel as="div" style={{ color: 'var(--c-stripTx)', fontSize: C.alertLabelSize }}>{tt('FILE')}</SectionLabel>
          </div>
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>{tt('FILE')} · {fileKind.toUpperCase()}</div>
              <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
            </div>
            {sheets.length > 1 && (
              <Select label="Sheet/Page" options={sheets.map((s, i) => ({ value: String(i), label: s.sheetName + (s.guessedTarget ? ` · ${s.guessedTarget}` : '') }))} value={String(activeSheetIdx)} onChange={onSheetChange} />
            )}
            <Select label="Target" options={TARGETS.map(t => ({ value: t.value, label: t.label }))} value={target} onChange={onTargetChange} />
            {directProg ? (
              // the coach's block layout was read by sheetProgramParse - no AI call, no rate limit (5.10 #554)
              <div data-si-direct="" style={{ height: 'var(--btn-h)', boxSizing: 'border-box', border: `1px solid ${C.cardBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.ac, whiteSpace: 'nowrap' }}>{tt('Read directly - no AI')}</div>
            ) : (
              <Btn onClick={analyze} disabled={analyzing || !sheetGrid?.headers?.length} style={{ minWidth: 140, justifyContent: 'center' }}>{tr(readLang(), analyzing ? 'Analyzing…' : 'Analyze with AI')}</Btn>
            )}
          </div>
        </div>
      )}

      {sheetGrid && !directProg && (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, marginBottom: 12 }}>
          <div className="title-strip" style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
            <SectionLabel as="div" style={{ color: 'var(--c-stripTx)', fontSize: C.alertLabelSize }}>{tt('SHEET PREVIEW')}</SectionLabel>
          </div>
          <div style={{ padding: 12 }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, marginBottom: 6, letterSpacing: '0.18em', fontWeight: 700 }}>{sheetGrid.headers.length} {tt('cols')} · {sheetGrid.rows.length} {tt('rows')}</div>
          <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: FB, color: C.tx }}>
              <thead><tr style={{ background: 'transparent' }}>{sheetGrid.headers.map((h, i) => (
                <th key={i} style={{ padding: '6px 10px', textAlign: 'start', fontFamily: FN, fontSize: 10, color: C.tm, borderBottom: `1px solid ${C.cardBd}`, whiteSpace: 'nowrap' }}>{h || `(col ${i + 1})`}</th>
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
          <div className="title-strip" style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
            <SectionLabel as="div" style={{ color: 'var(--c-stripTx)', fontSize: C.alertLabelSize }}>{tt('AI MAPPING')}</SectionLabel>
          </div>
          <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}><Badge color={lowConf ? C.or : C.gn}>{Math.round((mapping.confidence ?? 0) * 100)}% {tt('confident')}</Badge></div>
            <Btn onClick={runTransform} disabled={transforming} style={{ minWidth: 160, justifyContent: 'center' }}>{tr(readLang(), transforming ? 'Transforming…' : 'Preview Transform')}</Btn>
          </div>
          {mapping.notes && <div style={{ fontSize: 12, color: C.tm, lineHeight: 1.5, marginBottom: 8 }}>💡 {mapping.notes}</div>}
          {Array.isArray(mapping.warnings) && mapping.warnings.length > 0 && (
            <ul style={{ margin: '4px 0 10px 16px', padding: 0, color: C.or, fontSize: 12 }}>
              {mapping.warnings.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w}</li>)}
            </ul>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) minmax(160px,2fr) auto', gap: '6px 10px', alignItems: 'center', fontSize: 12 }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>{tt('TARGET')}</div>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>{tt('SOURCE COLUMN')}</div>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>{tt('CONF')}</div>
            {targetFields.map(field => {
              const m = mapping.mapping?.[field] || { source: null };
              const conf = m.confidence ?? 0;
              return (
                <React.Fragment key={field}>
                  <div style={{ color: C.tx, fontFamily: FB }}>{field}</div>
                  <select value={m.source || ''} onChange={e => updateMappingSource(field, e.target.value)}
                    style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '6px 8px', color: C.tx, fontFamily: FB, fontSize: 12 }}>
                    <option value="">{tt('— none —')}</option>
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
          <div className="title-strip" style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
            <SectionLabel as="div" style={{ color: 'var(--c-stripTx)', fontSize: C.alertLabelSize }}>{tt('PREVIEW')}</SectionLabel>
          </div>
          <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>
              <Badge color={C.gn}>{readLang() === 'he' ? (transform.items.length === 1 ? 'פריט אחד' : `${transform.items.length} פריטים`) : `${transform.items.length} item${transform.items.length === 1 ? '' : 's'}`}</Badge>
              {transform.errors.length > 0 && <Badge color={C.rd} style={{ marginInlineStart: 6 }}>{readLang() === 'he' ? (transform.errors.length === 1 ? 'שגיאה אחת' : `${transform.errors.length} שגיאות`) : `${transform.errors.length} error${transform.errors.length === 1 ? '' : 's'}`}</Badge>}
            </div>
            {target !== 'programs' && <Btn onClick={commit} disabled={committing || transform.items.length === 0} style={{ minWidth: 168, justifyContent: 'center' }}>{tr(readLang(), committing ? 'Writing…' : 'Commit to Database')}</Btn>}
          </div>
          {Array.isArray(transform.warnings) && transform.warnings.length > 0 && (
            <ul style={{ margin: '4px 0 10px 16px', padding: 0, color: C.or, fontSize: 12 }}>
              {transform.warnings.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w}</li>)}
            </ul>
          )}
          {/* programs: the readable day tables below replace the raw JSON (5.10 #554) */}
          {target !== 'programs' && (
          <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 10, maxHeight: 280, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, color: C.tm, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(transform.items.slice(0, 20), null, 2)}
            {transform.items.length > 20 && `\n…and ${transform.items.length - 20} more`}
          </div>
          )}
          {transform.errors.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 11, color: C.rd, cursor: 'pointer' }}>{readLang() === 'he' ? (transform.errors.length === 1 ? 'שורה אחת דולגה' : `${transform.errors.length} שורות דולגו`) : `${transform.errors.length} skipped row${transform.errors.length === 1 ? '' : 's'}`}</summary>
              <ul style={{ margin: '4px 0 0 16px', padding: 0, color: C.tm, fontSize: 11 }}>
                {transform.errors.slice(0, 30).map((e, i) => <li key={i}>row {e.rowIdx}: {e.msg}</li>)}
              </ul>
            </details>
          )}
          </div>
        </div>
      )}

      {drafts && (
        <ProgramImport drafts={drafts} source={aiDrafts ? 'ai' : 'direct'} lib={lib} titleGroups={titleGroups} resOf={resOf} onPickMatch={onPickMatch}
          libById={libById} unresolvedCount={unresolvedCount} rosterOptions={rosterOptions} athleteId={athleteId}
          onAthlete={(id) => setAthletePick({ forKey: draftKey, id })} block={progBlock} committing={committing} onCommit={commit} />
      )}

      {commitMsg && <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.gn}`, color: C.gn, borderRadius: 0, padding: '10px 12px', fontSize: 13 }}>{commitMsg}</div>}
    </div>
  );
}
