import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { fmtPrettyDate } from './dates';
import { safeUrl } from './VideoEmbed';
import useAutosave from './hooks/useAutosave';
import { C, FN, FB, FH, uid, ytId, ytIsShort, EXPO_LOGO, EXPO_ICON, EXPO_LOGO_NAV } from './theme';
import { EXPOMark } from './expoMark';
import BugReportButton from './BugReportButton';
import CoachMessagesAthlete from './CoachMessages';
import PushToggle from './PushToggle';
import { sendPush, isCoachMutedForAthlete } from './push';
import AthleteChallengesWidget from './AthleteChallengesWidget';
import { EX } from './exerciseData';
import { supabase, SUPA_URL, SUPA_PUBLISHABLE_KEY } from './supabase';
import { PasswordChangeModal } from './auth';
import { traineeIdsFor, memberIndexFromId, sortProgramsChrono, blockNum } from './traineeUtils';
import { FormVideoPlayer } from './WorkoutReview';
import { enqueueBlob, attachWorkout, drainBlobs, newBlobId, removeBlob, subscribe as subscribeBlobs } from './blobQueue';
import { emitSaveError } from './useSupaStore';
import ExerciseSubstitution, { libExerciseToEx } from './ExerciseSubstitution';
import TraineePRsView from './TraineePRsView';
import ReadinessRow, { hasReadiness } from './ReadinessRow';
import CheckinTrends from './CheckinTrends';
import { toast, confirmToast, isRefined5b, useEscClose, useDelayedUnmountValue } from './ui';
import { isLogOfPlan, duplicatePlanNames } from './planLogMatch';
import { useT as useAppT } from './i18n';
import { resolveStoredUrl } from './storageUrl';
// F-14 — meal photo → macros logger. Lazy-loaded since most athletes
// won't open it on every page load (and it pulls in the meals query).
const MealLogger = React.lazy(() => import('./MealLogger'));
const LiveRepCounter = React.lazy(() => import('./LiveRepCounter'));

// Tempo colour — a LEGIBLE light cool-grey. Secondary spec: must be clearly
// distinct from the bright-cyan reps/sets AND the orange warm-up. Faded cyan
// read too close to the reps/sets; the muted C.tm grey read too dim/dull.
// #9BA0AC is neutral, clearly not cyan/orange, and reads cleanly on dark.
// One source of truth for every card + the logger. (Ohad)
const TEMPO_COLOR = '#9BA0AC';

// Split a free-text prescription into [reps, rest]: the leading reps token
// (e.g. "1×12 E", "3x5", "2X4") stays cyan; everything after it (tempo/rest,
// incl. Hebrew like "שלוש שניות ירידה" or ", 30 SEC REST") is the rest, shown
// grey. Returns null when there's no leading NxM reps token (e.g. "80KG (2X4 E)")
// so the caller renders the whole string cyan. Handles comma OR space delimiters.
const splitPrescription = (str) => {
  const s = String(str || '');
  // reps token = N×M (with optional range) + an optional trailing unit word
  // (SEC/REPS/MIN/E) so "3 X 10-20 SEC" stays whole. The rest is only taken
  // when it's a comma-clause or whitespace-then-non-digit (e.g. Hebrew tempo).
  const m = s.match(/^(\s*\d+\s*[×xX]\s*[\d–-]+(?:\s*(?:SECS?|REPS?|MIN|E))?)(\s*,\s*.*|\s+\D.*)?$/i);
  if (!m) return null;
  return [m[1].trim(), (m[2] || '').trim() ? m[2] : ''];
};

// SETS × REPS hero — two big cyan numbers with SETS / REPS micro-labels beneath
// so the athlete reads which is which (Ohad). Shared by the exercise step AND
// the warm-up step so the header is consistent everywhere. Time-based reps
// ("15 SEC E") get a smaller value font so they still fit on one line. Falls
// back to a plain centred line only when the reps cell is itself a full N×M
// prescription (a per-week "2x10 e" cell) — printing that under a REPS label
// would double-count the sets. With splitCombined (warm-up rx path only) a
// combined "N×reps" reps string with no explicit sets is split into the two
// columns; the exercise step passes splitCombined=false so a blank-sets +
// "2x10 e" reps cell stays verbatim (splitting it there would fabricate a sets
// count and mislabel the trailing tempo token). Renders "—" when both empty.
function SetsRepsHero({ sets, reps, splitCombined = false }) {
  let sStr = String(sets ?? '').trim();
  let rStr = String(reps ?? '').trim();
  if (splitCombined && !sStr && rStr) {
    const sp = rStr.match(/^(\d+)\s*[×xX]\s*(.+)$/);
    if (sp) { sStr = sp[1]; rStr = sp[2].trim(); }
  }
  const labeled = sStr && rStr && !/[×x]/i.test(rStr) && rStr.length <= 12;
  if (!labeled) {
    // If reps is ITSELF a full 'N×M' prescription (a per-week "2x10 e" cell) do
    // NOT also prepend the flat sets count — "3 × 2x10 e" tells the athlete to do
    // 3× a 2×10 (6 working sets) instead of the intended 2×10. Mirrors rxOf's
    // /[x×]/ guard on the overview surface so the two screens agree.
    // "combined" = reps is ITSELF a full N×M prescription ("2x10 e"), where
    // prepending the flat sets would double-count. Must match ONLY a real
    // set-count prefix (a leading number then ×/x) — NOT a stray letter x in a
    // word like "max"/"max reps" (that regressed "3 × max" down to just "max").
    const combined = /^\s*\d+\s*[×x]/i.test(rStr);
    const txt = (combined ? rStr : [sStr, rStr].filter(Boolean).join(' × ')) || '—';
    return <div style={{ fontSize: 15, color: C.ac, fontWeight: 700, fontFamily: FN, textAlign: 'center' }}>{txt}</div>;
  }
  // Both columns share ONE font size (driven by the longer value) so SETS and
  // REPS always render at the same size (Ohad), while a long value like
  // "10-20 SEC" still shrinks to fit rather than overflowing.
  const valFont = Math.max(sStr.length, rStr.length) > 4 ? 15 : 19;
  const col = (val, label) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: valFont, color: C.ac, fontWeight: 700, fontFamily: FN, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{val}</span>
      <span style={{ fontSize: 8, color: C.tx, fontWeight: 700, fontFamily: FN, letterSpacing: '0.2em', textIndent: '0.2em', lineHeight: 1 }}>{label}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 14 }}>
      {col(sStr, 'SETS')}
      <span style={{ fontSize: 14, color: C.tm, fontWeight: 400, fontFamily: FN, lineHeight: 1 }}>×</span>
      {col(rStr, 'REPS')}
    </div>
  );
}

// Feature gate for the swap-exercise UI. Substitution is ONLY for trainees on
// expo-il template-purchased plans — Ohad's manually-coached private clients
// should never see this button (he handles substitutions for them himself).
//
// Read precedence:
//   1. plan.isTemplatePurchase — typed flag from the plans table column
//      (or data JSONB until the SQL migration runs). Set on import for
//      template plans and on the trainer plan editor.
//   2. Legacy name-prefix detection — kept as a safety net for any plan
//      that pre-dates the typed flag.
function isTemplatePlan(plan) {
  if (!plan) return false;
  if (plan.isTemplatePurchase === true) return true;
  const n = (plan.name || '').toLowerCase();
  return n.startsWith('[expo]') || n.startsWith('expo · ') || n.startsWith('expo - ');
}

// Substitution availability is decided by isTemplatePlan(plan) further below
// (typed plans.is_template_purchase column + legacy name-prefix fallback).
// The earlier dog-food override (Ohad's trainee id / email) was a temporary
// dev gate before any real template purchase landed — removed now that the
// real predicate covers the case.

// EX dict now imported from exerciseData.js (single source of truth)
// Previously inline — see exerciseData.js for all client exercises

// Build reverse lookup: exercise title → EX key
const EX_BY_TITLE = {};
Object.entries(EX).forEach(([k,v]) => { if(v.t) EX_BY_TITLE[v.t.toLowerCase()] = k; });

// Convert trainer-side plan to portal compressed format.
// Accepts two day shapes:
//   a) Trainer UI shape: d.exercises = [{ exerciseId, title, sets, reps, tempo, superset, notes }]
//   b) Drive-import / compressed shape: d.ex = [{ eid, s, r, tempo, superset, n }]
// Drive-imported plans store only `eid`; the title/video/cues live in the trainer exercise library,
// so we must look them up there. This path covers the majority of plans in Supabase.
// exById / exByTitle are Maps prebuilt once per render of the parent (useMemo
// on the stable trainerExercises array). Replaces two O(library) .find scans
// per exercise — at 1,467 exercises × dozens of plan rows that was ~100k+
// comparisons on every portal re-render (incl. the 30s presence beat).
function trainerPlanToPortal(plan, exById, exByTitle) {
  return {
    name: plan.name,
    phase: plan.phase || '',
    weeks: plan.weeks || 4,
    rest: (plan.notes || '').replace(/imported from sheets/gi, '').trim(),
    // Plan kind — 'daily' means a repeatable single-day routine the
    // athlete can log unlimited times (no day rotation, no week
    // structure, no warm-up). Everything else is undefined / 'standard'.
    kind: plan.kind || undefined,
    // filter(Boolean) at every seam: a null day / exercise / warm-up element
    // (corrupt Drive import, half-deleted editor row, offline partial) would
    // otherwise throw on `.exerciseId`/`.rx` and blank the ENTIRE athlete portal
    // (this transform runs over every plan before any tab branches). Dropping a
    // corrupt entry degrades gracefully instead of crashing every tab.
    warmup: Array.isArray(plan.warmup) ? plan.warmup.filter(Boolean) : [],
    days: (Array.isArray(plan.days) ? plan.days : []).filter(Boolean).map(d => {
      // Same hybrid-day rule as WeeklyFocusTool/normalizeDays: an empty
      // d.exercises must not shadow a populated compact d.ex, or the athlete
      // sees an empty day the coach sees full (audit 08-22 #53).
      const trainerArr = Array.isArray(d.exercises) ? d.exercises : null;
      const compactArr = Array.isArray(d.ex) ? d.ex : null;
      const rawList = ((trainerArr && trainerArr.length) ? trainerArr
        : (compactArr && compactArr.length) ? compactArr
        : (trainerArr || compactArr || [])).filter(Boolean);
      const seenEid = new Map();   // #51: disambiguate the same exercise appearing twice in one day
      return {
        name: d.name,
        // Per-day daily-routine flag. Propagates from PlanEditor's per-day
        // checkbox so the athlete portal can render that day with unlimited
        // logs / no DONE lock.
        kind: d.kind || undefined,
        ex: rawList.map((pe, peIdx) => {
          // Normalize: compressed shape uses eid/s/r, trainer shape uses exerciseId/sets/reps.
          const libId = pe.exerciseId || pe.eid || null;
          let exData = libId ? (exById.get(libId) || null) : null;
          if (!exData && pe.title) {
            const needle = pe.title.toLowerCase().trim();
            exData = exByTitle.get(needle) || null;
          }
          // Resolved title: trainer-library hit > inline pe.title > "Exercise N"
          // placeholder. The library is the canonical source — if we have it,
          // prefer it over an inline title so a renamed library entry flows
          // through to old plans. Only fall back to "Exercise N" when we have
          // literally nothing (trainerExercises hasn't loaded yet on first
          // render, OR the eid is orphaned and there's no inline title).
          const haveRealTitle = !!(exData?.title || pe.title);
          const title = (exData?.title || pe.title || 'Exercise ' + (peIdx + 1)).trim();
          let eid = EX_BY_TITLE[title.toLowerCase()];
          if (!eid) {
            const stableKey = pe.id || libId || title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            eid = 'dyn_' + stableKey;
            // Always (re)write when we have a real title — earlier renders may
            // have stubbed this with "Exercise N" before trainerExercises had
            // loaded, and the old guard `if (!EX[eid])` made that stub
            // permanent. Only refuse to overwrite an entry that already has
            // a real title if all we have now is the placeholder.
            const existing = EX[eid];
            const stubbed = existing && /^exercise\s+\d+$/i.test(existing.t || '');
            if (!existing || stubbed || haveRealTitle) {
              EX[eid] = {
                t: title,
                vid: exData?.videoLink || existing?.vid || '',
                q: exData?.cues || existing?.q || '',
              };
            }
          } else if (exData) {
            // KNOWN eid hit (the title matched a static EX baseline entry).
            // The bug we're fixing here: 9 baseline entries in exerciseData.js
            // are title-only — they have NO `vid`. With only the `if (!eid)`
            // branch updating EX from the library, those entries never
            // inherited the library's videoLink, so e.g. BB Lunge rendered
            // with no VIDEO → link on the trainee portal even though `e10`
            // has a videoLink in the Supabase exercise library. Backfill
            // the baseline entry from library data when the library has
            // info the baseline lacks. Never downgrade a populated baseline.
            const existing = EX[eid] || {};
            const next = {
              t: existing.t || title,
              vid: existing.vid || exData.videoLink || '',
              q: existing.q || exData.cues || '',
            };
            if (next.vid !== existing.vid || next.q !== existing.q) {
              EX[eid] = next;
            }
          }
          // #51: the SAME exercise can appear twice in one day (e.g. a heavy
          // top set + a back-off of the same lift). Both resolve to one eid,
          // which collapsed them into a single portal row (shared substitution,
          // shared prev-week ghost, shared PR match). Give the 2nd+ occurrence a
          // suffixed eid with a MIRRORED EX entry so title/video/cue still
          // resolve, but the rows are treated as distinct. The 1st keeps its
          // original eid, so already-stored workouts still match by eid; live
          // set-sync matches by exercise INDEX, not eid, so it is unaffected.
          const nSeen = (seenEid.get(eid) || 0) + 1;
          seenEid.set(eid, nSeen);
          if (nSeen > 1) {
            const dupEid = `${eid}#${nSeen}`;
            if (!EX[dupEid] && EX[eid]) EX[dupEid] = EX[eid];
            eid = dupEid;
          }
          // NEVER invent a prescription. A plan row that omits sets/reps stays
          // BLANK (renders "—" via SetsRepsHero/rxOf) instead of a fabricated
          // "3 × 8-12" the coach never wrote — which previously also got PERSISTED
          // into the athlete's permanent record on finish(). (empty = empty)
          const sets = pe.sets ?? pe.s ?? '';
          const reps = pe.reps ?? pe.r ?? '';
          const notes = pe.notes ?? pe.n;
          // Per-instance video override. Three states:
          //   undefined → no override (trainee sees library videoLink)
          //   ''        → explicit "no video for this program row"
          //   'http://…' → use this URL on this row
          // We propagate the override (including '') so the trainee respects
          // an explicit "no video" choice instead of falling back to library.
          const hasOverride = pe.videoUrl !== undefined || pe.vid !== undefined;
          const overrideUrl = pe.videoUrl !== undefined ? pe.videoUrl : pe.vid;
          const out = { eid, s: sets, r: reps };
          if (hasOverride) out.vid = overrideUrl || '';
          if (pe.tempo) out.tempo = pe.tempo;
          if (pe.superset) out.superset = pe.superset;
          if (notes) out.n = notes;
          // Coach explicitly cleared this program's note (× CLEAR → notes:''
          // + notesEdited:true). Carry that intent so the portal shows BLANK,
          // not the library cue — an empty-but-edited note must not fall back.
          else if (pe.notesEdited) out.nCleared = true;
          if (Array.isArray(pe.wk) && pe.wk.length) out.wk = pe.wk;
          if (Array.isArray(pe.wkS) && pe.wkS.length) out.wkS = pe.wkS;
          return out;
        })
      };
    })
  };
}


const bi = {background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:"8px 10px",color:C.tx,fontFamily:FB,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",textAlign:"center"};
// Set-logging inputs (reps/load/RPE) during a live workout: bigger tap target
// + fontSize 16 (anything smaller makes iOS zoom the page on focus, which
// breaks the logging flow). Used with inputMode + select-on-focus below.
const seti = {...bi,fontSize:16,padding:"12px 8px",fontVariantNumeric:"tabular-nums"};
const selectOnFocus = (e) => { try { e.target.select(); } catch {} };
const Bg = ({children,color=C.ac,style:s}) => <span style={{display:"inline-block",padding:"3px 10px",borderRadius:0,fontSize:10,fontWeight:700,fontFamily:FN,background:'var(--c-sf)',border:`1px solid ${color}`,color,letterSpacing:'0.18em',textTransform:'uppercase',...s}}>{children}</span>;

// Renders a Google Photos share URL as an inline player. Google blocks
// iframe embedding of share pages via X-Frame-Options, so /api/resolve-video
// scrapes the share page server-side and returns a direct googleusercontent
// stream URL we can hand to <video>. Resolution is cached at the edge for a
// day, so subsequent loads are instant.
const _gphResolveCache = new Map();
// A stored form video, resolved before it is played.
//
// The athlete's own video is stored as an /object/public/ URL, which only
// works while the bucket is world-readable - and it being world-readable is a
// finding, not a feature: an unauthenticated fetch returns a real athlete's
// training video today. resolveStoredUrl signs the URL, works unchanged on a
// public bucket, and falls back to the original on any failure, so this changes
// nothing now and is what keeps playback alive the moment the bucket is made
// private. Every other surface (coach review, meal photos, voice notes) already
// goes through it; this was the last raw one.
function StoredVideo({ src, ...rest }) {
  const [url, setUrl] = useState(src);
  useEffect(() => {
    let alive = true;
    setUrl(src);
    if (src) resolveStoredUrl(src).then((u) => { if (alive && u) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [src]);
  return <video src={url} {...rest} />;
}

function GooglePhotosEmbed({ url }) {
  const tt = useAppT();
  const [state, setState] = useState(() => _gphResolveCache.get(url) || { phase: 'loading' });
  const [streamFailed, setStreamFailed] = useState(false);
  useEffect(() => {
    setStreamFailed(false);
    if (_gphResolveCache.has(url)) { setState(_gphResolveCache.get(url)); return; }
    let alive = true;
    fetch('/api/resolve-video?url=' + encodeURIComponent(url))
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        const next = ok && j?.url ? { phase: 'ok', src: j.url, poster: j.poster || null } : { phase: 'err', error: j?.error || 'Cannot resolve video' };
        // Cache SUCCESSES only — caching an error poisoned the URL so a single
        // transient resolve failure showed "VIDEO COULD NOT BE EMBEDDED" forever
        // until a hard reload (the trainee's exercise demo, gone until reload).
        if (next.phase === 'ok') _gphResolveCache.set(url, next);
        setState(next);
      })
      .catch(e => { if (alive) setState({ phase: 'err', error: String(e?.message || e) }); });
    return () => { alive = false; };
  }, [url]);
  const wrap = {marginTop:16,marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'#000',border:`1px solid ${C.cardBd}`};
  if (state.phase === 'loading') return <div style={{...wrap,display:'flex',alignItems:'center',justifyContent:'center',color:C.tm,fontFamily:FN,fontSize:11,letterSpacing:'0.18em'}}>LOADING VIDEO…</div>;
  if (state.phase === 'err' || streamFailed) return <div style={{...wrap,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,color:C.tm,fontFamily:FN,fontSize:11,padding:16,textAlign:'center'}}>
    <div>{tt("VIDEO COULD NOT BE EMBEDDED")}</div>
    {safeUrl(url) && <a href={safeUrl(url)} target="_blank" rel="noopener noreferrer" style={{color:C.ac,textDecoration:'none',letterSpacing:'0.18em'}}>OPEN IN GOOGLE PHOTOS →</a>}</div>;
  const handleBadStream = () => setStreamFailed(true);
  const handleMeta = (e) => { if (!(e.currentTarget.duration > 0)) setStreamFailed(true); };
  return <div style={wrap}><video src={state.src} poster={state.poster||undefined} controls playsInline onError={handleBadStream} onLoadedMetadata={handleMeta} style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}/></div>;
}

// Overview focus note — clamps to 2 lines so the card stays compact, with a
// MORE/LESS toggle that reveals the full text on tap (Ohad: don't balloon the
// cards, don't let any length of text size them).
function OverviewFocus({ text }) {
  const tt = useAppT();
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) setOverflows(el.scrollHeight > el.clientHeight + 1); }, [text, open]);
  return (
    <div style={{marginInlineStart:30,marginTop:4}}>
      <div ref={ref} style={{fontSize:11,color:C.ac,opacity:0.85,lineHeight:1.4,...(open?null:{display:'-webkit-box',WebkitBoxOrient:'vertical',WebkitLineClamp:2,overflow:'hidden'})}}>
        <span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',marginRight:8,opacity:0.7}}>{tt("FOCUS")}</span><bdi>{text}</bdi>
      </div>
      {(overflows || open) && <span onClick={(e)=>{e.stopPropagation();setOpen(o=>!o);}} style={{display:'inline-block',marginTop:3,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.1em',color:C.ac,cursor:'pointer',opacity:0.85}}>{open?'▲ LESS':'▼ MORE'}</span>}
    </div>
  );
}

// StepLogger: warmup steps → pre-workout → exercise steps → finish
function StepLogger({day, plan, weekNum, clientId, onBack, onComplete, weeklyFocus, trainerExercises, priorWorkouts, allowSubstitution, demoMode = false, branch = '', nameAmbiguous = false, onFilmSet = null}) {
  const tt = useAppT();
  // Steps: 'wu0','wu1',... → 0,1,2,... (group indices) → 'end'
  // Daily-routine days skip warm-up steps entirely — Roei's "morning
  // routine" pattern doesn't tie to a warm-up block. Per-day flag set
  // via PlanEditor's 📆 Daily Routine checkbox. Legacy plan-level
  // kind='daily' (96e5f72 shape) also skips. The plan-level warm-up
  // editor still works for other (week-paced) days in the same plan.
  const isDailyRoutine = day?.kind === 'daily' || plan?.kind === 'daily';
  const warmup = isDailyRoutine ? [] : (plan.warmup || []);
  const wuCount = warmup.length;
  const exCount = day.ex.length;

  // Session draft. Persisted to localStorage on every change so a phone call,
  // backgrounded app, screen lock, or tab close mid-workout doesn't wipe the
  // logged sets/RPE/notes. Restored on mount. Cleared on onComplete (workout
  // finished and committed) or onBack (trainee explicitly leaves). Keyed by
  // (clientId, plan.name, day.name, weekNum) so resuming the same day in the
  // same week brings back the in-progress entries.
  // Day INDEX disambiguates two days that share a name in the same plan+week —
  // without it their in-progress drafts collided on one localStorage key, so
  // logging the 2nd "Day A" loaded/overwrote the 1st's draft.
  const _dayIdx = Array.isArray(plan?.days) ? plan.days.indexOf(day) : -1;
  const sessionKey = `expo-stepLogger-${clientId}-${plan.name}-${day.name}-d${_dayIdx}-w${weekNum}`;
  // Legacy key (pre day-index). READ fallback only, so a draft saved under the
  // old key still restores on deploy instead of vanishing. Cleared alongside
  // the new key on finish so a completed session's draft can't resurface.
  const _legacySessionKey = `expo-stepLogger-${clientId}-${plan.name}-${day.name}-w${weekNum}`;
  // Memoized: this is read ONLY by useState initializers (first render). As a
  // plain IIFE it re-ran localStorage.getItem + JSON.parse of the whole session
  // draft on EVERY render — i.e. on every keystroke in a set input while the
  // athlete logs. Keyed on sessionKey so it still refreshes when the day/week
  // changes. (perf)
  const _restoredSession = useMemo(() => {
    try { const raw = localStorage.getItem(sessionKey) || localStorage.getItem(_legacySessionKey); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }, [sessionKey, _legacySessionKey]);

  // Per-session substitutions: { [originalEid]: libraryExercise }. Resets on
  // workout finish or if the trainee navigates away from this day. The
  // prescribed plan is never mutated — substitution lives only in this state.
  const [substitutions, setSubstitutions] = useState(_restoredSession?.substitutions || {});
  const [swapOpenForEid, setSwapOpenForEid] = useState(null);
  // F-31 — open the LiveRepCounter for a specific exercise. eid is the
  // unique exercise instance in the day. The counter is lazy-imported
  // because MediaPipe vision_bundle is ~140KB.
  const [liveCountForEid, setLiveCountForEid] = useState(null);
  const [fbOpenForEid, setFbOpenForEid] = useState(null);   // last-week coach video feedback, per exercise
  const submittingRef = useRef(false);   // guards Complete-Workout against a double-tap minting two workout rows

  // Group consecutive exercises sharing the same superset letter.
  // groups[i] = { exIdxs: [0,1,...], superset: 'A' | '' }
  const groups = (() => {
    const out = [];
    let cur = null;
    day.ex.forEach((ex, i) => {
      const ss = ex.superset || '';
      if (ss && cur && cur.superset === ss) { cur.exIdxs.push(i); }
      else { cur = { superset: ss, exIdxs: [i] }; out.push(cur); }
    });
    return out;
  })();
  const groupCount = groups.length;

  const [step, setStep] = useState(() => {
    // Clamp a restored draft step against the CURRENT plan shape — the coach
    // may have removed warm-ups or shrunk the day since the draft was saved,
    // and an out-of-range 'wuN' would crash on warmup[wi].vid every load.
    const r = _restoredSession?.step;
    if (typeof r === 'string' && r.startsWith('wu')) {
      const wi = parseInt(r.slice(2), 10);
      if (Number.isFinite(wi) && wi >= 0 && wi < wuCount) return r;
    } else if (typeof r === 'number' && r >= 0 && r < groupCount) {
      return r;
    } else if (r === 'end' || r === 'checkin') {
      return r;
    }
    return wuCount > 0 ? 'wu0' : 'checkin';
  });
  const [notes, setNotes] = useState(_restoredSession?.notes || '');
  // Readiness check-in (autoregulation) — collected between warm-ups and the
  // first exercise, saved onto the workout. (Ohad: "couldn't see the check-in")
  const [checkin, setCheckin] = useState(_restoredSession?.autoregulation || { pain: '', sleep: '', energy: '' });
  // Per-week sets (ex.wkS) takes precedence over the scalar ex.s for allocating log rows.
  // weekNum is 0-indexed; fall back to the flat sets count (or 3) if the week is missing.
  const setCountFor = (ex) => {
    const perWeek = Array.isArray(ex.wkS) ? parseInt(ex.wkS[weekNum], 10) : NaN;
    if (Number.isFinite(perWeek) && perWeek > 0) return perWeek;
    return typeof ex.s === 'number' ? ex.s : 3;
  };
  // Find the most recent prior top set (by load) for a given stableId so the
  // first-set inputs can prefill last session's numbers — saves the trainee
  // the keystrokes for "match last week" + makes progressive overload visible
  // (you see what you did and can bump it). Honors substitutions on the prior
  // session side. Returns { reps, load, rpe } or null.
  const priorTopFor = (stableId, titleKey) => {
    if (!priorWorkouts || priorWorkouts.length === 0) return null;
    let best = null;
    for (const w of priorWorkouts) {
      for (const px of (w.exercises || [])) {
        const pSub = px.substitution;
        const pStableId = pSub ? (pSub.toLibId || `swap:${(pSub.to||'').toLowerCase()}`) : px.eid;
        // eid first, normalized title second (plan rebuilds rotate eids) — so
        // the "match last week" prefill survives a rebuild instead of silently
        // dropping. Mirrors the prevWeekSets / newPRs matchers.
        const pTitleKey = (pSub ? pSub.to : px.title || '').toLowerCase().trim();
        if (pStableId !== stableId && !(titleKey && pTitleKey === titleKey)) continue;
        for (const s of (px.sets || [])) {
          if (!s.done) continue;
          const load = parseFloat(s.load) || 0;
          if (load <= 0) continue;
          if (!best || load > best.load || (load === best.load && new Date(w.date) > new Date(best.date))) {
            best = { load, reps: s.reps ?? '', rpe: s.rpe ?? '', date: w.date };
          }
        }
      }
    }
    return best;
  };
  const [allSets, setAllSets] = useState(() => {
    // Resume from draft if the cached row count matches the current day shape.
    // Mismatch means the trainer reshaped the day since the draft was written
    // (added/removed exercises or sets) — safer to rebuild from the prescribed
    // plan than to splice partial old data into the new structure.
    if (_restoredSession?.allSets?.length === day.ex.length) {
      const sizesOk = _restoredSession.allSets.every((rows, i) => rows.length === setCountFor(day.ex[i]));
      // Identity check: the day's exercise eids must match, in order. Without
      // this, a coach reorder/swap that preserves row+set counts realigns the
      // draft's logged sets onto the WRONG exercises (Squat's 100kg saved under
      // Bench). If exOrder is absent (older draft) fall back to size-only.
      const curOrder = day.ex.map(e => e.eid);
      const prevOrder = _restoredSession.exOrder;
      const identityOk = !Array.isArray(prevOrder) ||
        (prevOrder.length === curOrder.length && prevOrder.every((e, i) => e === curOrder[i]));
      if (sizesOk && identityOk) return _restoredSession.allSets;
    }
    return day.ex.map(ex => {
      const count = setCountFor(ex);
      const prior = priorTopFor(ex.eid, (EX[ex.eid]?.t || '').toLowerCase().trim());
      // Only the first set carries the prior numbers; subsequent sets stay blank
      // so the trainee makes a deliberate call set-by-set instead of robotically
      // copying last session across all four sets.
      // `prefill:true` marks the auto-filled top set as UNTOUCHED. It's stripped
      // the moment the athlete edits the set (uSet) and blanked on save if still
      // untouched — so a prefilled number the athlete never actually lifted can't
      // resurface next week as a phantom "last week" ghost (empty = empty).
      return Array.from({ length: count }, (_, i) => i === 0 && prior
        ? { reps: String(prior.reps || ''), load: String(prior.load || ''), rpe: prior.rpe != null ? String(prior.rpe) : '', done: false, prefill: true }
        : { reps: '', load: '', rpe: '', done: false });
    });
  });
  const [fv, setFv] = useState(() => {
    if (_restoredSession?.fv?.length === day.ex.length) {
      // Older drafts persisted blob: URLs verbatim. Strip them on hydrate
      // so a resumed session never renders a dead <video src="blob:..."> —
      // pendingBlobId (if present) re-mints from IDB; otherwise has:false.
      return _restoredSession.fv.map(f => {
        if (!f) return { note:'', has:false };
        const out = { ...f };
        if (typeof out.videoUrl === 'string' && out.videoUrl.startsWith('blob:')) {
          out.videoUrl = null;
          if (!out.cloudUrl && !out.pendingBlobId) out.has = false;
        }
        // A restored draft is NEVER mid-upload — the upload ran in a document
        // that's gone. Rehydrating uploading:true permanently locks the whole
        // workout: the Complete button becomes the non-clickable "Video
        // uploading…" label and Record/Replace stay disabled, so the athlete
        // can neither finish nor re-record and every logged set is stranded.
        // A finished upload left cloudUrl; a queued one left pendingBlobId
        // (both set uploading:false first) — so if neither is present, nothing
        // survived the interruption and the slot resets to re-recordable.
        if (out.uploading) {
          out.uploading = false;
          if (!out.cloudUrl && !out.pendingBlobId) { out.has = false; out.videoUrl = null; }
          delete out.phase; out.compressProgress = 0; out.uploadProgress = 0;
        }
        return out;
      });
    }
    return day.ex.map(() => ({note:'',has:false}));
  });

  // When the trainee swaps to a different exercise mid-session, prefill the
  // first set with that exercise's prior top — same behavior as initial mount,
  // just for the swapped-in exercise. Skips if the trainee already started
  // typing into the row.
  useEffect(() => {
    setAllSets(prev => {
      let changed = false;
      const next = prev.map((rows, ei) => {
        const ex = day.ex[ei];
        const sub = substitutions[ex.eid];
        if (!sub) return rows;
        const stableId = sub.id || `swap:${(sub.title||'').toLowerCase()}`;
        const first = rows[0];
        if (!first || first.reps || first.load || first.rpe || first.done) return rows;
        const prior = priorTopFor(stableId, (sub.title || '').toLowerCase().trim());
        if (!prior) return rows;
        changed = true;
        // prefill:true (same marker as the initial-mount prefill at ~448) so a
        // swap-in top set the athlete never touches is BLANKED on save instead
        // of persisting last session's numbers as if they were performed.
        const newFirst = { reps: String(prior.reps || ''), load: String(prior.load || ''), rpe: prior.rpe != null ? String(prior.rpe) : '', done: false, prefill: true };
        const out = [...rows]; out[0] = newFirst; return out;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [substitutions]);
  const [wuDone, setWuDone] = useState(() => {
    if (_restoredSession?.wuDone?.length === warmup.length) return _restoredSession.wuDone;
    return warmup.map(() => false);
  });
  // Live gym-session bridge: while this athlete is on the floor of an active
  // group session, every set edit (kg / reps / rpe / ✓) is broadcast to the
  // coach's big screen so it shows up LIVE — no need to finish the workout or
  // even advance the exercise (Ohad). Fire-and-forget on the same 'gym-session'
  // Broadcast channel SessionsView listens on; if no session has this athlete
  // checked in, the payload simply matches nothing and is ignored coach-side.
  const sessChanRef = useRef(null);
  // Latest allSets, readable inside the (once-subscribed) channel handlers
  // without re-subscribing on every keystroke.
  const allSetsRef = useRef(allSets);
  allSetsRef.current = allSets;
  // Revoke every in-memory blob: preview URL when the logger unmounts (workout
  // finished / exited). Any pending upload's bytes persist in IndexedDB via
  // blobQueue, so the preview URL isn't needed after unmount — without this
  // each queued form video (a 10-40MB Blob) stayed pinned in memory until a
  // full page reload (the expo-blob-uploaded event had no listener to free it).
  const fvRef = useRef(fv);
  fvRef.current = fv;
  useEffect(() => () => {
    for (const f of (fvRef.current || [])) {
      if (f && typeof f.videoUrl === 'string' && f.videoUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(f.videoUrl); } catch { /* noop */ }
      }
    }
  }, []);
  useEffect(() => {
    if (demoMode) return;
    // Merge a remote field into local set state WITHOUT re-broadcasting (only
    // uSet broadcasts). Matched by EXERCISE INDEX (ei) — the coach session and
    // the portal derive exercise ids from different schemes (plan exerciseId vs
    // title-hash), but both iterate the same plan-day exercises in the same
    // order, so position is the reliable shared key. fillOnly=true (catch-up)
    // never clobbers a value the athlete already entered; only ORs completion.
    const applyRemoteSet = (ei, si, field, value, fillOnly) => {
      if (ei == null || ei < 0) return;
      setAllSets(prev => {
        if (!prev[ei] || si >= prev[ei].length) return prev;
        const cur = prev[ei][si];
        if (cur?.[field] === value) return prev;
        // An untouched PREFILLED value is a suggestion carried over from last
        // session, not something the athlete entered — treat it as empty for
        // catch-up purposes. Without this, fill-empty-only saw a non-empty
        // string and refused, so a reopened portal could never pull down the
        // real set-1 values a coach had already logged.
        const isUntouchedPrefill = !!cur?.prefill && !cur?.done;
        if (fillOnly) {
          if (field === 'done') { if (cur.done || !value) return prev; }
          else {
            if (!isUntouchedPrefill && cur[field] !== '' && cur[field] != null) return prev;
            if (value === '' || value == null) return prev;
          }
        }
        // Clear `prefill` on any remote write, exactly as uSet does for a local
        // edit. This is REAL data (the coach logging the athlete's set from the
        // gym-floor screen), and finish() blanks every still-prefilled, unticked
        // set — so leaving the flag set silently discarded the coach's numbers
        // the moment the athlete tapped Complete.
        const n = [...prev]; n[ei] = [...n[ei]];
        n[ei][si] = { ...n[ei][si], [field]: value, prefill: false };
        return n;
      });
    };
    // Match plan + day + WEEK. The WIRE week is 1-indexed (HUMAN week) so it
    // agrees with the coach session (a.week = W1..Wn); weekNum here is 0-indexed,
    // hence weekNum+1. (Comparing the raw 0-indexed weekNum rejected EVERY live
    // sync message — coach 1-indexed vs portal 0-indexed.) week optional so
    // pre-week peers still match.
    const mine = (planName, dayName, week) =>
      (!planName || planName === plan?.name) && (!dayName || dayName === day?.name) && (week == null || week === weekNum + 1);
    // My current sets as a positional exercises[] list (index = exercise index).
    // Blank untouched prefills (prefill && !done) — they're last week's suggestion
    // carried into set 1, NOT something the athlete logged. Transmitting them as
    // real values let a catch-up peer accept them as logged data and clear the
    // prefill flag, so finish() no longer blanked them and they saved as phantom
    // sets the athlete never performed. Mirrors finish()'s own prefill blanking.
    const snapshot = () => (allSetsRef.current || []).map((rows) => ({
      sets: (rows || []).map(s => (s.prefill && !s.done)
        ? { reps: '', load: '', rpe: '', done: false }
        : { reps: s.reps, load: s.load, rpe: s.rpe, done: s.done }),
    }));
    const hasData = (exs) => exs.some(x => x.sets.some(s => s.reps || s.load || s.rpe || s.done));
    // Per-trainee topic so an athlete only ever joins their OWN room — another
    // athlete's live sets never reach this browser (the old shared 'gym-session'
    // room leaked every athlete's data to every portal). The coach's per-athlete
    // edits + catch-up come here; the coach-device full-session mirror stays on
    // the coach-only 'gym-session' topic that portals never join.
    // PRIVATE channel (#35): Realtime Authorization runs realtime.messages RLS
    // on join, so only staff or this athlete can read/write this topic. Before
    // #35 the topic was public — anyone with the (browser-shipped) anon key
    // could subscribe to a guessed 'gym-set:<id>' and read an athlete's live
    // sets or inject fake ones. The per-message guards below stay as defence in
    // depth; the server is now the actual gate.
    const ch = supabase.channel('gym-set:' + clientId, { config: { private: true, broadcast: { self: false } } });
    // Coach edit (group or single) → one 'athlete-set' per field.
    ch.on('broadcast', { event: 'athlete-set' }, ({ payload: p }) => {
      if (!p || p.ei == null || p.si == null || !p.field) return;
      // Defence in depth: even though the topic is already per-trainee, reject
      // any message not addressed to this athlete so a stray/injected broadcast
      // on a guessed topic can't write into this logger (until the channel is
      // made private with Realtime Authorization — see task #35).
      if (p.traineeId && p.traineeId !== clientId) return;
      if (!mine(p.planName, p.dayName, p.week)) return;
      applyRemoteSet(p.ei, p.si, p.field, p.value);
    });
    // CATCH-UP: a peer just connected and asked for the current state — if I
    // hold data for this athlete/day, reply with it.
    ch.on('broadcast', { event: 'sync-request' }, ({ payload: p }) => {
      if (!p || p.traineeId !== clientId || !mine(p.planName, p.dayName, p.week)) return;
      const exercises = snapshot();
      if (!hasData(exercises)) return;
      try { ch.send({ type: 'broadcast', event: 'sync-state', payload: { traineeId: clientId, planName: plan?.name, dayName: day?.name, week: weekNum + 1, exercises } }); } catch { /* not ready */ }
    });
    // CATCH-UP: a peer replied with its current state — fill my empty slots.
    ch.on('broadcast', { event: 'sync-state' }, ({ payload: p }) => {
      if (!p || p.traineeId !== clientId || !mine(p.planName, p.dayName, p.week)) return;
      (p.exercises || []).forEach((ex, ei) => {
        (ex.sets || []).forEach((st, si) => {
          ['reps', 'load', 'rpe', 'done'].forEach(f => { if (st[f] !== undefined) applyRemoteSet(ei, si, f, st[f], true); });
        });
      });
    });
    // On connect, ask whoever's online (coach session / other device) for the
    // current state so a freshly-opened portal pulls what's already filled.
    // A private channel is authorized from the JWT on the realtime socket.
    // supabase-js sets that on SIGNED_IN / TOKEN_REFRESHED, but a channel
    // created during the same page load can race ahead of the auth event and
    // join tokenless (→ denied). setAuth() first so the join always carries a
    // token; it's idempotent and cheap.
    let disposed = false;
    (async () => {
      try { await supabase.realtime.setAuth(); } catch { /* join below will surface it */ }
      if (disposed) return;
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          try { ch.send({ type: 'broadcast', event: 'sync-request', payload: { traineeId: clientId, planName: plan?.name, dayName: day?.name, week: weekNum + 1 } }); } catch { /* not ready */ }
        } else if (status === 'CHANNEL_ERROR') {
          // Live-sync is an enhancement — logging (not throwing) keeps a denied
          // join from ever blocking the athlete's own logging.
          console.warn('[live-sync] portal channel not authorized for', clientId);
        }
      });
    })();
    sessChanRef.current = ch;
    return () => { disposed = true; sessChanRef.current = null; supabase.removeChannel(ch); };
  }, [demoMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const broadcastSet = (ei, si, f, v) => {
    if (demoMode) return;
    try {
      sessChanRef.current?.send({ type: 'broadcast', event: 'athlete-set', payload: {
        traineeId: clientId, planName: plan?.name, dayName: day?.name, week: weekNum + 1,   // 1-indexed wire (matches coach a.week)
        ei, si, field: f, value: v,
      } });
    } catch { /* channel not ready yet — skip this edit, the next one syncs */ }
  };
  // Any edit means the athlete has taken ownership of this set — clear the
  // `prefill` mark so it's kept (and counts) as a real logged set.
  // Functional updater (not a spread of the `allSets` closure): a coach floor-
  // screen edit can land via applyRemoteSet in the same tick, and a stale-closure
  // write would clobber it (lost update in the very live-sync path this exists for).
  const uSet = (ei,si,f,v) => {setAllSets(prev=>{const n=[...prev];n[ei]=[...n[ei]];n[ei][si]={...n[ei][si],[f]:v,prefill:false};return n;});broadcastSet(ei,si,f,v)};

  // Persist the in-progress session to localStorage on every state change.
  // Bundle once so the autosave hook has a single stable value to track.
  // 200ms debounce keeps writes off the hot path while a trainee taps through
  // sets quickly. Cleared on onComplete / onBack via the wrappers below.
  // blob: URLs are bound to the document that minted them — persisting them
  // verbatim would make the resumed session reference dead URLs and render
  // empty <video> tags. Strip on save; resume re-mints from the IDB blob
  // via pendingBlobId when present.
  const serializeFv = (arr) => (Array.isArray(arr) ? arr : []).map(f => {
    if (!f) return f;
    const safe = { ...f };
    if (typeof safe.videoUrl === 'string' && safe.videoUrl.startsWith('blob:')) {
      safe.videoUrl = null;
    }
    // Never persist mid-upload state: a resumed draft can't have a live
    // upload, and rehydrating uploading:true permanently locks the workout
    // (Complete button disabled + Record/Replace disabled → sets stranded).
    // See the restore mapper above for the full rationale.
    if (safe.uploading) {
      safe.uploading = false;
      if (!safe.cloudUrl && !safe.pendingBlobId) { safe.has = false; safe.videoUrl = null; }
      delete safe.phase; safe.compressProgress = 0; safe.uploadProgress = 0;
    }
    return safe;
  });
  const sessionDraft = React.useMemo(
    // exOrder fingerprints the day's exercise identities so resume can detect a
    // coach reorder/swap since the draft was written. allSets binds to exercises
    // purely by position, so restoring a positionally-valid but reordered draft
    // silently smears one exercise's logged sets onto another (data corruption).
    () => ({ step, notes, autoregulation: checkin, allSets, fv: serializeFv(fv), wuDone, substitutions, exOrder: day.ex.map(e => e.eid), savedAt: Date.now() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, notes, checkin, allSets, fv, wuDone, substitutions, day]
  );
  const sessionAutosave = useAutosave(
    sessionDraft,
    async (draft) => {
      try { localStorage.setItem(sessionKey, JSON.stringify(draft)); return true; }
      catch { return false; }
    },
    { debounceMs: 200 }
  );
  const clearSessionDraft = () => {
    try { localStorage.removeItem(sessionKey); localStorage.removeItem(_legacySessionKey); } catch {}
    sessionAutosave.markClean();
  };

  // Visible "did my data make it?" signal in the sticky session bar.
  // Tracks (a) the last time autosave wrote to localStorage, and (b) the
  // pending blob count from the offline upload queue. Both surface as a
  // single small pill so the trainee never has to guess.
  const [lastSavedAt, setLastSavedAt] = React.useState(null);
  React.useEffect(() => {
    if (sessionAutosave.status === 'saved') setLastSavedAt(new Date());
  }, [sessionAutosave.status]);
  const [pendingBlobs, setPendingBlobs] = React.useState(0);
  React.useEffect(() => subscribeBlobs(setPendingBlobs), []);

  // Smart video handling: Safari/iOS skips compression (iOS pre-compresses),
  // Chrome/Android uses Canvas+MediaRecorder at accelerated playback.
  // Files under 25MB skip compression on all browsers.
  // Tracks whether this StepLogger is still mounted. Compression kicks off an
  // rAF draw loop and a MediaRecorder that would otherwise keep running if the
  // user navigates away mid-upload (memory leak + orphan MediaRecorder).
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // Feature-detect compression capability. UA-sniffing for Safari was unreliable
  // — iOS 14.5+ ships MediaRecorder and canvas.captureStream, but quality varies.
  // Try in any browser that exposes the APIs; fall back to direct upload on throw.
  const canCompressVideo = () =>
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    (MediaRecorder.isTypeSupported('video/webm; codecs=vp8') ||
     MediaRecorder.isTypeSupported('video/webm') ||
     MediaRecorder.isTypeSupported('video/mp4'));

  const compressVideoChrome = (file, onProgress, signal, opts = {}) => new Promise((resolve, reject) => {
    // Target: ~40MB output — comfortably under Supabase's HARD 50MB per-object
    // cap (free plan, project-wide; uploads at/over it get 413 "Payload too
    // large" — exactly what locked Ron out on 2026-06-12). Bitrate computed
    // from duration so a 5-minute video gets the same budget as a 30-second
    // one. Quality clamped to [400 Kbps, 3 Mbps]. opts.maxWidth / opts.targetMb
    // let the caller retry a too-big result at a smaller frame / tighter budget.
    const TARGET_MB = opts.targetMb || 40;
    const MAX_WIDTH = opts.maxWidth || 1280;
    const MIN_BITRATE = 400_000;
    const MAX_BITRATE = 3_000_000;

    const src = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.muted = true; vid.playsInline = true; vid.preload = 'auto'; vid.src = src;

    // Single-exit cleanup so a timeout/abort can't leave the MediaRecorder,
    // <video>, and rAF loop running (and the object URL leaked) in the
    // background after the caller has already given up. `settled` makes every
    // terminal path idempotent. `_recorder`/`_vid` are filled once they exist.
    let settled = false;
    let _recorder = null;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      try { if (_recorder && _recorder.state === 'recording') _recorder.stop(); } catch {}
      try { vid.pause(); } catch {}
      try { URL.revokeObjectURL(src); } catch {}
      fn(arg);
    };
    const done = (v) => finish(resolve, v);
    const fail = (e) => finish(reject, e);

    // External abort (the 40s wall-clock race in the caller) → stop everything.
    if (signal) {
      if (signal.aborted) { fail(new Error('aborted')); return; }
      signal.addEventListener('abort', () => fail(new Error('aborted')), { once: true });
    }

    vid.onloadedmetadata = () => {
      if (settled) return;
      const duration = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 60;
      const targetBits = TARGET_MB * 1024 * 1024 * 8;
      const computed = Math.floor(targetBits / duration);
      const BITRATE = Math.max(MIN_BITRATE, Math.min(MAX_BITRATE, computed));

      // Max-width cap handles both landscape (1920x1080 → 1280x720) and portrait
      // (1080x1920 unchanged) correctly. The /2 rounding is required by VP8/H.264
      // chroma subsampling.
      const scale = vid.videoWidth > MAX_WIDTH ? MAX_WIDTH / vid.videoWidth : 1;
      const w = Math.round(vid.videoWidth * scale / 2) * 2;
      const h = Math.round(vid.videoHeight * scale / 2) * 2;

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');

      if (typeof canvas.captureStream !== 'function') {
        fail(new Error('canvas.captureStream unsupported'));
        return;
      }

      // Prefer mp4 first — it ships proper duration metadata in the moov atom,
      // so the trainer's <video> playback (seek bar, time readout, playbackRate
      // toggles) works correctly without the Infinity-duration scan trick.
      // WebM from MediaRecorder lacks a duration cue in the EBML header and
      // forces a full-file scan to compute duration, which silently breaks
      // playbackRate on the trainer-review side. Chrome ≥ 123 and Safari
      // ≥ 14.5 support mp4 encoding; Firefox falls back to webm.
      const mimeCandidates = [
        'video/mp4; codecs="avc1.42E01E"',
        'video/mp4',
        'video/webm; codecs=vp8',
        'video/webm; codecs=vp9',
        'video/webm',
      ];
      const mimeType = mimeCandidates.find(t => MediaRecorder.isTypeSupported(t));
      if (!mimeType) {
        fail(new Error('No supported MediaRecorder mime type'));
        return;
      }
      const ext = mimeType.startsWith('video/mp4') ? '.mp4' : '.webm';
      const baseType = mimeType.split(';')[0];

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITRATE });
      _recorder = recorder;
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: baseType });
        chunks.length = 0; // release chunk references promptly
        if (blob.size < 1024) {
          fail(new Error('Compression produced empty output'));
          return;
        }
        if (onProgress) onProgress(100); // never strand the bar below 100 (duration fallback)
        done({ blob, ext, originalSize: file.size, compressedSize: blob.size });
      };

      vid.currentTime = 0;
      // playbackRate = 1 is critical: canvas.captureStream samples at wall-clock,
      // so any speedup bakes fast-motion into the output (8x was the old bug).
      vid.playbackRate = 1;

      vid.play().then(() => {
        if (settled) return; // aborted while play() was resolving
        recorder.start(100);
        const draw = () => {
          if (settled) return;
          // Abort if the host component unmounted mid-compression — otherwise
          // the rAF loop + MediaRecorder + video element keep running in memory.
          if (!aliveRef.current) { fail(new Error('aborted')); return; }
          if (vid.ended || vid.paused || vid.currentTime >= duration) {
            if (recorder.state === 'recording') recorder.stop();
            vid.pause(); return;
          }
          ctx.drawImage(vid, 0, 0, w, h);
          // Clamp to 99 mid-stream; onstop emits the final 100. Guards against a
          // duration fallback (60s on a 30s clip) freezing the bar mid-range.
          if (onProgress) onProgress(Math.min(99, Math.round((vid.currentTime / duration) * 100)));
          requestAnimationFrame(draw);
        };
        draw();
        const wallTime = (duration / vid.playbackRate) + 3;
        setTimeout(() => { if (recorder.state === 'recording') { recorder.stop(); vid.pause(); } }, wallTime * 1000);
      }).catch(fail);
    };
    vid.onerror = () => { fail(new Error('Failed to load video')); };
  });

  // Upload with real progress tracking via XMLHttpRequest
  // Supabase Storage REST API: POST raw body with Content-Type header.
  // URL/key sourced from src/supabase.js so there's a single
  // change-once point if/when the project is rotated.
  const uploadWithProgress = (blob, path, contentType, onProgress) => new Promise(async (resolve, reject) => {
    const url = `${SUPA_URL}/storage/v1/object/form-videos/${path}`;
    // Authenticate as the SIGNED-IN ATHLETE, not with the bundled anon key.
    // The anon key is public (it ships in the bundle), so an anon-authenticated
    // upload let anyone on the internet write to any folder — the source of the
    // orphaned t4/t5/_lib objects and a bucket-fill DoS. With the session token
    // the INSERT policy can scope writes to the caller's own trainee folder.
    // Authed uploads MUST carry the athlete's token — the INSERT policy requires
    // auth.uid(). A long realtime compress or a backgrounded phone can expire
    // the access token mid-flow; the old anon-key fallback then 403'd and the
    // recording was silently DROPPED. Refresh when near expiry, fall back to the
    // current session, and refuse (so the catch queues it + prompts re-auth)
    // rather than fire an unauthenticated request that's guaranteed to 403.
    let bearer;
    try {
      let { data } = await supabase.auth.getSession();
      let s = data?.session;
      const expSoon = !s?.expires_at || (s.expires_at * 1000 - Date.now() < 120000);
      if (expSoon) {
        // Try to refresh, then RE-READ the session — a failed refresh (e.g.
        // offline) leaves the old token in place, so we can't trust `tok` from
        // before. Reading getSession again gives us the actually-current token
        // and its real expiry to validate below.
        try { await supabase.auth.refreshSession(); } catch { /* offline / refresh failed */ }
        ({ data } = await supabase.auth.getSession());
        s = data?.session;
      }
      // Refuse if the token is missing OR already past its expiry: firing it
      // would 403 server-side, and a generic 403 risks being misclassified
      // permanent and the recording DROPPED. Rejecting authExpired routes it to
      // the offline queue (recoverable on re-auth). A still-valid-but-stale
      // token (offline, not yet expired) is fine to send — it works until exp.
      if (!s?.access_token || (s.expires_at && s.expires_at * 1000 <= Date.now())) {
        const e = new Error('Session expired — sign out and back in to upload. Your recording is saved.');
        e.httpStatus = 401; e.authExpired = true; reject(e); return;
      }
      bearer = s.access_token;
    } catch {
      const e = new Error('Session expired — sign out and back in to upload. Your recording is saved.');
      e.httpStatus = 401; e.authExpired = true; reject(e); return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${bearer}`);
    xhr.setRequestHeader('apikey', SUPA_PUBLISHABLE_KEY);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'true');

    // Flaky mobile networks can leave a request in flight forever (neither
    // onload nor onerror fires) — the slot froze at 99% with no recovery. But a
    // flat wall-clock timeout is wrong: a legit 50MB clip on ~1Mbps LTE takes
    // ~400s of genuine progress and would be killed mid-transfer, then re-queue
    // and 408 again until MAX_ATTEMPTS drops it. So watch for a STALL (no bytes
    // flowing) rather than total elapsed time. Settle a stall as 408 (classified
    // transient → offline queue) so the recording survives and retries.
    const STALL_MS = 30000;          // abort if no upload progress for 30s
    const ABS_MAX_MS = 10 * 60000;   // absolute backstop: 10 min even if dribbling
    let lastTick = Date.now();
    const startedAt = lastTick;
    let settled = false;
    const clearWatch = () => { if (watchdog) { clearInterval(watchdog); watchdog = null; } };
    const fail408 = (why) => {
      if (settled) return; settled = true; clearWatch();
      try { xhr.upload.onprogress = null; xhr.onload = null; xhr.onerror = null; xhr.abort(); } catch { /* already settled */ }
      const e = new Error(why); e.httpStatus = 408; reject(e);
    };
    let watchdog = setInterval(() => {
      const now = Date.now();
      if (now - lastTick > STALL_MS) fail408('Upload stalled — no progress');
      else if (now - startedAt > ABS_MAX_MS) fail408('Upload timed out');
    }, 3000);

    xhr.upload.onprogress = (e) => {
      lastTick = Date.now();
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (settled) return; settled = true; clearWatch();
      if (xhr.status >= 200 && xhr.status < 300) {
        const publicUrl = `${SUPA_URL}/storage/v1/object/public/form-videos/${path}`;
        resolve({ publicUrl });
      } else {
        // Surface the server's REAL reason (e.g. "Payload too large", "new row
        // violates row-level security") instead of a bare status code — the
        // opaque "Upload failed: 413" is exactly what hid Ron's outage.
        console.error('Upload response:', xhr.status, xhr.responseText);
        let serverMsg = '';
        if (xhr.responseText) { try { const j = JSON.parse(xhr.responseText); serverMsg = j?.message || j?.error || ''; } catch { serverMsg = xhr.responseText.slice(0, 200); } }
        const err = new Error(serverMsg ? `${serverMsg} (${xhr.status})` : `Upload failed: ${xhr.status}`);
        err.httpStatus = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => { if (settled) return; settled = true; clearWatch(); reject(new Error('Upload network error')); };
    xhr.send(blob); // Send raw blob, NOT FormData
  });

  const handleVideoUpload = async (e, exIdx, exMeta = null) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    // Demo mode is a public marketing surface — never write to production
    // storage. Other portal paths (handleComplete, plans-load, presence) gate
    // on demoMode already; the upload handler had been the one omission.
    if (demoMode) {
      // A demo surface that wants the clip (the /try sandbox) gets it and
      // takes over; nothing is written to production storage either way. This
      // is what lets /try show the REAL portal rather than a hand-written copy
      // of it that drifts — the copy had a red play button on every row, a
      // greeting the portal does not use, and its exercise rows inverted.
      if (onFilmSet) { onFilmSet(file, exMeta || {}, exIdx); return; }
      toast('Demo mode — uploads disabled', 'info');
      return;
    }

    // Re-entrancy guard: the Record/Replace inputs are disabled while
    // uploading, but a double-tap can fire two change events before React
    // re-renders the disabled state. Without this, two uploads race on the
    // same exercise slot. Synchronous read of the latest slot state.
    if (fv[exIdx]?.uploading) return;

    // Reject non-video and empty files BEFORE we build a preview/queue entry.
    // accept="video/*" filters the picker but a user can still hand-pick "all
    // files" on some Androids, or a 0-byte capture can come back from a failed
    // recording. An empty/garbage blob otherwise sails through compression and
    // upload and lands as an unplayable object the coach can't review.
    const looksVideo = (file.type || '').startsWith('video/') || /\.(mp4|mov|m4v|webm|ogg|3gp|avi|mkv)$/i.test(file.name || '');
    if (!file.size || !looksVideo) {
      toast(!file.size ? 'That video is empty — try recording again.' : 'That file isn\'t a video. Record a clip or pick a video from your library.', 'error', { ttl: 7000 });
      return;
    }

    // Hard cap. Above this size the source is too long to encode reliably
    // (compress time = source duration), browser memory pressure spikes, and
    // any compression-fallback path would blow past the Supabase bucket limit.
    const MAX_INPUT_BYTES = 750 * 1024 * 1024;
    if (file.size > MAX_INPUT_BYTES) {
      const sizeMB = Math.round(file.size / 1e6);
      toast(`Video is ${sizeMB}MB — too large. Max 750MB.\nRecord a shorter clip and try again.`, 'error', { ttl: 8000 });
      return;
    }

    // Warn only when we can't compress AND the file is huge — at that point
    // the trainee is shipping the raw blob and may run into Supabase upload
    // limits / slow networks. confirmToast is async so the iOS video element
    // doesn't stall on a sync window.confirm.
    // Supabase rejects any object >= 50MB (free-plan project-wide cap, 413).
    // If this browser can't compress, an oversized file is GUARANTEED to fail
    // server-side — block it here with the real reason instead of letting the
    // upload die later as a cryptic "Load failed" (Ron, 2026-06-12).
    const SUPA_MAX_BYTES = 50 * 1024 * 1024;
    const compressionAvailable = canCompressVideo();
    if (!compressionAvailable && file.size > SUPA_MAX_BYTES) {
      const sizeMB = Math.round(file.size / 1e6);
      toast(`Video is ${sizeMB}MB — over the 50MB upload limit, and this browser can't compress it.\nRecord a shorter clip (~30 seconds) or lower the camera resolution in Settings > Camera.`, 'error', { ttl: 9000 });
      return;
    }

    // If a previously-recorded clip on this slot was queued for offline
    // upload but the user just re-recorded, drop the old blob from IDB so it
    // doesn't upload pointlessly later.
    const prevPending = fv[exIdx]?.pendingBlobId;
    if (prevPending) {
      try { await removeBlob(prevPending); } catch {}
    }

    const previewUrl = URL.createObjectURL(file);
    setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], has:true, videoUrl:previewUrl, fileName:file.name, uploading:true, uploaded:false, compressProgress:0, uploadProgress:0, pendingBlobId:null, videoError:false}; return n; });

    // Hoist these so the catch handler (offline-queue path) can read them.
    // Inside-try-only declarations made the enqueueBlob() call silently
    // throw a ReferenceError, which was caught by the inner try/catch and
    // dropped the trainee's recording on the floor.
    let uploadBlob = file;
    let ext = file.name.match(/\.[^.]+$/)?.[0] || '.mp4';
    let contentType = file.type || 'video/mp4';
    let path = null;

    try {
      // iPhone hands us .MOV / video/quicktime. Chrome/Edge on desktop refuse
      // to play that MIME, so the trainer review screen shows a black player.
      // Most iPhone web-uploads are H.264-in-MOV, which Chrome plays fine if
      // we just label it video/mp4. HEVC clips will still fail (no transcode
      // here) — they fall through to the FormVideoPlayer error fallback.
      if (/quicktime/i.test(contentType) || /\.mov$/i.test(ext)) {
        ext = '.mp4';
        contentType = 'video/mp4';
      }

      // Compress if the browser exposes MediaRecorder + captureStream and the
      // file is large enough to be worth re-encoding. Failure here is non-fatal
      // — fall through and upload the original blob so the trainee isn't stuck.
      const shouldCompress = compressionAvailable && file.size > 15 * 1024 * 1024;

      if (shouldCompress) {
        setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], phase:'compress'}; return n; });
        // Compression runs at REAL TIME (playbackRate=1 — speeding it up bakes
        // fast-motion into the output), so a 120s clip needs ~120s to encode. A
        // fixed 40s cap was aborting every long clip → it shipped the
        // uncompressed original → 413 over the 50MB cap (this is exactly what
        // locked Ron out). Use a STALL watchdog instead: abort only when the
        // encoder makes NO progress for a while (a genuine hang — e.g. HEVC that
        // never fires onloadedmetadata), with a generous absolute backstop. A
        // long-but-progressing encode is allowed to finish.
        const runCompress = async (cOpts) => {
          const ctrl = new AbortController();
          let lastTick = Date.now(); const startedAt = lastTick; let watchdog;
          const STALL_MS = 30_000;       // no progress for 30s ⇒ encoder hung
          const ABS_MAX_MS = 240_000;    // absolute backstop (~120s clip + margin)
          try {
            const result = await Promise.race([
              compressVideoChrome(file, pct => {
                lastTick = Date.now();
                setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], compressProgress:pct}; return n; });
              }, ctrl.signal, cOpts),
              new Promise((_, rej) => {
                watchdog = setInterval(() => {
                  const now = Date.now();
                  if (now - lastTick > STALL_MS || now - startedAt > ABS_MAX_MS) { ctrl.abort(); rej(new Error('compression stalled')); }
                }, 3000);
              }),
            ]).finally(() => { clearInterval(watchdog); });
            ctrl.abort();                  // success: ensure no listeners/loops linger
            return result;
          } catch (e) { ctrl.abort(); throw e; }
        };
        try {
          let result = await runCompress({});
          // If the encoder ignored the bitrate hint (some iOS builds do) and the
          // result is still over the cap, retry once at a smaller frame + tighter
          // budget — resolution is always respected, so this reliably fits.
          if (result.blob.size > SUPA_MAX_BYTES) {
            console.warn(`Compressed to ${Math.round(result.blob.size/1e6)}MB — retrying at lower resolution`);
            setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], compressProgress:0}; return n; });
            result = await runCompress({ maxWidth: 640, targetMb: 30 });
          }
          uploadBlob = result.blob;
          ext = result.ext;
          contentType = result.blob.type;
        } catch (compressErr) {
          console.warn('Compression failed/timed out, uploading original:', compressErr);
          setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], compressProgress:100}; return n; });
        }
      }

      // FINAL size gate — whatever we're about to ship (compressed or original
      // after a compression failure/timeout) must clear the 50MB server cap,
      // or Supabase 413s it. Fail loud and early with the real reason.
      if (uploadBlob.size > SUPA_MAX_BYTES) {
        const sizeMB = Math.round(uploadBlob.size / 1e6);
        URL.revokeObjectURL(previewUrl);
        setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:false, has:false, videoUrl:null, uploadError:`${sizeMB}MB > 50MB limit`}; return n; });
        toast(`Video is ${sizeMB}MB after processing — over the 50MB upload limit.\nKeep the clip under ~2 minutes and try again.`, 'error', { ttl: 9000 });
        return;
      }

      // clientId scopes the storage path AND the RLS folder check. If it's ever
      // missing we'd write to "undefined/..." — an orphan no RLS-scoped reader
      // (coach review included) can ever see. Refuse rather than create one.
      if (!clientId) {
        URL.revokeObjectURL(previewUrl);
        setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:false, has:false, videoUrl:null, uploadError:'missing athlete id'}; return n; });
        toast('Could not identify your account — sign out and back in, then retry.', 'error', { ttl: 8000 });
        return;
      }

      // Upload with progress (XHR for real-time %, falls back to Supabase client)
      setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], phase:'upload', compressProgress:100}; return n; });
      // Collision-proof filename: ts alone collides if two uploads on the same
      // slot land in the same millisecond (double-tap); a short random suffix
      // guarantees uniqueness so neither silently overwrites the other.
      const ts = Date.now();
      const rand = Math.floor(Math.random() * 1e6).toString(36);
      path = `${clientId}/${ts}-${rand}-form${ext}`;

      let publicUrl;
      // Tell SwUpdateBanner an upload is in flight so its idle timer doesn't
      // reload the page mid-upload (no input events + no live stream during a
      // PUT would otherwise read as "stepped away") and drop the clip before it
      // lands in storage or the IDB blob queue. Cleared in the finally below.
      try { window.__expoUploadInFlight = (window.__expoUploadInFlight | 0) + 1; } catch { /* noop */ }
      try {
        const result = await uploadWithProgress(uploadBlob, path, contentType, pct => {
          setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploadProgress:pct}; return n; });
        });
        publicUrl = result.publicUrl;
      } catch (xhrErr) {
        // A definite client-error status (4xx) is PERMANENT — re-throw without
        // attempting the fallback, so the outer catch surfaces it instead of
        // burning a second upload and then queueing a doomed retry.
        if (xhrErr?.httpStatus >= 400 && xhrErr.httpStatus < 500 && ![408, 429].includes(xhrErr.httpStatus)) throw xhrErr;
        // Otherwise (network/5xx/unknown): fall back to the Supabase JS client
        // (no progress bar but uses the session + its own retry semantics).
        console.warn('XHR upload failed, falling back to Supabase client:', xhrErr);
        const { error } = await supabase.storage.from('form-videos').upload(path, uploadBlob, { upsert: true, contentType });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('form-videos').getPublicUrl(path);
        // Never save a phantom success: if the URL is missing, throw into the
        // catch (which queues/retries) instead of marking uploaded with null.
        if (!urlData?.publicUrl) throw new Error('no public url after upload');
        publicUrl = urlData.publicUrl;
      } finally {
        try { window.__expoUploadInFlight = Math.max(0, (window.__expoUploadInFlight | 0) - 1); } catch { /* noop */ }
      }

      // Switch the video element to the cloud URL BEFORE revoking the preview
      // blob — otherwise the next replay would try to re-fetch a dead blob URL
      // and the video would silently disappear from the player.
      setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:true, has:true, videoUrl:publicUrl, cloudUrl:publicUrl, compressProgress:100, uploadProgress:100, uploadError:null, pendingBlobId:null}; return n; });
      URL.revokeObjectURL(previewUrl);
    } catch(err) {
      console.error('Video upload error:', err);
      // If we appear to be offline (or this is a network-shaped error), persist
      // the blob to IndexedDB and let the blob queue replay it once connectivity
      // returns. Workout flow continues — the user doesn't have to re-record.
      const offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
      const msg = err?.message || 'Upload failed';
      // Classify transient (worth queuing for retry) vs permanent (queuing just
      // loops forever, then drops silently). Prefer the HTTP status when we have
      // one: 4xx (except 408/429) is permanent — payload-too-large, RLS denial,
      // bad request will NEVER succeed on retry. Only queue genuine network loss
      // or server-side/transient codes. Message-regex is the last resort, and we
      // exclude phrases that are definitely permanent even when wrapped in a
      // fetch-shaped error (e.g. supabase-js "Failed to fetch" masking a 413).
      const status = err?.httpStatus ?? err?.status ?? err?.statusCode;
      // Decide PERMANENT-by-message first: these phrases will never succeed on
      // retry. 'invalid' alone matched transient framings ("invalid request"),
      // so it's scoped. 'permission denied' kept in lockstep with blobQueue.js
      // (PERMANENT_ERROR_RE) — a divergence there let a recoverable-looking 403
      // get queued here, then dropped on the next drain (a 2-hop silent loss).
      const permanentByMsg = /payload too large|exceeded|maximum allowed|row-level security|permission denied|invalid (jwt|token|signature|mime)|not allowed|mime type/i.test(msg);
      // Auth-expiry is RECOVERABLE (re-sign-in) — treat it as transient so the
      // recording is queued and survives, and prompt the athlete instead of
      // dropping it with an opaque 403. A bare 403 (server-side expired token,
      // generic "Forbidden") is auth-recoverable UNLESS the body names a
      // permanent cause (RLS/payload/mime) — otherwise it would fall through to
      // permanentByStatus and be DROPPED, the exact regression Round 2 caught.
      const isAuth = !!err?.authExpired || status === 401 || (status === 403 && !permanentByMsg);
      const permanentByStatus = !isAuth && typeof status === 'number' && status >= 400 && status < 500 && ![408, 429].includes(status);
      const transientByMsg = /network|fetch|timeout|abort|offline|load failed/i.test(msg);
      const looksTransient = isAuth || (!permanentByStatus && !permanentByMsg && (offline || (typeof status === 'number' ? status >= 500 || status === 408 || status === 429 : transientByMsg)));
      if (looksTransient) {
        try {
          const blobId = newBlobId();
          await enqueueBlob({ id: blobId, blob: uploadBlob, contentType, storagePath: path });
          if (isAuth) toast('Session expired — sign back in. Your video is saved and will upload once you do.', 'warn', { ttl: 9000 });
          // Keep previewUrl alive — it's the only way to play the recording
          // until the blob queue uploads it. Browser GC reclaims it when the
          // tab closes or when we revoke after a successful drain.
          setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:false, has:true, videoUrl:previewUrl, cloudUrl:null, pendingBlobId:blobId, compressProgress:100, uploadProgress:0, uploadError:null}; return n; });
          return;
        } catch (e2) {
          // IndexedDB itself failed (private browsing, quota exhausted, IDB
          // disabled) — we can't persist the blob for later retry. This is the
          // one path that would otherwise SILENTLY lose the recording with a
          // misleading "network" toast. Surface it as a STORAGE problem (not a
          // connectivity blip), keep the in-memory preview alive so the athlete
          // can still play it and retry this session, and route it through the
          // persistent save-error card — never just console.error and wipe it.
          console.error('Blob queue enqueue failed:', e2);
          emitSaveError({ key: 'form_video', op: 'storage-unavailable', msg: 'Could not save your video on this device. Free up storage (or exit private browsing) and upload again.' });
          // Keep previewUrl + has:true so the clip stays visible/playable; mark
          // the error so the slot offers re-upload instead of vanishing. has is
          // false for finish() purposes via cloudUrl/pendingBlobId both null —
          // the workout won't record a phantom video, but the athlete keeps the
          // recording on screen to retry before leaving the page.
          setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:false, has:false, videoUrl:previewUrl, cloudUrl:null, pendingBlobId:null, uploadError:'Not saved — device storage full. Tap Replace to try again.'}; return n; });
          toast('Could not save your video on this device. Free up storage and upload it again.', 'error', { ttl: 9000 });
          return;
        }
      }
      URL.revokeObjectURL(previewUrl);
      setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:false, has:false, videoUrl:null, uploadError:msg}; return n; });
      toast(`Video upload failed: ${msg}\nTry again or pick a shorter clip.`, 'error', { ttl: 7000 });
    }
  };

  const finish = () => {
    // In-flight guard: two taps in the same tick both ran finish() to completion
    // (setLg(null) only unmounts on the next render), minting two workoutIds → two
    // client_workouts rows + two pushes + a double session decrement. Once armed we
    // unmount via onComplete, so no reset is needed.
    if (submittingRef.current) return;
    submittingRef.current = true;
    const workoutId = uid();
    // Carry pendingBlobId on each form_video entry so the blob queue can find
    // and patch this workout once the upload eventually succeeds.
    const formVideos = fv.map(f => ({
      has: f.has,
      note: f.note,
      fileName: f.fileName || null,
      cloudUrl: f.cloudUrl || null,
      pendingBlobId: f.pendingBlobId || null,
    }));
    // Attach the now-known workout id to each queued blob, then poke the
    // drainer in case we're online.
    fv.forEach((f, i) => {
      if (f.pendingBlobId) {
        attachWorkout(f.pendingBlobId, workoutId, i).catch(() => {});
      }
    });
    if (fv.some(f => f.pendingBlobId)) drainBlobs();
    // Capture per-session exercise substitutions so trainer review shows
    // what the trainee actually did, not just what was prescribed. The
    // workout exercise.title reflects the swap when one happened, and
    // `substitution` carries the original eid + library id of the swap-in
    // for downstream signals (which equipment is bottlenecking which
    // programs, etc.).
    const finishedAt = new Date().toISOString();
    onComplete({
      // planId identifies WHICH plan this is, where the name cannot: two couple
      // members can hold plans with the same name and the same day names
      // (audit 08-22 #31).
      id: workoutId, clientId, planId: plan.id || null, planName: plan.name, dayName: day.name,
      week: weekNum + 1, date: finishedAt, notes, autoregulation: checkin,
      formVideos,
      exercises: day.ex.map((ex, i) => {
        const sub = substitutions[ex.eid];
        const prescribedTitle = EX[ex.eid]?.t || '?';
        // A per-week reps cell can hold a FULL "N×M" prescription (e.g. "2x10 e").
        // In that case it already carries the set count — prepending the flat `ex.s`
        // would save "3x2x10 e" and show the athlete a wrong record. Mirror the
        // rxOf / SetsRepsHero combined-guard so History matches the live logger.
        const wkReps = String((ex.wk && ex.wk[weekNum]) ?? '').trim() || ex.r;
        const wkSets = (ex.wkS && ex.wkS[weekNum]) || ex.s;
        // A blank prescription (coach left sets+reps empty) persists as '' — never
        // a fabricated "x"/"3x8-12" written as if it were prescribed. (empty = empty)
        const prescribed = /[x×]/i.test(String(wkReps)) ? String(wkReps)
          : ((String(wkSets ?? '').trim() || String(wkReps ?? '').trim()) ? `${wkSets}x${wkReps}` : '');
        return {
          eid: ex.eid,
          title: sub ? sub.title : prescribedTitle,
          prescribed,
          // Blank any set still carrying the untouched-prefill mark: the athlete
          // never actually performed it, so it must save empty (not as a number
          // they'll see resurface next week as a phantom "last week" ghost).
          // `|| []` matching the guarded derefs at ~1435 / ~1749: if the open
          // day changes underneath the logger (portalVis arrives over realtime
          // and re-filters visPlans, shifting the flat `lg` index), allSets can
          // be shorter than the newly-targeted day's exercise list. Unguarded,
          // this threw at the exact moment of committing — white screen, and the
          // athlete's whole session lost on the last tap.
          sets: (allSets[i] || []).map(s => (s.prefill && !s.done) ? { reps: '', load: '', rpe: '', done: false } : s),
          substitution: sub ? {
            from: prescribedTitle,
            fromEid: ex.eid,
            to: sub.title,
            toLibId: sub.id,
            at: finishedAt,
          } : null,
        };
      }),
    });
    // Workout committed — drop the in-progress draft. The trainee can start a
    // fresh log next time without seeing stale set values from this session.
    // Exit (← Exit / browser nav) intentionally KEEPS the draft so a trainee
    // can resume the same day mid-workout.
    clearSessionDraft();
  };

  // Navigation helpers
  const totalSteps = wuCount + groupCount; // warmups + groups
  const stepIndex = typeof step === 'string' && step.startsWith('wu') ? parseInt(step.slice(2)) :
    step === 'end' ? totalSteps : step === 'checkin' ? wuCount : wuCount + step;
  const goNext = () => {
    window.scrollTo(0,0);
    if (typeof step === 'string' && step.startsWith('wu')) {
      const wi = parseInt(step.slice(2));
      const nd = [...wuDone]; nd[wi] = true; setWuDone(nd);
      if (wi + 1 < wuCount) setStep('wu' + (wi + 1));
      else setStep('checkin');
    }
    else if (step === 'checkin') setStep(0);
    else if (typeof step === 'number' && step < groupCount - 1) setStep(step + 1);
    else setStep('end');
  };
  // True on the very first step of the session, where Back has nowhere to go.
  // (A daily day has no warm-ups at all, so its Check-In is the first step.)
  const atFirstStep = (typeof step === 'string' && step.startsWith('wu') && parseInt(step.slice(2)) === 0)
    || (step === 'checkin' && wuCount === 0);
  const goPrev = () => {
    window.scrollTo(0,0);
    if (typeof step === 'string' && step.startsWith('wu')) {
      const wi = parseInt(step.slice(2));
      if (wi > 0) setStep('wu' + (wi - 1));   // first step: stay put — EXIT is the way out
    }
    else if (step === 0) setStep('checkin');
    else if (step === 'checkin') {
      // Back from the check-in: into the last warmup if any, else exit.
      if (wuCount > 0) setStep('wu' + (wuCount - 1));
      // no warm-ups: this IS the first step, so stay put
    }
    else if (typeof step === 'number') setStep(step - 1);
    else if (step === 'end') setStep(groupCount - 1);
  };

  // Progress bar with EXPO icon. The "↻ Resumed" pill (orange) appears for
  // ~6s after mount IF a draft was restored, so the trainee notices that the
  // logged state isn't a glitch but their own prior session.
  const [showResumedPill, setShowResumedPill] = useState(!!_restoredSession);
  useEffect(() => {
    if (!showResumedPill) return;
    const t = setTimeout(() => setShowResumedPill(false), 6000);
    return () => clearTimeout(t);
  }, [showResumedPill]);
  const bar = <div style={{padding:'calc(10px + env(safe-area-inset-top)) 16px 10px',background:C.sf,borderBottom:`1px solid ${C.bd}`,position:'sticky',top:0,zIndex:10}}>
    <div style={{display:'flex',alignItems:'center',marginBottom:6,position:'relative',minHeight:40}}>
      <EXPOMark theme="dark" height={36} style={{flexShrink:0}} />
      <span style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',fontFamily:FN,fontSize:12,color:C.tm,whiteSpace:'nowrap',lineHeight:1}}>{day.name} · W{weekNum+1}</span>
      {/* Right cluster — one flex box anchored right with marginLeft:'auto',
          so ← Exit sits on the RIGHT EDGE always (Ohad). Previously only the
          autosave pill carried the auto-margin, so before the first autosave
          the Exit button hugged the logo on the left. */}
      <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        {(lastSavedAt || pendingBlobs > 0 || sessionAutosave.status === 'saving' || sessionAutosave.status === 'error') && (
          <span title={pendingBlobs > 0 ? `${pendingBlobs} video${pendingBlobs===1?'':'s'} waiting to upload` : (sessionAutosave.status === 'error' ? 'Last save failed — your edits are not safe yet' : 'Session saved locally')} style={{color:sessionAutosave.status==='error'?C.rd:pendingBlobs>0?C.or:C.gn,fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',gap:5,lineHeight:1}}>
            {/* Glyphs (✓/⚠/…) aren't in JetBrains Mono → they render in a
                fallback font with a taller baseline. Splitting the mark into
                its own flex item lets alignItems:center line it up with the
                mono digits instead of floating high. (Ohad — OCD timer align) */}
            {/* "SAVE FAILED" used to sit HERE, and it is wide. The day label
                beside it is absolutely centred on the whole bar, so it is not
                in the flow and cannot be pushed aside - at 390 the two printed
                on top of each other and neither could be read. A failed save is
                also the most important thing on this screen, so it gets its own
                full-width strip below instead of a corner it does not fit. */}
            {sessionAutosave.status === 'saving' ? <span>… SAVING</span> :
             sessionAutosave.status === 'error' ? <span aria-hidden="true" style={{width:7,height:7,borderRadius:'50%',background:'#E0574A',display:'inline-block'}} /> :
             lastSavedAt ? <span style={{lineHeight:1}}>✓</span> : ''}
            {pendingBlobs > 0 && <span style={{opacity:0.85}}>· ↑{pendingBlobs}</span>}
          </span>
        )}
        {showResumedPill && <span title="Restored from your last session" style={{color:C.or,fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.1em',whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',gap:5,lineHeight:1}}><span style={{lineHeight:1}}>↻</span><span style={{lineHeight:1}}>{tt("RESUMED")}</span></span>}
        {/* Bnei Herzliya team crest — readable size, vertically centered. */}
        {branch === 'Bnei Herzliya' && <img src="/bnei-herzliya-logo-w.png" alt="Bnei Herzliya" style={{height:40,width:'auto',objectFit:'contain',flexShrink:0}} />}
        <button onClick={onBack} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',padding:0,display:'inline-flex',alignItems:'center',gap:5,lineHeight:1,whiteSpace:'nowrap'}}><span style={{lineHeight:1}}>←</span><span style={{lineHeight:1}}>{tt("EXIT")}</span></button>
      </div></div>
    {sessionAutosave.status === 'error' && (
      <div role="status" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,margin:'0 0 8px',padding:'6px 10px',background:'rgba(224,87,74,0.12)',border:'1px solid rgba(224,87,74,0.55)',color:'#E0574A',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.08em'}}>
        <span>SAVE FAILED — YOUR LAST EDITS ARE NOT SAVED YET</span>
      </div>
    )}
    <div style={{display:'flex',gap:2}}>
      {/* Warm-up dots (orange) + Exercise dots (blue/green) */}
      {warmup.map((_,i) => <div key={'wu'+i} style={{flex:1,height:3,borderRadius:0,background:stepIndex>i?C.or:stepIndex===i?'rgba(255,165,2,0.502)':C.bd}} />)}
      {/* Group dots (one per superset group or solo exercise) */}
      {groups.map((_,i) => <div key={'g'+i} style={{flex:1,height:3,borderRadius:0,background:stepIndex>wuCount+i?C.gn:stepIndex===wuCount+i?C.ac:C.bd}} />)}
    </div>
    <div style={{fontSize: groups[step]?.superset ? 11 : 10, color: groups[step]?.superset ? C.ac : C.td, fontWeight: groups[step]?.superset ? 700 : 400, letterSpacing: groups[step]?.superset ? '0.06em' : 0, fontFamily:FN, marginTop:4, textAlign:'center'}}>
      {typeof step==='string'&&step.startsWith('wu') ? `Warm-Up ${parseInt(step.slice(2))+1}/${wuCount}` :
       step==='checkin' ? 'Check-In' :
       step==='end' ? 'Complete' :
       groups[step]?.superset ? `Superset ${groups[step].superset} · Group ${step+1}/${groupCount}` :
       `Exercise ${step+1}/${groupCount}`}
    </div></div>;

  // ===== WARM-UP STEP =====
  if (typeof step === 'string' && step.startsWith('wu')) {
    const wi = parseInt(step.slice(2));
    // Guard: if the plan was reshaped mid-session (coach removed a warm-up) the
    // athlete can be parked on a now-out-of-range wuN step — warmup[wi] undefined
    // would crash on .vid and blank the logger. Fall back to an empty card.
    const wu = warmup[wi] || {};
    const vid = wu.vid ? ytId(wu.vid) : null;
    const vidShort = wu.vid ? ytIsShort(wu.vid) : false;
    return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
      <div style={{padding:20}}>
        {/* Warm-up screen matches the EXERCISE screen exactly — centred name,
            cyan reps, grey ⏱ tempo — minus find-alternate / set-log grid /
            form-check (warm-ups aren't logged). The top bar already shows
            "Warm-Up i/N", so no body pill. (Ohad) */}
        <h2 style={{margin:'0 0 4px',fontFamily:FN,fontSize:18,textAlign:'center'}}>{wu.t}</h2>
        {(() => {
          // Explicit wu.tempo is the source of truth — the overview warm-up
          // card always reads w.tempo (line ~2774). The bug: the rx branch
          // below ran splitPrescription(wu.rx) and IGNORED wu.tempo, so a
          // warm-up with rx "1X10 E" + tempo "3-4 SEC ECC" showed the tempo
          // on the overview but dropped it in-session. Seed tempo from the
          // explicit field; only fall back to the rx-split remainder.
          // Structured warm-up → pass sets/reps to the shared hero so it renders
          // the same labelled SETS / REPS block as the exercise step (Ohad wants
          // them consistent). rx-only warm-ups pass the combined reps token, which
          // SetsRepsHero splits (or shows plainly if it can't).
          let heroSets = '', heroReps = '', tempo = wu.tempo || '';
          if (wu.sets || wu.reps) {
            heroSets = wu.sets ?? ''; heroReps = wu.reps ?? '';
          } else {
            const parts = splitPrescription(wu.rx);
            if (parts) { heroReps = parts[0]; if (!tempo) tempo = String(parts[1] || '').replace(/^[\s,]+/, ''); }
            else heroReps = String(wu.rx || '');
          }
          return <>
            {(heroSets || heroReps) && <SetsRepsHero sets={heroSets} reps={heroReps} splitCombined />}
            {tempo && <div style={{fontSize:13,color:TEMPO_COLOR,marginTop:4,display:'flex',alignItems:'center',justifyContent:'center',gap:5,lineHeight:1}}><span style={{fontSize:12,lineHeight:1}}>⏱</span><span style={{lineHeight:1}}>{tempo}</span></div>}
            <div style={{marginBottom:14}} />
          </>;
        })()}
        {/* Coach note for this warm-up (authored in the plan editor's
            warm-up expand panel). */}
        {wu.note && <div style={{background:'transparent',border:`1px solid ${C.cardBd}`,borderLeft:`3px solid ${C.cardBd}`,borderRadius:0,padding:12,marginBottom:14}}>
          <div style={{fontSize:10,fontFamily:FN,color:C.td,marginBottom:6,fontWeight:700,letterSpacing:'0.18em'}}>{tt("EXERCISE NOTE")}</div>
          <div dir="auto" style={{fontSize:13,color:C.tx,lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word',direction:/[֐-׿]/.test(wu.note||'')?'rtl':'ltr',fontFamily:/[֐-׿]/.test(wu.note||'')?FH:undefined}}>{wu.note}</div>
        </div>}
        {vid ? <div style={vidShort
          ? {marginTop:16,marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'9/16',maxWidth:300,marginLeft:'auto',marginRight:'auto',background:'#000',border:`1px solid ${C.cardBd}`}
          : {marginTop:16,marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'var(--c-sf)',border:`1px solid ${C.cardBd}`}}>
          <iframe src={`https://www.youtube.com/embed/${vid}`} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen/></div>
          : wu.vid && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(wu.vid) ? <div style={{marginTop:16,marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'#000',border:`1px solid ${C.cardBd}`}}>
          <video src={wu.vid} controls playsInline style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}/></div>
          : wu.vid && /(photos\.app\.goo\.gl|photos\.google\.com)/i.test(wu.vid) ? <GooglePhotosEmbed url={wu.vid} />
          : wu.vid && /lh3\.googleusercontent\.com/i.test(wu.vid) ? <div style={{marginTop:16,marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'#000',border:`1px solid ${C.cardBd}`}}>
          <video src={wu.vid} controls playsInline style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}/></div>
          : <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:30,marginBottom:14,textAlign:'center',color:C.tm}}>{tt("No video for this exercise")}</div>}
        <div style={{display:'flex',gap:8}}>
          {!atFirstStep && <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>← Back</button>}
          <button onClick={goNext} style={{flex:2,padding:14,borderRadius:0,border:`1px solid ${C.or}`,background:'transparent',color:C.or,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>
            {wi === wuCount - 1 ? 'Start Check-In →' : 'Next Warm-Up →'}</button></div>
      </div></div>;
  }

  // ===== CHECK-IN (readiness / autoregulation) =====
  if (step === 'checkin') {
    const lbl = { fontSize:10, fontFamily:FN, color:C.tx, letterSpacing:'0.18em', fontWeight:700, marginBottom:8 };
    // Options render as the underline-input ENTRY material (not solid boxes),
    // matching the portal's control-material system. Each option's underline
    // carries a FAINT good→bad severity tint (25%) so the direction is
    // perceptible without shouting; the selected option alone brightens to the
    // full colour (label + 2px underline). PAIN·NONE (green) can never read
    // like PAIN·HIGH (red). All scales put good on the RIGHT — PAIN reads
    // best-first, SLEEP/ENERGY worst-first, so `goodFirst` flips the ramp.
    const RAMP = ['#35C36A', '#F2CE1E', '#F0862A', '#E23B3B']; // best → worst (yellow/orange/red all distinct)
    const scale = (field, opts, goodFirst) => (
      <div style={{display:'flex',gap:14}}>
        {opts.map(([v,l],idx) => {
          const on = checkin[field] === v;
          const sev = goodFirst ? RAMP[idx] : RAMP[opts.length-1-idx];
          return <button key={v} onClick={()=>setCheckin(c=>({...c,[field]: on ? '' : v}))}
            style={{flex:1,padding:'9px 0',background:'transparent',border:'none',borderBottom:`${on?2:1}px solid ${on?sev:sev+'40'}`,color:on?sev:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.04em',cursor:'pointer',borderRadius:0,transition:'color .12s, border-color .12s'}}>{l}</button>;
        })}
      </div>
    );
    return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
      <div style={{padding:20}}>
        <h2 style={{margin:'0 0 4px',fontFamily:FN,fontSize:18,textAlign:'center'}}>{tt("Readiness Check-In")}</h2>
        <div style={{fontSize:13,color:C.tm,textAlign:'center',marginBottom:24}}>How are you feeling today? <span style={{color:C.td}}>(optional)</span></div>
        <div style={{marginBottom:18}}><div style={lbl}>{tt("PAIN")}</div>{scale('pain',[['high','HIGH'],['moderate','MODERATE'],['mild','MILD'],['none','NONE']], false)}</div>
        <div style={{marginBottom:18}}><div style={lbl}>{tt("SLEEP")}</div>{scale('sleep',[['poor','POOR'],['ok','OK'],['good','GOOD'],['great','GREAT']], false)}</div>
        <div style={{marginBottom:26}}><div style={lbl}>{tt("ENERGY")}</div>{scale('energy',[['low','LOW'],['ok','OK'],['good','GOOD'],['high','HIGH']], false)}</div>
        <div style={{display:'flex',gap:8}}>
          {!atFirstStep && <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>← Back</button>}
          <button onClick={goNext} style={{flex:2,padding:14,borderRadius:0,border:`1px solid ${C.ac}`,background:'transparent',color:C.ac,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>Start Workout →</button>
        </div>
      </div></div>;
  }

  // ===== FINISH =====
  // Detect new PRs in this session — for each prescribed exercise, compute
  // this session's top completed-set load and compare to the trainee's prior
  // best for the same exercise (or for the swap-in if a swap happened).
  // Surfaces as a celebration list above the notes textarea.
  const newPRs = (() => {
    const out = [];
    for (let i = 0; i < day.ex.length; i++) {
      const ex = day.ex[i];
      const sets = (allSets[i] || []).filter(s => s.done && s.load !== '' && s.load != null)
        .map(s => parseFloat(s.load) || 0).filter(n => n > 0);
      if (sets.length === 0) continue;
      const sessionTop = Math.max(...sets);
      const sub = substitutions[ex.eid];
      const stableId = sub ? (sub.id || `swap:${(sub.title||'').toLowerCase()}`) : ex.eid;
      const displayTitle = sub ? sub.title : (EX[ex.eid]?.t || '?');
      // Title key for the eid-OR-title match below: a plan rebuild rotates eids
      // while the title is stable; matching by eid alone made every exercise a
      // false "FIRST LOG" debut after a rebuild and missed real PRs.
      const prTitleKey = (sub ? sub.title : (EX[ex.eid]?.t || '')).toLowerCase().trim();
      // Find prior best across all this trainee's prior workouts.
      let priorBest = 0;
      for (const w of (priorWorkouts || [])) {
        for (const px of (w.exercises || [])) {
          const pSub = px.substitution;
          const pStableId = pSub ? (pSub.toLibId || `swap:${(pSub.to||'').toLowerCase()}`) : px.eid;
          const pTitleKey = (pSub ? pSub.to : px.title || '').toLowerCase().trim();
          if (pStableId !== stableId && !(prTitleKey && pTitleKey === prTitleKey)) continue;
          for (const s of (px.sets || [])) {
            if (!s.done) continue;
            const v = parseFloat(s.load) || 0;
            if (v > priorBest) priorBest = v;
          }
        }
      }
      if (sessionTop > priorBest && priorBest > 0) {
        out.push({ title: displayTitle, prev: priorBest, now: sessionTop, delta: sessionTop - priorBest });
      } else if (sessionTop > 0 && priorBest === 0) {
        // First time logging this exercise — count as a debut, not a PR.
        out.push({ title: displayTitle, prev: 0, now: sessionTop, delta: sessionTop, debut: true });
      }
    }
    return out;
  })();
  if (step === 'end') return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
    <div style={{padding:20,textAlign:'center'}}>
      <EXPOMark theme="dark" height={36} style={{marginBottom:16}} />
      <h2 style={{margin:'0 0 8px',fontFamily:FN,fontSize:22}}>Nice Work! 🎉</h2>
      <div style={{color:C.tm,fontSize:13,marginBottom:20}}>Session complete. Any notes?</div>

      {/* New PRs from this session */}
      {newPRs.length > 0 && (
        <div style={{
          background: 'var(--c-sf)', border: `1px solid ${C.gn}`, borderRadius: 0,
          padding: '12px 14px', marginBottom: 16, textAlign: 'left',
        }}>
          <div style={{
            fontFamily: FN, fontSize: 10, color: C.gn, letterSpacing: 2, fontWeight: 700,
            marginBottom: 8, textAlign: 'center',
          }}>
            {newPRs.some(p => !p.debut) ? `🏆 ${newPRs.filter(p => !p.debut).length} NEW PR${newPRs.filter(p => !p.debut).length === 1 ? '' : 's'}` : `✨ FIRST LOGS`}
            {newPRs.some(p => p.debut) && newPRs.some(p => !p.debut)
              ? ` · ${newPRs.filter(p => p.debut).length} debut${newPRs.filter(p => p.debut).length === 1 ? '' : 's'}` : ''}
          </div>
          {newPRs.map((p, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '4px 0',
              borderBottom: i < newPRs.length - 1 ? `1px solid rgba(46,213,115,0.125)` : 'none',
            }}>
              <span style={{ fontFamily: FB, fontSize: 13, color: C.tx, fontWeight: 600 }}>{p.title}</span>
              <span style={{ fontFamily: FN, fontSize: 12, color: C.gn, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {p.debut ? `${p.now}kg` : `${p.prev}kg → ${p.now}kg (+${p.delta})`}
              </span>
            </div>
          ))}
        </div>
      )}

      <textarea dir="auto" value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did it feel? Pain? Modifications?" style={{...bi,minHeight:120,resize:'vertical',marginBottom:16,textAlign:'center'}}/>
      {fv.some(f => f.uploading) ? (
        <button style={{width:'100%',padding:16,borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'wait',opacity:0.6}}>⏳ Video uploading...</button>
      ) : (
        <button onClick={finish} style={{width:'100%',padding:16,borderRadius:0,border:`1px solid ${C.gn}`,background:'transparent',color:C.gn,fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>✓ Complete Workout</button>
      )}
      {!atFirstStep && <button onClick={goPrev} style={{width:'100%',padding:12,border:'none',background:'transparent',color:C.tm,cursor:'pointer',marginTop:8}}>← Back</button>}
    </div></div>;

  // ===== EXERCISE STEP (single exercise OR grouped superset) =====
  // A thin/empty day (name-only Drive import, 0 exercises) has no groups, so
  // groups[step] is undefined. Returning null stranded the athlete on a blank
  // screen with no way out — render an EXIT affordance instead.
  const group = groups[step];
  if (!group) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 18 }}>
      <div style={{ fontFamily: FN, fontSize: 12, color: C.tm, letterSpacing: '0.08em', lineHeight: 1.6 }}>This day has no exercises yet.<br />Check back once your coach adds them.</div>
      <button onClick={onBack} style={{ background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', padding: '10px 22px', borderRadius: 0 }}>← EXIT</button>
    </div>
  );
  const isSuperset = group.exIdxs.length > 1 && !!group.superset;
  // Stub-fill any unresolved entry instead of silently dropping it — a missing
  // EX[eid] used to make exercises vanish from the day, masquerading as data
  // loss. Now they render with whatever title we can scrape from the eid so
  // the athlete sees the slot exists and can still log against it.
  const groupExs = group.exIdxs.map(idx => {
    const ex = day.ex[idx];
    const d = EX[ex.eid] || { t: `Exercise ${idx + 1}`, vid: '', q: '' };
    return { idx, ex, d };
  });
  if (groupExs.length === 0) return null;

  // Any exercise in the group still uploading?
  const anyUploading = group.exIdxs.some(i => fv[i]?.uploading);

  // Render one complete exercise block: title → prescription → tempo → wave → notes → video → weekly focus → set log → form check
  const renderExerciseBlock = (g, blockIdx) => {
    const { idx: ei, ex, d: dPrescribed } = g;
    // If the trainee swapped this exercise for an alternate this session,
    // overlay the substituted exercise's title/video/cues on top of the
    // prescribed one. ex.eid (the original) is preserved for logging.
    const sub = substitutions[ex.eid];
    const d = sub ? { ...dPrescribed, ...libExerciseToEx(sub) } : dPrescribed;
    // Per-instance video override (set by coach in PlanEditor) wins over the
    // library default. ex.vid === '' means coach explicitly cleared the video
    // for this row → no fallback. Substitution still wins over both — trainee
    // picked it.
    const effectiveVid = sub ? d.vid : ('vid' in ex ? ex.vid : d.vid);
    const vid = ytId(effectiveVid);
    const vidShort = ytIsShort(effectiveVid);
    // Treat an empty-string per-week cell as MISSING (fall back to flat ex.r/ex.s),
    // not as a real value — `??` only catches null/undefined, so a blank week
    // entry ('') rendered '—' instead of the flat prescription. (blank ≠ 0; reps
    // are never a literal '0'.)
    const pickWk = (arr, i, flat) => { const v = arr?.[i]; return (v == null || v === '') ? flat : v; };
    const hw = ex.wk?.length > 0;
    const wr = hw ? pickWk(ex.wk, weekNum, ex.r) : null;
    // Per-week sets array (ex.wkS) mirrors per-week reps (ex.wk). When the
    // coach defined per-week reps but kept sets flat, we still need to render
    // the sets × reps prescription so the trainee sees how many sets to do.
    const wrS = ex.wkS?.length > 0 ? pickWk(ex.wkS, weekNum, ex.s) : null;
    const setsForDisplay = wrS ?? ex.s;
    const repsForDisplay = wr ?? ex.r;
    // `|| {}`: fv is sized at mount, so if the coach adds an exercise to this day
    // mid-session, day.ex grows past fv and fv[ei] is undefined — f.uploaded/.has
    // would then throw and white-screen the workout (allSets[ei] was already
    // guarded for this exact reshape; fv[ei] was the unguarded twin).
    const f = fv[ei] || {};
    // Focus keys are client-scoped (`clientId|plan|day|eid|Wn`); the legacy
    // un-scoped key is kept as a read fallback for pre-scoping notes.
    // Focus is keyed by its SOURCE week N (written during week N to guide week
    // N+1), so the guidance shown on display week D lives under W(D-1). weekNum
    // is 0-based (human week = weekNum+1), so W(D-1) = W${weekNum}. Reading
    // W${weekNum+1} surfaced next-week's focus a week early (Ohad 2026-06-26).
    const fwk = weekNum;                                   // = human week − 1 = the source week
    const fk = `${clientId}|${plan.name}|${day.name}|${ex.eid}|W${fwk}`;
    const wf = weeklyFocus?.[fk] ?? weeklyFocus?.[`${plan.name}|${day.name}|${ex.eid}|W${fwk}`];
    // Unified coach guidance for THIS exercise THIS week: weekly-focus text +
    // last week's annotated form video (the coach's drawings + timestamped
    // comments, replayed via the same player) + the static program note as
    // fallback. Composed from existing data — no migration.
    // ex.nCleared → coach explicitly blanked this program's note; respect it
    // and do NOT fall back to the library cue (d.q).
    const staticNote = (ex.n && ex.n.trim()) || (ex.nCleared ? '' : (d.q && d.q.trim())) || '';
    const lastWeekFb = (() => {
      if (!priorWorkouts || weekNum < 1) return null;
      const pw = priorWorkouts.find(w => w.planName === plan.name && w.dayName === day.name && w.week === weekNum);
      if (!pw) return null;
      // Match by eid first, normalized title second — a plan rebuild can rotate
      // eids while the title stays stable, and without the title fallback the
      // coach's last-week form-video feedback silently vanished. Mirrors the
      // prevWeekSets matcher below.
      const fbTitleKey = (sub ? sub.title : d.t || '').toLowerCase().trim();
      let pidx = (pw.exercises || []).findIndex(pe => pe.eid === ex.eid);
      if (pidx < 0 && fbTitleKey) pidx = (pw.exercises || []).findIndex(pe => (pe.title || '').toLowerCase().trim() === fbTitleKey);
      if (pidx < 0) return null;
      const fvid = (pw.formVideos || [])[pidx];
      if (!fvid || !fvid.cloudUrl) return null;
      const coachNotes = (fvid.reviewNotes || []).filter(n => (n.author || 'trainer') === 'trainer');
      if (!coachNotes.length) return null;
      return { url: fvid.cloudUrl, notes: fvid.reviewNotes || [], count: coachNotes.length, title: (pw.exercises[pidx].title || d.t || '') };
    })();

    // Previous-week working sets for this same exercise on this same day.
    // Week 2+ only. Scoped to (planName, dayName, week=weekNum) so cross-block
    // history doesn't bleed in. Matches by eid first, normalized title second
    // (plan rebuilds can rotate eids while the title stays stable). A logged
    // load is the qualifying signal — trainees often skip the "done" check.
    // Computed once at block level so each set row can show its own prior.
    let prevWeekSets = null;
    let prevWeekIdx = null;
    if (weekNum >= 1 && priorWorkouts && priorWorkouts.length > 0) {
      const stableId = sub ? (sub.id || `swap:${(sub.title||'').toLowerCase()}`) : ex.eid;
      const titleKey = (sub ? sub.title : d.t || '').toLowerCase().trim();
      const targetWeek = weekNum; // saved w.week is 1-indexed; prev = weekNum
      let prevDate = null;
      for (const w of priorWorkouts) {
        // nameAmbiguous is true only when this portal shows two plans with the
        // SAME name (a couple) — there the plan id decides which member's logs
        // may ghost into these set rows (audit #31). Everywhere else the name
        // is the link, exactly as before.
        if (!isLogOfPlan(w, plan, nameAmbiguous ? new Set([plan.name]) : null)) continue;
        if (w.dayName !== day.name) continue;
        if (w.week !== targetWeek) continue;
        for (const px of (w.exercises || [])) {
          const pSub = px.substitution;
          const pStableId = pSub ? (pSub.toLibId || `swap:${(pSub.to||'').toLowerCase()}`) : px.eid;
          const pTitleKey = (pSub ? pSub.to : px.title || '').toLowerCase().trim();
          if (pStableId !== stableId && !(titleKey && pTitleKey === titleKey)) continue;
          // A performed set = real load OR real reps (bodyweight/time work logs
          // reps or seconds with no kg). Untouched prefills are saved blank now,
          // so this no longer resurfaces phantom numbers.
          // Keep the FULL sets array (do NOT compact out blanks) so ghost rows
          // stay index-aligned to THIS week's set rows — filtering a skipped
          // early set shifted every later ghost onto the wrong row. The render
          // skips blank ghost entries per-row instead. Gate on "any performed".
          const perf = s => parseFloat(s.load) > 0 || parseFloat(s.reps) > 0;
          const full = (px.sets || []);
          if (full.some(perf) && (!prevDate || new Date(w.date) > new Date(prevDate))) {
            prevWeekSets = full;
            prevWeekIdx = targetWeek;
            prevDate = w.date;
          }
        }
      }
    }

    return <div key={ei} style={{marginBottom: blockIdx < groupExs.length - 1 ? 24 : 0, paddingBottom: blockIdx < groupExs.length - 1 ? 20 : 0, borderBottom: blockIdx < groupExs.length - 1 ? `2px dashed ${C.bd2}` : 'none'}}>
      {isSuperset && <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:8}}>
        <span style={{fontSize:10,fontFamily:FN,fontWeight:800,letterSpacing:'0.1em',color:'#fff',background:C.ac,padding:'3px 8px',borderRadius:0}}>{tt('SUPERSET')} {group.superset}</span>
        <span style={{fontSize:10,fontFamily:FN,color:C.ac,fontWeight:700,letterSpacing:'0.08em'}}>{blockIdx+1}/{groupExs.length} · {tt('alternate each round')}</span>
      </div>}

      {/* Title (reflects swap if any) */}
      <h2 style={{margin:'0 0 4px',fontFamily:FN,fontSize:18,textAlign:'center'}}>{d.t}</h2>

      {/* Substitution slot — fixed-height centered line below the title.
          Both states (no swap / swapped) occupy the same vertical space so
          opening the picker and choosing an alternate doesn't reflow the
          rest of the exercise block. Reads as a single typographic line,
          no border / background / chip — same visual rhythm as the
          prescription / tempo lines below. */}
      {allowSubstitution && (
        <div style={{
          textAlign:'center',marginBottom:6,minHeight:18,
          fontFamily:FN,fontSize:10,letterSpacing:1.2,fontWeight:600,
        }}>
          {!sub ? (
            <button onClick={() => setSwapOpenForEid(ex.eid)} title="Find an alternate exercise"
              style={{background:'transparent',border:'none',color:C.tm,fontFamily:FN,fontSize:10,letterSpacing:1.2,fontWeight:600,cursor:'pointer',padding:0}}
              onMouseEnter={e=>e.currentTarget.style.color=C.ac}
              onMouseLeave={e=>e.currentTarget.style.color=C.tm}>
              <span style={{opacity:0.5,marginRight:4}}>⇄</span>
              EQUIPMENT BUSY? FIND ALTERNATE
            </button>
          ) : (
            <span style={{color:C.ac}}>
              <span style={{marginRight:4}}>⇄</span>
              SWAPPED FROM {' '}
              <span style={{color:C.tm,fontWeight:500}} title={dPrescribed.t}>{dPrescribed.t.toUpperCase()}</span>
              {' · '}
              <button onClick={() => setSubstitutions(s => { const n={...s}; delete n[ex.eid]; return n; })}
                title="Undo swap"
                style={{background:'transparent',border:'none',color:C.ac,fontFamily:FN,fontSize:10,letterSpacing:1.2,fontWeight:700,cursor:'pointer',padding:0,textDecoration:'underline'}}>
                {tt("UNDO")}
              </button>
            </span>
          )}
        </div>
      )}
      {swapOpenForEid === ex.eid && (
        <ExerciseSubstitution
          currentTitle={dPrescribed.t}
          currentEx={dPrescribed}
          library={trainerExercises || []}
          onPick={(lib) => setSubstitutions(s => ({ ...s, [ex.eid]: lib }))}
          onClose={() => setSwapOpenForEid(null)}
        />
      )}
      {/* F-31 — Live rep counter modal. Opens the camera + pose
          tracker; voice-trigger "start" begins counting. Closes
          fullscreen so the athlete sees nothing but the count + skeleton. */}
      {liveCountForEid === ex.eid && (
        <React.Suspense fallback={null}>
          <LiveRepCounter
            exerciseTitle={d.t}
            targetReps={typeof repsForDisplay === 'number' ? repsForDisplay : null}
            onClose={() => setLiveCountForEid(null)} />
        </React.Suspense>
      )}
      <SetsRepsHero sets={setsForDisplay} reps={repsForDisplay} />
      {ex.tempo && String(ex.tempo)!==String(repsForDisplay) && <div style={{fontSize:13,color:TEMPO_COLOR,marginTop:4,display:'flex',alignItems:'center',justifyContent:'center',gap:5,lineHeight:1}}><span style={{fontSize:12,lineHeight:1}}>⏱</span><span style={{lineHeight:1}}>{ex.tempo}</span></div>}

      {/* No outer frame — the wrapper's cardBd (cyan-30% in dark) read as a
          cyan line around the WK1–WK4 group. Dropping it + its padding lets the
          cells span the full width, flush with the video box below (Ohad). */}
      {hw && <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,marginTop:12,marginBottom:14}}>
        {ex.wk.map((w,i) => <div key={i} style={{background:'var(--c-sf)',border:`1px solid ${weekNum===i?C.ac:C.cardBd}`,borderRadius:0,padding:6,textAlign:'center'}}>
          <div style={{fontSize:9,color:C.td,fontFamily:FN}}>WK {i+1}</div>
          <div style={{fontSize:12,color:weekNum===i?C.ac:C.tx,fontWeight:600}}>{w}</div></div>)}</div>}

      {/* Cyan-polish pass: every neutral border on this view is now 1px
          C.cardBd (thicker, gray) instead of 0.25px / C.ac. Cyan is reserved
          for genuine intent \u2014 the left accent stripe on the focus card,
          active-week pill, and key inline text. */}

      {vid ? <div style={vidShort
        ? {marginTop:16,marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'9/16',maxWidth:300,marginLeft:'auto',marginRight:'auto',background:'#000',border:`1px solid ${C.cardBd}`}
        : {marginTop:16,marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'var(--c-sf)',border:`1px solid ${C.cardBd}`}}>
        <iframe src={`https://www.youtube.com/embed/${vid}`} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen/></div>
        : effectiveVid && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(effectiveVid) ? <div style={{marginTop:16,marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'#000',border:`1px solid ${C.cardBd}`}}>
        <video src={effectiveVid} controls playsInline style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}/></div>
        : effectiveVid && /(photos\.app\.goo\.gl|photos\.google\.com)/i.test(effectiveVid) ? <GooglePhotosEmbed url={effectiveVid} />
        : effectiveVid && /lh3\.googleusercontent\.com/i.test(effectiveVid) ? <div style={{marginTop:16,marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'#000',border:`1px solid ${C.cardBd}`}}>
        <video src={effectiveVid} controls playsInline style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}/></div> : null}

      {/* WEEKLY FOCUS \u2014 outer border is always neutral now; the left accent
          stripe (3px) is the cyan-when-set indicator. Reads as a calm card
          with a focused stripe rather than a wholly cyan box. */}
      {(() => {
        const hasText = !!(wf && wf.trim());
        const hasFb = !!lastWeekFb;
        const showNote = !hasText && !hasFb && !!staticNote;
        if (!hasText && !hasFb && !showNote) return null;
        const accent = hasText || hasFb;
        const body = hasText ? wf : staticNote;
        const fbOpen = fbOpenForEid === ex.eid;
        return (
          <div style={{background:'transparent',border:`1px solid ${C.cardBd}`,borderLeft:`3px solid ${accent?C.ac:C.cardBd}`,borderRadius:0,padding:12,marginBottom:12}}>
            <div style={{fontSize:10,fontFamily:FN,color:accent?C.ac:C.td,marginBottom:6,fontWeight:700,letterSpacing:'0.18em'}}>{accent ? "COACH'S FOCUS" : 'EXERCISE NOTE'}</div>
            {(hasText || showNote) && (
              <div dir="auto" style={{fontSize:13,color:C.tx,lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word',direction:/[֐-׿]/.test(body||'')?'rtl':'ltr',fontFamily:/[֐-׿]/.test(body||'')?FH:undefined}}>{body}</div>
            )}
            {hasFb && (
              <div style={{marginTop:(hasText||showNote)?10:0}}>
                <button onClick={() => setFbOpenForEid(fbOpen ? null : ex.eid)}
                  style={{width:'100%',padding:'10px 8px',borderRadius:0,border:`1px solid ${C.ac}`,background:'transparent',color:C.ac,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',cursor:'pointer'}}>
                  {fbOpen ? '▾ ' : '▸ '}Coach's video feedback · {lastWeekFb.count} note{lastWeekFb.count===1?'':'s'}
                </button>
                {fbOpen && (
                  <div style={{marginTop:8}}>
                    <FormVideoPlayer url={lastWeekFb.url} exerciseTitle={lastWeekFb.title} role="client" reviewNotes={lastWeekFb.notes} onReviewNotesChange={null} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* "Best ever" all-time pill removed (Ohad) — the reference the athlete
          wants is the PREVIOUS-WEEK per-set ghost rows inside the grid below,
          not an all-time best. */}
      <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:14,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 40px',gap:4,marginBottom:4}}>
          {['','REPS','KG','RPE','✓'].map(h => <div key={h} style={{fontSize:10.5,fontFamily:FN,fontWeight:700,letterSpacing:'0.08em',color:C.tm,textAlign:'center'}}>{h}</div>)}</div>
        {(allSets[ei]||[]).map((set,si) => {
          // Ghost row above each set: REPS/KG/RPE the trainee logged for
          // this same set index last week. Aligned to the input columns
          // so the eye lands on the prior value while typing the new one.
          //
          // Lighter pass per Ohad: dropped the cyan-tinted boxes, the
          // dashed borders, the W{n} label, and the arrow. Just three
          // muted numbers aligned to the input columns above. The grid
          // alignment alone tells the eye "this column = the input
          // column below." Reads as a hint, not a competing element.
          //
          // Shown in BOTH themes (2026-06-20): previous-week weight is the
          // athlete's progressive-overload reference and must always be
          // visible. It had been dark-theme-only (2026-05-15), so athletes on
          // the light theme stopped seeing it — restored here. Uses theme-aware
          // tokens (var(--c-ac)/var(--c-tx)) so it reads correctly on light too.
          const prior = prevWeekSets?.[si];
          // prevWeekSets is now the FULL (un-compacted) array, so a blank entry
          // = a set the athlete skipped that week. Only show a ghost for a set
          // that was actually performed (real load or reps) at THIS index.
          const showGhost = !!prior && (parseFloat(prior.load) > 0 || parseFloat(prior.reps) > 0);
          return <React.Fragment key={si}>
            {showGhost && <div style={{
              display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 40px',gap:4,
              alignItems:'center',marginBottom:0,marginTop:si===0?0:8,
              opacity:0.72,
            }}>
              <div style={{fontFamily:FN,fontSize:11,color:'var(--c-ac)',textAlign:'center',letterSpacing:'0.1em',fontWeight:700}}>W{prevWeekIdx}</div>
              <div style={{padding:'8px 10px',fontFamily:FB,fontSize:14,color:'var(--c-tx)',textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{prior.reps || '—'}</div>
              <div style={{padding:'8px 10px',fontFamily:FB,fontSize:14,color:'var(--c-tx)',textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{parseFloat(prior.load) || '—'}</div>
              <div style={{padding:'8px 10px',fontFamily:FB,fontSize:14,color:'var(--c-tx)',textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{prior.rpe || '—'}</div>
              <div />
            </div>}
            <div style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 40px',gap:4,alignItems:'center',marginBottom:4,opacity:set.done?.5:1}}>
              <div style={{fontFamily:FN,fontSize:13,color:C.td,textAlign:'center'}}>{si+1}</div>
              <input aria-label="Reps" value={set.reps} onChange={e => uSet(ei,si,'reps',e.target.value)} onFocus={selectOnFocus} inputMode="numeric" enterKeyHint="next" placeholder="—" style={seti}/>
              <input aria-label="Weight (kg)" value={set.load} onChange={e => uSet(ei,si,'load',e.target.value)} onFocus={selectOnFocus} inputMode="decimal" enterKeyHint="next" placeholder="kg" style={seti}/>
              <input aria-label="RPE" value={set.rpe} onChange={e => uSet(ei,si,'rpe',e.target.value)} onFocus={selectOnFocus} inputMode="decimal" enterKeyHint="done" placeholder="—" style={seti}/>
              {/* Whole cell is the tap target (not just the 18px box) so a
                  sweaty mid-set tap lands. 24px box, centered. */}
              <label style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:44,cursor:'pointer'}}>
                <input type="checkbox" checked={set.done} onChange={e => uSet(ei,si,'done',e.target.checked)} style={{width:24,height:24,accentColor:C.gn,cursor:'pointer'}}/>
              </label>
            </div>
          </React.Fragment>;
        })}</div>

      <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontSize:11,fontFamily:FN,color:C.tm}}>{tt("FORM CHECK")}</div>
          {f.uploaded && <div style={{display:'flex',alignItems:'center',gap:4,background:'var(--c-sf)',border:`1px solid ${C.gn}`,padding:'3px 10px',borderRadius:0}}>
            <span style={{fontSize:11,fontFamily:FN,color:C.gn,fontWeight:700,letterSpacing:'0.08em'}}>✓ UPLOADED</span></div>}
          {f.uploading && <div style={{display:'flex',alignItems:'center',gap:4,background:'var(--c-sf)',border:`1px solid ${C.ac}`,padding:'3px 10px',borderRadius:0}}>
            <span style={{fontSize:11,fontFamily:FN,color:C.ac,fontWeight:700}}>{f.phase==='compress' ? `Compressing ${f.compressProgress||0}%` : `Uploading ${f.uploadProgress||0}%`}</span></div>}
        </div>
        {f.has && f.videoUrl ? (
          <div style={{marginBottom:10}}>
            <StoredVideo src={f.videoUrl} controls playsInline
              onError={() => setFv(prev => { const n=[...prev]; n[ei]={...n[ei], videoError:true}; return n; })}
              style={{width:'100%',borderRadius:0,maxHeight:200,background:'transparent'}} />
            {f.videoError && (
              <div style={{marginTop:6,padding:8,background:'var(--c-sf)',border:`1px solid ${C.or||'#c97a00'}`,fontSize:11,color:C.or||'#c97a00',fontFamily:FN}}>
                Video failed to load. {safeUrl(f.cloudUrl) ? <a href={safeUrl(f.cloudUrl)} target="_blank" rel="noopener noreferrer" style={{color:C.ac}}>Open in new tab ↗</a> : 'Try Re-recording.'}
              </div>
            )}
            <div style={{display:'flex',gap:8,marginTop:6}}>
              {/* Replace + Remove are both disabled while an upload is in
                  flight — otherwise picking a new file mid-upload would race
                  the previous upload's setFv against the new one's. */}
              <label style={{flex:1,minHeight:44,padding:'12px 8px',borderRadius:0,border:`0.25px dashed ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',textAlign:'center',cursor:f.uploading?'not-allowed':'pointer',opacity:f.uploading?0.4:1,pointerEvents:f.uploading?'none':'auto',display:'flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box'}}>
                Replace
                <input type="file" accept="video/*" capture="environment" style={{display:'none'}} disabled={f.uploading} onChange={async e => {
                  // Drop the slot's prior queued blob before enqueuing the new one —
                  // Replace overwrites pendingBlobId, so without this the old blob
                  // (workoutId:null, never drained) leaks until the 7-day GC.
                  // Mirrors the Remove button's cleanup. (offline audit #3)
                  if (f.pendingBlobId) { removeBlob(f.pendingBlobId).catch(() => {}); }
                  await handleVideoUpload(e, ei, d);
                }} />
              </label>
              <button disabled={f.uploading} onClick={() => {
                  // Revoke the in-memory blob URL and drop any IDB-queued
                  // upload so the offline drainer can't ressurect the file
                  // after the trainee asked to remove it.
                  if (typeof f.videoUrl === 'string' && f.videoUrl.startsWith('blob:')) {
                    try { URL.revokeObjectURL(f.videoUrl); } catch {}
                  }
                  if (f.pendingBlobId) {
                    removeBlob(f.pendingBlobId).catch(() => {});
                  }
                  setFv(prev => { const n=[...prev]; n[ei]={...n[ei],has:false,videoUrl:null,uploaded:false,cloudUrl:null,pendingBlobId:null}; return n; });
                }}
                style={{flex:1,minHeight:44,padding:'12px 8px',borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.rd,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:f.uploading?'not-allowed':'pointer',opacity:f.uploading?0.4:1}}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div style={{display:'flex',gap:8}}>
            <label style={{flex:1,padding:'16px 8px',borderRadius:0,border:`1px dashed ${C.ac}`,background:'transparent',color:C.tm,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span>{tt("Record")}</span>
              <input type="file" accept="video/*" capture="environment" style={{display:'none'}} onChange={async e => { await handleVideoUpload(e, ei, d); }} />
            </label>
            <label style={{flex:1,padding:'16px 8px',borderRadius:0,border:`1px dashed ${C.ac}`,background:'transparent',color:C.tm,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span>{tt("Gallery")}</span>
              <input type="file" accept="video/*" style={{display:'none'}} onChange={async e => { await handleVideoUpload(e, ei, d); }} />
            </label>
          </div>
        )}
        <button onClick={() => setLiveCountForEid(ex.eid)} title="Live rep counter — camera + voice trigger"
          style={{width:'100%',marginTop:8,padding:'11px 8px',borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>
          Live Rep Counter
        </button>
        <textarea dir="auto" value={f.note} onChange={e => { const v = e.target.value; setFv(prev => { const n=[...prev]; n[ei]={...n[ei],note:v}; return n; }); }} placeholder="Notes for coach" style={{...bi,fontSize:13,minHeight:50,resize:'vertical',marginTop:8,color:C.ac}}/>
      </div>
    </div>;
  };

  return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
    <div style={{padding:20}}>
      {isSuperset && <div style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,padding:'8px 12px',marginBottom:18,textAlign:'center'}}>
        <div style={{fontSize:11,fontFamily:FN,color:C.ac,fontWeight:700,letterSpacing:'0.08em'}}>SUPERSET {group.superset} · {groupExs.length} EXERCISES</div>
        <div style={{fontSize:11,color:C.tm,marginTop:3}}>Alternate between exercises each round</div>
      </div>}

      {groupExs.map(renderExerciseBlock)}

      <div style={{display:'flex',gap:8,marginTop:20}}>
        {!atFirstStep && <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>← Back</button>}
        <button onClick={anyUploading ? undefined : goNext} style={{flex:2,padding:14,borderRadius:0,border:`1px solid ${anyUploading?C.cardBd:C.ac}`,background:'transparent',color:anyUploading?C.tm:C.ac,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:anyUploading?'wait':'pointer',opacity:anyUploading?0.6:1}}>
          {anyUploading ? `Processing video…` : step===groupCount-1 ? 'Finish →' : 'Next →'}</button></div>
    </div></div>;
}

// A plan's CURRENT week (0-indexed) derived from client_workouts — the same
// "first un-logged (week, day), continue from the latest trained week" rule the
// coach single/group surfaces use, so all views agree. Used both to open the
// active block on the right week AND to log a NON-active visible plan's day
// under ITS OWN week (a single global `wk` follows the active block only).

function deriveWeekIdx(plan, cw, dupNames) {
  const planWeeks = Number(plan?.weeks) || 4;
  // Exclude daily-routine days (kind:'daily') from the week-advancement scan —
  // they're logged unlimited times and are NOT a weekly requirement, so counting
  // them as "un-logged" pinned a mixed plan's week forever (and made a non-active
  // plan re-log every set under week 1). Mirrors the header's d.kind !== 'daily'.
  const dayNames = (plan?.days || []).filter(d => d.kind !== 'daily' && plan?.kind !== 'daily').map(d => d.name).filter(Boolean);
  const logs = (cw || []).filter(w => isLogOfPlan(w, plan, dupNames));
  const done = new Set(logs.map(w => `${Number(w.week) || 1}|${w.dayName}`));
  const maxWk = logs.length ? Math.max(...logs.map(w => Number(w.week) || 1)) : 1;
  let nextWk = Math.max(1, maxWk);
  if (dayNames.length) {
    outer: for (let w = Math.max(1, maxWk); w <= planWeeks; w++) {
      for (const dn of dayNames) { if (!done.has(`${w}|${dn}`)) { nextWk = w; break outer; } }
    }
  } else {
    nextWk = Math.min(planWeeks, maxWk + (logs.length ? 1 : 0) || 1);
  }
  return Math.max(0, Math.min(planWeeks, nextWk) - 1);
}

// Main client portal
export default function ClientPortal({ clientId, signOut, clientWorkouts, setClientWorkouts, bwLog, setBwLog, weeklyFocus, setWeeklyFocus, portalVis, trainerPlans, trainerExercises, trainees, selfTrainee = null, onDecrementSession, updateFormVideos, demoMode = false, demoPlans = null, onReturnToCoach = null, embedded = false, onFilmSet = null }) {
  const tt = useAppT();
  // clientId comes from the authenticated session (resolved upstream in App.jsx).
  // The old email-lookup login lived inside this component and bypassed auth;
  // it's gone. Trainee is fixed for the session.
  const ci = clientId;
  const logOut = async () => {
    setVw('prog');
    if (signOut) await signOut();
  };
  const [wk, setWk] = useState(0);
  const [lg, setLg] = useState(null);
  const [vw, setVw] = useState('prog');
  const [expandedHistEx, setExpandedHistEx] = useState(null); // `${workoutId}:${exIdx}` — which exercise row in History is open
  const [bwHistOpen, setBwHistOpen] = useState(false); // BW weigh-in history list collapsed by default (Ohad)
  // Last-seen timestamp for client-side unread tracking of coach comments.
  // Stored per client in localStorage. Updated each time the History tab
  // opens. Comments with createdAt > this count as unread.
  const [lastHistSeen, setLastHistSeen] = useState(() => {
    try { return localStorage.getItem('expo-hist-seen-' + clientId) || ''; } catch { return ''; }
  });
  useEffect(() => {
    if (vw !== 'hist' || !clientId) return;
    const now = new Date().toISOString();
    setLastHistSeen(now);
    try { localStorage.setItem('expo-hist-seen-' + clientId, now); } catch {}
  }, [vw, clientId]);
  // Unread coach comments = reviewNotes (trainer-authored only) with
  // createdAt > lastHistSeen, across all of this client's workouts.
  const unreadCoachNotes = (() => {
    let n = 0;
    for (const w of (clientWorkouts || [])) {
      // Scope strictly to THIS client — during a coach-preview switch the
      // previous athlete's clientWorkouts can linger for a render, which made
      // a brand-new athlete's portal flash a phantom "N new notes from Ohad"
      // (Ohad: Amri, 0 workouts, showed 19). Never count another athlete's notes.
      if (w.clientId && ci && w.clientId !== ci) continue;
      for (const fv of (w.formVideos || [])) {
        for (const note of (fv?.reviewNotes || [])) {
          if (note.author === 'trainer' && note.createdAt && note.createdAt > lastHistSeen) n++;
          for (const r of (note.replies || [])) {
            if (r.author === 'trainer' && r.createdAt && r.createdAt > lastHistSeen) n++;
          }
        }
      }
    }
    return n;
  })();
  const [bw, setBw] = useState('');
  const [clientPlans, setClientPlans] = useState([]); // Plans loaded from plans table for this client
  const [selectedBlockName, setSelectedBlockName] = useState(null); // which block bodyweight logs target when client has multiple visible plans
  const [bwDeleteConfirm, setBwDeleteConfirm] = useState(null); // BW log entry pending delete confirmation (null | entry)
  const bwDel = useDelayedUnmountValue(bwDeleteConfirm); // holds the entry through the exit animation
  useEscClose(!!bwDeleteConfirm, () => setBwDeleteConfirm(null)); // Escape dismisses the BW-delete confirm
  const [showPwModal, setShowPwModal] = useState(false);
  const [plansLoadError, setPlansLoadError] = useState(null);

  // Resolve client from trainees (Supabase)
  // Athletes can't read the full trainees store (RLS); fall back to the
  // gate-resolved record (my_trainee RPC) passed down from App so the portal
  // doesn't hang on "Loading your program…" with an empty trainees list.
  const trainee = (trainees || []).find(t => t.id === ci) || (selfTrainee && selfTrainee.id === ci ? selfTrainee : null);
  // Bnei Herzliya club-TEAM format flag (|| legacy branch tag for pre-format athletes).
  const isBnei = trainee?.format === 'Bnei Herzliya' || trainee?.branch === 'Bnei Herzliya';

  // Restore last-viewed week when a client logs in so they don't land on W1
  // every session when they're mid-way through a block.
  React.useEffect(() => {
    if (!ci) return;
    try {
      const v = localStorage.getItem('expo-wk-' + ci);
      if (v != null) { const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 0) setWk(n); }
    } catch {}
  }, [ci]);
  React.useEffect(() => {
    if (!ci) return;
    try { localStorage.setItem('expo-wk-' + ci, String(wk)); } catch {}
  }, [ci, wk]);

  // Load this client's plans from plans table when client changes.
  // Mount guard: rapid login/logout could otherwise race a stale fetch
  // into setClientPlans after the component remounted for a different user.
  const [plansReloadKey, setPlansReloadKey] = useState(0);
  React.useEffect(() => {
    // Clearing the previous client's load error when ci flips (or goes
    // null) keeps a stale red banner from sticking when switching between
    // trainees on a dual-role account.
    if (!ci) { setClientPlans([]); setPlansLoadError(null); return; }
    // Demo mode: skip Supabase entirely, render the prop-supplied plans.
    if (demoMode) {
      setClientPlans(Array.isArray(demoPlans) ? demoPlans : []);
      setPlansLoadError(null);
      return;
    }
    let alive = true;
    setPlansLoadError(null);
    (async () => {
      try {
        const { supabase: sb } = await import('./supabase');
        // Couples: a trainee may have plans under parent ID OR sub-member IDs (parent__0, parent__1).
        // Fetch all so the shared portal renders both members' plans.
        const ids = traineeIdsFor(ci);
        const { data, error } = await sb.from('plans').select('*').in('trainee_id', ids);
        if (!alive) return;
        if (error) throw error;
        if (data) {
          setClientPlans(data.map(p => ({
            id: p.id, name: p.name, traineeId: p.trainee_id, phase: p.phase,
            notes: p.notes, active: p.active, createdAt: p.created_at,
            days: p.data?.days || [], warmup: p.data?.warmup || [],
            weeks: p.data?.weeks || 4,
            // Plan-level daily-routine flag (legacy 96e5f72 shape) — without it a
            // whole-plan daily routine renders as a normal week-paced block.
            kind: p.data?.kind || undefined,
          })));
        }
      } catch (e) {
        if (alive) {
          console.error('ClientPortal plans load:', e);
          setPlansLoadError(e?.message || 'Could not load your programs.');
        }
      }
    })();
    return () => { alive = false; };
  }, [ci, plansReloadKey, demoMode, demoPlans]);

  // Presence heartbeat — let the coach know this client is online.
  // Gated on document.visibilityState so a backgrounded tab doesn't keep
  // writing to Supabase every 30s for hours. When the tab comes back to
  // foreground we beat immediately so the coach sees them as online.
  //
  // Row-per-client: each trainee owns `expo-presence-<id>` and writes only
  // that row. Eliminates the read-modify-write race the old shared
  // `expo-presence` object had — two trainees beating at the same time
  // would clobber each other's stamps. The coach-side aggregator scans
  // `key like 'expo-presence-%'`.
  React.useEffect(() => {
    if (!ci || demoMode) return;
    let consecutiveFailures = 0;
    const beat = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { supabase: sb } = await import('./supabase');
        const key = `expo-presence-${ci}`;
        const { error: writeErr } = await sb.from('store').upsert({ key, value: { ts: Date.now(), clientId: ci } });
        if (writeErr) throw writeErr;
        consecutiveFailures = 0;
      } catch (e) {
        consecutiveFailures += 1;
        if (consecutiveFailures === 3) {
          console.warn('[presence] heartbeat failing:', e?.message || e);
        }
      }
    };
    beat();
    const iv = setInterval(beat, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [ci, demoMode]);

  const clientName = trainee?.name || '';

  // Prebuilt lookup maps so plan→portal conversion is O(1) per exercise instead
  // of scanning the whole (1,467-entry) library twice per row, every render.
  const exById = useMemo(() => {
    const m = new Map();
    for (const e of (trainerExercises || [])) m.set(e.id, e);
    return m;
  }, [trainerExercises]);
  const exByTitle = useMemo(() => {
    const m = new Map();
    for (const e of (trainerExercises || [])) {
      const k = (e.title || '').toLowerCase().trim();
      if (k && !m.has(k)) m.set(k, e);
    }
    return m;
  }, [trainerExercises]);

  // All plans live in the Supabase `plans` table (populated from Drive).
  // Preserve traineeId so the visibility key can include the couple member suffix.
  const mergedPlans = trainee
    ? clientPlans.map(p => ({ ...trainerPlanToPortal(p, exById, exByTitle), traineeId: p.traineeId }))
    : [];

  // Filter by portal visibility toggles, then sort newest-first via the
  // canonical sortProgramsChrono — handles "Block N" without # (Drive imports),
  // floats Comeback/rehab blocks to the top, falls back to createdAt.
  // visKey matches the trainer-side TraineeDetail keying. Couple member plans
  // get a `:m{N}` suffix so toggling one member's plan doesn't ghost into the other's.
  const visKeyFor = (p) => {
    const mi = memberIndexFromId(p.traineeId, ci);
    return mi != null ? `${clientName}:${p.name}:m${mi}` : `${clientName}:${p.name}`;
  };
  // Default portal visibility: show only the LATEST numbered training block
  // plus any NON-block plans (ongoing routines like "Morning Routine",
  // mobility, etc. — blockNum returns -Infinity for these). Older blocks
  // (#1..#N-1) are hidden by default so the athlete only ever sees their
  // current program — Ohad's "only show the latest block for each client".
  // The coach can still override per-plan via the TraineeDetail visibility
  // toggles / ONLY pill, which write an explicit true/false into portalVis;
  // those explicit picks always win over the default.
  const sorted = mergedPlans.slice().sort(sortProgramsChrono);
  // Plan names that appear more than once in what this portal shows. For a
  // couple — two members, two plans, one shared portal — this is the collision
  // that let one member's logs mark the other's day done (audit #31). It is the
  // ONLY place the plan id gets to override the name.
  const dupPlanNames = React.useMemo(() => duplicatePlanNames(sorted), [sorted]);
  const latestBlock = sorted.find(p => blockNum(p.name) !== -Infinity);
  const visPlans = sorted.filter(p => {
    if (clientName && portalVis) {
      const v = portalVis[visKeyFor(p)];
      if (v === true) return true;   // coach explicitly opted this plan IN
      if (v === false) return false; // coach explicitly opted this plan OUT
    }
    // No explicit toggle → latest block + non-block plans only.
    return blockNum(p.name) === -Infinity || p === latestBlock;
  });

  // Demo-mode diagnostic — surfaces portalVis ↔ plan key alignment so the
  // coach can spot a key-mismatch bug at a glance (e.g. couples sub-member
  // suffix not lining up, or Hebrew-encoded plan name with trailing space).
  // No-op in real client portal. Reads once per render.
  if (demoMode && typeof window !== 'undefined') {
    try {
      const planKeys = mergedPlans.map(p => ({ name: p.name, key: visKeyFor(p), vis: portalVis?.[visKeyFor(p)] }));
      const hidden = planKeys.filter(k => k.vis === false).length;
      const shown = planKeys.filter(k => k.vis !== false).length;
      console.info('[EXPO portal preview]', { clientName, mergedPlansCount: mergedPlans.length, visPlansCount: visPlans.length, shown, hidden, planKeys, portalVisKeyCount: Object.keys(portalVis || {}).length });
    } catch {}
  }

  // Active block for bodyweight logging — scopes uniqueness to (client, block, week)
  // Falls back to the first visible plan when no manual selection (or selection no longer visible).
  const activePlan = visPlans.find(p => p.name === selectedBlockName) || visPlans[0];

  // Clamp persisted wk to the current block's week count. Covers two cases:
  // (a) stored wk=7 carried over from an 8-week block into a new 4-week block,
  // (b) trainer shortened a plan after the client logged in.
  // Gated on activePlan being loaded — otherwise during the Supabase plans fetch
  // activePlan is undefined, the fallback `|| 4` kicks in, and a legit restored
  // wk=7 from an 8-week block gets clamped to 3 and written back to localStorage
  // before the 8-week plan actually arrives, permanently losing the client's week.
  React.useEffect(() => {
    if (!activePlan) return;
    const max = (activePlan.weeks || 4) - 1;
    if (wk > max) {
      // Surface the clamp so the trainee notices when a block-swap moves
      // them. Silent clamping was producing log-misdating reports.
      toast(`Moved to week ${max + 1} — this block has ${activePlan.weeks || 4} weeks`, 'info', { ttl: 5000 });
      setWk(max);
    }
  }, [activePlan?.weeks, wk]);

  const cw = clientWorkouts.filter(w => w.clientId === ci);
  // Sync the displayed week with reality (client_workouts): when the active
  // block changes, open on the athlete's CURRENT week (next un-logged) — the
  // same week single/group/coach derive. Ref-guarded so it fires only on a real
  // block change, never overriding the athlete's manual week navigation.
  const lastBlockRef = React.useRef(null);
  // True when the last derive ran against an EMPTY history. On a fresh device
  // (new phone, cleared storage, private tab) there is no `expo-cw` cache and
  // the small plans query resolves well before the full client_workouts scan —
  // so the first derive saw cw = [] , returned week 0, and the ref guard below
  // meant it NEVER re-derived once the workouts arrived. An athlete in week 5
  // was shown W1, and tapping LOG filed the session under week 1, colliding
  // with their real W1 in every week-scoped view (done ✓, ghosts, PRs).
  const derivedFromEmptyRef = React.useRef(false);
  React.useEffect(() => {
    const name = activePlan?.name;
    if (!name) return;
    const blockChanged = lastBlockRef.current !== name;
    // One-shot correction when real history finally lands.
    const rescueFromEmpty = derivedFromEmptyRef.current && cw.length > 0;
    if (!blockChanged && !rescueFromEmpty) return;
    lastBlockRef.current = name;
    derivedFromEmptyRef.current = cw.length === 0;
    // Same autopicker rule single + group use: scan weeks then days, open on the
    // week of the FIRST un-logged (week, day) — a partially-done week stays put
    // (W1 day1 done, day2 not → W1, not W2). All three derive identically from
    // the shared client_workouts, so the week shown here matches what the coach
    // sees in single/group. Fully-done block → last week.
    // Open on the athlete's CURRENT week (first un-logged day, continue from the
    // latest trained week). Same rule single/group/coach derive — see deriveWeekIdx.
    setWk(deriveWeekIdx(activePlan, cw, dupPlanNames));
    // cw.length is in the deps ONLY to drive the rescue above. Once a derive
    // has run against real history, derivedFromEmptyRef is false, so later
    // growth (the athlete completing a workout) can never yank the week away
    // from wherever they navigated manually.
  }, [activePlan?.name, cw.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleComplete = w => {
    // demoMode = coach-side preview. Writes must never touch the real
    // trainee's record. Bail before any setter so a future refactor that
    // wires real (non-noop) setters into preview can't leak through.
    if (demoMode) { setLg(null); return; }
    setClientWorkouts(prev => [...prev, w]);
    // Number.isFinite guard: type="number" still lets "e"/locale commas
    // through, and a NaN row poisons the BW chart min/max math.
    if (bw && Number.isFinite(parseFloat(bw))) {
      // File under the block the BW BOX was displayed in — the active plan,
      // labeled "LOG W{wk+1} · {activePlan}" — because that's where the athlete
      // typed this weight. Filing under the COMPLETED workout's block instead
      // mis-attributed it for a multi-plan athlete who typed BW under the active
      // block then finished a different block's day (task #58). The explicit BW
      // SAVE button already files under activePlan; this matches it.
      const blockName = activePlan?.name || w.planName || null;
      const wkNum = wk + 1;
      const planId = clientPlans.find(p => p.name === blockName)?.id || activePlan?.id || null;
      if (blockName) {
        setBwLog(prev => {
          const filtered = prev.filter(b => !(b.clientId === ci && b.blockName === blockName && b.week === wkNum));
          return [...filtered, { date: new Date().toISOString(), clientId: ci, week: wkNum, bw: parseFloat(bw), blockName, planId }];
        });
        // Clear the box so this weigh-in isn't silently re-filed under the next
        // week/block on subsequent workout completions (the SAVE button clears
        // too; without this, one typed weigh-in became phantom points across
        // multiple weeks as `wk` advanced after each completion).
        setBw('');
      }
    }
    if(onDecrementSession && ci) onDecrementSession(ci);
    // Notify the coach. Fire-and-forget — push never blocks the
    // post-workout UI. Tag includes the workout id so two devices on
    // the coach's account see a single dedup'd notification.
    // Per-athlete mute: if the coach has toggled "🔕 MUTED" on this
    // athlete's TraineeDetail, skip the push (the workout still saves
    // and shows up in /coach/review — only the phone buzz is muted).
    const exCount = Array.isArray(w.exercises) ? w.exercises.length : 0;
    (async () => {
      if (await isCoachMutedForAthlete(ci)) return;
      sendPush({
        toEmail: 'ohadyproductions@gmail.com',
        title: `${clientName || 'Athlete'} finished a workout`,
        body: `${w.dayName || 'Session'} · W${w.week ?? wk + 1} · ${exCount} ex`,
        url: `/coach/trainees/${ci}`,
        tag: `workout:${w.id || ci}`,
      });
    })();
    setLg(null);
  };

  // Step Logger — find plan by index across visible plans
  if (lg !== null && trainee) {
    let dayCount = 0; let targetPlan = null; let targetDayIdx = 0;
    for (const p of visPlans) { if (lg < dayCount + p.days.length) { targetPlan = p; targetDayIdx = lg - dayCount; break; } dayCount += p.days.length; }
    if (!targetPlan) { toast('This program is no longer available.', 'info'); setLg(null); return null; }
    // F-25 — substitution is available on EVERY plan (full version).
    // Earlier the swap UI was gated to isTemplatePlan(plan) so Ohad's
    // hand-coached clients couldn't accidentally swap mid-session. With
    // proper coach insight into substitutions via workout logs, the gate
    // is no longer needed and trainees can adapt to a busy gym freely.
    // weekNum follows the ACTIVE block's selector only. Logging a day that
    // belongs to a DIFFERENT visible plan must file under THAT plan's own
    // current week, not the active block's — else a multi-plan athlete's
    // workout lands under the wrong week (done/AGAIN badge + ghosts too).
    const logWeek = (targetPlan.name === activePlan?.name) ? wk : deriveWeekIdx(targetPlan, cw, dupPlanNames);
    // key by the day's IDENTITY (plan + day index + week), not the flat `lg`
    // index: if portalVis updates over realtime mid-session and the same `lg`
    // now maps to a DIFFERENT day, this forces a fresh StepLogger so allSets is
    // rebuilt from the correct prescription instead of the old day's numbers
    // being saved onto the new day's exercises.
    return <StepLogger key={`${targetPlan.id || targetPlan.name || 'p'}|${targetDayIdx}|${targetPlan.days[targetDayIdx]?.name || ''}|w${logWeek}`} day={targetPlan.days[targetDayIdx]} plan={targetPlan} weekNum={logWeek} clientId={ci} onBack={() => setLg(null)} onComplete={handleComplete} weeklyFocus={weeklyFocus} trainerExercises={trainerExercises} priorWorkouts={cw} allowSubstitution={true} nameAmbiguous={dupPlanNames.has(targetPlan.name)} demoMode={demoMode} onFilmSet={onFilmSet} branch={isBnei ? 'Bnei Herzliya' : (trainee?.branch || '')}/>; }

  // Shared portal header (logo + lock + logout / greeting / block badges +
  // sessions count / tab switcher). Rendered at the top of Program, BW Graph,
  // and History so the layout stays consistent across tabs.
  //
  // ?pv=1..5 — five COMPLETE design identities for Ohad's review round
  // (2026-07-05): every styled zone (stats header / nav / weeks+KG /
  // warm-up card / day cards) renders per identity. Brand constants hold
  // across all five: #39BDFF cyan, JetBrains Mono, square corners,
  // hairlines, orange warm-up identity, green done.
  //   (no param) BASE — the design Ohad approved as baseline (commit
  //                     44540d0): segmented strips + strip-header cards.
  //                     ALWAYS reachable at the bare /athlete URL.
  //   1 EDITORIAL — asymmetric type, underline tabs, left-rail cards
  //   2 TABLE     — progress track, fused controls, single-line data rows
  //   3 CONSOLE   — mono banner, inverse-video actives, numbered listing
  //   4 AIR       — no chrome: whitespace, text-only controls, open cards
  //   5 RAIL      — cyan rails: hero week bar, rail-topped actives, left-rail cards
  // RAIL (pv5) is the real portal — the default at bare /athlete. BASE stays
  // reachable at ?pv=0 and the other explorations at ?pv=1..4. (Ohad 2026-07-08)
  const pv = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pv')) || '';
  const ident = ({'0':'BASE','1':'EDITORIAL','2':'TABLE','3':'CONSOLE','4':'AIR','5':'RAIL'})[pv] || 'RAIL';
  const sl = Math.max(0, (trainee?.sessionsRemaining || 0));
  const renderTopHeader = () => (
    <>
      {/* Reserve the scrollbar gutter always so switching tabs (short Messages
          vs tall Program) never shifts the centred content left/right (Ohad:
          "pages glitch from left to right"). */}
      <style>{`html{scrollbar-gutter:stable}`}</style>
      <div style={{background:C.bg,padding:'calc(12px + env(safe-area-inset-top)) 20px 12px',borderBottom:(ident==='CONSOLE'||ident==='RAIL')?'none':`1px solid ${C.bd2}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,position:'relative'}}>
          {/* Bnei Herzliya crest — top row, horizontally centered, sized to the
              EXPO mark's height (Ohad: "all the way up, same size as the EXPO logo"). */}
          {isBnei && <img src="/bnei-herzliya-logo-w.png" alt="Bnei Herzliya" style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',height:36,width:'auto',objectFit:'contain',pointerEvents:'none'}} />}
          {/* EXPO logo. For dual-role accounts (trainer who also has a
              trainee row) it doubles as the "switch to coach portal"
              affordance — click the mark to go back to /coach/dashboard.
              Pure clients see a static logo. Hidden in demoMode (the
              CoachPreviewPortal back button is the only escape there)
              AND in embedded mode (DemoEmbed iframe — the outer marketing
              page already shows the EXPO mark; doubling it looks busy). */}
          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
            {embedded ? (
              <span style={{width:36}} aria-hidden="true" />
            ) : onReturnToCoach && !demoMode ? (
              <button onClick={onReturnToCoach}
                title="Switch to the coach portal"
                style={{background:'transparent',border:'none',padding:0,marginLeft:3,cursor:'pointer',display:'flex',alignItems:'center'}}>
                <EXPOMark theme="dark" height={36} style={{marginLeft:0}} />
              </button>
            ) : (
              <EXPOMark theme="dark" height={36} style={{marginLeft:3}} />
            )}
            {/* (Bnei Herzliya co-brand lives as the big crest above the greeting
                below — the tiny header logo was removed per Ohad.) */}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            {!demoMode && (() => {
              // trainee.email is either a string or an array (up to 3 per
              // memory project_auth_state). Flatten to the first non-empty
              // address; falls back to empty string which the API treats
              // as null reporter_email.
              const raw = trainee?.email;
              const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
              const reporter = arr.find(e => typeof e === 'string' && e.trim()) || '';
              return <BugReportButton role="athlete" reporterEmail={reporter} variant="athlete" />;
            })()}
            <button onClick={()=>setShowPwModal(true)} title="Change password" style={{background:'none',border:'none',color:C.tm,cursor:'pointer',padding:0,display:'flex',alignItems:'center'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </button>
            {/* Always reads like the real athlete portal ('LOG OUT →') — even in
                preview, so the coach/prospect sees an authentic portal. The
                outer preview banner already carries the '← BACK TO COACH' exit. */}
            <button onClick={logOut} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.12em',padding:0}}>LOG OUT →</button>
          </div>
        </div>
        {/* Symmetric vertical rhythm (Ohad): crest→greeting == greeting→divider,
            and BNEI HERZLIYA gets equal space above (divider) and below (the
            block strip's cyan top border). lineHeight:1 makes the text boxes
            glyph-tight so the measured gaps ARE the visual gaps. GAP=12. */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:12}}>
          {/* Just the athlete's first name (Ohad: drop the "Hey"/"היי" prefix).
              Hebrew names use the Hebrew font so they don't render oversized. */}
          <h1 dir="auto" style={{margin:0,lineHeight:1,fontFamily:FN,fontSize:21,fontWeight:600,color:C.tx,textAlign:'center',letterSpacing:'0.04em'}}><span style={/[֐-׿]/.test(clientName.split(' ')[0]) ? {fontFamily:FH} : undefined}>{clientName.split(' ')[0]}</span></h1>
          <div style={{width:24,height:1,background:C.ac,marginTop:12,opacity:0.5}}/>
          {isBnei && (
            <div style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.16em',lineHeight:1,color:C.ac,marginTop:12,textAlign:'center'}}>BNEI HERZLIYA</div>
          )}
        </div>
        {/* Three across: BLOCK (left) · THIS WEEK completion blocks (centred) ·
            SESSIONS-LEFT-IN-BLOCK (right). All computed once from the primary
            plan. 1fr auto 1fr centres the middle regardless of side widths.
            SESSIONS now counts workouts remaining until the block is finished
            (total block sessions − distinct logged (week,day)), not billing. */}
        {(() => {
          const primaryPlan = visPlans[0];
          const weekDays = (primaryPlan?.days || []).filter(d => d.kind !== 'daily');
          const weeks = Number(primaryPlan?.weeks) || Number(primaryPlan?.data?.weeks) || 4;
          const dayNames = new Set(weekDays.map(d => d.name));
          // Scope progress to THIS block only. Day names and week numbers repeat
          // across blocks (week resets to 1, "Push/Pull"/"Day A" recur), so
          // unscoped `cw` let a previous block's logs mark the current block's
          // days done and skew THIS WEEK / N-LEFT for every returning athlete
          // (audit H2). Mirrors the planName-scoped pattern used elsewhere here.
          const pName = primaryPlan?.name;
          const pcw = pName ? cw.filter(w => w.planName === pName) : cw;
          const loggedWeeks = pcw.map(w => w.week).filter(n => Number.isFinite(n));
          const curWeek = loggedWeeks.length ? Math.max(...loggedWeeks) : 1;
          const isDayDone = (d) => pcw.some(w => w.dayName === d.name && w.week === curWeek);
          const doneThisWeek = weekDays.filter(isDayDone).length;
          const total = weeks * weekDays.length;
          const completed = new Set(pcw.filter(w => dayNames.has(w.dayName) && w.week >= 1 && w.week <= weeks).map(w => w.week + '|' + w.dayName)).size;
          const blockLeft = Math.max(0, total - completed);
          // v2 — one symmetric strip: three EQUAL cells, every cell the same
          // anatomy (label above, value below, both centered), so the row
          // shares the page's centre axis with HEY <name> instead of three
          // controls with three different anchor logics.
          // ── Stats header per identity ───────────────────────────────────
          // Shared principles (WHOOP / Nike / Strava patterns): ONE dominant
          // element per zone (the trio failed because three equal items = no
          // hierarchy); ≥2.5x value-to-label scale contrast; progress gets a
          // VISUAL, not digits; metadata collapses to one quiet tracked
          // line; 8pt spacing grid; tabular numerals.
          // RAIL (pv5) is the chosen design, but Ohad wants its TOP (stat
          // strip) to look like CONSOLE (pv3) — so RAIL maps to the console
          // header block. The rest of RAIL (week strip, cards) is unchanged.
          const hv = ({BASE:'1',EDITORIAL:'2',TABLE:'3',CONSOLE:'4',AIR:'5',RAIL:'4'})[ident];
          const blockLabel = visPlans.length ? ((visPlans[0].name||'').replace(/^block\s*/i,'') || visPlans[0].name) : '';
          const metaLbl = {fontSize:9,color:C.tm,fontFamily:FN,letterSpacing:'0.2em',fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap'};
          const metaVal = {fontSize:12,color:C.ac,fontFamily:FN,fontWeight:700,letterSpacing:'0.06em',fontVariantNumeric:'tabular-nums'};
          const metaDot = <span aria-hidden="true" style={{color:C.td,fontSize:10,margin:'0 10px'}}>·</span>;

          // V1 FOCUS — the week's progress is the hero: wide segmented bar
          // centred under the greeting, count beside it; block + sessions
          // demoted to one metadata line below.
          // (Ohad: all three on the SAME ROW) — block identity left, the
          // week progress as the bigger centre element, countdown right.
          if (hv === '1') return (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'2px 2px 0',whiteSpace:'nowrap'}}>
              <span style={metaLbl}>{tt("Block")} <span style={metaVal}>{blockLabel}</span></span>
              {weekDays.length > 0 && (
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  {/* count sits BEFORE the fill blocks (Ohad) */}
                  <span style={{fontSize:15,color:C.ac,fontFamily:FN,fontWeight:700,letterSpacing:'0.02em',fontVariantNumeric:'tabular-nums',lineHeight:1}}>{doneThisWeek}/{weekDays.length}</span>
                  <div style={{display:'flex',gap:4}}>
                    {weekDays.map((d,i)=><div key={i} title={d.name} style={{width:26,height:9,borderRadius:0,background:isDayDone(d)?C.ac:'transparent',border:`1px solid ${isDayDone(d)?C.ac:'var(--c-cardBd)'}`,transition:'background .2s'}}/>)}
                  </div>
                </div>
              )}
              <span style={metaLbl}><span style={metaVal}>{blockLeft}</span> {tt("Left")}</span>
            </div>
          );

          // V2 EDITORIAL — asymmetric two-column: block identity stacked
          // left-ragged, one big countdown number flush right (Nike-style
          // tension between text mass and a single hero numeral).
          if (hv === '2') return (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'2px 2px 0'}}>
              <div style={{display:'flex',flexDirection:'column',gap:6,minWidth:0}}>
                <span style={{fontSize:20,color:C.tx,fontFamily:FN,fontWeight:700,letterSpacing:'0.03em',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:1}}>{tt("Block")} <span style={{color:C.ac}}>{blockLabel}</span></span>
                {weekDays.length > 0 && (
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{...metaLbl,letterSpacing:'0.14em'}}>{doneThisWeek}/{weekDays.length}</span>
                    <div style={{display:'flex',gap:4}}>
                      {weekDays.map((d,i)=><div key={i} title={d.name} style={{width:22,height:7,borderRadius:0,background:isDayDone(d)?C.ac:'transparent',border:`1px solid ${isDayDone(d)?C.ac:'var(--c-cardBd)'}`,transition:'background .2s'}}/>)}
                    </div>
                    <span style={{...metaLbl,letterSpacing:'0.14em'}}>{tt("This Week")}</span>
                  </div>
                )}
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,flexShrink:0}}>
                <span style={{fontSize:34,color:C.ac,fontFamily:FN,fontWeight:700,lineHeight:0.9,letterSpacing:'-0.02em',fontVariantNumeric:'tabular-nums'}}>{blockLeft}</span>
                <span style={metaLbl}>{tt("Left")}</span>
              </div>
            </div>
          );

          // V3 TABLE — one continuous 4px progress track edge to edge
          // (block completion, not just this week), three quiet readouts
          // anchored under it: left / centre / right (car-dash footer).
          const totalPct = total > 0 ? Math.round((completed / total) * 100) : 0;
          if (hv === '3') return (
            <div style={{display:'flex',flexDirection:'column',gap:8,padding:'4px 0 0'}}>
              <div style={{position:'relative',height:4,background:'var(--c-sf2)',overflow:'hidden'}} title={`${completed}/${total} block sessions done`}>
                <div style={{position:'absolute',inset:'0 auto 0 0',width:`${totalPct}%`,background:C.ac,transition:'width .3s'}}/>
              </div>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',whiteSpace:'nowrap'}}>
                <span style={metaLbl}>{tt("Block")} <span style={metaVal}>{blockLabel}</span></span>
                {weekDays.length > 0 && <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
                  <span style={metaVal}>{doneThisWeek}/{weekDays.length}</span>
                  <span style={{display:'inline-flex',gap:3}}>
                    {weekDays.map((d,i)=><span key={i} title={d.name} style={{width:12,height:6,borderRadius:0,display:'inline-block',background:isDayDone(d)?C.ac:'transparent',border:`1px solid ${isDayDone(d)?C.ac:'var(--c-cardBd)'}`}}/>)}
                  </span>
                  <span style={metaLbl}>{tt("Week")}</span>
                </span>}
                <span style={metaLbl}><span style={metaVal}>{blockLeft}</span> {tt("Left")}</span>
              </div>
            </div>
          );

          // V4 CONSOLE — a mono status banner boxed by top+bottom hairlines
          // only. One line: identity left, progress mid, countdown right —
          // inverse-video accents, everything tabular. Symmetric: banner
          // padding 10/10, groups share one baseline.
          if (hv === '4') return (
            <div style={{borderTop:`1px solid ${C.cardBd}`,borderBottom:`1px solid ${C.cardBd}`,padding:'10px 2px',display:'flex',alignItems:'center',justifyContent:'space-between',whiteSpace:'nowrap',gap:10,flexWrap:'wrap',rowGap:6}}>
              {/* The block name WRAPS; it used to truncate. Truncating did stop the
                  week + left groups being shoved off a phone, but it cost the athlete
                  the name of the block he is training: measured on /demo/athlete at
                  390, scrollWidth 202 against clientWidth 152 rendered "BLOCK #4 -
                  HYPE...". Letting the row wrap gives the name a full line and moves
                  the week group under it instead, which is the same answer the header
                  nav needed at this width. Nothing wraps at desktop. */}
              <span style={{fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',color:C.tx,lineHeight:1.35,minWidth:0,overflowWrap:'break-word'}}>{tt("BLOCK")} <span style={{color:C.ac}}>{blockLabel}</span></span>
              {weekDays.length > 0 && <span style={{display:'inline-flex',alignItems:'center',gap:8,fontFamily:FN,flexShrink:0}}>
                <span style={{fontSize:11,fontWeight:700,color:C.ac,fontVariantNumeric:'tabular-nums',lineHeight:1}}>{doneThisWeek}/{weekDays.length}</span>
                {/* squares carry a −1px lift so their geometric centre sits on the
                    text CAP axis, not the font-box centre (caps ride ~1px high in
                    Nord). Measured, matches "0/3"/"WEEK" cap-centres. */}
                <span style={{display:'inline-flex',alignItems:'center',gap:2}}>
                  {weekDays.map((d,i)=><span key={i} title={d.name} style={{width:10,height:10,display:'inline-block',background:isDayDone(d)?C.ac:'var(--c-sf2)',border:`1px solid ${isDayDone(d)?C.ac:C.cardBd}`}}/>)}
                </span>
                <span style={{fontSize:9,color:C.tm,letterSpacing:'0.14em',fontWeight:700,lineHeight:1}}>{tt("WEEK")}</span>
              </span>}
              <span style={{fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',color:C.tm,lineHeight:1,flexShrink:0}}><span style={{color:C.ac,fontVariantNumeric:'tabular-nums'}}>{blockLeft}</span> LEFT</span>
            </div>
          );

          // V5 AIR — no chrome at all: one centred whisper line, values in
          // cyan, progress as small dots, wide tracking. Symmetric around
          // the page centre like the greeting above it.
          if (hv === '5') return (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',whiteSpace:'nowrap',padding:'2px 0 0'}}>
              <span style={{...metaLbl,letterSpacing:'0.24em'}}>{tt("Block")} <span style={metaVal}>{blockLabel}</span></span>
              {weekDays.length > 0 && <>
                {metaDot}
                <span style={{display:'inline-flex',alignItems:'center',gap:8}}>
                  <span style={metaVal}>{doneThisWeek}/{weekDays.length}</span>
                  <span style={{display:'inline-flex',gap:5,alignItems:'center'}}>
                    {weekDays.map((d,i)=><span key={i} title={d.name} style={{width:7,height:7,borderRadius:0,display:'inline-block',transform:'rotate(45deg)',background:isDayDone(d)?C.ac:'transparent',border:`1px solid ${isDayDone(d)?C.ac:'var(--c-cardBd)'}`}}/>)}
                  </span>
                </span>
              </>}
              {metaDot}
              <span style={{...metaLbl,letterSpacing:'0.24em'}}><span style={metaVal}>{blockLeft}</span> {tt("Left")}</span>
            </div>
          );

          // V6 RAIL — the week is the hero: one row, count BEFORE wide fill
          // blocks in the centre at hero scale, block identity left and
          // countdown right as quiet anchors. Same-row rule holds.
          return (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'2px 2px 0',whiteSpace:'nowrap'}}>
              <span style={metaLbl}>{tt("Block")} <span style={metaVal}>{blockLabel}</span></span>
              {weekDays.length > 0 && (
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:17,color:C.ac,fontFamily:FN,fontWeight:700,letterSpacing:'0.02em',fontVariantNumeric:'tabular-nums',lineHeight:1}}>{doneThisWeek}/{weekDays.length}</span>
                  <div style={{display:'flex',gap:4}}>
                    {weekDays.map((d,i)=><div key={i} title={d.name} style={{width:34,height:11,borderRadius:0,background:isDayDone(d)?C.ac:'transparent',borderTop:`2px solid ${isDayDone(d)?C.ac:C.cardBd}`,borderLeft:`1px solid ${isDayDone(d)?C.ac:'var(--c-cardBd)'}`,borderRight:`1px solid ${isDayDone(d)?C.ac:'var(--c-cardBd)'}`,borderBottom:`1px solid ${isDayDone(d)?C.ac:'var(--c-cardBd)'}`,transition:'background .2s'}}/>)}
                  </div>
                </div>
              )}
              <span style={metaLbl}><span style={metaVal}>{blockLeft}</span> {tt("Left")}</span>
            </div>
          );
        })()}
      </div>
      {/* Two-row nav — v2 (Ohad 2026-07-05: "too messy, no borders, nobody
          knows it's clickable"). Same 3+3 grouping as the 05-16 spec, but as
          a SEGMENTED 3×2 GRID: one hairline box, hairlines between every
          cell, active cell filled cyan-tint — the same boxed language as the
          header stats strip and the WEEK selector, and unmistakably buttons. */}
      {(() => {
        const NAV = [
          ['prog','PROGRAM'],['bwt','BW'],['meal','MEAL LOG'],
          ['hist',`HISTORY (${cw.length})`],['pr','PRs'],['msg','MESSAGES'],
        ];
        const unreadDot = (k) => k==='hist' && unreadCoachNotes>0 && <span style={{position:'absolute',top:6,right:8,width:6,height:6,background:C.rd}}/>;

        // EDITORIAL — one left-aligned row of underline tabs riding a
        // continuous baseline hairline (active 2px cyan per stroke ruling).
        if (ident === 'EDITORIAL') return (
          <div style={{padding:'14px 20px 0',position:'relative'}}>
            <style>{`.pv-scroll::-webkit-scrollbar{display:none}`}</style>
            {/* right-edge fade = "there's more" affordance on narrow screens
                where MESSAGES scrolls out of view */}
            <div aria-hidden="true" style={{position:'absolute',top:14,bottom:0,right:20,width:26,background:`linear-gradient(90deg, transparent, ${C.bg})`,pointerEvents:'none',zIndex:1}}/>
            <div className="pv-scroll" style={{display:'flex',gap:0,borderBottom:`1px solid ${C.cardBd}`,overflowX:'auto',scrollbarWidth:'none',msOverflowStyle:'none'}}>
              {NAV.map(([k,l]) =>
                <button key={k} role="tab" aria-selected={vw===k} onClick={() => setVw(k)}
                  style={{padding:'10px 10px',marginBottom:-1,borderRadius:0,border:'none',
                    borderBottom:`2px solid ${vw===k?C.ac:'transparent'}`,
                    background:'transparent',color:vw===k?C.ac:C.tm,
                    fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',
                    cursor:'pointer',position:'relative',whiteSpace:'nowrap',flexShrink:0,
                    transition:'color .15s, border-color .15s'}}>
                  {l}{unreadDot(k)}
                </button>
              )}
            </div>
          </div>
        );

        // CONSOLE — same 3×2 grid geometry, but inverse-video active
        // with a ▸ cursor prefix; every cell mono, tight tracking.
        // RAIL borrows this nav too (Ohad: pv5 top like pv3).
        if (ident === 'CONSOLE' || ident === 'RAIL') return (
          <div style={{padding:'14px 20px 0'}}>
            {/* keep the cyan nav border (cardBd is cyan) — the grey line Ohad
                wanted gone is the header section's bd2 divider, removed below. */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',border:`1px solid ${C.cardBd}`}}>
              {NAV.map(([k,l], i) =>
                <button key={k} role="tab" aria-selected={vw===k} onClick={() => setVw(k)}
                  style={{padding:'11px 4px',borderRadius:0,border:'none',
                    borderLeft: i % 3 ? `1px solid ${C.cardBd}` : 'none',
                    borderTop: i >= 3 ? `1px solid ${C.cardBd}` : 'none',
                    background: vw===k ? C.ac : 'transparent',
                    color: vw===k ? '#000000' : C.tm,
                    fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.14em',
                    cursor:'pointer',position:'relative',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                    transition:'background .12s, color .12s'}}>
                  {vw===k ? '▸ ' : ''}{l}{unreadDot(k)}
                </button>
              )}
            </div>
          </div>
        );

        // AIR — chrome-free: two centred text rows, the active page is
        // a small solid cyan chip; everything else is bare tracked text.
        if (ident === 'AIR') return (
          <div style={{padding:'16px 20px 0',display:'flex',flexDirection:'column',gap:10}}>
            {[NAV.slice(0,3), NAV.slice(3)].map((row, ri) => (
              <div key={ri} style={{display:'flex',justifyContent:'center',gap:26}}>
                {row.map(([k,l]) =>
                  <button key={k} role="tab" aria-selected={vw===k} onClick={() => setVw(k)}
                    style={{padding:'5px 10px',borderRadius:0,border:'none',
                      background: vw===k ? C.ac : 'transparent',
                      color: vw===k ? '#000000' : C.tm,
                      fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.14em',
                      cursor:'pointer',position:'relative',whiteSpace:'nowrap',
                      transition:'background .15s, color .15s'}}>
                    {l}{unreadDot(k)}
                  </button>
                )}
              </div>
            ))}
          </div>
        );

        // BASE (house: SOLID cyan active) + TABLE (quiet tint active) +
        // RAIL (tint active with a 2px cyan top rail echoing the cards) —
        // all share the segmented 3×2 grid geometry.
        const active = (k) => vw === k;
        const activeBg = ident === 'BASE' ? C.ac : 'rgba(57,189,255,0.12)';
        const activeFg = ident === 'BASE' ? '#000000' : C.ac;
        return (
          <div style={{padding:'14px 20px 0'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',border:`1px solid ${C.cardBd}`,background:'var(--c-sf)'}}>
              {NAV.map(([k,l], i) =>
                <button key={k} role="tab" aria-selected={vw===k} onClick={() => setVw(k)}
                  style={{padding:'12px 4px',borderRadius:0,border:'none',
                    borderLeft: i % 3 ? `1px solid ${C.cardBd}` : 'none',
                    borderTop: i >= 3 ? `1px solid ${C.cardBd}` : 'none',
                    boxShadow: ident === 'RAIL' && active(k) ? `inset 0 2px 0 0 ${C.ac}` : 'none',
                    background: active(k) ? activeBg : 'transparent',
                    color: active(k) ? activeFg : C.tm,
                    fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.12em',
                    cursor:'pointer',position:'relative',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                    transition:'background .15s, color .15s'}}>
                  {l}{unreadDot(k)}
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );

  // BW Graph tab
  if (vw === 'bwt' && trainee) {
    const bwData = bwLog.filter(b => b.clientId === ci).sort((a,b) => new Date(a.date) - new Date(b.date));
    const existingBw = bwData.find(b => b.week === wk + 1 && b.blockName === activePlan?.name);
    const bwDisplay = bw || (existingBw ? String(existingBw.bw) : '');
    const rawMax = bwData.length ? Math.max(...bwData.map(b=>b.bw)) : 100;
    const rawMin = bwData.length ? Math.min(...bwData.map(b=>b.bw)) : 50;
    const pad = Math.max((rawMax - rawMin) * 0.2, 1.5);
    const maxBw = rawMax + pad;
    const minBw = rawMin - pad;
    const range = maxBw - minBw;
    return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
      {renderTopHeader()}
      <div style={{padding:'14px 20px 20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
          <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',fontWeight:700}}>{tt("BODYWEIGHT")}</div>
          <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.12em',fontWeight:700}}><bdi>{clientName}</bdi> · {bwData.length} ENTRIES</div>
        </div>

        {/* Quick log */}
        <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:14,marginBottom:16}}>
          {visPlans.length > 1 && <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
            {visPlans.map(p => <button key={p.name} onClick={() => setSelectedBlockName(p.name)}
              style={{padding:'4px 10px',borderRadius:0,border:`${activePlan?.name===p.name?'2px':'0.25px'} solid ${C.ac}${activePlan?.name===p.name?'':'4D'}`,background:'transparent',color:activePlan?.name===p.name?C.ac:C.tm,fontFamily:FN,fontSize:11,fontWeight:600,cursor:'pointer'}}>{p.name}</button>)}
          </div>}
          {visPlans.length > 1 && <div style={{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap'}}>
            {Array.from({length: activePlan?.weeks || 4}, (_, w) => <button key={w} onClick={() => setWk(w)} style={{flex:'1 1 40px',padding:'6px 0',borderRadius:0,border:`${wk===w?'2px':'0.25px'} solid ${C.ac}${wk===w?'':'4D'}`,background:'transparent',color:wk===w?C.ac:C.tm,fontFamily:FN,fontSize:11,fontWeight:600,cursor:'pointer'}}>W{w+1}</button>)}
          </div>}
          <div style={{fontSize:9,fontFamily:FN,color:C.tm,marginBottom:8,textAlign:'center',letterSpacing:'0.18em',fontWeight:700}}>LOG W{wk+1} · {activePlan?.name || 'NO ACTIVE BLOCK'}</div>
          <div style={{display:'flex',gap:8}}>
            <input value={bwDisplay} onChange={e => setBw(e.target.value)} placeholder="Weight in kg" type="number" disabled={!activePlan} style={{flex:1,background: 'var(--c-sf2)',border:`1px solid ${existingBw?'rgba(46,213,115,0.376)':C.ac}`,borderRadius:0,padding:'10px 12px',color:C.tx,fontFamily:FN,fontSize:14,outline:'none',boxSizing:'border-box',opacity:activePlan?1:0.5,textAlign:'center'}}/>
            <button disabled={!activePlan||demoMode} onClick={()=>{if(demoMode)return;const val=bw||bwDisplay;if(val&&Number.isFinite(parseFloat(val))&&activePlan){setBwLog(prev=>{const filtered=prev.filter(b=>!(b.clientId===ci&&b.blockName===activePlan.name&&b.week===wk+1));return[...filtered,{date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(val),blockName:activePlan.name,planId:activePlan.id||null}]});setBw('')}}}
              style={{padding:'10px 20px',borderRadius:0,border:`1px solid ${(bw&&activePlan)?C.ac:C.cardBd}`,background:'transparent',color:(bw&&activePlan)?C.ac:C.td,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',cursor:(bw&&activePlan)?'pointer':'default'}}>{tt("SAVE")}</button>
          </div>
          {!activePlan && <div style={{fontSize:10,color:C.td,marginTop:6}}>Assign an active program to log bodyweight.</div>}
        </div>

        {/* Graph */}
        {bwData.length < 2 ? (
          <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:40,textAlign:'center',color:C.td,marginBottom:16}}>
            <div style={{fontSize:24,marginBottom:8}}>📊</div>
            <div style={{fontSize:13}}>Log at least 2 weigh-ins to see your trend</div>
          </div>
        ) : (
          <div style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,padding:14,marginBottom:16}}>
            <div style={{fontSize:10,fontFamily:FN,color:C.ac,letterSpacing:'0.15em',fontWeight:700,marginBottom:10}}>{tt("TREND")}</div>
            <svg viewBox={`0 -10 ${Math.max(bwData.length * 60, 300)} 185`} style={{width:'100%',height:185}}>
              {/* Grid lines */}
              {[0,0.25,0.5,0.75,1].map((p,i) => {
                const y = 10 + p * 130;
                const val = (maxBw - p * range).toFixed(1);
                return <g key={i}>
                  <line x1="40" y1={y} x2={Math.max(bwData.length*60,300)-10} y2={y} stroke={C.bd} strokeWidth="0.5" strokeDasharray="4"/>
                  <text x="36" y={y+4} fill={C.tm} fontSize="9" fontFamily={FN} textAnchor="end">{val}</text>
                </g>;
              })}
              {/* Line + dots */}
              <polyline fill="none" stroke={C.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                points={bwData.map((d,i) => `${50+i*50},${10+((maxBw-d.bw)/range)*130}`).join(' ')}/>
              {bwData.map((d,i) => {
                const x = 50 + i * 50;
                const y = 10 + ((maxBw - d.bw) / range) * 130;
                const prevBlock = i>0 ? bwData[i-1].blockName : null;
                const blockChanged = d.blockName && d.blockName !== prevBlock;
                const mNum = d.blockName?.match(/#(\d+)/);
                const blockAbbrev = mNum ? 'B'+mNum[1] : (d.blockName ? d.blockName.slice(0,4) : '?');
                const prevY = i>0 ? 10+((maxBw-bwData[i-1].bw)/range)*130 : null;
                const nextY = i<bwData.length-1 ? 10+((maxBw-bwData[i+1].bw)/range)*130 : null;
                const prevDown = prevY!=null ? prevY>y : null;
                const nextDown = nextY!=null ? nextY>y : null;
                const dirs = [prevDown,nextDown].filter(v=>v!=null);
                const isPeak = dirs.length>0 && dirs.every(v=>v===true);
                const isTrough = dirs.length>0 && dirs.every(v=>v===false);
                let labelX=x, labelY, anchor='middle';
                if (!isPeak && !isTrough && prevY!=null && nextY!=null) {
                  const ascending = nextY<prevY;
                  labelX = ascending ? x-6 : x+6;
                  labelY = y-4;
                  anchor = ascending ? 'end' : 'start';
                } else {
                  let above = isPeak;
                  if (above && y<6) above=false;
                  else if (!above && y>132) above=true;
                  labelY = above ? y-8 : y+14;
                }
                return <g key={i}>
                  {blockChanged && <line x1={x-25} y1="10" x2={x-25} y2="140" stroke={C.bd2||C.bd} strokeWidth="0.5" strokeDasharray="2"/>}
                  <circle cx={x} cy={y} r="3" fill={C.ac}/>
                  <text x={labelX} y={labelY} fill={C.tx} fontSize="10" fontFamily={FN} textAnchor={anchor} fontWeight="600">{d.bw}</text>
                  <text x={x} y={152} fill={C.tm} fontSize="8" fontFamily={FN} textAnchor="middle">{blockAbbrev}·W{d.week||'?'}</text>
                  <text x={x} y={163} fill={C.tm} fontSize="7" fontFamily={FN} textAnchor="middle">{new Date(d.date).toLocaleDateString('he-IL',{day:'numeric',month:'numeric'})}</text>
                </g>;
              })}
            </svg>
            {/* Stats */}
            <div style={{display:'flex',gap:8,marginTop:10}}>
              <div style={{flex:1,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.12em',fontWeight:700}}>{tt("LATEST")}</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:C.tx}}>{bwData[bwData.length-1].bw}kg</div>
              </div>
              <div style={{flex:1,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.12em',fontWeight:700}}>{tt("CHANGE")}</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:(bwData[bwData.length-1].bw-bwData[0].bw)<=0?C.gn:C.or}}>
                  {(bwData[bwData.length-1].bw-bwData[0].bw)>0?'+':''}{(bwData[bwData.length-1].bw-bwData[0].bw).toFixed(1)}kg</div>
              </div>
              <div style={{flex:1,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.12em',fontWeight:700}}>{tt("ENTRIES")}</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:C.tx}}>{bwData.length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Log history — collapsible; the strip is the toggle handle. Rows are
            NOT clickable (clicking used to jump the value into the LOG box +
            let you re-save it — Ohad: must not). Delete stays via the × only. */}
        <button onClick={() => setBwHistOpen(o => !o)} style={{display:'flex',alignItems:'center',gap:8,background:'transparent',border:'none',padding:0,marginBottom:8,cursor:'pointer'}}>
          <span style={{fontSize:9,color:C.td,fontFamily:FN}}>{bwHistOpen ? '▾' : '▸'}</span>
          <span style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',fontWeight:700}}>HISTORY{bwData.length ? ` · ${bwData.length}` : ''}</span>
        </button>
        {bwHistOpen && bwData.slice().reverse().map((d,i) => {
          const onDelete = (e) => { e.stopPropagation(); setBwDeleteConfirm(d); };
          return <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,marginBottom:4}}>
            <div>
              <span style={{fontSize:13,fontWeight:600,fontFamily:FN,color:C.tx}}>{d.bw} kg</span>
              <span style={{fontSize:11,color:C.tm,marginLeft:8,fontFamily:FN}}>{d.blockName||'?'} · W{d.week||'?'}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:10,color:C.td,fontFamily:FN}}>{fmtPrettyDate(d.date)}</span>
              <button onClick={onDelete} title="Delete entry" style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,color:C.td,cursor:'pointer',fontSize:14,padding:'2px 6px',borderRadius:0,lineHeight:1}}>×</button>
            </div>
          </div>;
        })}
        {bwHistOpen && bwData.length === 0 && <div style={{textAlign:'center',padding:20,color:C.td,fontSize:13}}>{tt("No bodyweight entries yet")}</div>}
      </div>
      {bwDel.value && createPortal(<div role="dialog" aria-modal="true" aria-label="Delete bodyweight entry" className={bwDel.closing ? 'motion-fade-out' : 'motion-fade-in'} onClick={() => setBwDeleteConfirm(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}}>
        <div onClick={e=>e.stopPropagation()} className={bwDel.closing ? 'motion-fall' : 'motion-rise'} style={{background:C.bg,border:`1px solid ${C.cardBd}`,borderRadius:0,padding:24,maxWidth:320,width:'100%'}}>
          <div style={{fontFamily:FN,fontSize:10,color:C.td,marginBottom:8,letterSpacing:'0.12em',fontWeight:700}}>{tt("DELETE ENTRY")}</div>
          <div style={{fontSize:13,color:C.tx,marginBottom:20,fontFamily:FB,lineHeight:1.5}}>Remove {bwDel.value.bw}kg from {bwDel.value.blockName || '?'} · W{bwDel.value.week || '?'}?</div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={() => setBwDeleteConfirm(null)} style={{flex:1,padding:'10px 0',borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer'}}>{tt("CANCEL")}</button>
            <button onClick={() => { const d = bwDel.value; if (d) setBwLog(prev => prev.filter(b => !(b.clientId===d.clientId && b.blockName===d.blockName && b.week===d.week && b.date===d.date))); setBwDeleteConfirm(null); }} style={{flex:1,padding:'10px 0',borderRadius:0,border:`1px solid ${C.rd}`,background:'transparent',color:C.rd,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer'}}>{tt("DELETE")}</button>
          </div>
        </div>
      </div>, document.body)}
    </div>;
  }

  // PRs (per-exercise weight progression)
  if (vw === 'pr' && trainee) {
    return <TraineePRsView clientWorkouts={cw} traineeId={ci} header={renderTopHeader()} />;
  }

  // Check-in trends graph — renders the SHARED CheckinTrends component (also
  // used on the coach trainee page) inside the portal chrome, so the two stay
  // identical. Reached from the "READINESS GRAPH →" link in History.
  if (vw === 'chk' && trainee) {
    const checkinCount = cw.filter(w => hasReadiness(w.autoregulation)).length;
    return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
      {renderTopHeader()}
      <div style={{padding:'14px 20px 20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
          <button onClick={() => setVw('hist')} style={{background:'transparent',border:'none',color:C.ac,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.18em',cursor:'pointer',padding:0}}>← HISTORY</button>
          <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.12em',fontWeight:700}}><bdi>{clientName}</bdi> · {checkinCount} CHECK-IN{checkinCount===1?'':'S'}</div>
        </div>
        <CheckinTrends workouts={cw} />
      </div>
    </div>;
  }

  // History
  if (vw === 'hist' && trainee) return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
    {renderTopHeader()}
    <div style={{padding:'14px 20px 20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:14}}>
        <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',fontWeight:700}}>HISTORY · {cw.length} SESSION{cw.length===1?'':'S'}</div>
        {/* Graph button — same shape as the coach dashboard buttons; opens the
            check-in trends view. Always shown once there's any history so the
            feature is discoverable; the trends view carries its own empty state
            until the athlete has logged check-ins. */}
        {/* Small text CTA (no icon, no box) — matches the HISTORY label scale. */}
        {cw.length > 0 && <button onClick={() => setVw('chk')} style={{background:'transparent',border:'none',color:C.ac,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.16em',padding:0,cursor:'pointer',whiteSpace:'nowrap'}}>READINESS GRAPH →</button>}
      </div>
      {cw.length === 0 ? <div style={{textAlign:'center',padding:40,color:C.td}}>No workouts yet.</div> :
        // Sort newest-first by date at render time. The DB query returns date
        // DESC, but handleComplete optimistically APPENDS a just-finished
        // session to the end of cw — so relying on array order stranded the
        // workout the athlete just completed at the very BOTTOM of History.
        // Sorting here is order-independent and always puts today's session up
        // top. (~dozens of rows; trivial cost.)
        [...cw].sort((a,b) => new Date(b.date||0) - new Date(a.date||0)).map(w => { const wActive = !!expandedHistEx && expandedHistEx.startsWith(w.id + ':'); return <div key={w.id} style={{background:'var(--c-sf)',border:`${wActive?'2px':'0.25px'} solid ${C.ac}${wActive?'':'4D'}`,borderRadius:0,padding:12,paddingBottom:4,marginBottom:8}}>
          {/* header strip — day/block on the left, date/week on the right, on a
              tinted band with a cyan left rail + bottom border (card-header look
              like the coach dashboard). Spans the card via negative margins. */}
          <div style={{background:'var(--c-sf2)',borderLeft:`3px solid ${C.ac}`,borderBottom:`1px solid ${C.cardBd}`,margin:'-12px -12px 10px',padding:'8px 12px',display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:10}}>
            {/* order: DAY · W# · BLOCK — the week sits between the day and the
                block (Ohad); the date moves to the right on its own. */}
            <div style={{fontFamily:FN,fontWeight:700,fontSize:13,letterSpacing:'0.02em',minWidth:0,whiteSpace:'normal',overflowWrap:'break-word',lineHeight:1.3}}>{w.dayName} <span style={{color:C.ac,fontWeight:700,fontSize:11,letterSpacing:'0.04em'}}>· W{w.week} ·</span> <span style={{color:C.tm,fontWeight:400,fontSize:12}}>{w.planName}</span></div>
            <div style={{fontSize:10,fontFamily:FN,color:C.tm,letterSpacing:'0.08em',whiteSpace:'nowrap',flexShrink:0}}>{fmtPrettyDate(w.date)}</div>
          </div>
          {/* Pre-workout readiness check-in the athlete logged for this session. */}
          {hasReadiness(w.autoregulation) && <div style={{marginBottom:10,paddingBottom:8,borderBottom:`1px solid ${C.cardBd}`}}><ReadinessRow data={w.autoregulation} showTitle /></div>}
          {(w.exercises || []).map((x,i) => {
            const fv = (w.formVideos || [])[i];
            const hasVideo = !!(fv && fv.cloudUrl);
            const notesCount = (fv?.reviewNotes || []).reduce((a, n) => a + 1 + (n.replies?.length || 0), 0);
            const expandKey = `${w.id}:${i}`;
            const isOpen = expandedHistEx === expandKey;
            const canExpand = hasVideo; // only exercises with a video get the tap-to-expand affordance
            return (
              <div key={i} style={{marginTop:2}}>
                <div onClick={canExpand ? () => setExpandedHistEx(isOpen ? null : expandKey) : undefined}
                  role={canExpand ? 'button' : undefined} tabIndex={canExpand ? 0 : undefined} aria-expanded={canExpand ? isOpen : undefined}
                  onKeyDown={canExpand ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedHistEx(isOpen ? null : expandKey); } }) : undefined}
                  style={{fontSize:11,fontFamily:FN,color:C.tm,display:'flex',alignItems:'center',gap:6,cursor:canExpand?'pointer':'default',padding:'3px 0'}}>
                  <span style={{flex:1,minWidth:0,color:C.tx,display:'flex',gap:6}}><span style={{width:22,textAlign:'right',flexShrink:0,color:C.td}}>{i+1}.</span><span style={{minWidth:0}}>{x.title} <span style={{color:C.td}}>{x.prescribed} · {(x.sets||[]).filter(s=>s.done).length}/{(x.sets||[]).length}</span></span></span>
                  {/* VIDEO + NOTES are uniform bare caps tags (matching weight/
                      size, each with a leading severity dot) so the row reads as
                      one clean cluster instead of a bare label next to a boxed
                      pill (Ohad: the mixed treatment looked awkward). */}
                  {hasVideo && <span style={{display:'inline-flex',alignItems:'center',gap:4,color:C.gn,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',lineHeight:1}}><span style={{width:5,height:5,background:C.gn,borderRadius:'50%'}}/>{tt("VIDEO")}</span>}
                  {notesCount > 0 && <span style={{display:'inline-flex',alignItems:'center',gap:4,color:C.ac,fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',lineHeight:1}}><span style={{width:5,height:5,background:C.ac,borderRadius:'50%'}}/>{notesCount} {notesCount===1?'NOTE':'NOTES'}</span>}
                  {canExpand && <span style={{color:C.td,fontSize:10}}>{isOpen ? '▲' : '▼'}</span>}
                </div>
                {isOpen && hasVideo && (
                  <div style={{marginTop:6,marginBottom:10,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:8}}>
                    <FormVideoPlayer url={fv.cloudUrl} exerciseTitle={x.title}
                      role="client"
                      reviewNotes={fv.reviewNotes || []}
                      onReviewNotesChange={updateFormVideos ? (nextNotes) => {
                        const updated = (w.formVideos || []).map((fvi, fi) => fi === i ? { ...fvi, reviewNotes: nextNotes } : fvi);
                        updateFormVideos(w.id, updated);
                      } : null}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {w.notes && <div style={{fontSize:11,color:C.tm,marginTop:4,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,padding:6,borderRadius:0,fontFamily:FN}}><span style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',color:C.ac,marginInlineEnd:6}}>NOTE</span><bdi>{w.notes}</bdi></div>}
        </div>; })}</div></div>;

  // MEAL LOG page — full-screen, lazy-loaded.
  if (vw === 'meal' && trainee) return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
    {renderTopHeader()}
    <div style={{padding:'14px 20px 28px'}}>
      {ci ? (
        <React.Suspense fallback={<div style={{textAlign:'center',color:C.td,padding:40,fontFamily:FN,fontSize:11,letterSpacing:'0.18em',fontWeight:700}}>LOADING…</div>}>
          <MealLogger clientId={ci} page demoMode={demoMode} />
        </React.Suspense>
      ) : null}
    </div>
  </div>;

  // MESSAGES page — surfaces the same thread that lived inline on the
  // Program view before 2026-05-16.
  if (vw === 'msg' && trainee) return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
    {renderTopHeader()}
    <div style={{padding:'14px 20px 28px'}}>
      {ci ? (
        <>
          {!demoMode && <PushToggle role="athlete" />}
          <CoachMessagesAthlete
            traineeId={ci}
            role="athlete"
            demoMode={demoMode}
            recipientEmail="ohadyproductions@gmail.com"
            senderLabel={(trainee?.name || '').split(' ')[0] || 'your athlete'} />
        </>
      ) : null}
    </div>
  </div>;

  // Program view
  if (trainee) { const lb = bwLog.filter(b => b.clientId === ci).slice().sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-1)[0]?.bw;   // chronologically latest, not last-appended (re-saving an older week reorders the array)
    return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
      {renderTopHeader()}
      <div style={{padding:'14px 20px 20px'}}>
        {/* flex-end so the WEEK strip and KG box bottom-align exactly — their
            labels differ by a sub-pixel, and centring offset the boxes ~0.8px
            (Ohad: "kg and wk4 not aligned"). */}
        <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'flex-end'}}>
          {/* WEEK selector hidden for daily-routine plans — they have no
              week structure. BW input stays useful regardless. */}
          {/* v2 — WEEK is a single segmented strip (equal cells inside one
              hairline box, active cell filled) so it speaks the same boxed
              language as the header stats strip; label style matches the
              strip cell labels. */}
          {activePlan?.kind !== 'daily' && <div style={{flex:1}}><div style={{fontSize:8,fontFamily:FN,color:C.tm,marginBottom:6,letterSpacing:'0.16em',fontWeight:700}}>{tt("WEEK")}</div>
            {/* Weeks per identity. All fixed 32px so the KG input stays
                level in every version. */}
            {(() => {
              const N = activePlan ? (activePlan.weeks || 4) : 4;
              const mk = (w, styles) => activePlan
                ? <button key={w} onClick={() => setWk(w)} style={styles}>W{w+1}</button>
                : <div key={w} style={{...styles,opacity:0.3,display:'flex',alignItems:'center',justifyContent:'center',border:styles.border||'none'}}>—</div>;
              // EDITORIAL — underline text (coherent: the nav is underline too)
              if (ident === 'EDITORIAL') return (
                <div style={{display:'flex',height:32,alignItems:'stretch',borderBottom:`1px solid ${C.cardBd}`}}>
                  {Array.from({length:N},(_,w)=>mk(w,{flex:1,padding:0,marginBottom:-1,borderRadius:0,border:'none',borderBottom:`2px solid ${activePlan&&wk===w?C.ac:'transparent'}`,background:'transparent',color:activePlan&&wk===w?C.ac:C.tm,fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',cursor:'pointer',transition:'color .15s, border-color .15s'}))}
                </div>);
              // TABLE — one fused segmented strip (instrument cluster)
              if (ident === 'TABLE') return (
                <div style={{display:'grid',gridTemplateColumns:`repeat(${N}, 1fr)`,border:`1px solid ${C.cardBd}`,height:32,boxSizing:'border-box'}}>
                  {Array.from({length:N},(_,w)=>mk(w,{padding:0,borderRadius:0,border:'none',borderLeft:w?`1px solid ${C.cardBd}`:'none',background:activePlan&&wk===w?'rgba(57,189,255,0.12)':'transparent',color:activePlan&&wk===w?C.ac:C.tm,fontFamily:FN,fontSize:11,fontWeight:activePlan&&wk===w?700:600,letterSpacing:'0.06em',cursor:'pointer',transition:'color .15s, background .15s'}))}
                </div>);
              // CONSOLE — mono chips, ACTIVE = inverse video
              if (ident === 'CONSOLE') return (
                <div style={{display:'flex',gap:4,height:32,alignItems:'stretch'}}>
                  {Array.from({length:N},(_,w)=>mk(w,{flex:1,padding:0,borderRadius:0,border:`1px solid ${activePlan&&wk===w?C.ac:C.cardBd}`,background:activePlan&&wk===w?C.ac:'transparent',color:activePlan&&wk===w?'#000000':C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer',transition:'color .12s, background .12s'}))}
                </div>);
              // AIR — bare text, active = cyan + weight only (full 32px
              // hit-targets so the row bottoms out level with the KG box)
              if (ident === 'AIR') return (
                <div style={{display:'flex',height:32,alignItems:'stretch',justifyContent:'space-between',padding:'0 4px'}}>
                  {Array.from({length:N},(_,w)=>mk(w,{padding:'0 8px',height:32,borderRadius:0,border:'none',background:'transparent',color:activePlan&&wk===w?C.ac:C.tm,fontFamily:FN,fontSize:12,fontWeight:activePlan&&wk===w?700:500,letterSpacing:'0.08em',cursor:'pointer',transition:'color .15s'}))}
                </div>);
              // RAIL — separate bordered boxes (each 32px border-box, own 1px
              // border) so every week box is EXACTLY the same size as the KG
              // input (also 32px border-box) — Ohad: KG must match the weeks.
              // The RAIL identity is kept via the 2px cyan top rail on active.
              if (ident === 'RAIL') return (
                <div style={{display:'flex',gap:4,alignItems:'stretch'}}>
                  {Array.from({length:N},(_,w)=>mk(w,{flex:1,height:32,boxSizing:'border-box',padding:0,borderRadius:0,border:`1px solid ${activePlan&&wk===w?C.ac:C.cardBd}`,boxShadow:activePlan&&wk===w?`inset 0 2px 0 0 ${C.ac}`:'none',background:activePlan&&wk===w?'rgba(57,189,255,0.12)':'transparent',color:activePlan&&wk===w?C.ac:C.tm,fontFamily:FN,fontSize:11,fontWeight:activePlan&&wk===w?700:600,letterSpacing:'0.06em',cursor:'pointer',transition:'color .15s, background .15s, border-color .15s'}))}
                </div>);
              // BASE — compact separated boxes, tint active (approved)
              return (
                <div style={{display:'flex',gap:4,height:32,alignItems:'stretch'}}>
                  {Array.from({length:N},(_,w)=>mk(w,{flex:1,padding:0,borderRadius:0,border:`1px solid ${activePlan&&wk===w?C.ac:C.cardBd}`,background:activePlan&&wk===w?'rgba(57,189,255,0.12)':'transparent',color:activePlan&&wk===w?C.ac:C.tm,fontFamily:FN,fontSize:11,fontWeight:activePlan&&wk===w?700:600,letterSpacing:'0.06em',cursor:'pointer',transition:'color .15s, background .15s, border-color .15s'}))}
                </div>);
            })()}</div>}
          <div style={{width:120}}><div style={{fontSize:9,fontFamily:FN,marginBottom:6,letterSpacing:'0.14em',fontWeight:700,textAlign:'center'}}><span style={{color:C.tm}}>{tt("BW")}</span>{lb?<span style={{color:C.ac}}>{` · ${lb}KG`}</span>:''}</div>
            <div style={{display:'flex',gap:4}}>
            {/* KG matches the week cells: 32px border-box in every identity;
                underline material where the identity is underline/bare. */}
            <input value={bw} onChange={e => setBw(e.target.value)} placeholder="KG" type="number" disabled={!activePlan}
              style={(ident === 'EDITORIAL' || ident === 'AIR')
                ? {background:'transparent',border:'none',borderBottom:`1px solid ${C.cardBd}`,borderRadius:0,height:32,padding:'0 8px',color:C.tx,fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',opacity:activePlan?1:0.5}
                : {background:'transparent',border:`1px solid ${C.cardBd}`,borderRadius:0,height:32,padding:'0 8px',color:C.tx,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.06em',outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',opacity:activePlan?1:0.5}}/>
            {bw && Number.isFinite(parseFloat(bw)) && activePlan && <button onClick={()=>{setBwLog(prev=>{const filtered=prev.filter(b=>!(b.clientId===ci&&b.blockName===activePlan.name&&b.week===wk+1));return[...filtered,{date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(bw),blockName:activePlan.name,planId:activePlan.id||null}]});setBw('')}} style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,padding:'4px 10px',color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer',whiteSpace:'nowrap'}}>{tt("SAVE")}</button>}
            </div></div></div>
        {activePlan?.rest && <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'10px 14px',marginBottom:14,fontSize:12,color:C.tm,fontFamily:FN}}><span style={{color:C.td,fontSize:9,fontWeight:700,letterSpacing:'0.15em',marginRight:10}}>{tt("REST")}</span>{activePlan.rest}</div>}
        {unreadCoachNotes > 0 && <div onClick={() => setVw('hist')}
          role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVw('hist'); } }}
          style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,padding:'12px 14px',marginBottom:14,cursor:'pointer',display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:6,height:6,background:C.ac,flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,color:C.ac,fontWeight:700,fontFamily:FN,letterSpacing:'0.02em'}}>{unreadCoachNotes} new note{unreadCoachNotes===1?'':'s'} from Ohad</div>
            <div style={{fontSize:9,color:C.tm,marginTop:3,fontFamily:FN,letterSpacing:'0.12em',textTransform:'uppercase'}}>View in History →</div>
          </div>
        </div>}
        {ci && !demoMode && <AthleteChallengesWidget clientId={ci} clientWorkouts={clientWorkouts} bwLog={bwLog} traineesById={Object.fromEntries((trainees||[]).map(t=>[t.id,t]))} />}
        {/* Messages + Meal Log used to render inline here. Both are
            now their own pages (vw='msg' / vw='meal') reached via the
            two-row nav above. Removed 2026-05-16. */}
        {plansLoadError && <div style={{background:'var(--c-sf)',border:`1px solid ${C.rd||'#c94444'}`,borderRadius:0,padding:14,marginBottom:14}}>
          <div style={{fontSize:11,color:C.rd||'#ff6b6b',fontWeight:700,fontFamily:FN,letterSpacing:'0.1em',marginBottom:6,textTransform:'uppercase'}}>{tt("Couldn't load programs")}</div>
          <div style={{fontSize:11,color:C.tm,marginBottom:10}}>{plansLoadError}</div>
          <button onClick={()=>{setPlansLoadError(null);setPlansReloadKey(k=>k+1);}} style={{background:'var(--c-sf)',border:`1px solid ${C.rd||'#c94444'}`,color:C.rd||'#ff6b6b',borderRadius:0,padding:'6px 14px',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',cursor:'pointer'}}>{tt("RETRY")}</button>
        </div>}
        {visPlans.length===0 && !plansLoadError && <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'40px 30px',textAlign:'center',color:C.td,marginBottom:14}}><div style={{fontSize:10,fontFamily:FN,fontWeight:700,letterSpacing:'0.18em',color:C.tm,marginBottom:10}}>{tt("NO ACTIVE PROGRAM")}</div><div style={{fontSize:13,color:C.td}}>Contact your coach to start training.</div></div>}
        {/* Per-plan block: divider → warm-up → rest → training days */}
        {(()=>{ let globalDayIdx = 0;
          // ── buildCard: ONE card renderer, six identities ────────────────
          // rows: [{num, rx, tempo, title, focus?}]; accent = C.or (warm-up)
          // or C.ac (day); header extras (✓ / N LOGGED) and the LOG action
          // are passed in so warm-up and day cards share every identity's
          // chrome and rhythm exactly (Ohad: same design, obviously).
          const buildCard = ({ key, accent, title, count, extras = null, action = null, rows, borderColor, countColor, tempoColor = TEMPO_COLOR }) => {
            const hair = C.cardBd;
            const isWu = accent === C.or;
            const numOf = (n) => ident === 'CONSOLE' ? String(n).padStart(2,'0') : String(n);
            // Row: two-line everywhere except TABLE (single-line data row).
            const exRow = (r, i) => {
              // AIR breathes: dividers at ~40% of the house hairline
              const divider = i
                ? (ident === 'CONSOLE' ? `1px dashed ${hair}`
                  : ident === 'AIR' ? '1px solid rgba(127,127,131,0.16)'
                  : `1px solid ${hair}`)
                : 'none';
              if (ident === 'TABLE') return (
                <div key={i} style={{padding:'8px 0',borderTop:divider,display:'flex',alignItems:'center',gap:10}}>
                  {/* width 20 (not 18): every ident indents row content 30px
                      (num 20 + gap 10) so OverviewFocus's fixed 30px
                      marginInlineStart lines up everywhere */}
                  <span style={{width:20,flexShrink:0,fontFamily:FN,fontSize:10,fontWeight:700,color:C.td,fontVariantNumeric:'tabular-nums',textAlign:'right'}}>{numOf(r.num)}</span>
                  <span style={{flex:1,minWidth:0,fontWeight:600,fontSize:12,lineHeight:1.3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.title}</span>
                  {/* fixed tempo column so the orange values form a true rail
                      instead of floating ragged between title and rx */}
                  <span dir="ltr" style={{fontSize:10,color:tempoColor,fontFamily:FN,letterSpacing:'0.04em',flexShrink:0,whiteSpace:'nowrap',minWidth:76,textAlign:'right',unicodeBidi:'isolate'}}>{r.tempo || ''}</span>
                  <span dir="ltr" style={{unicodeBidi:'isolate',fontSize:11,fontWeight:700,color:C.ac,fontFamily:FN,letterSpacing:'0.04em',flexShrink:0,whiteSpace:'nowrap',width:72,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{r.rx}</span>
                </div>
              );
              // number element per identity — square (BASE/RAIL), mono
              // listing number (CONSOLE/EDITORIAL), bare numeral (AIR)
              const numEl = (ident === 'BASE' || ident === 'RAIL')
                ? <div style={{width:20,height:20,borderRadius:0,background:'var(--c-sf)',border:`1px solid ${hair}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:FN,fontSize:11,fontWeight:700,color:C.tx,flexShrink:0,lineHeight:1}}>{r.num}</div>
                : <span style={{width:20,flexShrink:0,fontFamily:FN,fontSize:11,fontWeight:700,color:ident==='AIR'?accent:C.td,fontVariantNumeric:'tabular-nums',textAlign:ident==='AIR'?'left':'right',lineHeight:'20px'}}>{numOf(r.num)}</span>;
              return (
                <div key={i} style={{padding: ident==='AIR' ? '9px 0 10px' : '7px 0 8px',borderTop:divider}}>
                  <div style={{display:'flex',gap:10,alignItems:'center'}}>
                    {numEl}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
                        {(() => {
                          // reps cyan; the rest/tempo after the first comma goes
                          // grey so combined free-text ("5XI, 30 SEC REST") reads
                          // the same as the logger + day rows (consistency).
                          // The prescription is split at the first comma so the
                          // part after it can be tinted. The source often has a
                          // SPACE before that comma ("5x1 , 30 sec rest"), so the
                          // split put it at the end of the first span and it
                          // rendered as "5X1 , 30 SEC REST" — a comma floating
                          // away from its number, on the one line that tells an
                          // athlete what to lift.
                          //
                          // Trim it. (An earlier version of this fix blamed RTL
                          // bidi reordering and wrapped the pair in an isolate.
                          // That explanation was wrong — this portal renders
                          // LTR, direction:ltr on html, body and the element —
                          // and it only appeared to work because inline-block
                          // collapsed the trailing space. The isolate is kept:
                          // harmless, and correct if this ever renders RTL.)
                          const rx = String(r.rx || ''); const ci = rx.indexOf(',');
                          const base = {fontSize:11,fontWeight:700,fontFamily:FN,letterSpacing:'0.04em'};
                          const iso = {};
                          if (ci === -1) return <span dir="ltr" style={{...base,...iso,color:C.ac}}>{rx}</span>;
                          return <span dir="ltr" style={iso}><span style={{...base,color:C.ac}}>{rx.slice(0,ci).trimEnd()}</span><span style={{...base,color:tempoColor}}>{rx.slice(ci)}</span></span>;
                        })()}
                        {r.tempo && <span dir="ltr" style={{fontSize:11,color:tempoColor,fontFamily:FN,letterSpacing:'0.04em',unicodeBidi:'isolate',display:'inline-block'}}>{r.tempo}</span>}
                      </div>
                      <div style={{marginTop:4,fontWeight:600,fontSize:12,lineHeight:1.35,wordBreak:'break-word'}}>{r.title}</div>
                    </div>
                  </div>
                  {r.focus && <OverviewFocus text={r.focus} />}
                </div>
              );
            };
            // LOG action per identity: bordered chip (BASE/TABLE/CONSOLE/
            // RAIL) or a text link (EDITORIAL/AIR).
            const actionEl = action && ((ident === 'EDITORIAL' || ident === 'AIR')
              ? <button onClick={action.onClick} style={{background:'none',border:'none',padding:0,color:C.ac,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.14em',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>{action.label} →</button>
              : <button onClick={action.onClick} style={{padding:'5px 16px',minWidth:78,borderRadius:0,border:`1px solid ${C.ac}`,background:'transparent',color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.15em',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{action.label}</button>);
            const titleGroup = (size, tracking) => (
              <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
                {/* Count is BASELINE-aligned to the title, then lifted so its INK
                    center matches the title-caps ink center (Ohad: optically
                    centered). Calibrated from real Nord pixel-ink measurement:
                    title-caps ink-center ≈ 0.333·size above baseline, the 10px
                    count ≈ 3.28 above — so lift = 3.28−0.333·size (−1.05px at
                    size 13). Same value for "(N)" and "N EX". */}
                <span style={{display:'inline-flex',alignItems:'baseline',gap:7,whiteSpace:'nowrap',minWidth:0,lineHeight:1}}>
                  <span style={{fontWeight:700,fontSize:size,fontFamily:FN,letterSpacing:tracking,textTransform:'uppercase',lineHeight:1,color:ident==='EDITORIAL'&&accent===C.or?C.or:(accent===C.or?C.or:C.tx),overflowWrap:'break-word'}}>{title}</span>
                  <span style={{fontSize:10,color:countColor || C.tm,fontFamily:FN,letterSpacing:'0.08em',textTransform:'uppercase',lineHeight:1,transform:`translateY(${(3.28 - 0.333 * size).toFixed(2)}px)`,...(countColor?{opacity:0.65}:{})}}>{count}</span>
                </span>
                {extras}
              </div>
            );
            // ── card chrome per identity ──
            if (ident === 'EDITORIAL') return (
              <div key={key} style={{background:'var(--c-sf)',borderLeft:`3px solid ${accent}`,borderRadius:0,marginBottom:14,padding:'12px 16px 0'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,paddingBottom:10,borderBottom:`1px solid ${hair}`}}>
                  {titleGroup(16,'0.02em')}
                  {actionEl}
                </div>
                {rows.map(exRow)}
              </div>
            );
            if (ident === 'CONSOLE') return (
              <div key={key} style={{background:'var(--c-sf)',border:`1px solid ${borderColor || hair}`,borderRadius:0,marginBottom:12,padding:'0 14px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'8px 0',borderBottom:`1px solid ${hair}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
                    <span aria-hidden="true" style={{width:4,height:14,background:accent,flexShrink:0}}/>
                    {titleGroup(12,'0.12em')}
                  </div>
                  {actionEl}
                </div>
                {rows.map(exRow)}
              </div>
            );
            if (ident === 'AIR') return (
              <div key={key} style={{marginBottom:26}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,paddingBottom:9,borderBottom:`1px solid ${hair}`}}>
                  {titleGroup(15,'0.06em')}
                  {actionEl}
                </div>
                {rows.map(exRow)}
              </div>
            );
            if (ident === 'RAIL') return (
              <div key={key} style={{background:'var(--c-sf)',border:`1px solid ${hair}`,borderLeft:`3px solid ${accent}`,borderRadius:0,marginBottom:12,padding:'10px 16px 0'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,paddingBottom:9,borderBottom:`1px solid ${hair}`}}>
                  {titleGroup(13,'0.04em')}
                  {actionEl}
                </div>
                {rows.map(exRow)}
              </div>
            );
            if (ident === 'TABLE') return (
              <div key={key} style={{background:'var(--c-sf)',border:`1px solid ${borderColor || hair}`,borderRadius:0,marginBottom:12,padding:'0 14px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'8px 0',borderBottom:`1px solid ${hair}`}}>
                  {titleGroup(12,'0.06em')}
                  {actionEl}
                </div>
                {rows.map(exRow)}
              </div>
            );
            // BASE — approved strip-header card, untouched geometry
            // (warm-up keeps its committed 14px horizontal padding; day 18px)
            const bpx = isWu ? 14 : 18;
            return (
              <div key={key} style={{background:'var(--c-sf)',border:`1px solid ${borderColor || C.ac}`,borderRadius:0,marginBottom:isWu?14:12,padding:`14px ${bpx}px 0`}}>
                <div style={{background:'var(--c-stripBg, var(--c-sf))',margin:`-14px -${bpx}px 0`,padding:`8px ${bpx}px`,borderBottom:`1px solid ${hair}`,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
                  {titleGroup(13,'0.04em')}
                  {actionEl}
                </div>
                {rows.map(exRow)}
              </div>
            );
          };
          {/* keyed by ID: two same-named couple plans produced DUPLICATE React
              keys, so React mis-reconciled one member's cards onto the other's
              after any state update (audit #31). */}
          return visPlans.map((vp,vpIdx) => <React.Fragment key={vp.id || vp.name}>
          {visPlans.length>1 && <div style={{display:'flex',alignItems:'center',gap:10,margin:vpIdx===0?'0 0 12px':'20px 0 12px'}}>
            <div style={{flex:1,height:1,background:C.bd2}}/>
            <span style={{fontFamily:FN,fontSize:11,fontWeight:700,color:C.ac,letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{(vp.name || '').toUpperCase()}</span>
            {vp.phase && <span style={{fontSize:10,color:C.tm}}>· {vp.phase}</span>}
            <div style={{flex:1,height:1,background:C.bd2}}/>
          </div>}
          {/* Skip the warm-up preview when every day in this plan is a daily
              routine — the plan-level warm-up doesn't apply to those, so
              showing it just creates UI noise. If even one day is week-paced,
              the warm-up is still relevant and stays visible. */}
          {vp.warmup?.length > 0 && !(vp.kind === 'daily' || (Array.isArray(vp.days) && vp.days.length > 0 && vp.days.every(d => d.kind === 'daily'))) && buildCard({
            key: 'wu-' + vp.name,
            accent: C.or,
            borderColor: C.cardBd,
            title: `Warm-Up · ${vp.name}`,
            count: `(${vp.warmup.length})`,
            countColor: C.or,
            // warm-up owns ORANGE (number + title + rail); its tempo goes muted
            // so the warm-up's colour is clearly different from the tempo, which
            // is orange on the day cards (Ohad).
            tempoColor: TEMPO_COLOR,
            rows: vp.warmup.map((w,i) => ({
              num: i + 1,
              rx: (w.sets || w.reps)
                ? ((w.sets ?? '') && (w.reps ?? '') ? `${w.sets}×${w.reps}` : `${w.sets ?? ''}${w.reps ?? ''}`)
                : (w.rx || ''),
              tempo: w.tempo,
              title: w.t,
            })),
          })}
          {vp.rest && visPlans.length>1 && <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'8px 12px',marginBottom:12,fontSize:11,color:C.tm,fontFamily:FN}}><span style={{color:C.td,fontSize:9,fontWeight:700,letterSpacing:'0.15em',marginRight:10}}>{tt("REST")}</span>{vp.rest}</div>}
          {vp.days.map((day,di) => { const dayIdx = globalDayIdx++;
          // Daily-routine: PER-DAY flag (`day.kind === 'daily'`) lets the
          // athlete log THIS specific day any number of times during the
          // block — never lock behind DONE, no week-rotation tie-in. Other
          // days in the same plan keep normal week-paced behavior. Plan-
          // level kind='daily' (96e5f72 legacy shape) is treated as
          // "every day in this plan is daily" so old data renders the same.
          const isDailyRoutine = day.kind === 'daily' || vp.kind === 'daily';
          // Scope to THIS plan (vp.name) — day names + week numbers repeat
          // across blocks, so unscoped `cw` marked a current-block day ✓/AGAIN
          // from a PRIOR block's log, so the athlete could skip an untrained
          // session (audit H2). Mirrors the planName-scoped pattern used above.
          const dailyCount = isDailyRoutine ? cw.filter(w => w.dayName === day.name && isLogOfPlan(w, vp, dupPlanNames)).length : 0;
          // Per-plan week: the global `wk` strip belongs to the ACTIVE plan. A
          // secondary visible plan (couples, an opted-in 2nd block) logs its day under
          // ITS OWN derived week (finish() line ~2387), so the overview must read the
          // done-badge / prescription / focus against that same week — else a
          // completed secondary day reads "not done" (duplicate re-log) or an
          // untrained one reads "done" (skipped), and the rx shown is off-by-week.
          const vpWeek = (vp.name === activePlan?.name) ? wk : deriveWeekIdx(vp, cw);
          const done = !isDailyRoutine && cw.some(w => w.dayName === day.name && w.week === vpWeek + 1 && isLogOfPlan(w, vp, dupPlanNames));
          // doneBorderColor hoisted out of the inline template — the
          // build-time guard's parser mis-tracks single-quoted strings
          // inside nested ${ … } expressions (it's how the original bare
          // rgba(...) crash slipped past CI), so we keep the template
          // expression to a plain identifier.
          // Done days: neutral border (no green box) + a green ✓ next to the name
          // (Ohad: "don't like the green around the cyan DONE — green check instead").
          const doneBorderColor = done ? C.cardBd : C.ac;
          // Weekly cells are FREE-TEXT: some hold a full prescription
          // ("2x10 e"), some bare reps ("8"). Show full cells as-is; prefix
          // SETSx onto bare ones (Ohad 2026-07-05). No video in the
          // overview — it lives in the logging session.
          const rxOf = (ex) => {
            const hw = ex.wk?.length > 0;
            const wr = hw ? (ex.wk[vpWeek] ?? ex.r) : null;
            const sets = (ex.wkS && ex.wkS[vpWeek]) || ex.s;
            // Compose "SxR" from non-blank parts only; a fully-blank prescription
            // shows "—", never a fabricated "x"/"3x8-12". (empty = empty)
            const compose = (r) => {
              const sS = String(sets ?? '').trim(), rS = String(r ?? '').trim();
              if (/[x×]/i.test(rS)) return rS;
              if (!sS && !rS) return '—';
              return sS && rS ? sS + 'x' + rS : (sS || rS);
            };
            if (!hw) return compose(ex.r);
            const wrS = String(wr ?? '').trim();
            if (!wrS) return compose(ex.r);
            return /[x×]/i.test(wrS) ? wrS : compose(wr);
          };
          return buildCard({
            key: vp.name + '-' + di,
            accent: C.ac,
            borderColor: doneBorderColor,
            title: day.name,
            count: `${day.ex.length} EX`,
            extras: <>
              {done && <span title="Completed this week" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',lineHeight:1,padding:'5px 10px',border:`1px solid ${C.gn}`,color:C.gn,fontFamily:FN,fontSize:12,fontWeight:700,flexShrink:0}}>✓</span>}
              {isDailyRoutine && dailyCount > 0 && <span style={{display:'inline-flex',alignItems:'center',lineHeight:1,padding:'3px 7px',border:`1px solid ${C.ac}`,color:C.ac,fontFamily:FN,fontSize:8,fontWeight:700,letterSpacing:'0.18em'}}>{dailyCount} LOGGED</span>}
            </>,
            action: { label: done ? 'AGAIN' : 'START', onClick: () => setLg(dayIdx) },
            rows: day.ex.map((ex,i) => {
              const d = EX[ex.eid] || { t: `Exercise ${i+1}`, vid: '', q: '' };
              return {
                num: i + 1,
                rx: rxOf(ex),
                tempo: ex.tempo,
                title: d.t,
                // Fall back to the exercise's own cue. Ohad: "there's no focus on the
                // real athlete portal" - the demo shows a FOCUS line under every
                // exercise and the real portal showed none, because it only read the
                // WEEKLY focus store, which is keyed per exercise per week and is
                // almost always empty. Meanwhile 81% of plan rows (3,457 of 4,264,
                // measured) already carry `notes` - the cue snapshotted from the
                // library, which is the coaching line for that movement. The weekly
                // focus still wins when it exists: it is this week's emphasis and
                // overrides the standing cue.
                focus: weeklyFocus?.[`${ci}|${vp.name}|${day.name}|${ex.eid}|W${vpWeek}`]
                  ?? weeklyFocus?.[`${vp.name}|${day.name}|${ex.eid}|W${vpWeek}`]
                  ?? ((ex.notes ?? ex.n) || undefined),
              };
            }),
          });})}</React.Fragment>)})()}
      </div>
      {showPwModal && <PasswordChangeModal demoMode={demoMode} onClose={()=>setShowPwModal(false)}/>}
      </div>; }

  // Falls through while trainees are still loading (ci set but not yet matched).
  // Auth is handled upstream in App.jsx — no login form here.
  return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20,gap:16}}>
    <img src={EXPO_LOGO_NAV} alt="EXPO" style={{height:50}} />
    <div style={{color:C.td,fontSize:13}}>Loading your program…</div>
  </div>;
}
