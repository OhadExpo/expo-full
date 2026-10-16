// /coach/tasks/properties — the EXPO property engine inside Tasks (staff only: Ohad + Yuval).
// The PC engine (M:\ExpoNadlan) writes nadlan_cards / nadlan_thumbs / nadlan_meta after every cycle; both coaches vote
// here (nadlan_votes, one row per card per coach, live over realtime). "צריך שיחה" / "סיור" open a real task in
// coach_notes, assigned to whoever pressed it, so property work lives in the same Tasks list as everything else.
// Every tab has its own URL: /coach/tasks/properties/<new|shortlist|call|rejected|history|opportunities>.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { C, FN, FB } from './theme';
import { useUrlSync, segmentAfter } from './urlState';

const BASE = '/coach/tasks/properties';
const TABS = [
  { k: 'new', he: 'חדשים' }, { k: 'shortlist', he: 'רשימה קצרה' }, { k: 'call', he: 'צריך שיחה' },
  { k: 'rejected', he: 'נדחו' }, { k: 'history', he: 'כבר נראו' }, { k: 'opportunities', he: 'הזדמנויות' },
];
const AREAS = [
  { k: 0, he: 'כל האזורים' }, { k: 1, he: '1 · צפון ת״א' }, { k: 2, he: '2 · הרצליה פיתוח' },
  { k: 3, he: '3 · ר״ה + הירוקה' }, { k: 4, he: '4 · רעננה / שמריהו / רשפון' }, { k: 5, he: 'שכונה לבדיקה' },
];
const REJECT = ['קומה', 'מחיר', 'אזור', 'גודל', 'מצב הנכס', 'רעש / שכנים', 'תחושה', 'כבר ראינו', 'אחר'];
const VERDICT_HE = { shortlist: 'רשימה קצרה', call: 'צריך שיחה', rejected: 'לא מתאים', visited: 'סיור' };
const WHO_HE = { ohad: 'אוהד', yuval: 'יובל' };
const DEAL_HE = { business_for_sale: 'עסק למסירה', hourly: 'לפי שעה', sublet: 'סאבלט', rent: 'השכרה' };
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('he-IL'));
const newTaskId = () => 'note_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
const tabFromPath = (p) => { const s = segmentAfter(p, BASE); return TABS.some(t => t.k === s) ? s : 'new'; };

function chip(kind) {
  const map = { good: ['var(--c-gn, #2fbf71)', 'rgba(47,191,113,0.12)'], warn: ['var(--c-or, #f5a524)', 'rgba(245,165,36,0.12)'],
    bad: ['var(--c-rd, #ef4444)', 'rgba(239,68,68,0.12)'], info: [C.tx, C.acD] };
  const [fg, bg] = map[kind] || map.info;
  return { display: 'inline-block', fontFamily: FB, fontSize: 12, padding: '2px 8px', borderRadius: 999, color: fg, background: bg };
}
const btn = (active, tone) => ({
  fontFamily: FN, fontSize: 12, fontWeight: 700, padding: '7px 11px', borderRadius: 0, cursor: 'pointer',
  border: `1px solid ${active ? (tone || C.ac) : C.bd}`, background: active ? (tone || C.ac) : 'transparent',
  color: active ? 'var(--c-bg)' : C.tx,
});
const pill = (active) => ({
  fontFamily: FN, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 0, cursor: 'pointer',
  border: `1px solid ${active ? C.ac : C.bd}`, background: active ? C.ac : C.sf, color: active ? 'var(--c-bg)' : C.tx,
});

export default function PropertiesView() {
  const [me, setMe] = useState(null);
  const [cards, setCards] = useState([]);
  const [votes, setVotes] = useState({});           // card_id -> { ohad: row, yuval: row }
  const [opps, setOpps] = useState([]);
  const [run, setRun] = useState(null);
  const [thumbs, setThumbs] = useState({});
  const [area, setArea] = useState(0);
  const [openReject, setOpenReject] = useState(null);
  const [status, setStatus] = useState('טוען…');
  const [tab, setTab] = useState(() => (typeof window !== 'undefined' ? tabFromPath(window.location.pathname) : 'new'));
  useUrlSync(tab, (v) => setTab(v || 'new'), {
    toPath: (v) => (typeof window !== 'undefined' && window.location.pathname.startsWith(BASE) ? `${BASE}/${v}` : null),
    fromPath: (p) => (p.startsWith(BASE) ? tabFromPath(p) : null),
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = (data?.user?.email || '').toLowerCase();
      setMe(email.includes('yuval') ? 'yuval' : 'ohad');
    }).catch(() => setMe('ohad'));
  }, []);

  const load = useCallback(async () => {
    const [c, v, m] = await Promise.all([
      supabase.from('nadlan_cards').select('id,score,verdict,area,data,first_seen,updated_at').eq('active', true).order('score', { ascending: false }),
      supabase.from('nadlan_votes').select('*'),
      supabase.from('nadlan_meta').select('key,value,updated_at'),
    ]);
    if (c.error || v.error) { setStatus('הטעינה נכשלה: ' + ((c.error || v.error).message || '')); return; }
    setCards((c.data || []).map(r => ({ ...r.data, id: r.id, score: r.score, verdict: r.verdict, area: r.area, first_seen: r.first_seen })));
    const vv = {};
    for (const r of v.data || []) (vv[r.card_id] = vv[r.card_id] || {})[r.voter] = r;
    setVotes(vv);
    const meta = Object.fromEntries((m.data || []).map(r => [r.key, r.value]));
    setOpps(Array.isArray(meta.opps) ? meta.opps : []);
    setRun(meta.run || null);
    setStatus('');
  }, []);

  // live: the other coach's votes and each engine cycle show up without a reload
  const pending = useRef(null);
  useEffect(() => {
    load();
    const kick = () => { clearTimeout(pending.current); pending.current = setTimeout(load, 400); };
    const ch = supabase.channel('nadlan-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nadlan_votes' }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nadlan_cards' }, kick)
      .subscribe();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { try { supabase.removeChannel(ch); } catch { /* noop */ } window.removeEventListener('focus', onFocus); clearTimeout(pending.current); };
  }, [load]);

  const bucket = useCallback((c) => {
    const v = votes[c.id]?.[me];
    if (v?.verdict) return v.verdict === 'visited' ? 'shortlist' : v.verdict;
    if (c.verdict && c.verdict !== 'new') return 'history';
    return 'new';
  }, [votes, me]);

  const counts = useMemo(() => {
    const n = { opportunities: opps.length };
    for (const c of cards) { const b = bucket(c); n[b] = (n[b] || 0) + 1; }
    return n;
  }, [cards, opps, bucket]);

  const shown = useMemo(() => cards.filter(c => bucket(c) === tab && (!area || c.area === area)), [cards, bucket, tab, area]);

  // thumbnails for the cards on screen only
  useEffect(() => {
    const need = shown.map(c => c.id).filter(id => !(id in thumbs)).slice(0, 60);
    if (!need.length) return;
    supabase.from('nadlan_thumbs').select('card_id,jpeg_b64').in('card_id', need).then(({ data }) => {
      const add = Object.fromEntries(need.map(id => [id, null]));
      for (const r of data || []) add[r.card_id] = r.jpeg_b64;
      setThumbs(t => ({ ...t, ...add }));
    });
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  const vote = async (c, verdict, reason, score) => {
    if (!me) return;
    const prev = votes[c.id]?.[me] || null;
    let taskId = prev?.task_id || null;
    if ((verdict === 'call' || verdict === 'visited') && !taskId) {
      const where = [c.street, c.house_no, c.neighborhood, c.city].filter(Boolean).join(' ');
      const row = {
        id: newTaskId(), body: `${verdict === 'call' ? 'להתקשר' : 'סיור'}: ${c.ptype || 'נכס'} ${where} · ${fmt(c.size_m2)} מ"ר · ${c.price ? '₪' + fmt(c.price) : 'מחיר לבירור'}\n${(c.links?.[0]?.url) || ''}`,
        target_kind: 'property', target_id: c.id, target_label: where || c.title || 'נכס', pinned: false, status: 'open',
        auto_kind: 'nadlan', auto_ref: c.id, tags: ['נכס'], assigned_to: me, priority: c.score >= 85 ? 'high' : 'normal',
        context: { questions: (c.questions || []).slice(0, 6), score: c.score }, created_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('coach_notes').insert(row);
      if (!error) taskId = row.id;
    }
    const next = { card_id: c.id, voter: me, verdict: verdict || null, reason: reason ?? (verdict === prev?.verdict ? prev?.reason : null) ?? null,
      score: score ?? prev?.score ?? null, task_id: taskId, updated_at: new Date().toISOString() };
    setVotes(vs => ({ ...vs, [c.id]: { ...(vs[c.id] || {}), [me]: next } }));
    setOpenReject(null);
    const { error } = await supabase.from('nadlan_votes').upsert(next);
    setStatus(error ? 'ההצבעה לא נשמרה: ' + error.message : 'נשמר');
    if (error) setVotes(vs => ({ ...vs, [c.id]: { ...(vs[c.id] || {}), [me]: prev } }));
  };

  const Card = ({ c }) => {
    const mine = votes[c.id]?.[me] || {};
    const others = Object.values(votes[c.id] || {}).filter(v => v.voter !== me && v.verdict);
    const bad = (c.flags || []).some(f => /מעל התקרה|פינוי|שבת|מעטפת/.test(f));
    const t = thumbs[c.id];
    return (
      <article style={{ display: 'grid', gridTemplateColumns: 'minmax(0,148px) 1fr', border: `1px solid ${bad ? 'var(--c-rd, #ef4444)' : C.cardBd}`, borderRadius: 0, overflow: 'hidden', background: C.sf }} className="nadlan-card">
        <div style={{ position: 'relative', background: C.sf2, minHeight: 148 }}>
          {t ? <img alt="" src={`data:image/jpeg;base64,${t}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
             : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: C.tm, fontSize: 12, fontFamily: FB }}>{c.n_photos ? 'תמונות במודעה' : 'אין תמונות'}</div>}
          <div style={{ position: 'absolute', top: 8, insetInlineStart: 8, fontFamily: FN, fontWeight: 800, fontSize: 20, padding: '4px 8px', borderRadius: 0, background: C.sf, border: `2px solid ${c.score >= 80 ? 'var(--c-gn, #2fbf71)' : c.score >= 60 ? 'var(--c-or, #f5a524)' : C.bd}` }}>{Math.round(c.score)}</div>
        </div>
        <div style={{ padding: '12px 14px', display: 'grid', gap: 8, minWidth: 0, direction: 'rtl', textAlign: 'right' }}>
          <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 15, color: C.tx }}>{[c.ptype, [c.street, c.house_no].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || c.title}</div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm }}>{[c.neighborhood, c.city].filter(Boolean).join(', ')}{c.first_seen ? ` · נמצא ${c.first_seen}` : ''}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontFamily: FN, fontSize: 14, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>
            <span>{fmt(c.size_m2)} מ״ר</span><span>{c.floor == null ? 'קומה ?' : c.floor === 0 ? 'קרקע' : `קומה ${c.floor}`}</span>
            <span>{c.price ? `₪${fmt(c.price)} לחודש` : 'מחיר לבירור'}</span>{c.price && c.size_m2 ? <span>{fmt(c.price / c.size_m2)} ₪/מ״ר</span> : null}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {(c.reasons || []).filter(r => !/^אזור|מ"ר$|₪/.test(r)).slice(0, 6).map(r => <span key={r} style={chip('good')}>{r}</span>)}
            {(c.flags || []).map(f => <span key={f} style={chip(/מעל|פינוי|שבת|מעטפת/.test(f) ? 'bad' : 'warn')}>{f}</span>)}
            {c.n_ads > 1 && <span style={chip('info')}>{c.n_ads} מודעות לאותו נכס</span>}
            {c.broker && <span style={chip('warn')}>תיווך</span>}
            {c.seen_before && <span style={chip('warn')}>כבר נראה: {c.seen_note || 'בגיליון'}</span>}
            {others.map(o => <span key={o.voter} style={chip(o.verdict === 'rejected' ? 'bad' : 'good')}>{WHO_HE[o.voter]}: {VERDICT_HE[o.verdict]}{o.reason ? ` · ${o.reason}` : ''}{o.score ? ` · ${o.score}/10` : ''}</span>)}
          </div>
          <details style={{ fontFamily: FB, fontSize: 13, color: C.tx }}>
            <summary style={{ cursor: 'pointer', color: C.acText }}>שאלות לשיחה ({(c.questions || []).length})</summary>
            <ol style={{ margin: '6px 0 0', paddingInlineStart: 20 }}>{(c.questions || []).map(q => <li key={q}>{q}</li>)}</ol>
          </details>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontFamily: FB, fontSize: 13 }}>
            {(c.links || []).map(l => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: C.acText }}>פתח ב{l.src}</a>)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', borderTop: `1px dashed ${C.bd}`, paddingTop: 8 }}>
            <button type="button" style={btn(mine.verdict === 'shortlist', 'var(--c-gn, #2fbf71)')} onClick={() => vote(c, mine.verdict === 'shortlist' ? null : 'shortlist')}>לרשימה הקצרה</button>
            <button type="button" style={btn(mine.verdict === 'call', 'var(--c-or, #f5a524)')} onClick={() => vote(c, mine.verdict === 'call' ? null : 'call')}>צריך שיחה</button>
            <button type="button" style={btn(mine.verdict === 'visited', C.ac)} onClick={() => vote(c, mine.verdict === 'visited' ? null : 'visited')}>סיור</button>
            <button type="button" style={btn(mine.verdict === 'rejected', 'var(--c-rd, #ef4444)')} onClick={() => (mine.verdict === 'rejected' ? vote(c, null) : setOpenReject(openReject === c.id ? null : c.id))}>לא מתאים</button>
            <select aria-label="ציון 1-10" value={mine.score || ''} onChange={e => vote(c, mine.verdict || null, undefined, e.target.value ? +e.target.value : null)}
              style={{ fontFamily: FN, fontSize: 12, padding: 6, borderRadius: 0, border: `1px solid ${C.bd}`, background: 'transparent', color: C.tx }}>
              <option value="">ציון</option>{[...Array(10)].map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
            {mine.task_id && <span style={chip('info')}>נפתחה משימה</span>}
          </div>
          {openReject === c.id && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {REJECT.map(r => <button key={r} type="button" style={pill(mine.reason === r)} onClick={() => vote(c, 'rejected', r)}>{r}</button>)}
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 12, direction: 'rtl' }} className="nadlan-view">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {TABS.map(t => <button key={t.k} type="button" aria-pressed={tab === t.k} style={pill(tab === t.k)} onClick={() => setTab(t.k)}>{t.he} <span style={{ opacity: 0.7, fontSize: 11, marginInlineStart: 6 }}>{counts[t.k] || 0}</span></button>)}
      </div>
      {tab !== 'opportunities' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {AREAS.map(a => <button key={a.k} type="button" aria-pressed={area === a.k} style={pill(area === a.k)} onClick={() => setArea(a.k)}>{a.he}</button>)}
        </div>
      )}
      <div style={{ fontFamily: FB, fontSize: 12, color: C.tm }}>
        {status || `${cards.length} נכסים פעילים`}{run?.at ? ` · סריקה אחרונה ${run.at}` : ''}{run?.sources ? ` · ${run.sources}` : ''}
      </div>
      {tab === 'opportunities' ? (
        opps.length ? opps.map(o => (
          <article key={o.id} style={{ border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '12px 14px', background: C.sf, display: 'grid', gap: 6, textAlign: 'right' }}>
            <div style={{ fontFamily: FN, fontWeight: 700, color: C.tx }}>{o.title}</div>
            <div style={{ fontFamily: FB, fontSize: 12, color: C.tm }}>{[o.src, o.city, o.date].filter(Boolean).join(' · ')}</div>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.tx }}>{[o.deal && DEAL_HE[o.deal], o.size_m2 && `${Math.round(o.size_m2)} מ״ר`, o.price && `₪${fmt(o.price)} לחודש`, o.asking && `מבקשים ₪${fmt(o.asking)}`].filter(Boolean).join(' · ')}</div>
            {o.summary && <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>{o.summary}</div>}
            {o.url && <a href={o.url} target="_blank" rel="noopener noreferrer" style={{ color: C.acText, fontFamily: FB, fontSize: 13 }}>לפרטים</a>}
          </article>
        )) : <div style={{ color: C.tm, fontFamily: FB, padding: 24, textAlign: 'center' }}>אין כרגע עסקים למסירה, חללים לפי שעה או כתבות רלוונטיות.</div>
      ) : shown.length ? shown.map(c => <Card key={c.id} c={c} />)
        : <div style={{ color: C.tm, fontFamily: FB, padding: 24, textAlign: 'center' }}>{cards.length ? 'אין נכסים בלשונית הזו כרגע.' : 'המנוע עוד לא העלה נכסים לכאן.'}</div>}
      <style>{`@media (max-width: 560px) { .nadlan-card { grid-template-columns: 1fr !important } .nadlan-card > div:first-child { min-height: 0 !important; aspect-ratio: 16 / 9 } }`}</style>
    </div>
  );
}
