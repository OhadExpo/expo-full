import React, { useState, useRef, useEffect, useMemo } from 'react';
import { fmtPrettyDate } from './dates';
import useAutosave from './hooks/useAutosave';
import { C, FN, FB, FH, uid, ytId, EXPO_LOGO, EXPO_ICON, EXPO_LOGO_NAV } from './theme';
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
import ExerciseSubstitution, { libExerciseToEx } from './ExerciseSubstitution';
import TraineePRsView from './TraineePRsView';
import { toast, confirmToast, isRefined5b, useEscClose } from './ui';
// F-14 — meal photo → macros logger. Lazy-loaded since most athletes
// won't open it on every page load (and it pulls in the meals query).
const MealLogger = React.lazy(() => import('./MealLogger'));
const LiveRepCounter = React.lazy(() => import('./LiveRepCounter'));

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
    warmup: Array.isArray(plan.warmup) ? plan.warmup : [],
    days: (plan.days || []).map(d => {
      const rawList = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
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
          const sets = pe.sets ?? pe.s ?? 3;
          const reps = pe.reps ?? pe.r ?? '8-12';
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
function GooglePhotosEmbed({ url }) {
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
        _gphResolveCache.set(url, next);
        setState(next);
      })
      .catch(e => { if (alive) setState({ phase: 'err', error: String(e?.message || e) }); });
    return () => { alive = false; };
  }, [url]);
  const wrap = {marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'#000',border:`1px solid ${C.cardBd}`};
  if (state.phase === 'loading') return <div style={{...wrap,display:'flex',alignItems:'center',justifyContent:'center',color:C.tm,fontFamily:FN,fontSize:11,letterSpacing:'0.18em'}}>LOADING VIDEO…</div>;
  if (state.phase === 'err' || streamFailed) return <div style={{...wrap,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,color:C.tm,fontFamily:FN,fontSize:11,padding:16,textAlign:'center'}}>
    <div>VIDEO COULD NOT BE EMBEDDED</div>
    <a href={url} target="_blank" rel="noopener noreferrer" style={{color:C.ac,textDecoration:'none',letterSpacing:'0.18em'}}>OPEN IN GOOGLE PHOTOS →</a></div>;
  const handleBadStream = () => setStreamFailed(true);
  const handleMeta = (e) => { if (!(e.currentTarget.duration > 0)) setStreamFailed(true); };
  return <div style={wrap}><video src={state.src} poster={state.poster||undefined} controls playsInline onError={handleBadStream} onLoadedMetadata={handleMeta} style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}/></div>;
}

// StepLogger: warmup steps → pre-workout → exercise steps → finish
function StepLogger({day, plan, weekNum, clientId, onBack, onComplete, weeklyFocus, trainerExercises, priorWorkouts, allowSubstitution, demoMode = false}) {
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
  const sessionKey = `expo-stepLogger-${clientId}-${plan.name}-${day.name}-w${weekNum}`;
  const _restoredSession = (() => {
    try { const raw = localStorage.getItem(sessionKey); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  })();

  // Per-session substitutions: { [originalEid]: libraryExercise }. Resets on
  // workout finish or if the trainee navigates away from this day. The
  // prescribed plan is never mutated — substitution lives only in this state.
  const [substitutions, setSubstitutions] = useState(_restoredSession?.substitutions || {});
  const [swapOpenForEid, setSwapOpenForEid] = useState(null);
  // F-31 — open the LiveRepCounter for a specific exercise. eid is the
  // unique exercise instance in the day. The counter is lazy-imported
  // because MediaPipe vision_bundle is ~140KB.
  const [liveCountForEid, setLiveCountForEid] = useState(null);

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

  const [step, setStep] = useState(_restoredSession?.step || (wuCount > 0 ? 'wu0' : 0));
  const [notes, setNotes] = useState(_restoredSession?.notes || '');
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
  const priorTopFor = (stableId) => {
    if (!priorWorkouts || priorWorkouts.length === 0) return null;
    let best = null;
    for (const w of priorWorkouts) {
      for (const px of (w.exercises || [])) {
        const pSub = px.substitution;
        const pStableId = pSub ? (pSub.toLibId || `swap:${(pSub.to||'').toLowerCase()}`) : px.eid;
        if (pStableId !== stableId) continue;
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
      if (sizesOk) return _restoredSession.allSets;
    }
    return day.ex.map(ex => {
      const count = setCountFor(ex);
      const prior = priorTopFor(ex.eid);
      // Only the first set carries the prior numbers; subsequent sets stay blank
      // so the trainee makes a deliberate call set-by-set instead of robotically
      // copying last session across all four sets.
      return Array.from({ length: count }, (_, i) => i === 0 && prior
        ? { reps: String(prior.reps || ''), load: String(prior.load || ''), rpe: prior.rpe != null ? String(prior.rpe) : '', done: false }
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
        const prior = priorTopFor(stableId);
        if (!prior) return rows;
        changed = true;
        const newFirst = { reps: String(prior.reps || ''), load: String(prior.load || ''), rpe: prior.rpe != null ? String(prior.rpe) : '', done: false };
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
  const uSet = (ei,si,f,v) => {const n=[...allSets];n[ei]=[...n[ei]];n[ei][si]={...n[ei][si],[f]:v};setAllSets(n)};

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
    return safe;
  });
  const sessionDraft = React.useMemo(
    () => ({ step, notes, allSets, fv: serializeFv(fv), wuDone, substitutions, savedAt: Date.now() }),
    [step, notes, allSets, fv, wuDone, substitutions]
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
    try { localStorage.removeItem(sessionKey); } catch {}
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

  const compressVideoChrome = (file, onProgress) => new Promise((resolve, reject) => {
    // Target: ~50MB output, computed bitrate from duration so a 5-minute video
    // gets the same budget as a 30-second one. Quality clamped to [400 Kbps, 3 Mbps].
    const TARGET_MB = 50;
    const MAX_WIDTH = 1280;
    const MIN_BITRATE = 400_000;
    const MAX_BITRATE = 3_000_000;

    const src = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.muted = true; vid.playsInline = true; vid.preload = 'auto'; vid.src = src;

    vid.onloadedmetadata = () => {
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
        URL.revokeObjectURL(src);
        reject(new Error('canvas.captureStream unsupported'));
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
        URL.revokeObjectURL(src);
        reject(new Error('No supported MediaRecorder mime type'));
        return;
      }
      const ext = mimeType.startsWith('video/mp4') ? '.mp4' : '.webm';
      const baseType = mimeType.split(';')[0];

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITRATE });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        URL.revokeObjectURL(src);
        const blob = new Blob(chunks, { type: baseType });
        if (blob.size < 1024) {
          reject(new Error('Compression produced empty output'));
          return;
        }
        resolve({ blob, ext, originalSize: file.size, compressedSize: blob.size });
      };

      vid.currentTime = 0;
      // playbackRate = 1 is critical: canvas.captureStream samples at wall-clock,
      // so any speedup bakes fast-motion into the output (8x was the old bug).
      vid.playbackRate = 1;

      vid.play().then(() => {
        recorder.start(100);
        const draw = () => {
          // Abort if the host component unmounted mid-compression — otherwise
          // the rAF loop + MediaRecorder + video element keep running in memory.
          if (!aliveRef.current) {
            if (recorder.state === 'recording') recorder.stop();
            vid.pause();
            URL.revokeObjectURL(src);
            reject(new Error('aborted'));
            return;
          }
          if (vid.ended || vid.paused || vid.currentTime >= duration) {
            if (recorder.state === 'recording') recorder.stop();
            vid.pause(); return;
          }
          ctx.drawImage(vid, 0, 0, w, h);
          if (onProgress) onProgress(Math.round((vid.currentTime / duration) * 100));
          requestAnimationFrame(draw);
        };
        draw();
        const wallTime = (duration / vid.playbackRate) + 3;
        setTimeout(() => { if (recorder.state === 'recording') { recorder.stop(); vid.pause(); } }, wallTime * 1000);
      }).catch(reject);
    };
    vid.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Failed to load video')); };
  });

  // Upload with real progress tracking via XMLHttpRequest
  // Supabase Storage REST API: POST raw body with Content-Type header.
  // URL/key sourced from src/supabase.js so there's a single
  // change-once point if/when the project is rotated.
  const uploadWithProgress = (blob, path, contentType, onProgress) => new Promise((resolve, reject) => {
    const url = `${SUPA_URL}/storage/v1/object/form-videos/${path}`;
    const supaKey = SUPA_PUBLISHABLE_KEY;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${supaKey}`);
    xhr.setRequestHeader('apikey', supaKey);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'true');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const publicUrl = `${SUPA_URL}/storage/v1/object/public/form-videos/${path}`;
        resolve({ publicUrl });
      } else {
        console.error('Upload response:', xhr.status, xhr.responseText);
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(blob); // Send raw blob, NOT FormData
  });

  const handleVideoUpload = async (e, exIdx) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    // Demo mode is a public marketing surface — never write to production
    // storage. Other portal paths (handleComplete, plans-load, presence) gate
    // on demoMode already; the upload handler had been the one omission.
    if (demoMode) { toast('Demo mode — uploads disabled', 'info'); return; }

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
    const compressionAvailable = canCompressVideo();
    if (!compressionAvailable && file.size > 50 * 1024 * 1024) {
      const sizeMB = Math.round(file.size / 1e6);
      const ok = await confirmToast(`This video is ${sizeMB}MB and your browser can't compress it here. Continue upload?\n\nFor faster uploads, record a shorter clip (under 30 seconds) or pick from your library instead of recording new.`, { okLabel: 'Upload', cancelLabel: 'Cancel' });
      if (!ok) return;
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
        try {
          // Hard timeout: compressVideoChrome can hang forever if the hidden
          // <video> never fires onloadedmetadata (some mobile codecs / HEVC
          // never load AND never error). Race it against a wall-clock cap so a
          // stuck encode can't freeze the upload on "Compressing %" — we just
          // fall through and ship the original blob (bucket has no size limit).
          const COMPRESS_TIMEOUT_MS = 40_000;
          const result = await Promise.race([
            compressVideoChrome(file, pct => {
              setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], compressProgress:pct}; return n; });
            }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('compression timed out')), COMPRESS_TIMEOUT_MS)),
          ]);
          uploadBlob = result.blob;
          ext = result.ext;
          contentType = result.blob.type;
        } catch (compressErr) {
          console.warn('Compression failed/timed out, uploading original:', compressErr);
          setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], compressProgress:100}; return n; });
        }
      }

      // Upload with progress (XHR for real-time %, falls back to Supabase client)
      setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], phase:'upload', compressProgress:100}; return n; });
      const ts = Date.now();
      path = `${clientId}/${ts}-form${ext}`;

      let publicUrl;
      try {
        const result = await uploadWithProgress(uploadBlob, path, contentType, pct => {
          setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploadProgress:pct}; return n; });
        });
        publicUrl = result.publicUrl;
      } catch (xhrErr) {
        // Fallback: use Supabase JS client (no progress but reliable)
        console.warn('XHR upload failed, falling back to Supabase client:', xhrErr);
        const { error } = await supabase.storage.from('form-videos').upload(path, uploadBlob, { upsert: true, contentType });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('form-videos').getPublicUrl(path);
        publicUrl = urlData.publicUrl;
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
      const looksTransient = offline || /network|fetch|timeout|abort|offline/i.test(msg);
      if (looksTransient) {
        try {
          const blobId = newBlobId();
          await enqueueBlob({ id: blobId, blob: uploadBlob, contentType, storagePath: path });
          // Keep previewUrl alive — it's the only way to play the recording
          // until the blob queue uploads it. Browser GC reclaims it when the
          // tab closes or when we revoke after a successful drain.
          setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:false, has:true, videoUrl:previewUrl, cloudUrl:null, pendingBlobId:blobId, compressProgress:100, uploadProgress:0, uploadError:null}; return n; });
          return;
        } catch (e2) {
          // IndexedDB failed (private browsing, quota) — fall through to alert.
          console.error('Blob queue enqueue failed:', e2);
        }
      }
      URL.revokeObjectURL(previewUrl);
      setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:false, has:false, videoUrl:null, uploadError:msg}; return n; });
      toast(`Video upload failed: ${msg}\nTry again or pick a shorter clip.`, 'error', { ttl: 7000 });
    }
  };

  const finish = () => {
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
      id: workoutId, clientId, planName: plan.name, dayName: day.name,
      week: weekNum + 1, date: finishedAt, notes,
      formVideos,
      exercises: day.ex.map((ex, i) => {
        const sub = substitutions[ex.eid];
        const prescribedTitle = EX[ex.eid]?.t || '?';
        return {
          eid: ex.eid,
          title: sub ? sub.title : prescribedTitle,
          prescribed: (ex.wk && ex.wk[weekNum]) || `${(ex.wkS && ex.wkS[weekNum]) || ex.s}x${(ex.wk && ex.wk[weekNum]) || ex.r}`,
          sets: allSets[i],
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
    step === 'end' ? totalSteps : wuCount + step;
  const goNext = () => {
    window.scrollTo(0,0);
    if (typeof step === 'string' && step.startsWith('wu')) {
      const wi = parseInt(step.slice(2));
      const nd = [...wuDone]; nd[wi] = true; setWuDone(nd);
      if (wi + 1 < wuCount) setStep('wu' + (wi + 1));
      else setStep(0);
    }
    else if (typeof step === 'number' && step < groupCount - 1) setStep(step + 1);
    else setStep('end');
  };
  const goPrev = () => {
    window.scrollTo(0,0);
    if (typeof step === 'string' && step.startsWith('wu')) {
      const wi = parseInt(step.slice(2));
      if (wi > 0) setStep('wu' + (wi - 1)); else onBack();
    }
    else if (step === 0) {
      // Back from the first exercise: into the last warmup if any, else exit.
      if (wuCount > 0) setStep('wu' + (wuCount - 1));
      else onBack();
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
    <div style={{display:'flex',alignItems:'center',marginBottom:6,position:'relative',height:32}}>
      <EXPOMark theme="dark" height={36} style={{flexShrink:0}} />
      <span style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',fontFamily:FN,fontSize:11,color:C.tm,whiteSpace:'nowrap',lineHeight:1}}>{day.name} · W{weekNum+1}</span>
      {(lastSavedAt || pendingBlobs > 0 || sessionAutosave.status === 'saving' || sessionAutosave.status === 'error') && (
        <span title={pendingBlobs > 0 ? `${pendingBlobs} video${pendingBlobs===1?'':'s'} waiting to upload` : (sessionAutosave.status === 'error' ? 'Last save failed — your edits are not safe yet' : 'Session saved locally')} style={{marginLeft:'auto',background:'var(--c-sf)',border:`1px solid ${sessionAutosave.status==='error'?C.rd:pendingBlobs>0?C.or:C.gn}4D`,color:sessionAutosave.status==='error'?C.rd:pendingBlobs>0?C.or:C.gn,fontFamily:FN,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:0,letterSpacing:'0.06em',whiteSpace:'nowrap'}}>
          {sessionAutosave.status === 'saving' ? '… SAVING' :
           sessionAutosave.status === 'error' ? '⚠ SAVE FAILED' :
           lastSavedAt ? `✓ ${lastSavedAt.toTimeString().slice(0,5)}` : ''}
          {pendingBlobs > 0 && <span style={{marginLeft:6,opacity:0.85}}>· ↑{pendingBlobs}</span>}
        </span>
      )}
      {showResumedPill && <span title="Restored from your last session" style={{marginLeft:8,background:'var(--c-sf)',border:`1px solid ${C.or}`,color:C.or,fontFamily:FN,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:0,letterSpacing:'0.18em'}}>↻ RESUMED</span>}
      <button onClick={onBack} style={{marginLeft:8,background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FB,fontSize:13,padding:0,lineHeight:1}}>← Exit</button></div>
    <div style={{display:'flex',gap:2}}>
      {/* Warm-up dots (orange) + Exercise dots (blue/green) */}
      {warmup.map((_,i) => <div key={'wu'+i} style={{flex:1,height:3,borderRadius:0,background:stepIndex>i?C.or:stepIndex===i?'rgba(255,165,2,0.502)':C.bd}} />)}
      {/* Group dots (one per superset group or solo exercise) */}
      {groups.map((_,i) => <div key={'g'+i} style={{flex:1,height:3,borderRadius:0,background:stepIndex>wuCount+i?C.gn:stepIndex===wuCount+i?C.ac:C.bd}} />)}
    </div>
    <div style={{fontSize:10,color:C.td,fontFamily:FN,marginTop:4,textAlign:'center'}}>
      {typeof step==='string'&&step.startsWith('wu') ? `Warm-Up ${parseInt(step.slice(2))+1}/${wuCount}` :
       step==='end' ? 'Complete' :
       groups[step]?.superset ? `Superset ${groups[step].superset} · Group ${step+1}/${groupCount}` :
       `Exercise ${step+1}/${groupCount}`}
    </div></div>;

  // ===== WARM-UP STEP =====
  if (typeof step === 'string' && step.startsWith('wu')) {
    const wi = parseInt(step.slice(2));
    const wu = warmup[wi];
    const vid = ytId(wu.vid);
    return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
      <div style={{padding:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:12}}>
          <div style={{background:'var(--c-sf)',border:`1px solid ${C.or}`,borderRadius:0,padding:'4px 10px',fontFamily:FN,fontSize:9,color:C.or,fontWeight:700,letterSpacing:'0.18em',minWidth:110,textAlign:'center',fontVariantNumeric:'tabular-nums',boxSizing:'border-box'}}>WARM-UP {wi+1}/{wuCount}</div></div>
        <h2 style={{margin:'0 0 6px',fontFamily:FN,fontSize:18}}>{wu.t}</h2>
        {/* Prefer the new structured fields (sets × reps × tempo) and fall
            back to the legacy free-text rx for plans authored before the
            split. Existing plans render unchanged until the coach edits. */}
        <div style={{fontSize:15,color:C.or,fontWeight:700,fontFamily:FN,marginBottom:14}}>{(() => {
          if (wu.sets || wu.reps) {
            const setsStr = wu.sets ?? '';
            const repsStr = wu.reps ?? '';
            const core = setsStr && repsStr ? `${setsStr}×${repsStr}` : `${setsStr}${repsStr}`;
            return wu.tempo ? `${core}  ${wu.tempo}` : core;
          }
          return wu.rx || '';
        })()}</div>
        {vid ? <div style={{marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'var(--c-sf)',border:`1px solid ${C.cardBd}`}}>
          <iframe src={`https://www.youtube.com/embed/${vid}`} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen/></div>
          : wu.vid && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(wu.vid) ? <div style={{marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'#000',border:`1px solid ${C.cardBd}`}}>
          <video src={wu.vid} controls playsInline style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}/></div>
          : wu.vid && /(photos\.app\.goo\.gl|photos\.google\.com)/i.test(wu.vid) ? <GooglePhotosEmbed url={wu.vid} />
          : wu.vid && /lh3\.googleusercontent\.com/i.test(wu.vid) ? <div style={{marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'#000',border:`1px solid ${C.cardBd}`}}>
          <video src={wu.vid} controls playsInline style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}/></div>
          : <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:30,marginBottom:14,textAlign:'center',color:C.tm}}>No video for this exercise</div>}
        <div style={{display:'flex',gap:8}}>
          <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>← Back</button>
          <button onClick={goNext} style={{flex:2,padding:14,borderRadius:0,border:`1px solid ${C.or}`,background:'transparent',color:C.or,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>
            {wi === wuCount - 1 ? 'Start Check-In →' : 'Next Warm-Up →'}</button></div>
      </div></div>;
  }

  // ===== PRE-WORKOUT CHECK =====
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
      // Find prior best across all this trainee's prior workouts.
      let priorBest = 0;
      for (const w of (priorWorkouts || [])) {
        for (const px of (w.exercises || [])) {
          const pSub = px.substitution;
          const pStableId = pSub ? (pSub.toLibId || `swap:${(pSub.to||'').toLowerCase()}`) : px.eid;
          if (pStableId !== stableId) continue;
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
              <span style={{ fontFamily: FN, fontSize: 12, color: C.gn, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {p.debut ? `${p.now}kg` : `${p.prev}kg → ${p.now}kg (+${p.delta})`}
              </span>
            </div>
          ))}
        </div>
      )}

      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did it feel? Pain? Modifications?" style={{...bi,minHeight:120,resize:'vertical',marginBottom:16,textAlign:'center'}}/>
      {fv.some(f => f.uploading) ? (
        <button style={{width:'100%',padding:16,borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'wait',opacity:0.6}}>⏳ Video uploading...</button>
      ) : (
        <button onClick={finish} style={{width:'100%',padding:16,borderRadius:0,border:`1px solid ${C.gn}`,background:'transparent',color:C.gn,fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>✓ Complete Workout</button>
      )}
      <button onClick={goPrev} style={{width:'100%',padding:12,border:'none',background:'transparent',color:C.tm,cursor:'pointer',marginTop:8}}>← Back</button>
    </div></div>;

  // ===== EXERCISE STEP (single exercise OR grouped superset) =====
  const group = groups[step]; if (!group) return null;
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
    const hw = ex.wk?.length > 0;
    const wr = hw ? (ex.wk[weekNum] ?? ex.r) : null;
    // Per-week sets array (ex.wkS) mirrors per-week reps (ex.wk). When the
    // coach defined per-week reps but kept sets flat, we still need to render
    // the sets × reps prescription so the trainee sees how many sets to do.
    const wrS = ex.wkS?.length > 0 ? (ex.wkS[weekNum] ?? ex.s) : null;
    const setsForDisplay = wrS ?? ex.s;
    const repsForDisplay = wr ?? ex.r;
    const f = fv[ei];
    const fk = `${plan.name}|${day.name}|${ex.eid}|W${weekNum+1}`;
    const wf = weeklyFocus?.[fk];

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
        if (w.planName !== plan.name) continue;
        if (w.dayName !== day.name) continue;
        if (w.week !== targetWeek) continue;
        for (const px of (w.exercises || [])) {
          const pSub = px.substitution;
          const pStableId = pSub ? (pSub.toLibId || `swap:${(pSub.to||'').toLowerCase()}`) : px.eid;
          const pTitleKey = (pSub ? pSub.to : px.title || '').toLowerCase().trim();
          if (pStableId !== stableId && !(titleKey && pTitleKey === titleKey)) continue;
          const sets = (px.sets || []).filter(s => parseFloat(s.load) > 0);
          if (sets.length && (!prevDate || new Date(w.date) > new Date(prevDate))) {
            prevWeekSets = sets;
            prevWeekIdx = targetWeek;
            prevDate = w.date;
          }
        }
      }
    }

    return <div key={ei} style={{marginBottom: blockIdx < groupExs.length - 1 ? 24 : 0, paddingBottom: blockIdx < groupExs.length - 1 ? 20 : 0, borderBottom: blockIdx < groupExs.length - 1 ? `2px dashed ${C.bd2}` : 'none'}}>
      {isSuperset && <div style={{fontSize:10,fontFamily:FN,color:C.ac,fontWeight:700,letterSpacing:'0.08em',textAlign:'center',marginBottom:8}}>EXERCISE {blockIdx+1} OF {groupExs.length}</div>}

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
                UNDO
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
      <div style={{fontSize:15,color:C.ac,fontWeight:700,fontFamily:FN,textAlign:'center'}}>{`${setsForDisplay ?? ''} × ${repsForDisplay ?? ''}`.replace(/^ × $/, '—').trim()}</div>
      {/* F-31 — Live count entry button. Lightweight pill, sits below
          the prescription line. Always available — pose model only
          loads on tap. */}
      <div style={{textAlign:'center',marginTop:6}}>
        <button onClick={() => setLiveCountForEid(ex.eid)} title="Live rep counter — camera + voice trigger"
          style={{background:'transparent',border:`1px solid ${C.cardBd}`,color:C.tm,fontFamily:FN,fontSize:10,letterSpacing:'0.12em',fontWeight:700,padding:'4px 10px',cursor:'pointer',borderRadius:0}}>
          🎯 LIVE COUNT
        </button>
      </div>
      {ex.tempo && <div style={{fontSize:13,color:C.or,marginTop:4,textAlign:'center'}}>⏱ {ex.tempo}</div>}

      {hw && <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:10,marginTop:12,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
          {ex.wk.map((w,i) => <div key={i} style={{background:'var(--c-sf)',border:`1px solid ${weekNum===i?C.ac:C.cardBd}`,borderRadius:0,padding:6,textAlign:'center'}}>
            <div style={{fontSize:9,color:C.td,fontFamily:FN}}>WK {i+1}</div>
            <div style={{fontSize:12,color:weekNum===i?C.ac:C.tx,fontWeight:600}}>{w}</div></div>)}</div></div>}

      {/* Cyan-polish pass: every neutral border on this view is now 1px
          C.cardBd (thicker, gray) instead of 0.25px / C.ac. Cyan is reserved
          for genuine intent \u2014 the left accent stripe on the focus card,
          active-week pill, and key inline text. */}
      {(() => {
        // Notes precedence: coach's per-instance note (ex.n) wins. The library's
        // cues (d.q) only render as a fallback when ex.n is empty. This stops
        // the "white note from nowhere" effect where the library cues kept
        // showing under the orange coach note. Per-instance is the only
        // authoritative text the coach can edit; library is the seed source.
        const note = (ex.n && ex.n.trim()) || (d.q && d.q.trim()) || '';
        if (!note) return null;
        const useExNote = !!(ex.n && ex.n.trim());
        return (
          <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:12,marginTop:12,marginBottom:12,fontSize:13,color:C.tx,lineHeight:1.6}}>
            <div style={{fontSize:9,fontFamily:FN,color:C.tm,marginBottom:6,fontWeight:700,textAlign:'center',letterSpacing:'0.18em'}}>EXERCISE NOTES</div>
            <div style={{color:C.tx,textAlign:'center',direction:/[\u0590-\u05FF]/.test(note)?'rtl':'ltr',fontFamily:/[\u0590-\u05FF]/.test(note)?FH:undefined}}>{note}</div>
          </div>
        );
      })()}

      {vid ? <div style={{marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'var(--c-sf)',border:`1px solid ${C.cardBd}`}}>
        <iframe src={`https://www.youtube.com/embed/${vid}`} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen/></div>
        : effectiveVid && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(effectiveVid) ? <div style={{marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'#000',border:`1px solid ${C.cardBd}`}}>
        <video src={effectiveVid} controls playsInline style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}/></div>
        : effectiveVid && /(photos\.app\.goo\.gl|photos\.google\.com)/i.test(effectiveVid) ? <GooglePhotosEmbed url={effectiveVid} />
        : effectiveVid && /lh3\.googleusercontent\.com/i.test(effectiveVid) ? <div style={{marginBottom:14,borderRadius:0,overflow:'hidden',aspectRatio:'16/9',background:'#000',border:`1px solid ${C.cardBd}`}}>
        <video src={effectiveVid} controls playsInline style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}/></div> : null}

      {/* WEEKLY FOCUS \u2014 outer border is always neutral now; the left accent
          stripe (3px) is the cyan-when-set indicator. Reads as a calm card
          with a focused stripe rather than a wholly cyan box. */}
      <div style={{background:'transparent',border:`1px solid ${C.cardBd}`,borderLeft:`3px solid ${wf?C.ac:C.cardBd}`,borderRadius:0,padding:12,marginBottom:12,textAlign:'center'}}>
        <div style={{fontSize:10,fontFamily:FN,color:wf?C.ac:C.td,marginBottom:4,fontWeight:700,letterSpacing:'0.18em'}}>WEEKLY FOCUS</div>
        <div style={{fontSize:13,color:wf?C.tx:C.td,lineHeight:1.5}}>{wf || 'No focus set this week'}</div></div>

      {/* Last-time-at-this-exercise pill — moved here so it sits IMMEDIATELY
          above the inputs card. The trainee scrolls past prescription / notes
          / video, lands on the historical context (LAST all-time best plus
          per-set PREV WK ghost rows inside the grid), then logs this week's
          sets. Honors substitutions. */}
      {(() => {
        if (!priorWorkouts || priorWorkouts.length === 0) return null;
        const stableId = sub ? (sub.id || `swap:${(sub.title||'').toLowerCase()}`) : ex.eid;
        let bestPrior = null;
        for (const w of priorWorkouts) {
          for (const px of (w.exercises || [])) {
            const pSub = px.substitution;
            const pStableId = pSub ? (pSub.toLibId || `swap:${(pSub.to||'').toLowerCase()}`) : px.eid;
            if (pStableId !== stableId) continue;
            for (const s of (px.sets || [])) {
              if (!s.done) continue;
              const load = parseFloat(s.load) || 0;
              if (load <= 0) continue;
              const reps = parseFloat(s.reps) || 0;
              const rpe = s.rpe ?? null;
              if (!bestPrior || load > bestPrior.load || (load === bestPrior.load && new Date(w.date) > new Date(bestPrior.date))) {
                bestPrior = { load, reps, rpe, date: w.date };
              }
            }
          }
        }
        if (!bestPrior) return null;
        const days = Math.max(1, Math.round((Date.now() - new Date(bestPrior.date).getTime()) / 86400000));
        return (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <div style={{
              padding: '8px 14px',
              background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
              display: 'inline-flex', alignItems: 'center', gap: 10,
              fontFamily: FN, fontSize: 12, lineHeight: 1, color: C.tm,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {/* Single fontSize (12) + single lineHeight (1) across
                  every token in the pill so the baseline is rock-locked
                  — no glyph drift between labels, numbers, and units.
                  Visual hierarchy is carried by weight (700 for values,
                  400 for units, 700 + letterSpacing for labels) and
                  color (tx for primary, tm for secondary, td for meta).
                  Hairline dividers segment the three groups instead of
                  the previous "·" separator which floated mid-line. */}
              <span style={{ color: C.td, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>Best ever</span>
              <span style={{ width: 1, height: 12, background: C.cardBd }} />
              <span style={{ color: C.tx, fontWeight: 700 }}>{bestPrior.load}</span>
              <span style={{ color: C.tm, fontWeight: 400, letterSpacing: '0.04em' }}>KG</span>
              <span style={{ color: C.tm, fontWeight: 400 }}>×</span>
              <span style={{ color: C.tx, fontWeight: 700 }}>{bestPrior.reps || '—'}</span>
              {bestPrior.rpe != null && bestPrior.rpe !== '' && (
                <>
                  <span style={{ color: C.tm, fontWeight: 400, letterSpacing: '0.18em' }}>RPE</span>
                  <span style={{ color: C.tx, fontWeight: 700 }}>{bestPrior.rpe}</span>
                </>
              )}
              <span style={{ width: 1, height: 12, background: C.cardBd }} />
              <span style={{ color: C.td, fontWeight: 400, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{days}d ago</span>
            </div>
          </div>
        );
      })()}

      <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:14,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 40px',gap:4,marginBottom:4}}>
          {['','REPS','KG','RPE','✓'].map(h => <div key={h} style={{fontSize:9,fontFamily:FN,color:C.td,textAlign:'center'}}>{h}</div>)}</div>
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
          // Hidden in the light/refined theme entirely (Ohad's choice
          // 2026-05-15) — only the dark theme uses progressive-overload
          // glance-references.
          const prior = prevWeekSets?.[si];
          const showGhost = prior && !isRefined5b();
          return <React.Fragment key={si}>
            {showGhost && <div style={{
              display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 40px',gap:4,
              // marginBottom 0 — ghost W1 row sits flush against its
              // live W2 row directly below, reading as a stacked
              // pair within one set. marginTop 8 between sets keeps
              // the visual separation between distinct set groups.
              alignItems:'center',marginBottom:0,marginTop:si===0?0:8,
              opacity:0.5,
            }}>
              <div style={{fontFamily:FN,fontSize:11,color:'var(--c-ac)',textAlign:'center',letterSpacing:'0.1em',fontWeight:700}}>W{prevWeekIdx}</div>
              {/* Cell dimensions mirror the live `bi` input style
                  (padding 8px 10px, fontSize 14, FB body font, center)
                  so the ghost row sits in the exact same row-height as
                  the W2 input row below — visually identical scale,
                  carried by opacity 0.5 to mark it as reference. */}
              <div style={{padding:'8px 10px',fontFamily:FB,fontSize:14,color:'var(--c-tx)',textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{prior.reps || '—'}</div>
              <div style={{padding:'8px 10px',fontFamily:FB,fontSize:14,color:'var(--c-tx)',textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{parseFloat(prior.load) || '—'}</div>
              <div style={{padding:'8px 10px',fontFamily:FB,fontSize:14,color:'var(--c-tx)',textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{prior.rpe || '—'}</div>
              <div />
            </div>}
            <div style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 40px',gap:4,alignItems:'center',marginBottom:4,opacity:set.done?.5:1}}>
              <div style={{fontFamily:FN,fontSize:13,color:C.td,textAlign:'center'}}>{si+1}</div>
              <input value={set.reps} onChange={e => uSet(ei,si,'reps',e.target.value)} onFocus={selectOnFocus} inputMode="numeric" enterKeyHint="next" placeholder="—" style={seti}/>
              <input value={set.load} onChange={e => uSet(ei,si,'load',e.target.value)} onFocus={selectOnFocus} inputMode="decimal" enterKeyHint="next" placeholder="kg" style={seti}/>
              <input value={set.rpe} onChange={e => uSet(ei,si,'rpe',e.target.value)} onFocus={selectOnFocus} inputMode="decimal" enterKeyHint="done" placeholder="—" style={seti}/>
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
          <div style={{fontSize:11,fontFamily:FN,color:C.tm}}>FORM CHECK</div>
          {f.uploaded && <div style={{display:'flex',alignItems:'center',gap:4,background:'var(--c-sf)',border:`1px solid ${C.gn}`,padding:'3px 10px',borderRadius:0}}>
            <span style={{fontSize:14}}>✅</span><span style={{fontSize:11,fontFamily:FN,color:C.gn,fontWeight:700}}>UPLOADED</span></div>}
          {f.uploading && <div style={{display:'flex',alignItems:'center',gap:4,background:'var(--c-sf)',border:`1px solid ${C.ac}`,padding:'3px 10px',borderRadius:0}}>
            <span style={{fontSize:11,fontFamily:FN,color:C.ac,fontWeight:700}}>{f.phase==='compress' ? `⚙ Compressing ${f.compressProgress||0}%` : `☁ Uploading ${f.uploadProgress||0}%`}</span></div>}
        </div>
        {f.has && f.videoUrl ? (
          <div style={{marginBottom:10}}>
            <video src={f.videoUrl} controls playsInline
              onError={() => setFv(prev => { const n=[...prev]; n[ei]={...n[ei], videoError:true}; return n; })}
              style={{width:'100%',borderRadius:0,maxHeight:200,background:'transparent'}} />
            {f.videoError && (
              <div style={{marginTop:6,padding:8,background:'var(--c-sf)',border:`1px solid ${C.or||'#c97a00'}`,fontSize:11,color:C.or||'#c97a00',fontFamily:FN}}>
                Video failed to load. {f.cloudUrl ? <a href={f.cloudUrl} target="_blank" rel="noopener noreferrer" style={{color:C.ac}}>Open in new tab ↗</a> : 'Try Re-recording.'}
              </div>
            )}
            <div style={{display:'flex',gap:8,marginTop:6}}>
              {/* Replace + Remove are both disabled while an upload is in
                  flight — otherwise picking a new file mid-upload would race
                  the previous upload's setFv against the new one's. */}
              <label style={{flex:1,minHeight:44,padding:'12px 8px',borderRadius:0,border:`0.25px dashed ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',textAlign:'center',cursor:f.uploading?'not-allowed':'pointer',opacity:f.uploading?0.4:1,pointerEvents:f.uploading?'none':'auto',display:'flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box'}}>
                Replace
                <input type="file" accept="video/*" capture="environment" style={{display:'none'}} disabled={f.uploading} onChange={async e => { await handleVideoUpload(e, ei); }} />
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
            <label style={{flex:1,padding:'14px 8px',borderRadius:0,border:`0.25px dashed ${C.cardBd}`,background:'transparent',color:C.tm,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:20}}>🎥</span>
              <span>Record</span>
              <input type="file" accept="video/*" capture="environment" style={{display:'none'}} onChange={async e => { await handleVideoUpload(e, ei); }} />
            </label>
            <label style={{flex:1,padding:'14px 8px',borderRadius:0,border:`0.25px dashed ${C.cardBd}`,background:'transparent',color:C.tm,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:20}}>📁</span>
              <span>Gallery</span>
              <input type="file" accept="video/*" style={{display:'none'}} onChange={async e => { await handleVideoUpload(e, ei); }} />
            </label>
          </div>
        )}
        <textarea value={f.note} onChange={e => {const n=[...fv];n[ei]={...n[ei],note:e.target.value};setFv(n)}} placeholder="Notes for coach" style={{...bi,fontSize:13,minHeight:50,resize:'vertical',marginTop:8}}/>
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
        <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>← Back</button>
        <button onClick={anyUploading ? undefined : goNext} style={{flex:2,padding:14,borderRadius:0,border:`1px solid ${anyUploading?C.cardBd:C.ac}`,background:'transparent',color:anyUploading?C.tm:C.ac,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',cursor:anyUploading?'wait':'pointer',opacity:anyUploading?0.6:1}}>
          {anyUploading ? `⚙ Processing video...` : step===groupCount-1 ? 'Finish →' : (isSuperset?'Next Block →':'Next Exercise →')}</button></div>
    </div></div>;
}

// Main client portal
export default function ClientPortal({ clientId, signOut, clientWorkouts, setClientWorkouts, bwLog, setBwLog, weeklyFocus, setWeeklyFocus, portalVis, trainerPlans, trainerExercises, trainees, selfTrainee = null, onDecrementSession, updateFormVideos, demoMode = false, demoPlans = null, onReturnToCoach = null, embedded = false }) {
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
  useEscClose(!!bwDeleteConfirm, () => setBwDeleteConfirm(null)); // Escape dismisses the BW-delete confirm
  const [showPwModal, setShowPwModal] = useState(false);
  const [plansLoadError, setPlansLoadError] = useState(null);

  // Resolve client from trainees (Supabase)
  // Athletes can't read the full trainees store (RLS); fall back to the
  // gate-resolved record (my_trainee RPC) passed down from App so the portal
  // doesn't hang on "Loading your program…" with an empty trainees list.
  const trainee = (trainees || []).find(t => t.id === ci) || (selfTrainee && selfTrainee.id === ci ? selfTrainee : null);

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
  const handleComplete = w => {
    // demoMode = coach-side preview. Writes must never touch the real
    // trainee's record. Bail before any setter so a future refactor that
    // wires real (non-noop) setters into preview can't leak through.
    if (demoMode) { setLg(null); return; }
    setClientWorkouts(prev => [...prev, w]);
    if (bw && activePlan) setBwLog(prev => {
      const filtered = prev.filter(b => !(b.clientId===ci && b.blockName===activePlan.name && b.week===wk+1));
      return [...filtered, {date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(bw),blockName:activePlan.name,planId:activePlan.id||null}];
    });
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
    if (!targetPlan) { setLg(null); return null; }
    // F-25 — substitution is available on EVERY plan (full version).
    // Earlier the swap UI was gated to isTemplatePlan(plan) so Ohad's
    // hand-coached clients couldn't accidentally swap mid-session. With
    // proper coach insight into substitutions via workout logs, the gate
    // is no longer needed and trainees can adapt to a busy gym freely.
    return <StepLogger day={targetPlan.days[targetDayIdx]} plan={targetPlan} weekNum={wk} clientId={ci} onBack={() => setLg(null)} onComplete={handleComplete} weeklyFocus={weeklyFocus} trainerExercises={trainerExercises} priorWorkouts={cw} allowSubstitution={true} demoMode={demoMode}/>; }

  // Shared portal header (logo + lock + logout / greeting / block badges +
  // sessions count / tab switcher). Rendered at the top of Program, BW Graph,
  // and History so the layout stays consistent across tabs.
  const sl = Math.max(0, (trainee?.sessionsRemaining || 0));
  const renderTopHeader = () => (
    <>
      <div style={{background:C.bg,padding:'calc(20px + env(safe-area-inset-top)) 20px 18px',borderBottom:`1px solid ${C.bd2}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          {/* EXPO logo. For dual-role accounts (trainer who also has a
              trainee row) it doubles as the "switch to coach portal"
              affordance — click the mark to go back to /coach/dashboard.
              Pure clients see a static logo. Hidden in demoMode (the
              CoachPreviewPortal back button is the only escape there)
              AND in embedded mode (DemoEmbed iframe — the outer marketing
              page already shows the EXPO mark; doubling it looks busy). */}
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
            <button onClick={logOut} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.12em',padding:0}}>{demoMode ? '← EXIT PREVIEW' : 'LOG OUT →'}</button>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:18}}>
          <h1 style={{margin:0,fontFamily:FN,fontSize:18,fontWeight:600,color:C.tx,textAlign:'center',letterSpacing:'0.04em'}}>Hey {clientName.split(' ')[0]}</h1>
          <div style={{width:24,height:1,background:C.ac,marginTop:8,opacity:0.5}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:14}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>{visPlans.map(p=><span key={p.name} style={{display:'inline-block',padding:'2px 0 2px 10px',borderLeft:`2px solid ${C.ac}`,color:C.ac,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>{p.name}</span>)}</div>
          </div>
          <div style={{textAlign:'center',flexShrink:0}}>
            <div style={{fontSize:24,fontWeight:700,fontFamily:FN,color:sl<=2?C.rd:C.ac,lineHeight:1,letterSpacing:'-0.02em'}}>{sl}</div>
            <div style={{fontSize:9,color:C.tm,fontFamily:FN,letterSpacing:'0.18em',fontWeight:700,marginTop:5}}>SESSIONS</div>
          </div>
        </div>
      </div>
      {/* Two-row nav (Ohad spec 2026-05-16):
            Row 1 → PROGRAM · BW · MEAL LOG  (active work)
            Row 2 → MESSAGES · HISTORY · PRs (review & comms)
          Both rows share the cyan underline pattern (2px active /
          0.25px+30% inactive) — see [[feedback-stroke-ruling]]. */}
      {(() => {
        const navRow = (items) => (
          <div style={{display:'flex',gap:0}}>
            {items.map(([k,l]) =>
              <button key={k} onClick={() => setVw(k)}
                style={{flex:1,padding:'10px 4px',borderRadius:0,border:'none',borderBottom:`${vw===k?'2px':'0.25px'} solid ${C.ac}${vw===k?'':'4D'}`,background:'transparent',color:vw===k?C.ac:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.12em',cursor:'pointer',position:'relative'}}>
                {l}{k==='hist' && unreadCoachNotes>0 && <span style={{position:'absolute',top:6,right:8,width:6,height:6,background:C.rd}}/>}
              </button>
            )}
          </div>
        );
        return (
          <div style={{padding:'14px 20px 0'}}>
            {navRow([['prog','PROGRAM'],['bwt','BW'],['meal','MEAL LOG']])}
            {navRow([['hist',`HISTORY (${cw.length})`],['pr','PRs'],['msg','MESSAGES']])}
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
          <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',fontWeight:700}}>BODYWEIGHT</div>
          <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.12em',fontWeight:700}}>{clientName} · {bwData.length} ENTRIES</div>
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
            <button disabled={!activePlan||demoMode} onClick={()=>{if(demoMode)return;const val=bw||bwDisplay;if(val&&activePlan){setBwLog(prev=>{const filtered=prev.filter(b=>!(b.clientId===ci&&b.blockName===activePlan.name&&b.week===wk+1));return[...filtered,{date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(val),blockName:activePlan.name,planId:activePlan.id||null}]});setBw('')}}}
              style={{padding:'10px 20px',borderRadius:0,border:`1px solid ${(bw&&activePlan)?C.ac:C.cardBd}`,background:'transparent',color:(bw&&activePlan)?C.ac:C.td,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',cursor:(bw&&activePlan)?'pointer':'default'}}>SAVE</button>
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
            <div style={{fontSize:10,fontFamily:FN,color:C.ac,letterSpacing:'0.15em',fontWeight:700,marginBottom:10}}>TREND</div>
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
                <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.12em',fontWeight:700}}>LATEST</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:C.tx}}>{bwData[bwData.length-1].bw}kg</div>
              </div>
              <div style={{flex:1,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.12em',fontWeight:700}}>CHANGE</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:(bwData[bwData.length-1].bw-bwData[0].bw)<=0?C.gn:C.or}}>
                  {(bwData[bwData.length-1].bw-bwData[0].bw)>0?'+':''}{(bwData[bwData.length-1].bw-bwData[0].bw).toFixed(1)}kg</div>
              </div>
              <div style={{flex:1,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.12em',fontWeight:700}}>ENTRIES</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:C.tx}}>{bwData.length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Log history */}
        <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',fontWeight:700,marginBottom:8}}>HISTORY</div>
        {bwData.slice().reverse().map((d,i) => {
          const onEdit = () => { setBw(String(d.bw)); setWk((d.week||1)-1); if (d.blockName) setSelectedBlockName(d.blockName); };
          const onDelete = (e) => { e.stopPropagation(); setBwDeleteConfirm(d); };
          return <div key={i} onClick={onEdit} title="Click to edit" style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,marginBottom:4,cursor:'pointer'}}>
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
        {bwData.length === 0 && <div style={{textAlign:'center',padding:20,color:C.td,fontSize:13}}>No bodyweight entries yet</div>}
      </div>
      {bwDeleteConfirm && <div role="dialog" aria-modal="true" aria-label="Delete bodyweight entry" className="motion-fade-in" onClick={() => setBwDeleteConfirm(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.bg,border:`1px solid ${C.cardBd}`,borderRadius:0,padding:24,maxWidth:320,width:'100%'}}>
          <div style={{fontFamily:FN,fontSize:10,color:C.td,marginBottom:8,letterSpacing:'0.12em',fontWeight:700}}>DELETE ENTRY</div>
          <div style={{fontSize:13,color:C.tx,marginBottom:20,fontFamily:FB,lineHeight:1.5}}>Remove {bwDeleteConfirm.bw}kg from {bwDeleteConfirm.blockName || '?'} · W{bwDeleteConfirm.week || '?'}?</div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={() => setBwDeleteConfirm(null)} style={{flex:1,padding:'10px 0',borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer'}}>CANCEL</button>
            <button onClick={() => { const d = bwDeleteConfirm; setBwLog(prev => prev.filter(b => !(b.clientId===d.clientId && b.blockName===d.blockName && b.week===d.week))); setBwDeleteConfirm(null); }} style={{flex:1,padding:'10px 0',borderRadius:0,border:`1px solid ${C.rd}`,background:'transparent',color:C.rd,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer'}}>DELETE</button>
          </div>
        </div>
      </div>}
    </div>;
  }

  // PRs (per-exercise weight progression)
  if (vw === 'pr' && trainee) {
    return <TraineePRsView clientWorkouts={cw} traineeId={ci} header={renderTopHeader()} />;
  }

  // History
  if (vw === 'hist' && trainee) return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
    {renderTopHeader()}
    <div style={{padding:'14px 20px 20px'}}>
      <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',fontWeight:700,marginBottom:14}}>HISTORY · {cw.length} SESSION{cw.length===1?'':'S'}</div>
      {cw.length === 0 ? <div style={{textAlign:'center',padding:40,color:C.td}}>No workouts yet.</div> :
        // The DB query orders by date DESC (newest first). The previous
        // `.reverse()` flipped it to oldest-first, but the athlete
        // expects to see their most-recent session at the top. Use the
        // natural newest-first order.
        cw.map(w => { const wActive = !!expandedHistEx && expandedHistEx.startsWith(w.id + ':'); return <div key={w.id} style={{background:'var(--c-sf)',border:`${wActive?'2px':'0.25px'} solid ${C.ac}${wActive?'':'4D'}`,borderRadius:0,padding:12,marginBottom:8}}>
          <div style={{fontFamily:FN,fontWeight:700,fontSize:13,letterSpacing:'0.02em'}}>{w.dayName} <span style={{color:C.tm,fontWeight:400,fontSize:12}}>{w.planName}</span></div>
          <div style={{fontSize:10,fontFamily:FN,color:C.tm,marginBottom:6,letterSpacing:'0.08em'}}>{fmtPrettyDate(w.date)} · W{w.week}</div>
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
                  style={{fontSize:11,fontFamily:FN,color:C.tm,display:'flex',alignItems:'center',gap:6,cursor:canExpand?'pointer':'default',padding:'3px 0'}}>
                  <span style={{flex:1}}>{i+1}. {x.title} <span style={{color:C.td}}>{x.prescribed} · {(x.sets||[]).filter(s=>s.done).length}/{(x.sets||[]).length}</span></span>
                  {hasVideo && <span style={{color:C.gn,fontSize:12}}>📹</span>}
                  {notesCount > 0 && <span style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,color:C.ac,fontFamily:FN,fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:0}}>💬 {notesCount}</span>}
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
          {w.notes && <div style={{fontSize:11,color:C.tm,marginTop:4,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,padding:6,borderRadius:0,fontFamily:FN}}>📝 {w.notes}</div>}
        </div>; })}</div></div>;

  // MEAL LOG page — full-screen, lazy-loaded.
  if (vw === 'meal' && trainee) return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
    {renderTopHeader()}
    <div style={{padding:'14px 20px 28px'}}>
      {demoMode ? (
        <div style={{textAlign:'center',color:C.td,padding:40,fontSize:13}}>
          Meal logging is hidden in preview mode.
        </div>
      ) : ci ? (
        <React.Suspense fallback={<div style={{textAlign:'center',color:C.td,padding:40,fontFamily:FN,fontSize:11,letterSpacing:'0.18em',fontWeight:700}}>LOADING…</div>}>
          <MealLogger clientId={ci} page />
        </React.Suspense>
      ) : null}
    </div>
  </div>;

  // MESSAGES page — surfaces the same thread that lived inline on the
  // Program view before 2026-05-16.
  if (vw === 'msg' && trainee) return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
    {renderTopHeader()}
    <div style={{padding:'14px 20px 28px'}}>
      {demoMode ? (
        <div style={{textAlign:'center',color:C.td,padding:40,fontSize:13}}>
          Messages are hidden in preview mode.
        </div>
      ) : ci ? (
        <>
          <PushToggle role="athlete" />
          <CoachMessagesAthlete
            traineeId={ci}
            role="athlete"
            recipientEmail="ohadyproductions@gmail.com"
            senderLabel={(trainee?.name || '').split(' ')[0] || 'your athlete'} />
        </>
      ) : null}
    </div>
  </div>;

  // Program view
  if (trainee) { const lb = bwLog.filter(b => b.clientId === ci).slice(-1)[0]?.bw;
    return <div data-theme="dark" style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
      {renderTopHeader()}
      <div style={{padding:'14px 20px 20px'}}>
        <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
          {/* WEEK selector hidden for daily-routine plans — they have no
              week structure. BW input stays useful regardless. */}
          {activePlan?.kind !== 'daily' && <div style={{flex:1}}><div style={{fontSize:9,fontFamily:FN,color:C.tm,marginBottom:6,letterSpacing:'0.18em',fontWeight:700}}>WEEK</div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{activePlan ? Array.from({length: activePlan.weeks || 4}, (_, w) => <button key={w} onClick={() => setWk(w)} style={{flex:'1 1 40px',padding:'8px 0',borderRadius:0,border:`${wk===w?'2px':'0.25px'} solid ${C.ac}${wk===w?'':'4D'}`,background:'transparent',color:wk===w?C.ac:C.tm,fontFamily:FN,fontSize:12,fontWeight:600,letterSpacing:'0.06em',cursor:'pointer'}}>W{w+1}</button>) : Array.from({length: 4}, (_, w) => <div key={w} style={{flex:'1 1 40px',padding:'8px 0',border:`1px solid ${C.cardBd}`,opacity:0.3,fontFamily:FN,fontSize:12,fontWeight:600,letterSpacing:'0.06em',color:C.tm,textAlign:'center'}}>—</div>)}</div></div>}
          <div style={{width:120}}><div style={{fontSize:9,fontFamily:FN,color:C.tm,marginBottom:6,letterSpacing:'0.18em',fontWeight:700}}>BW{lb?` · ${lb}KG`:''}</div>
            <div style={{display:'flex',gap:4}}>
            <input value={bw} onChange={e => setBw(e.target.value)} placeholder="KG" type="number" disabled={!activePlan} style={{background: 'var(--c-sf2)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'8px',color:C.tx,fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',opacity:activePlan?1:0.5}}/>
            {bw && activePlan && <button onClick={()=>{setBwLog(prev=>{const filtered=prev.filter(b=>!(b.clientId===ci&&b.blockName===activePlan.name&&b.week===wk+1));return[...filtered,{date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(bw),blockName:activePlan.name,planId:activePlan.id||null}]});setBw('')}} style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,padding:'4px 10px',color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer',whiteSpace:'nowrap'}}>SAVE</button>}
            </div></div></div>
        {activePlan?.rest && <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'10px 14px',marginBottom:14,fontSize:12,color:C.tm,fontFamily:FN}}><span style={{color:C.td,fontSize:9,fontWeight:700,letterSpacing:'0.15em',marginRight:10}}>REST</span>{activePlan.rest}</div>}
        {unreadCoachNotes > 0 && <div onClick={() => setVw('hist')}
          style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,padding:'12px 14px',marginBottom:14,cursor:'pointer',display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:6,height:6,background:C.ac,flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,color:C.ac,fontWeight:700,fontFamily:FN,letterSpacing:'0.02em'}}>{unreadCoachNotes} new note{unreadCoachNotes===1?'':'s'} from Ohad</div>
            <div style={{fontSize:9,color:C.tm,marginTop:3,fontFamily:FN,letterSpacing:'0.12em',textTransform:'uppercase'}}>View in History →</div>
          </div>
        </div>}
        {!demoMode && ci && <AthleteChallengesWidget clientId={ci} clientWorkouts={clientWorkouts} bwLog={bwLog} traineesById={Object.fromEntries((trainees||[]).map(t=>[t.id,t]))} />}
        {/* Messages + Meal Log used to render inline here. Both are
            now their own pages (vw='msg' / vw='meal') reached via the
            two-row nav above. Removed 2026-05-16. */}
        {plansLoadError && <div style={{background:'var(--c-sf)',border:`1px solid ${C.rd||'#c94444'}`,borderRadius:0,padding:14,marginBottom:14}}>
          <div style={{fontSize:11,color:C.rd||'#ff6b6b',fontWeight:700,fontFamily:FN,letterSpacing:'0.1em',marginBottom:6,textTransform:'uppercase'}}>Couldn't load programs</div>
          <div style={{fontSize:11,color:C.tm,marginBottom:10}}>{plansLoadError}</div>
          <button onClick={()=>{setPlansLoadError(null);setPlansReloadKey(k=>k+1);}} style={{background:'var(--c-sf)',border:`1px solid ${C.rd||'#c94444'}`,color:C.rd||'#ff6b6b',borderRadius:0,padding:'6px 14px',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',cursor:'pointer'}}>RETRY</button>
        </div>}
        {visPlans.length===0 && !plansLoadError && <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'40px 30px',textAlign:'center',color:C.td,marginBottom:14}}><div style={{fontSize:10,fontFamily:FN,fontWeight:700,letterSpacing:'0.18em',color:C.tm,marginBottom:10}}>NO ACTIVE PROGRAM</div><div style={{fontSize:13,color:C.td}}>Contact your coach to start training.</div></div>}
        {/* Per-plan block: divider → warm-up → rest → training days */}
        {(()=>{ let globalDayIdx = 0; return visPlans.map((vp,vpIdx) => <React.Fragment key={vp.name}>
          {visPlans.length>1 && <div style={{display:'flex',alignItems:'center',gap:10,margin:vpIdx===0?'0 0 12px':'20px 0 12px'}}>
            <div style={{flex:1,height:1,background:C.bd2}}/>
            <span style={{fontFamily:FN,fontSize:11,fontWeight:700,color:C.ac,letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{vp.name.toUpperCase()}</span>
            {vp.phase && <span style={{fontSize:10,color:C.tm}}>· {vp.phase}</span>}
            <div style={{flex:1,height:1,background:C.bd2}}/>
          </div>}
          {/* Skip the warm-up preview when every day in this plan is a daily
              routine — the plan-level warm-up doesn't apply to those, so
              showing it just creates UI noise. If even one day is week-paced,
              the warm-up is still relevant and stays visible. */}
          {vp.warmup?.length > 0 && !(vp.kind === 'daily' || (Array.isArray(vp.days) && vp.days.length > 0 && vp.days.every(d => d.kind === 'daily'))) && <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:14,marginBottom:14}}>
            <div style={{fontSize:10,fontFamily:FN,color:C.or,marginBottom:10,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase'}}>Warm-Up · {vp.name} ({vp.warmup.length})</div>
            {vp.warmup.map((w,i) => <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:i<vp.warmup.length-1?`1px solid rgba(127,127,131,0.133)`:'none'}}>
              <span style={{fontSize:13,color:C.tx}}>{w.t}</span>
              <div style={{display:'flex',gap:10,alignItems:'center'}}><span style={{fontSize:11,color:C.ac,fontFamily:FN,fontWeight:600}}>{(() => {
                if (w.sets || w.reps) {
                  const setsStr = w.sets ?? '';
                  const repsStr = w.reps ?? '';
                  const core = setsStr && repsStr ? `${setsStr}×${repsStr}` : `${setsStr}${repsStr}`;
                  return w.tempo ? `${core}  ${w.tempo}` : core;
                }
                return w.rx || '';
              })()}</span>
                {w.vid && <a href={w.vid} target="_blank" rel="noopener" style={{color:C.ac,fontSize:9,textDecoration:'none',padding:'2px 0',fontFamily:FN,fontWeight:700,letterSpacing:'0.12em'}}>VIDEO →</a>}</div></div>)}</div>}
          {vp.rest && visPlans.length>1 && <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'8px 12px',marginBottom:12,fontSize:11,color:C.tm,fontFamily:FN}}><span style={{color:C.td,fontSize:9,fontWeight:700,letterSpacing:'0.15em',marginRight:10}}>REST</span>{vp.rest}</div>}
          {vp.days.map((day,di) => { const dayIdx = globalDayIdx++;
          // Daily-routine: PER-DAY flag (`day.kind === 'daily'`) lets the
          // athlete log THIS specific day any number of times during the
          // block — never lock behind DONE, no week-rotation tie-in. Other
          // days in the same plan keep normal week-paced behavior. Plan-
          // level kind='daily' (96e5f72 legacy shape) is treated as
          // "every day in this plan is daily" so old data renders the same.
          const isDailyRoutine = day.kind === 'daily' || vp.kind === 'daily';
          const dailyCount = isDailyRoutine ? cw.filter(w => w.dayName === day.name).length : 0;
          const done = !isDailyRoutine && cw.some(w => w.dayName === day.name && w.week === wk + 1);
          // doneBorderColor hoisted out of the inline template — the
          // build-time guard's parser mis-tracks single-quoted strings
          // inside nested ${ … } expressions (it's how the original bare
          // rgba(...) crash slipped past CI), so we keep the template
          // expression to a plain identifier.
          const doneBorderColor = done ? 'rgba(46,213,115,0.251)' : C.ac;
          return <div key={vp.name+'-'+di} style={{background:'var(--c-sf)',border:`${done?'0.25px':'1px'} solid ${doneBorderColor}`,borderRadius:0,marginBottom:12,padding:'14px 18px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div><span style={{fontWeight:700,fontSize:15,fontFamily:FN,letterSpacing:'0.02em'}}>{day.name}</span>{isDailyRoutine && <span style={{display:'inline-block',marginLeft:8,padding:'2px 6px',border:`1px solid ${C.ac}`,color:C.ac,fontFamily:FN,fontSize:8,fontWeight:700,letterSpacing:'0.18em',verticalAlign:'2px'}}>DAILY</span>}{done && <span style={{display:'inline-block',marginLeft:10,padding:'2px 7px',border:`1px solid ${C.gn}`,color:C.gn,fontFamily:FN,fontSize:8,fontWeight:700,letterSpacing:'0.18em',verticalAlign:'2px'}}>DONE</span>}{isDailyRoutine && dailyCount > 0 && <span style={{display:'inline-block',marginLeft:10,padding:'2px 7px',border:`1px solid ${C.ac}`,color:C.ac,fontFamily:FN,fontSize:8,fontWeight:700,letterSpacing:'0.18em',verticalAlign:'2px'}}>{dailyCount} LOGGED</span>}
                <div style={{fontSize:10,color:C.tm,marginTop:3,fontFamily:FN,letterSpacing:'0.08em',textTransform:'uppercase'}}>{day.ex.length} exercises{isDailyRoutine && ' · daily routine'}</div></div>
              <button onClick={() => setLg(dayIdx)} style={{padding:'6px 14px',borderRadius:0,border:`1px solid ${done?C.gn:C.ac}`,background:'transparent',color:done?C.gn:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.15em',cursor:'pointer'}}>{done?'AGAIN':'LOG'}</button></div>
            {day.ex.map((ex,i) => {const d = EX[ex.eid] || { t: `Exercise ${i+1}`, vid: '', q: '' }; const hw = ex.wk?.length>0; const wr = hw ? (ex.wk[wk] ?? ex.r) : null;
              const focus = weeklyFocus?.[`${vp.name}|${day.name}|${ex.eid}|W${wk+1}`];
              const v = 'vid' in ex ? ex.vid : d.vid;
              // Two-row layout: meta row (index + reps + tempo + VIDEO) is
              // always single-line so the eye never has to track a long
              // title against a small rep count. The exercise NAME gets a
              // clean second row (indented past the index) and can wrap
              // freely without crowding the metadata.
              return <div key={i} style={{padding:'8px 0',borderTop:i?`1px solid ${C.cardBd}`:'none'}}>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <div style={{width:20,borderRadius:0,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:FN,fontSize:11,fontWeight:700,color:C.ac,flexShrink:0,letterSpacing:'0.04em',padding:'1px 0'}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0,display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
                    <span style={{fontSize:11,fontWeight:700,color:C.ac,fontFamily:FN,letterSpacing:'0.04em'}}>{hw?(wr||''):((ex.wkS&&ex.wkS[wk])||ex.s)+'x'+ex.r}</span>
                    {ex.tempo && <span style={{fontSize:11,color:C.or,fontFamily:FN,letterSpacing:'0.04em'}}>{ex.tempo}</span>}
                  </div>
                  {v ? <a href={v} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{color:C.ac,fontSize:9,textDecoration:'none',padding:'2px 0',fontFamily:FN,fontWeight:700,letterSpacing:'0.12em',flexShrink:0}}>VIDEO →</a> : null}
                </div>
                <div style={{marginInlineStart:30,marginTop:4,fontWeight:600,fontSize:12,lineHeight:1.35,wordBreak:'break-word'}}>{d.t}</div>
                {focus && <div style={{marginInlineStart:30,fontSize:11,color:C.ac,marginTop:4,opacity:0.85,lineHeight:1.4,display:'-webkit-box',WebkitBoxOrient:'vertical',WebkitLineClamp:2,overflow:'hidden'}}><span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',marginRight:8,opacity:0.7}}>FOCUS</span>{focus}</div>}
              </div>})}
          </div>})}</React.Fragment>)})()}
      </div>
      {showPwModal && <PasswordChangeModal onClose={()=>setShowPwModal(false)}/>}
      </div>; }

  // Falls through while trainees are still loading (ci set but not yet matched).
  // Auth is handled upstream in App.jsx — no login form here.
  return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20,gap:16}}>
    <img src={EXPO_LOGO_NAV} alt="EXPO" style={{height:50}} />
    <div style={{color:C.td,fontSize:13}}>Loading your program…</div>
  </div>;
}
