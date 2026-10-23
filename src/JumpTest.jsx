// JUMP TEST (23.10 #897, from the TrackJump reel Ohad sent: "apply to our systems and tools"). The athlete films one
// vertical jump on his phone and gets his height - the same flight-time ruler as the coach's MovementLab
// (poseLab.jumpMetrics: both ankles leave and meet the floor, h = g t^2 / 8) - and it is SAVED where his coach sees it
// (athlete_tests), not left on one device. A clip, not the live camera: a recorded (ideally slow-motion) clip reads to
// about a centimetre, a live web camera 3-10 cm (evalTestMap.js). The clip never leaves the phone; only the numbers do.
// Its own URL: <progress>/jump-test opens the filming step. The demo and the coach's preview keep results in memory.
import React, { useEffect, useRef, useState } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { FitStrip } from './StrengthReview';
import { useUrlFlag } from './urlState';

const L = (he, en, hb) => (he ? hb : en);
const Ltr = ({ children, style }) => <bdi dir="ltr" style={{ unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums', ...style }}>{children}</bdi>;
const card = { border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', marginTop: 12 };
const btn = { height: 'var(--btn-h)', minHeight: 0, boxSizing: 'border-box', padding: '0 14px', border: `1px solid ${C.ac}`, borderRadius: 0, background: 'transparent', color: C.ac, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' };
const dm = (iso) => { const d = new Date(iso); return isFinite(d) ? `${d.getDate()}.${d.getMonth() + 1}` : ''; };
const DEMO_TESTS = (() => { const day = (n) => new Date(Date.now() - n * 86400000).toISOString(); return [{ id: 'd3', value: 47.6, tested_at: day(2), detail: { flightMs: 623 } }, { id: 'd2', value: 46.1, tested_at: day(16), detail: { flightMs: 613 } }, { id: 'd1', value: 44.3, tested_at: day(31), detail: { flightMs: 601 } }]; })();

export default function JumpTest({ clientId, he, demo = false, readOnly = false, coach = false }) {   // coach: his results on the athlete page, no filming
  const [tests, setTests] = useState(demo ? DEMO_TESTS : null);
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && /\/progress\/jump-test\/?$/.test(window.location.pathname));
  const [phase, setPhase] = useState('idle');   // idle | reading | result | fail | saving | saved
  const [pct, setPct] = useState(0);
  const [res, setRes] = useState(null);
  const fileRef = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const base = typeof window !== 'undefined' ? (window.location.pathname.match(/^(.*\/progress)(\/|$)/) || [])[1] || null : null;
  useUrlFlag(open, (v) => setOpen(!!v), base, 'jump-test');
  const tid = String(clientId || '');

  useEffect(() => {
    if (demo || !tid) return;
    let off = false;
    (coach ? supabase.from('athlete_tests').select('id, value, detail, tested_at').or(`trainee_id.eq.${tid},trainee_id.like.${tid}__*`) : supabase.from('athlete_tests').select('id, value, detail, tested_at').eq('trainee_id', tid)).eq('kind', 'cmj').order('tested_at', { ascending: false }).limit(20)
      .then(({ data }) => { if (!off) setTests(data || []); });
    return () => { off = true; };
  }, [tid, demo, coach]);

  const onFile = async (file) => {
    if (!file) return;
    setOpen(true); setPhase('reading'); setPct(0); setRes(null);
    const url = URL.createObjectURL(file);
    try {
      const [{ captureClipFrames }, { jumpMetrics }] = await Promise.all([import('./MovementLab'), import('./poseLab')]);
      const frames = await captureClipFrames(url, { quality: 'full', maxFrames: 600, onProgress: (p) => { if (alive.current) setPct(p); }, shouldStop: () => !alive.current });
      const m = jumpMetrics(frames);
      if (!alive.current) return;
      const fps = frames.length > 1 ? Math.round((frames.length - 1) / ((frames[frames.length - 1].t - frames[0].t) / 1000)) : null;
      if (m && m.heightCm > 0) { setRes({ ...m, fps }); setPhase('result'); } else setPhase('fail');
    } catch { if (alive.current) setPhase('fail'); } finally { URL.revokeObjectURL(url); }
  };
  const save = async () => {
    if (!res) return;
    const row = { trainee_id: tid, kind: 'cmj', value: Math.round(res.heightCm * 10) / 10, detail: { flightMs: Math.round(res.flightMs), peakRiseCm: res.peakRiseCm != null ? Math.round(res.peakRiseCm * 10) / 10 : null, fps: res.fps, model: 'full' }, tested_at: new Date().toISOString() };
    if (demo || readOnly) { setTests((t) => [{ id: `local-${Date.now()}`, ...row }, ...(t || [])]); setPhase('saved'); return; }
    setPhase('saving');
    const { data, error } = await supabase.from('athlete_tests').insert(row).select('id, value, detail, tested_at').single();
    if (!alive.current) return;
    if (error) { setPhase('result'); return; }
    setTests((t) => [data, ...(t || [])]); setPhase('saved');
  };

  const list = tests || [];
  if (coach && !list.length) return null;   // the coach's page shows the card once the athlete has tested
  const best = list.reduce((b, t) => (b == null || Number(t.value) > b ? Number(t.value) : b), null);
  const last = list[0] || null;
  const cm = (v) => <Ltr>{(Math.round(Number(v) * 10) / 10).toFixed(1)}</Ltr>;
  return (
    <div style={card} data-jump-test>
      <FitStrip he={he} title={L(he, 'Jump test', 'קפיצה אנכית')} meta={L(he, 'from a phone clip', 'מסרטון בטלפון')} />
      <div style={{ padding: '12px 14px' }}>
        {list.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
            {[[L(he, 'Best', 'שיא'), best], [L(he, 'Last', 'אחרונה'), last && last.value]].map(([k, v]) => (
              <div key={k} style={{ border: `1px solid ${C.cardBd}`, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontFamily: FN, fontSize: 22, fontWeight: 700, color: C.tx, lineHeight: 1.15 }}>{cm(v)} <span style={{ fontSize: 12, color: C.tm }}>{L(he, 'cm', 'ס״מ')}</span></div>
                <div style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: he ? 0 : '0.12em', textTransform: 'uppercase', color: C.tm, marginTop: 4 }}>{k}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: FB, fontSize: 13, lineHeight: 1.5, color: C.tm, marginBottom: 12 }}>{L(he, 'Film one jump and your height shows here.', 'צלם קפיצה אחת והגובה שלך יופיע כאן.')}</div>
        )}

        {!coach && open && (phase === 'idle' || phase === 'fail') && (
          <div data-jump-howto style={{ fontFamily: FB, fontSize: 13, lineHeight: 1.55, color: C.tx, marginBottom: 12 }}>
            {L(he, 'Phone on the floor, 2-3 m away, your whole body in the frame. Stand still for a second, jump as high as you can, land on the same spot. Slow motion gives the most exact number.',
              'שים את הטלפון על הרצפה, 2-3 מטר ממך, כשכל הגוף בתוך הפריים. תעמוד בשקט שנייה, תקפוץ הכי גבוה שאתה יכול ותנחת באותה נקודה. בהילוך איטי המספר הכי מדויק.')}
          </div>
        )}
        {phase === 'reading' && <div data-jump-reading style={{ fontFamily: FN, fontSize: 12, color: C.tm, marginBottom: 12 }}>{L(he, 'Reading the jump…', 'מנתח את הקפיצה…')} <Ltr>{Math.round((pct || 0) * (pct > 1 ? 1 : 100))}%</Ltr></div>}
        {phase === 'fail' && <div data-jump-fail style={{ fontFamily: FB, fontSize: 13, lineHeight: 1.5, color: C.or, marginBottom: 12 }}>{L(he, "Couldn't read a jump in this clip - keep your feet in the frame and stand still for a second before you jump.", 'לא הצלחתי לזהות קפיצה בסרטון. שהרגליים יהיו בתוך הפריים, ותעמוד בשקט שנייה לפני הקפיצה.')}</div>}
        {(phase === 'result' || phase === 'saving' || phase === 'saved') && res && (
          <div data-jump-result style={{ border: `1px solid ${C.ac}`, padding: '12px 14px', marginBottom: 12, textAlign: 'center' }}>
            <div style={{ fontFamily: FN, fontSize: 30, fontWeight: 700, color: C.ac, lineHeight: 1.1 }}>{cm(res.heightCm)} <span style={{ fontSize: 13, color: C.tm }}>{L(he, 'cm', 'ס״מ')}</span></div>
            <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 4 }}><Ltr>{(res.flightMs / 1000).toFixed(2)}</Ltr> {L(he, 's in the air', 'שנ׳ באוויר')}{best != null && res.heightCm > best && phase !== 'saved' ? <span style={{ color: C.gn }}> · {L(he, 'a new best', 'שיא חדש')}</span> : null}</div>
          </div>
        )}

        {!coach && <>
        <input ref={fileRef} type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; onFile(f); }} />
        <div style={{ display: 'grid', gridTemplateColumns: phase === 'result' ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 8 }}>
          {phase === 'result' && <button type="button" data-jump-save style={{ ...btn, background: C.ac, color: '#000' }} onClick={save}>{L(he, 'Save', 'שמור')}</button>}
          {phase === 'saving' ? <button type="button" disabled style={{ ...btn, opacity: 0.6 }}>{L(he, 'Saving…', 'שומר…')}</button>
            : phase === 'reading' ? <button type="button" disabled style={{ ...btn, opacity: 0.6 }}>{L(he, 'Reading…', 'מנתח…')}</button>
              : <button type="button" data-jump-film style={btn} onClick={() => { setOpen(true); if (open || phase !== 'idle') fileRef.current && fileRef.current.click(); }}>
                {phase === 'result' || phase === 'fail' || phase === 'saved' ? L(he, 'Film again', 'צילום נוסף') : open ? L(he, 'Film a jump', 'צילום קפיצה') : L(he, 'New jump test', 'מבחן קפיצה חדש')}
              </button>}
        </div>
        </>}

        {list.length > 1 && (
          <div style={{ marginTop: 12, marginBottom: -8 }} data-jump-history>{/* the last 32px row carries ~8px under its words: pulled back so the body ends even with its top (#964) */}
            {list.slice(0, 8).map((t, i) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 32, borderTop: i ? `1px solid ${C.cardBd}` : 'none', fontFamily: FN, fontSize: 12 }}>
                <span style={{ color: C.tm }}><Ltr>{dm(t.tested_at)}</Ltr></span>
                <span style={{ color: Number(t.value) === best ? C.ac : C.tx, fontWeight: 700 }}>{cm(t.value)} {L(he, 'cm', 'ס״מ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
