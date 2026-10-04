// VideoGapsView - Exercises hub -> VIDEOS (5.10 #559, Ohad: "library video gaps,
// but make it genius"). Which library exercises have NO video, ranked by the
// athletes who actually miss one; only SAFE candidates; and a one-click approve
// that also reaches the program rows - dry run first, undo after.
//
// Why the program rows: an athlete can not read the library, so a video reaches
// them only when it sits ON their program row. A row's video key ABSENT = inherit
// (they see nothing), '' = the coach chose no video, a URL = his override. An
// approve writes the library row and the ABSENT program rows only - never over
// his '' and never over his override (src/videoGaps.js, tested).
//
// The write rules, and why each one exists:
//   - Library: by id through the SAME store setter ExercisesView uses, as a
//     functional update that changes one row and only if it still holds what the
//     coach saw (setLibraryVideo). Never while the library is loading: one
//     whole-array write against an unloaded library wiped 1,326 exercises (27.8).
//   - Programs: one at a time, each RE-READ right before its write (a minute-old
//     snapshot would clobber an editor save made since), written through savePlan
//     (compare-and-swap on updated_at since 2.10 - never a raw .update()).
//   - Undo: in memory + sessionStorage; a program is restored only if it is
//     still the exact version we wrote, else it is reported and skipped.
//   - Blank > wrong: nothing is assigned without his click, and a candidate never
//     comes from a variant (videoGaps.candidatesFor).
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { C, FN, FB, ytId } from './theme';
import { Card, Btn, Modal, ChipGrid, baseInput } from './ui';
import { StoredVideo } from './StoredMedia';
import { supabase } from './supabase';
import { savePlan, planFromRow } from './usePlansStore';
import { rankGaps, candidatesFor, applyVideoToPlanData } from './videoGaps';
import { checkLink, markCurrent, missingAthletes, dryRun, setLibraryVideo, undoVerdict, unknownDataKeys, chunk, linksToCheck, deadRows } from './videoGapsApply';
import { normTitle } from './exerciseMatch';
import { useT, useHe } from './i18n';

const UNDO_KEY = 'expo-video-gaps-undo:v1';
const PAGE = 25;
const H = 'var(--btn-h)';
const LABEL = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm };
const btnH = { height: H, minHeight: H, boxSizing: 'border-box' };
const readUndo = () => { try { const v = sessionStorage.getItem(UNDO_KEY); return v ? JSON.parse(v) : null; } catch { return null; } };
const writeUndo = (v) => { try { if (v) sessionStorage.setItem(UNDO_KEY, JSON.stringify(v)); else sessionStorage.removeItem(UNDO_KEY); } catch { /* private mode: the in-memory copy still undoes */ } };

// "3 athletes" / "3 מתאמנים" with the Hebrew singular said properly
const count = (he, n, en1, enN, he1, heN) => (he ? (n === 1 ? he1 : `${n} ${heN}`) : `${n} ${n === 1 ? en1 : enN}`);

// One preview box: YouTube thumbnail -> embed on click, Vimeo -> player on click,
// a clip file / storage path -> <video>, any other https link -> a plain link.
function VideoPreview({ url, width = 240 }) {
  const tt = useT();
  const [play, setPlay] = useState(false);
  useEffect(() => { setPlay(false); }, [url]);
  const yid = ytId(url);
  const c = checkLink(url);
  const vimeo = c.ok && c.kind === 'vimeo' ? c.id : null;
  const isFile = !yid && !vimeo && (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(url || '')) || !/^https?:/i.test(String(url || '')));
  const box = { position: 'relative', width: '100%', maxWidth: width, aspectRatio: '16 / 9', background: '#000', overflow: 'hidden', flexShrink: 0 };
  const playKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlay(true); } };
  const glyph = (
    <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.85)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #fff', marginLeft: 3 /* physical: a play triangle points right in Hebrew too */ }} />
      </span>
    </span>
  );
  if (yid || vimeo) {
    if (play) {
      const src = yid ? `https://www.youtube.com/embed/${yid}?fs=0&rel=0&modestbranding=1&playsinline=1&autoplay=1` : `https://player.vimeo.com/video/${vimeo}?autoplay=1`;
      return <div style={box}><iframe title={tt('Play')} src={src} style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay; encrypted-media" /></div>;
    }
    return (
      <div style={{ ...box, cursor: 'pointer' }} role="button" tabIndex={0} aria-label={tt('Play')} onClick={() => setPlay(true)} onKeyDown={playKey}>
        {yid
          ? <img src={`https://img.youtube.com/vi/${yid}/mqdefault.jpg`} loading="lazy" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92, display: 'block' }} />
          : <span style={{ position: 'absolute', insetInlineStart: 8, bottom: 6, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#fff', textTransform: 'uppercase' }}>{tt('Vimeo')}</span>}
        {glyph}
      </div>
    );
  }
  if (isFile) return <StoredVideo src={url} controls playsInline preload="metadata" style={{ ...box, display: 'block' }} />;
  return <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: FB, fontSize: 12, color: C.acText, overflowWrap: 'anywhere' }}>{tt('Open link')} ↗</a>;
}

// A pasted link + APPROVE, 36px each, the input taking the rest of the row.
function PasteApprove({ placeholder, onApprove, disabled }) {
  const tt = useT();
  const he = useHe();
  const [v, setV] = useState('');
  const c = checkLink(v);
  const bad = v.trim() && !c.ok;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minWidth: 0 }}>
        <input type="url" inputMode="url" dir={v ? 'ltr' : 'auto'} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
          aria-label={placeholder} style={{ ...baseInput, ...btnH, flex: 1, minWidth: 0, textAlign: v ? 'left' : (he ? 'right' : 'left'), padding: '0 12px', fontSize: 12.5 }} />
        <Btn disabled={disabled || !c.ok} onClick={() => onApprove(c.url)} style={{ ...btnH, flexShrink: 0, minWidth: 120, opacity: disabled || !c.ok ? 0.45 : 1 }}>{tt('Approve')}</Btn>
      </div>
      {bad && <div style={{ fontFamily: FB, fontSize: 11.5, color: C.rd }}>{tt('Not a link this screen accepts')}</div>}
      {c.ok && <VideoPreview url={c.url} />}
    </div>
  );
}

function GapRow({ gap, library, plans, canWrite, onApprove, first }) {
  const tt = useT();
  const he = useHe();
  const cands = useMemo(() => candidatesFor(gap, library, plans), [gap, library, plans]);
  return (
    <div style={{ padding: '14px 0', borderTop: first ? 'none' : `1px solid ${C.cardBd}`, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        {/* dir=auto keeps an English title's glyph order; the alignment follows the PAGE (he: right) so it lines up with the lines under it */}
        <div dir="auto" style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, color: C.tx, overflowWrap: 'anywhere', textAlign: he ? 'right' : 'left' }}>{gap.title}</div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.td, marginTop: 4 }}>
          <span style={{ color: gap.activeAthletes ? C.acText : C.td, fontWeight: gap.activeAthletes ? 600 : 400 }}>{count(he, gap.activeAthletes, 'athlete on active programs', 'athletes on active programs', 'מתאמן אחד בתוכנית פעילה', 'מתאמנים בתוכניות פעילות')}</span>
          {' · '}{count(he, gap.missingRows, 'row', 'rows', 'שורה אחת', 'שורות')}
          {gap.recent && <>{' · '}<span style={{ color: C.or }}>{tt('Logged in the last 30 days')}</span></>}
        </div>
      </div>
      {cands.length ? cands.map((c) => (
        <div key={c.url} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', minWidth: 0 }}>
          <VideoPreview url={c.url} />
          <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ ...LABEL, color: C.gn }}>{c.source === 'your-program' ? tt('You used this in a program') : tt('Same exercise in your library')}</div>
            {c.source === 'library-twin' && <div dir="auto" style={{ fontFamily: FB, fontSize: 12.5, color: C.tx, textAlign: he ? 'right' : 'left' }}>{c.why.replace(/^Same exercise in your library: /, '').replace(/^"|"$/g, '')}</div>}
            <div dir="ltr" style={{ fontFamily: FB, fontSize: 11, color: C.td, overflowWrap: 'anywhere', textAlign: he ? 'right' : 'left' }}>{c.url}</div>
            <Btn disabled={!canWrite} onClick={() => onApprove({ exId: gap.id, exTitle: gap.title, from: '', url: c.url, mode: 'gap' })} style={{ ...btnH, alignSelf: 'flex-start', minWidth: 140, opacity: canWrite ? 1 : 0.45 }}>{tt('Approve')}</Btn>
          </div>
        </div>
      )) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ fontFamily: FB, fontSize: 12.5, color: C.tm }}>{tt('No safe candidate - paste a link')}</div>
          <PasteApprove placeholder={tt('Paste a video link')} disabled={!canWrite}
            onApprove={(url) => onApprove({ exId: gap.id, exTitle: gap.title, from: '', url, mode: 'gap' })} />
        </div>
      )}
    </div>
  );
}

export default function VideoGapsView({ exercises = [], setExercises, exercisesLoaded = false, trainees = [], clientWorkouts = [], isOwner = true }) {
  const tt = useT();
  const he = useHe();
  const [plans, setPlans] = useState(null);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState('missed');
  const [limit, setLimit] = useState(PAGE);
  const [health, setHealth] = useState({ status: 'idle', checked: 0, total: 0, results: [] });
  const [pending, setPending] = useState(null);    // { exId, exTitle, from, url, mode }
  const [run, setRun] = useState(null);            // { kind:'apply'|'undo', busy, done, total, lib, results:[] }
  const [undo, setUndo] = useState(() => readUndo());
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const loadPlans = useCallback(async () => {
    const { data, error } = await supabase.from('plans').select('id, trainee_id, name, active, data, updated_at, created_at');
    if (!alive.current) return;
    // `active` = the programs the athlete SEES today (markCurrent), not the DB flag that every row carries
    if (error) setErr(error.message); else { setErr(null); setPlans(markCurrent(data || [])); }
  }, []);
  useEffect(() => { loadPlans(); }, [loadPlans]);

  // The library is writable only once it has REALLY loaded (27.8: the wipe).
  const libReady = !!exercisesLoaded && Array.isArray(exercises) && exercises.length > 0;
  const canWrite = libReady && !!plans && !!setExercises && isOwner;

  // Titles logged in the last 30 days - a gap someone is training right now ranks up.
  const recent = useMemo(() => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const s = new Set();
    for (const w of clientWorkouts || []) {
      if (!w || String(w.date || '') < since) continue;
      for (const e of w.exercises || []) { const t = e && (e.title || e.name || e.t); if (t) s.add(normTitle(t)); }
    }
    return s;
  }, [clientWorkouts]);

  const gaps = useMemo(() => (plans && libReady ? rankGaps(exercises, plans, recent) : []), [plans, libReady, exercises, recent]);
  // the default list: what an athlete on a LIVE program would see today (or logged lately) -
  // an inactive block's missing video reaches nobody, so it waits under ALL
  const missed = useMemo(() => gaps.filter((g) => g.activeAthletes > 0 || g.recent), [gaps]);
  const athletesMissing = useMemo(() => (plans && libReady ? missingAthletes(exercises, plans).size : 0), [plans, libReady, exercises]);
  const dead = useMemo(() => (health.status === 'done' ? deadRows(exercises, health.results) : []), [health, exercises]);
  const shown = (filter === 'missed' ? missed : gaps).slice(0, limit);
  const listTotal = filter === 'missed' ? missed.length : gaps.length;

  const checkLinks = async () => {
    const links = linksToCheck(exercises);
    setHealth({ status: 'running', checked: 0, total: links.length, results: [] });
    const results = [];
    for (const batch of chunk(links, 50)) {
      let j = null;
      try {
        const res = await fetch('/api/video-health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls: batch }) });
        // a local `vite preview` has no /api: a 404 or the SPA's HTML, never JSON
        if (res.ok && /json/i.test(res.headers.get('content-type') || '')) j = await res.json();
      } catch { j = null; }
      if (!alive.current) return;
      if (!j || !Array.isArray(j.results)) { setHealth({ status: 'unavailable', checked: results.length, total: links.length, results }); return; }
      results.push(...j.results);
      setHealth({ status: 'running', checked: results.length, total: links.length, results: results.slice() });
    }
    setHealth({ status: 'done', checked: results.length, total: links.length, results });
  };

  const plan = useMemo(() => (pending && plans ? dryRun(pending, plans, trainees) : null), [pending, plans, trainees]);
  const nameOf = (tid) => { const t = (trainees || []).find((x) => x && x.id === tid); return (t && (t.name || t.nameLocal)) || ''; };

  const approve = async () => {
    if (!pending || !plan) return;
    const p = pending;
    // Re-check the library row against what the coach saw, and refuse an unloaded library.
    const cur = libReady ? exercises.find((e) => e && e.id === p.exId) : null;
    if (!cur || String(cur.videoLink || '').trim() !== String(p.from || '').trim()) {
      setRun({ kind: 'apply', busy: false, done: 0, total: 0, lib: 'stale', results: [] });
      return;
    }
    setRun({ kind: 'apply', busy: true, done: 0, total: plan.plans.length, lib: 'pending', results: [] });
    setExercises((prev) => setLibraryVideo(prev, p.exId, p.from, p.url));
    const results = [];
    const record = { at: new Date().toISOString(), exId: p.exId, title: p.exTitle, from: p.from || '', url: p.url, plans: [] };
    for (const g of plan.plans) {
      let r;
      try {
        const { data: row, error } = await supabase.from('plans').select('*').eq('id', g.planId).maybeSingle();
        if (error) r = { status: 'failed', why: error.message };
        else if (!row) r = { status: 'gone' };
        else if (unknownDataKeys(row.data).length) r = { status: 'refused' };
        else {
          const applied = applyVideoToPlanData(row.data, p.exId, p.exTitle, p.url);
          if (!applied.changed) r = { status: 'nothing' };
          else {
            const ok = await savePlan({ ...planFromRow(row), days: applied.data.days || [], warmup: applied.data.warmup || [] });
            if (!ok) r = { status: 'failed' };
            else {
              const { data: after } = await supabase.from('plans').select('updated_at').eq('id', g.planId).maybeSingle();
              r = { status: 'saved', changed: applied.changed };
              record.plans.push({ planId: g.planId, athlete: g.athlete, block: g.block, writtenAt: after && after.updated_at, before: { days: (row.data && row.data.days) || [], warmup: (row.data && row.data.warmup) || [] } });
            }
          }
        }
      } catch (e) { r = { status: 'failed', why: String((e && e.message) || e) }; }
      results.push({ planId: g.planId, athlete: g.athlete, block: g.block, ...r });
      if (alive.current) setRun((s) => ({ ...s, done: results.length, results: results.slice() }));
    }
    setUndo(record); writeUndo(record);
    if (alive.current) setRun((s) => ({ ...s, busy: false, lib: 'sent' }));
    loadPlans();
  };

  const doUndo = async () => {
    const rec = undo;
    if (!rec || !libReady) return;
    setPending(null);
    setRun({ kind: 'undo', busy: true, done: 0, total: rec.plans.length, lib: 'pending', results: [] });
    // the library goes back only if it still holds the link we wrote
    const cur = exercises.find((e) => e && e.id === rec.exId);
    const libOk = !!cur && String(cur.videoLink || '').trim() === rec.url;
    if (libOk) setExercises((prev) => setLibraryVideo(prev, rec.exId, rec.url, rec.from));
    const results = [];
    for (const pr of rec.plans) {
      let r;
      try {
        const { data: row, error } = await supabase.from('plans').select('*').eq('id', pr.planId).maybeSingle();
        const v = error ? 'failed' : undoVerdict(pr.writtenAt, row);
        if (v !== 'ok') r = { status: v === 'changed' ? 'changed' : v === 'gone' ? 'gone' : 'failed' };
        else r = { status: (await savePlan({ ...planFromRow(row), days: pr.before.days, warmup: pr.before.warmup })) ? 'restored' : 'failed' };
      } catch { r = { status: 'failed' }; }
      results.push({ planId: pr.planId, athlete: pr.athlete, block: pr.block, ...r });
      if (alive.current) setRun((s) => ({ ...s, done: results.length, results: results.slice() }));
    }
    setUndo(null); writeUndo(null);
    if (alive.current) setRun((s) => ({ ...s, busy: false, lib: libOk ? 'restored' : 'changed' }));
    loadPlans();
  };

  const STATUS = {
    saved: [C.gn, tt('Saved')], restored: [C.gn, tt('Restored')], failed: [C.rd, tt('Failed')],
    changed: [C.or, tt('Changed since - skipped')], gone: [C.td, tt('Deleted since')],
    nothing: [C.td, tt('Nothing missing any more')], refused: [C.or, tt('Refused - this program has a field this screen does not save')],
  };

  if (!isOwner) return null;
  if (err) return <Card header={tt('Library videos')}><div style={{ fontFamily: FB, color: C.rd }}>{tt("Couldn't load programs:")} {err}</div></Card>;

  const stat = (n, label, color) => (
    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, justifyContent: 'center' }}>
      <span style={{ fontFamily: FN, fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{n}</span>
      <span style={{ ...LABEL, letterSpacing: he ? 0 : LABEL.letterSpacing, fontSize: he ? 11 : 9, lineHeight: 1.25 }}>{label}</span>
    </div>
  );
  const loading = !plans || !libReady;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, margin: '0 auto', padding: '4px 0 60px', minWidth: 0 }}>
      <Card leftStripe={C.ac} header={tt('Library videos')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', border: `1px solid ${C.cardBd}`, marginBottom: 12 }}>
          {[
            stat(loading ? '…' : gaps.length, tt('Without a video'), C.tx),
            stat(loading ? '…' : athletesMissing, tt('Athletes missing one'), athletesMissing ? C.acText : C.tx),
            stat(health.status === 'done' ? dead.length : '—', tt('Dead links'), dead.length ? C.rd : C.tx),
          ].map((cell, i) => <div key={i} style={{ borderInlineStart: i ? `1px solid ${C.cardBd}` : 'none', minWidth: 0, display: 'flex' }}>{cell}</div>)}
        </div>
        <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td, lineHeight: 1.5, marginBottom: 12 }}>
          {tt('An athlete sees a video only when it is on their program row. Approve writes the library and every program row that has no video of its own - your "no video" rows and your own links stay as they are.')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <ChipGrid ariaLabel={tt('Videos')} value={filter} onChange={(k) => { setFilter(k); setLimit(PAGE); }} style={{ flex: '3 1 260px' }}
            items={[{ k: 'missed', label: tt('Athletes miss it'), n: loading ? null : missed.length }, { k: 'all', label: tt('All'), n: loading ? null : gaps.length }]} />
          <Btn variant="ghost" disabled={!libReady || health.status === 'running'} onClick={checkLinks} style={{ ...btnH, flex: '1 1 200px' }}>
            {health.status === 'running' ? `${tt('Checking links…')} ${health.checked}/${health.total}` : tt('Check links')}
          </Btn>
        </div>
        {health.status === 'unavailable' && <div style={{ fontFamily: FB, fontSize: 12, color: C.or, marginTop: 10 }}>{tt('Link check is unavailable here')}</div>}
        {health.status === 'done' && !dead.length && <div style={{ fontFamily: FB, fontSize: 12, color: C.gn, marginTop: 10 }}>{count(he, health.total, 'link checked - none dead.', 'links checked - none dead.', 'קישור אחד נבדק - הוא תקין.', 'קישורים נבדקו - אף אחד לא מת.')}</div>}
        {undo && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.cardBd}` }}>
            <span style={{ flex: '1 1 220px', minWidth: 0, fontFamily: FB, fontSize: 12.5, color: C.tx }}>
              <span style={LABEL}>{tt('Last approve')}</span>{' '}<span dir="auto">{undo.title}</span>{' · '}{count(he, undo.plans.length, 'program', 'programs', 'תוכנית אחת', 'תוכניות')}
            </span>
            <Btn variant="ghost" disabled={!libReady || (run && run.busy)} onClick={doUndo} style={{ ...btnH, minWidth: 140 }}>{tt('Undo')}</Btn>
          </div>
        )}
      </Card>

      {dead.length > 0 && (
        <Card header={`${tt('Dead links')} · ${dead.length}`}>
          {dead.map((d, i) => (
            <div key={d.id} style={{ padding: '12px 0', borderTop: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span dir="auto" style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, color: C.tx, overflowWrap: 'anywhere' }}>{d.title}</span>
                <span style={{ ...LABEL, color: d.state === 'dead' ? C.rd : C.or }}>{d.state === 'dead' ? tt('Dead') : tt('No embed')}</span>
              </div>
              <div dir="ltr" style={{ fontFamily: FB, fontSize: 11, color: C.td, overflowWrap: 'anywhere', textAlign: he ? 'right' : 'left' }}>{d.url}</div>
              <PasteApprove placeholder={tt('Paste the replacement link')} disabled={!canWrite}
                onApprove={(url) => setPending({ exId: d.id, exTitle: d.title, from: d.url, url, mode: 'replace' })} />
            </div>
          ))}
        </Card>
      )}

      <Card header={tt('Exercises without a video')}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.tm, fontFamily: FN, fontSize: 11, letterSpacing: '0.16em' }}>{!libReady ? tt('Loading the library…') : tt('Scanning programs…')}</div>
        ) : !shown.length ? (
          <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '8px 0' }}>{gaps.length ? tt('No program is missing a video right now.') : tt('Every exercise in your library has a video.')}</div>
        ) : (
          <>
            {shown.map((g, i) => <GapRow key={g.id} first={i === 0} gap={g} library={exercises} plans={plans} canWrite={canWrite} onApprove={setPending} />)}
            {listTotal > shown.length && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, borderTop: `1px solid ${C.cardBd}` }}>
                <Btn variant="ghost" onClick={() => setLimit((n) => n + PAGE)} style={{ ...btnH, minWidth: 200 }}>{tt('Show more')} · {listTotal - shown.length}</Btn>
              </div>
            )}
          </>
        )}
      </Card>

      {pending && plan && !run && (
        <Modal open wide onClose={() => setPending(null)} title={tt('Review before writing')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <div>
              <div style={{ ...LABEL, color: C.ac, marginBottom: 6 }}>{tt('Library')}</div>
              <div dir="auto" style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, color: C.tx, textAlign: he ? 'right' : 'left' }}>{plan.library.title}</div>
              <div dir="ltr" style={{ fontFamily: FB, fontSize: 12, color: C.td, overflowWrap: 'anywhere', textAlign: he ? 'right' : 'left', marginTop: 4 }}>
                <span style={{ color: plan.library.from ? C.rd : C.td }}>{plan.library.from || `'' (${tt('No video')})`}</span>{'  →  '}<span style={{ color: C.gn }}>{plan.library.to}</span>
              </div>
            </div>
            <VideoPreview url={plan.library.to} width={320} />
            <div>
              <div style={{ ...LABEL, color: C.ac, marginBottom: 6 }}>{tt('Programs')} · {count(he, plan.rowCount, 'row', 'rows', 'שורה אחת', 'שורות')} · {count(he, plan.athleteCount, 'athlete', 'athletes', 'מתאמן אחד', 'מתאמנים')}</div>
              {plan.plans.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${C.cardBd}`, maxHeight: 300, overflowY: 'auto' }}>
                  {plan.plans.map((g, i) => (
                    <div key={g.planId} style={{ padding: '8px 12px', borderTop: i ? `1px solid ${C.cardBd}` : 'none', fontFamily: FB, fontSize: 12.5, color: C.tx, minWidth: 0 }}>
                      <span dir="auto" style={{ fontWeight: 600 }}>{g.athlete || nameOf(g.traineeId) || '—'}</span>{' · '}<span dir="auto">{g.block}</span>
                      {/* not the block the athlete sees today (markCurrent) - still written, it inherits the same gap */}
                      {!g.active && <span style={{ color: C.td }}>{' · '}{tt('older block')}</span>}
                      <div style={{ color: C.td, fontSize: 11.5, marginTop: 2 }}>
                        {g.places.map((pl) => (pl.where === 'warmup' ? tt('Warm-up') : (pl.dayName || `${tt('Day')} ${pl.di + 1}`))).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>{tt('No program row changes - none of them is missing this video.')}</div>}
            </div>
            <div style={{ fontFamily: FB, fontSize: 12.5, color: C.tm }}>{tt('Your "no video" rows and your own links are left alone')} ({plan.leftAlone})</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Btn variant="ghost" onClick={() => setPending(null)} style={{ ...btnH, minWidth: 120 }}>{tt('Cancel')}</Btn>
              <Btn variant="solid" disabled={!canWrite} onClick={approve} style={{ ...btnH, minWidth: 180, background: '#39BDFF', borderColor: '#39BDFF', color: '#06131b' }}>{tt('Approve and write')}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {run && (
        <Modal open onClose={() => { if (!run.busy) { setRun(null); setPending(null); } }} title={run.kind === 'undo' ? tt('Undo') : tt('Approve')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {run.lib === 'stale' ? (
              <div style={{ fontFamily: FB, fontSize: 13, color: C.or }}>{tt('This exercise changed since you opened it - nothing was written.')}</div>
            ) : (
              <>
                <div style={{ fontFamily: FB, fontSize: 13, color: C.tx }}>
                  <span style={LABEL}>{tt('Library')}</span>{' '}
                  <span style={{ color: run.lib === 'changed' ? C.or : run.lib === 'pending' ? C.td : C.gn }}>
                    {run.lib === 'pending' ? '…' : run.lib === 'changed' ? tt('Changed since - skipped') : run.kind === 'undo' ? tt('Restored') : tt('Saved')}
                  </span>
                </div>
                <div style={{ ...LABEL }}>{tt('Programs')} · {run.done}/{run.total}</div>
                {run.results.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${C.cardBd}`, maxHeight: 300, overflowY: 'auto' }}>
                    {run.results.map((r, i) => {
                      const [col, label] = STATUS[r.status] || [C.td, r.status];
                      return (
                        <div key={r.planId} style={{ padding: '8px 12px', borderTop: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', fontFamily: FB, fontSize: 12.5, color: C.tx }}>
                          <span style={{ minWidth: 0 }}><span dir="auto">{r.athlete || '—'}</span>{' · '}<span dir="auto">{r.block}</span></span>
                          <span style={{ color: col, fontWeight: 600 }}>{label}{r.changed ? ` (${r.changed})` : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn variant="ghost" disabled={run.busy} onClick={() => { setRun(null); setPending(null); }} style={{ ...btnH, minWidth: 120 }}>{run.busy ? '…' : tt('Close')}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
