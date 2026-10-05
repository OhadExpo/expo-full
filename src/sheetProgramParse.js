// sheetProgramParse.js — read the coach's own program sheets DIRECTLY, no AI
// (5.10 #554, Ohad: "make smart importing 10 times better").
//
// The ~210 plans in the app were imported by a deterministic parser that only
// ever existed as a CLI (scripts/drive-import-core.cjs parseSingleSheet). The
// in-app Smart Import was AI-only: it took the first row with 3 filled cells as
// THE header (wrong for these sheets: every day has its own `#|Day name|Sets|
// Reps|...` header row), dropped hyperlinked videos, the warm-up grid and
// merged cells, and matched exercises by exact lowercase title. This is that
// CLI parser ported to a pure module the screen can run on a SheetJS worksheet,
// with the CLI's guesses removed:
//
//   - NO DEFAULTS. The CLI wrote 3 for a blank sets cell and '8-12' for blank
//     reps, and read sets/reps/tempo/video from hard-coded columns 5/6/4/3 when
//     a header did not name them. His rule: never invent training data, blank
//     beats wrong. A blank cell stays '', and a column no header has named is
//     not read at all (a warning says so).
//   - SUPERSETS ARE GROUPS. The plan editor colours rows that share a letter as
//     ONE group (PlansView supersetColor). The CLI gave "1a" the letter A and
//     "1b" the letter B - two different groups. Here every row of "1a/1b/1c"
//     shares one letter, the day's groups lettered A, B, C in order.
//   - WAVES are the coach's own text: "10>8>6" in reps becomes wk
//     ['10','8','6'] (in sets: wkS). The CLI read the next four cells to the
//     right instead, whatever they held.
//   - MERGED CELLS: SheetJS keeps a merged value only in its top-left cell. A
//     label merged down several rows (one sets value for a superset, a note for
//     three rows) applies to every row it spans, so it is copied DOWN its first
//     column. It is not copied across: a value merged sideways belongs to its
//     first column only.
//   - Rows above the first day header are the warm-up area only. The CLI also
//     read them as a "Day 1".
//
// Also here, pure so the unit test can hold them: the library ranker the
// preview uses (suggestMatches' exact scale with the library tokenized ONCE),
// the athlete guess from the file name, and the plan row the commit writes.
// Unit test: scripts/verify-sheet-parse.mjs (BREAK=1 must fail).
import { normTitle, tokenSet, canonTokens } from './exerciseMatch.js';

// ── worksheet → grid ──────────────────────────────────────────────────────
const colNum = (letters) => { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const ADDR = /^([A-Z]+)(\d+)$/;

// The text the coach SEES in a cell: SheetJS's formatted text (w) first, the raw
// value second. A reps cell Google Sheets turned into a date shows "8-Dec" in w
// and a serial number in v; w is the honest one.
const cellText = (cell) => {
  if (!cell) return '';
  if (cell.w != null && String(cell.w) !== '') return String(cell.w);
  return cell.v == null ? '' : String(cell.v);
};
const cellLink = (cell) => (cell && cell.l && (cell.l.Target || cell.l.target)) || '';

// rows[r][c] = trimmed text, links[r][c] = hyperlink target ('' when none).
export function sheetGrid(ws) {
  const rows = []; const links = [];
  if (!ws) return { rows, links };
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const m = ADDR.exec(key); if (!m) continue;
    const r = Number(m[2]) - 1; const c = colNum(m[1]);
    while (rows.length <= r) { rows.push([]); links.push([]); }
    rows[r][c] = cellText(ws[key]).trim();
    const l = cellLink(ws[key]); if (l) links[r][c] = l;
  }
  // A merged block: copy the top-left value (and its link) DOWN the block's
  // first column into the cells SheetJS left empty. Never across, never over
  // a value that is there.
  for (const mg of ws['!merges'] || []) {
    if (!mg || !mg.s || !mg.e) continue;
    const c = mg.s.c; const top = (rows[mg.s.r] || [])[c] || ''; const topLink = (links[mg.s.r] || [])[c] || '';
    if (!top && !topLink) continue;
    for (let r = mg.s.r + 1; r <= mg.e.r; r++) {
      while (rows.length <= r) { rows.push([]); links.push([]); }
      if (!rows[r][c]) rows[r][c] = top;
      if (topLink && !links[r][c]) links[r][c] = topLink;
    }
  }
  for (let r = 0; r < rows.length; r++) { rows[r] = Array.from(rows[r], (v) => v || ''); links[r] = Array.from(links[r], (v) => v || ''); }
  return { rows, links };
}

const isDayHeader = (row) => String((row || [])[0] || '').trim() === '#' && !!String((row || [])[1] || '').trim();

// Does this sheet have the coach's per-day `#|Day name|...` header? Only such a
// sheet goes the direct way; anything else stays on the AI path.
export function hasDayHeader(ws) {
  return sheetGrid(ws).rows.some(isDayHeader);
}

// ── the parser ────────────────────────────────────────────────────────────
const WU_HEADER_RE = /^\s*(warm[-\s]?up|morning routine|חימום|instructions?|notes?|neck exc|bb\s*-\s*barbell|everything else|bb exercises|week\s*\d|rest|home routine|date:|day\s+\w)/i;
const WU_RX_RE = /^(.+?)\s*\(\s*([^()]+?)\s*\)\s*$/;
const URL_RE = /^https?:\/\/\S+$/i;
const COLS = {
  sets: /^(sets?|סטים)$/i,
  reps: /^(reps?|חזרות)$/i,
  tempo: /^(tempo|טמפו)$/i,
  rest: /^(rest|מנוחה)$/i,
  vid: /^(vid(eo)?|link|סרטון)$/i,
  notes: /^(notes?|comments?|cues?|הערות|דגשים)$/i,
};
const findCol = (hdr, rx) => { for (let c = 2; c < hdr.length; c++) if (rx.test(String(hdr[c] || '').trim())) return c; return -1; };
// sets: a whole number is a number; anything else the coach wrote is kept as
// written ("3-4", "AMRAP"); a blank cell is '' - never 3.
const setsValue = (raw) => (raw === '' ? '' : /^\d+$/.test(raw) ? Number(raw) : raw);

export function parseSheetProgram(ws, sheetName = '') {
  const { rows, links } = sheetGrid(ws);
  const at = (r, c) => (c >= 0 ? String((rows[r] || [])[c] || '').trim() : '');
  const linkAt = (r, c) => (c >= 0 ? String((links[r] || [])[c] || '') : '');
  const warnings = [];

  let firstDayRow = rows.length;
  for (let r = 0; r < rows.length; r++) if (isDayHeader(rows[r])) { firstDayRow = r; break; }

  // Warm-up: "Name (prescription)" cells above the first day (CLI port). The
  // title cell (A1, or B1 when A1 is blank) is the block's name, not a warm-up:
  // "Block 7 (4 weeks)" read as an exercise called "Block 7" in the CLI.
  const titleCol = at(0, 0) ? 0 : 1;
  const warmup = []; const wuSeen = new Set(); const wuCells = new Set();
  for (let r = 0; r < firstDayRow; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (r === 0 && c === titleCol) continue;
      const v = at(r, c);
      if (!v || WU_HEADER_RE.test(v)) continue;
      const m = v.match(WU_RX_RE); if (!m) continue;
      const t = m[1].trim(); const rx = m[2].trim();
      if (!t || !rx || !/\d|sec|rep|min/i.test(rx) || /[:]/.test(t) || /^(week\s|date\s|new\s+gym)/i.test(t)) continue;
      wuCells.add(r);
      const key = t.toLowerCase(); if (wuSeen.has(key)) continue; wuSeen.add(key);
      const vid = linkAt(r, c);
      warmup.push(vid ? { t, rx, vid } : { t, rx });
    }
  }
  // A numbered row above the first day that is not a warm-up cell was not read.
  let skippedAbove = 0;
  for (let r = 1; r < firstDayRow; r++) if (/^\d/.test(at(r, 0)) && at(r, 1) && !wuCells.has(r)) skippedAbove++;
  if (skippedAbove) warnings.push({ code: 'above-first-day', n: skippedAbove });

  const days = []; let day = null;
  // Column positions come from the day's own header row and carry to the next
  // day when it does not restate them. -1 = no header has named it: not read.
  const col = { sets: -1, reps: -1, tempo: -1, rest: -1, vid: -1, notes: -1 };
  const closeDay = () => {
    if (!day || !day.exercises.length) return;
    // superset groups: a number used by 2+ lettered rows ("1a","1b") = one group
    const count = new Map();
    for (const g of day._groups) if (g) count.set(g, (count.get(g) || 0) + 1);
    const letterOf = new Map();
    for (const g of day._groups) if (g && count.get(g) > 1 && !letterOf.has(g)) letterOf.set(g, String.fromCharCode(65 + letterOf.size));
    day.exercises.forEach((ex, i) => { const g = day._groups[i]; if (g && letterOf.has(g)) ex.superset = letterOf.get(g); });
    days.push({ name: day.name, exercises: day.exercises });
  };
  for (let r = firstDayRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const a = at(r, 0); const b = at(r, 1);
    if (isDayHeader(row)) {
      closeDay();
      day = { name: b, exercises: [], _groups: [] };
      for (const k of Object.keys(COLS)) { const c = findCol(row, COLS[k]); if (c !== -1) col[k] = c; }
      if (col.sets === -1 || col.reps === -1) warnings.push({ code: 'unlabelled-columns', day: b });
      continue;
    }
    const al = a.toLowerCase(); const bl = b.toLowerCase();
    if (!a || a === '#' || al.includes('rest') || al.includes('off')) continue;
    if (!b || bl === 'exercise' || bl === 'name') continue;
    if (bl.includes('rest') && bl.includes('off')) continue;
    if (al === 'instructions' || al.startsWith('bb -') || al.startsWith('bb exercises')) continue;
    const setsRaw = at(r, col.sets); const repsRaw = at(r, col.reps);
    let tempo = at(r, col.tempo); if (/^(tempo|none)$/i.test(tempo)) tempo = '';
    const ex = { title: b, sets: setsValue(setsRaw), reps: repsRaw, tempo, rest: at(r, col.rest), notes: at(r, col.notes) };
    const vidText = at(r, col.vid);
    const videoUrl = linkAt(r, col.vid) || linkAt(r, 1) || (URL_RE.test(vidText) ? vidText : '');
    if (videoUrl) ex.videoUrl = videoUrl;
    // A '>' cell ("10>8>6") stays EXACTLY as written (5.10 review 1005d #2): it
    // may mean per-week reps or a pyramid inside one session - split into wk it
    // showed the athlete "10" for every set and stretched the block to 5 weeks.
    // Until the notation is confirmed, the athlete reads what the coach wrote.
    const ss = /^(\d+)\s*([a-h])\b/i.exec(a);
    day.exercises.push(ex); day._groups.push(ss ? ss[1] : '');
  }
  closeDay();
  const weeks = 4;
  // The tab name is the block name (CLI: cell A1 is often a stale copy-paste).
  const name = String(sheetName || '').trim() || at(0, 0) || at(0, 1);
  return { name, days, warmup, weeks, warnings };
}

// ── library matching ──────────────────────────────────────────────────────
// suggestMatches (exerciseMatch.js) tokenizes every library title on every
// call: ~1,500 titles x every unique sheet title. This is the same scale -
// 100 exact, 98 same words, 96 same meaning, 84..76 one-two words apart, 40-80
// similar - over a library tokenized ONCE. The unit test holds it equal to
// suggestMatches.
export const AUTO_LINK_SCORE = 96;

export function buildLibIndex(library) {
  const out = [];
  for (const ex of library || []) {
    const t = ex && (ex.title || ex.t);
    const n = normTitle(t);
    if (n) out.push({ ex, n, ts: tokenSet(t), cs: canonTokens(t) });
  }
  return out;
}

function diffLabel(planOnly, libOnly) {
  const parts = [];
  if (planOnly.length === 1 && libOnly.length === 1) parts.push(`${planOnly[0]}↔${libOnly[0]}`);
  else { for (const w of libOnly) parts.push(`+${w}`); for (const w of planOnly) parts.push(`−${w}`); }
  const s = parts.join(' ');
  return s.length > 26 ? s.slice(0, 25) + '…' : s;
}

export function rankMatches(title, index, limit = 3) {
  const n = normTitle(title);
  if (!n) return [];
  const ts = tokenSet(title); const cs = canonTokens(title);
  const scored = [];
  for (const it of index || []) {
    const { ex, n: en, ts: es, cs: ces } = it;
    if (en === n) { scored.push({ ex, score: 100, why: 'exact match' }); continue; }
    let rawInter = 0; ts.forEach((x) => { if (es.has(x)) rawInter++; });
    if (rawInter === ts.size && rawInter === es.size) { scored.push({ ex, score: 98, why: 'same words' }); continue; }
    let inter = 0; cs.forEach((x) => { if (ces.has(x)) inter++; });
    if (inter === cs.size && inter === ces.size) { scored.push({ ex, score: 96, why: 'same meaning' }); continue; }
    const union = new Set([...cs, ...ces]).size;
    const jac = union ? inter / union : 0;
    const diff = (cs.size - inter) + (ces.size - inter);
    if (diff <= 2 && inter >= Math.max(1, cs.size - 1)) {
      scored.push({ ex, score: 92 - diff * 8, why: diffLabel([...cs].filter((x) => !ces.has(x)), [...ces].filter((x) => !cs.has(x))) });
    } else if (jac >= 0.5) scored.push({ ex, score: Math.round(40 + jac * 40), why: 'similar' });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// The one library entry to link without asking: the top suggestion at the
// same-meaning level or better, and only when no OTHER entry ties it (two
// library duplicates that both read "same meaning" are the coach's call).
export function autoLinkId(ranked) {
  const top = ranked && ranked[0];
  if (!top || top.score < AUTO_LINK_SCORE) return '';
  if (ranked.some((m, i) => i > 0 && m.score === top.score && m.ex.id !== top.ex.id)) return '';
  return top.ex.id || '';
}

// ── athlete guess from the file / tab name ────────────────────────────────
// A full-name hit wins; otherwise a single name word that only ONE athlete
// has. Anything ambiguous is '' - the coach picks.
export function guessAthleteId(trainees, text) {
  const hay = ` ${normTitle(text)} `;
  if (!hay.trim()) return '';
  const full = []; const part = [];
  for (const t of trainees || []) {
    const n = normTitle(t && t.name);
    if (!t || !t.id || !n) continue;
    if (hay.includes(` ${n} `)) { full.push(t.id); continue; }
    if (n.split(' ').some((w) => w.length >= 3 && hay.includes(` ${w} `))) part.push(t.id);
  }
  // only a FULL name prefills (5.10 review 1005d #3): a plan commits straight
  // into that athlete's portal, and one shared word ("Day" in "Day A program")
  // is not enough to send it there - the coach picks
  void part;
  return full.length === 1 ? full[0] : '';
}

// ── the plan row the commit writes ────────────────────────────────────────
// `resolve(title)` → the library entry the coach linked (or created) for that
// title, or null. The row snapshots what the athlete needs because athletes
// cannot read the library (RLS): the library title (as the editor's picker
// does), the sheet's own video or else the library's, the sheet's own note or
// else the library cues. Sets / reps / tempo / rest are the sheet's, blank
// stays blank.
export function draftToPlanRow(prog, { resolve, traineeId, planId, makeId, now }) {
  const days = (prog.days || []).map((d) => ({
    id: 'pd_' + makeId(),
    name: d.name || '',
    exercises: (d.exercises || []).map((ex, i) => {
      const lib = resolve(ex.title) || null;
      const row = {
        id: 'pe_' + makeId(),
        exerciseId: lib ? lib.id : '',
        title: (lib && lib.title) || String(ex.title || '').trim(),
        sets: ex.sets === undefined || ex.sets === null ? '' : ex.sets,
        reps: ex.reps == null ? '' : String(ex.reps),
        load: '', rpe: '',
        tempo: ex.tempo == null ? '' : String(ex.tempo),
        rest: ex.rest == null ? '' : String(ex.rest),
        notes: String(ex.notes || '').trim() || (lib && lib.cues) || '',
        order: i,
        superset: ex.superset || '',
        wk: Array.isArray(ex.wk) && ex.wk.length ? ex.wk : null,
        wkS: Array.isArray(ex.wkS) && ex.wkS.length ? ex.wkS : null,
      };
      const vid = ex.videoUrl || (lib && lib.videoLink) || '';
      if (vid) row.videoUrl = vid;
      return row;
    }),
  }));
  let weeks = Math.max(4, prog.weeks || 0);
  for (const d of days) for (const ex of d.exercises) weeks = Math.max(weeks, (ex.wk || []).length, (ex.wkS || []).length);
  return {
    id: planId,
    name: prog.name || 'Imported Block',
    trainee_id: traineeId || '',
    phase: '', notes: '',
    active: true,
    created_at: now, updated_at: now,
    is_template_purchase: false,
    data: { days, warmup: prog.warmup || [], weeks, isTemplatePurchase: false },
  };
}
