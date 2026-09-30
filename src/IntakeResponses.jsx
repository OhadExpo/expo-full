// INTAKE RESPONSES — the Google Forms "Responses" tab, for EXPO's own forms.
//
// Ohad, 27.9: "make sure all the הערכה מקדימה pages get results like the
// google questionnaire" / "where i can see everyone's answers and individual
// answers in multiple different views". Three views over the submissions of
// ONE form (a form's questions are its schema in intakeFormSchemas.js):
//   SUMMARY    every question, aggregated over everyone who answered it -
//              choices as bars, scales as a distribution + average, numbers
//              as min / median / average / max, text as the list of answers;
//   QUESTION   one question at a time, every respondent's answer beside his name;
//   INDIVIDUAL one respondent at a time, all his answers, ‹ › to step through.
// Read-only: nothing here writes. Empty answers are counted as "no answer",
// never dropped silently and never invented.
import React, { useMemo, useState } from 'react';
import { C, FN, FB, FH } from './theme';
import { FORM_BY_KEY } from './intakeFormSchemas';
import { useT } from './i18n';

const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const asNum = (v) => { const n = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };
const fmtDate = (iso) => { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; } catch { return ''; } };
const round1 = (n) => Math.round(n * 10) / 10;

function Bar({ label, n, total, dirRtl }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px', gap: 10, alignItems: 'center' }}>
      <div style={{ position: 'relative', minHeight: 'var(--btn-h)', boxSizing: 'border-box', display: 'flex', alignItems: 'center', border: `1px solid ${C.cardBd}` }}>
        <span style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: `${pct}%`, background: 'color-mix(in srgb, var(--c-ac) 22%, transparent)' }} />
        <span style={{ position: 'relative', padding: '3px 8px', fontFamily: dirRtl ? FH : FB, fontSize: 13, color: C.tx }}>{label}</span>
      </div>
      <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tm, textAlign: 'end', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{n} · {pct}%</span>
    </div>
  );
}

function QuestionSummary({ q, subs, rtl, tt }) {
  const answered = subs.filter((s) => !isEmpty(s.payload?.[q.id]));
  const none = subs.length - answered.length;
  const head = (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
      {/* his own form's question, word for word - it wraps, it is not reworded */}
      <div data-allow-wrap="" style={{ fontFamily: rtl ? FH : FB, fontSize: 14, fontWeight: 700, color: C.tx }}>{q.label}</div>
      <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: C.tm, whiteSpace: 'nowrap', flexShrink: 0 }}>{answered.length} {tt('answers')}{none ? ` · ${none} ${tt('no answer')}` : ''}</span>
    </div>
  );
  let body = null;
  if (q.type === 'choice' || Array.isArray(q.choices)) {
    const counts = new Map((q.choices || []).map((c) => [c, 0]));
    for (const s of answered) { const v = s.payload[q.id]; for (const x of (Array.isArray(v) ? v : [v])) counts.set(String(x), (counts.get(String(x)) || 0) + 1); }
    body = <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{[...counts.entries()].map(([c, n]) => <Bar key={c} label={c} n={n} total={answered.length} dirRtl={rtl} />)}</div>;
  } else if (q.type === 'scale' && q.scale) {
    const vals = answered.map((s) => asNum(s.payload[q.id])).filter((n) => n != null);
    const avg = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    const steps = []; for (let k = q.scale.min; k <= q.scale.max; k++) steps.push(k);
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map((k) => <Bar key={k} label={`${k}${k === q.scale.min && q.scale.minLabel ? ` — ${q.scale.minLabel}` : ''}${k === q.scale.max && q.scale.maxLabel ? ` — ${q.scale.maxLabel}` : ''}`} n={vals.filter((v) => v === k).length} total={vals.length} dirRtl={rtl} />)}
        {avg != null && <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tm, marginTop: 4 }}>{tt('average')} {avg} / {q.scale.max}</div>}
      </div>
    );
  } else if (q.type === 'number') {
    const vals = answered.map((s) => asNum(s.payload[q.id])).filter((n) => n != null).sort((a, b) => a - b);
    const stat = (l, v) => (
      <div style={{ border: `1px solid ${C.cardBd}`, padding: '7.5px 10px 8.5px' /* half a pixel each way: the letters sit 1px low at 8/8 (ink gate) and the line box 2px high at 7/9 (rhythm gate) - both within tolerance here (AUDIT-470) */, minWidth: 0 }}>
        <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{l}</div>
        <div style={{ fontFamily: FN, fontSize: 18, fontWeight: 800, color: C.tx, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{v == null ? '—' : v}</div>
      </div>
    );
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {stat(tt('min'), vals.length ? vals[0] : null)}
        {stat(tt('median'), vals.length ? vals[Math.floor(vals.length / 2)] : null)}
        {stat(tt('average'), vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null)}
        {stat(tt('max'), vals.length ? vals[vals.length - 1] : null)}
      </div>
    );
  } else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 260, overflowY: 'auto', border: `1px solid ${C.cardBd}` }}>
        {answered.map((s, i) => (
          <div key={s.id} style={{ padding: '7.5px 10px 8.5px' /* between the ink and line-box gates (AUDIT-470) */, borderTop: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span style={{ fontFamily: rtl ? FH : FB, fontSize: 13, color: C.tx, flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{String(s.payload[q.id])}</span>
            <span style={{ fontFamily: FN, fontSize: 10, color: C.td, flexShrink: 0 }}>{s.who}</span>
          </div>
        ))}
        {!answered.length && <div style={{ padding: '8px 10px', fontFamily: FB, fontSize: 13, color: C.td }}>{tt('No answers yet.')}</div>}
      </div>
    );
  }
  return <div style={{ padding: '14px 0', borderTop: `1px solid ${C.cardBd}` }}>{head}{body}</div>;
}

export default function IntakeResponses({ submissions = [], traineeNameFor }) {
  const tt = useT();
  const forms = useMemo(() => Object.entries(FORM_BY_KEY).map(([key, form]) => {
    const [type, locale] = key.split(':');
    const subs = (submissions || []).filter((s) => s.form_type === type && s.locale === locale)
      .map((s) => ({ ...s, who: (traineeNameFor && traineeNameFor(s)) || s.name || s.email || '—' }))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { key, form, subs };
  }), [submissions, traineeNameFor]);
  const withAny = forms.filter((f) => f.subs.length);
  const [formKey, setFormKey] = useState(() => (withAny[0] || forms[0] || {}).key);
  const cur = forms.find((f) => f.key === formKey) || withAny[0] || forms[0];
  const [view, setView] = useState('summary');
  const [qIdx, setQIdx] = useState(0);
  const [pIdx, setPIdx] = useState(0);
  if (!cur) return null;
  const { form, subs } = cur;
  const rtl = form.locale === 'he';
  const q = form.questions[Math.min(qIdx, form.questions.length - 1)];
  const person = subs[Math.min(pIdx, Math.max(0, subs.length - 1))];
  const seg = (on) => ({ height: 'var(--btn-h)', padding: '0 14px', boxSizing: 'border-box', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0, color: on ? 'var(--c-bg)' : C.tm, background: on ? C.ac : 'transparent', border: `1px solid ${on ? C.ac : C.cardBd}`, whiteSpace: 'nowrap' });
  const pager = (i, n, set) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button type="button" disabled={i <= 0} onClick={() => set(i - 1)} style={{ ...seg(false), padding: 0, width: 36, opacity: i <= 0 ? 0.4 : 1 }} aria-label={tt('Previous')}>‹</button>
      <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tx, fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'center' }}>{n ? i + 1 : 0} / {n}</span>
      <button type="button" disabled={i >= n - 1} onClick={() => set(i + 1)} style={{ ...seg(false), padding: 0, width: 36, opacity: i >= n - 1 ? 0.4 : 1 }} aria-label={tt('Next')}>›</button>
    </span>
  );

  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, marginBottom: 18 }}>
      <div className="title-strip" style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: `1px solid ${C.cardBd}`, padding: '0 18px', minHeight: 41, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-stripTx)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{tt('Responses')}</span>
        <span className="strip-meta" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-stripTx)', whiteSpace: 'nowrap' }}>{subs.length} {tt('responses')}</span>
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* which form */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {forms.map((f) => (
            <button key={f.key} type="button" onClick={() => { setFormKey(f.key); setQIdx(0); setPIdx(0); }} style={{ ...seg(f.key === cur.key), fontFamily: f.form.locale === 'he' ? FH : FN, letterSpacing: f.form.locale === 'he' ? 0 : '0.1em', opacity: f.subs.length ? 1 : 0.55 }}>
              {f.form.title.replace(/^EXPO\s*[—-]\s*/, '')} · {f.subs.length}
            </button>
          ))}
        </div>
        {/* which view */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {[['summary', tt('Summary')], ['question', tt('Question')], ['individual', tt('Individual')]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setView(k)} style={seg(view === k)}>{l}</button>
          ))}
        </div>

        {!subs.length && <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '8px 0' }}>{tt('No responses to this form yet.')}</div>}

        {!!subs.length && view === 'summary' && (
          <div style={{ direction: rtl ? 'rtl' : 'ltr' }}>
            {form.questions.map((qq) => <QuestionSummary key={qq.id} q={qq} subs={subs} rtl={rtl} tt={tt} />)}
          </div>
        )}

        {!!subs.length && view === 'question' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {pager(Math.min(qIdx, form.questions.length - 1), form.questions.length, setQIdx)}
              <select value={q.id} onChange={(e) => setQIdx(form.questions.findIndex((x) => x.id === e.target.value))}
                style={{ flex: '1 1 220px', minWidth: 0, height: 'var(--btn-h)', background: 'var(--c-sf)', color: C.tx, border: `1px solid ${C.cardBd}`, borderRadius: 0, fontFamily: rtl ? FH : FB, fontSize: 13, direction: rtl ? 'rtl' : 'ltr' }}>
                {form.questions.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </div>
            <div style={{ direction: rtl ? 'rtl' : 'ltr', border: `1px solid ${C.cardBd}` }}>
              <div data-allow-wrap="" style={{ padding: '10px 12px', fontFamily: rtl ? FH : FB, fontSize: 15, fontWeight: 700, color: C.tx, borderBottom: `1px solid ${C.cardBd}` }}>{q.label}</div>
              {subs.map((s, i) => {
                const v = s.payload?.[q.id];
                return (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 150px) minmax(0, 1fr)', gap: 12, padding: '8px 12px', borderTop: i ? `1px solid ${C.cardBd}` : 'none', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tm, overflowWrap: 'break-word' }}>{s.who}<span style={{ display: 'block', fontWeight: 400, color: C.td, fontSize: 10 }}>{fmtDate(s.created_at)}</span></span>
                    <span style={{ fontFamily: rtl ? FH : FB, fontSize: 13, color: isEmpty(v) ? C.td : C.tx, fontStyle: isEmpty(v) ? 'italic' : 'normal', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{isEmpty(v) ? tt('no answer') : Array.isArray(v) ? v.join(' · ') : (q.type === 'scale' && q.scale ? `${v} / ${q.scale.max}` : String(v))}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!!subs.length && view === 'individual' && person && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {pager(Math.min(pIdx, subs.length - 1), subs.length, setPIdx)}
              <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.tx }}>{person.who}</span>
              <span style={{ fontFamily: FN, fontSize: 11, color: C.td }}>{fmtDate(person.created_at)}</span>
            </div>
            <div style={{ direction: rtl ? 'rtl' : 'ltr', border: `1px solid ${C.cardBd}` }}>
              {form.questions.map((qq, i) => {
                const v = person.payload?.[qq.id];
                return (
                  <div key={qq.id} style={{ padding: '10px 12px', borderTop: i ? `1px solid ${C.cardBd}` : 'none' }}>
                    <div style={{ fontFamily: rtl ? FH : FN, fontSize: rtl ? 12 : 10, fontWeight: 700, letterSpacing: rtl ? 0 : '0.06em', textTransform: rtl ? 'none' : 'uppercase', color: C.tm, marginBottom: 4 }}>{qq.label}</div>
                    <div style={{ fontFamily: rtl ? FH : FB, fontSize: 14, color: isEmpty(v) ? C.td : C.tx, fontStyle: isEmpty(v) ? 'italic' : 'normal', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{isEmpty(v) ? tt('no answer') : Array.isArray(v) ? v.join(' · ') : (qq.type === 'scale' && qq.scale ? `${v} / ${qq.scale.max}` : String(v))}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
