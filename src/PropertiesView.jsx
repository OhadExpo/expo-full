// /coach/tasks/properties — the EXPO property engine inside Tasks (staff only: Ohad + Yuval).
// The PC engine (M:\ExpoNadlan) writes nadlan_cards / nadlan_thumbs / nadlan_meta after every cycle; both coaches decide
// here (nadlan_votes, one row per card per coach, live over realtime).
// THE FORMULA (Ohad 17.10: "too many categories ... find a slightly simple formula"): one decision per card -
//   מעניין -> the card moves to בטיפול and a call task opens for whoever pressed it; one row then walks it
//             שיחה -> סיור -> מועמד (סיור opens the visit task);
//   לא     -> archived at once; one tap tags why.
// ציון is a 1-5 row. Five tabs: חדשים (every hard rule confirmed by the card gate) · לבירור (a fact missing - the card's
// own questions settle it) · בטיפול · ארכיון · הזדמנויות. Every card carries its OWN analysis and questions, written by the
// engine from that ad. Every tab has its own URL: /coach/tasks/properties/<new|check|active|archive|opportunities>.
// Layout: one grid for every card - photo column | body; the body is title, place, a 4-cell fact table, the engine's
// read, tags, questions, links, and the decision rows, each row with its label in a fixed column so all cards line up.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { C, FH } from './theme';
import { ChipGrid } from './ui';
import { useUrlSync, segmentAfter } from './urlState';

const BASE = '/coach/tasks/properties';
const TABS = [
  { k: 'new', he: 'חדשים' }, { k: 'check', he: 'לבירור' }, { k: 'active', he: 'בטיפול' },
  { k: 'archive', he: 'ארכיון' }, { k: 'opportunities', he: 'הזדמנויות' },
];
const TAB_HINT = {
  new: 'עברו את כל הבדיקות: אזור, גודל, קומה, מחיר ועסקת שכירות - כל אחד מאומת מתוך המודעה.',
  check: 'לא שוברים אף כלל, אבל חסר נתון קריטי. השאלות בכל כרטיס סוגרות את זה בשיחה אחת.',
  active: 'נכסים שסימנתם "מעניין", לפי שלב: מועמד, סיור, שיחה.',
  archive: 'נכסים שסימנתם "לא", ונכסים שנדחו כבר לפני המנוע.',
  opportunities: 'עסקים למסירה, חללים לפי שעה, אותות מוקדמים וכתבות - לא נכסים להשכרה ישירה.',
};
const STAGES = [{ k: 'call', label: 'שיחה' }, { k: 'visited', label: 'סיור' }, { k: 'shortlist', label: 'מועמד' }];
const ACTIVE = new Set(['call', 'visited', 'shortlist']);
const STAGE_ORDER = { shortlist: 0, visited: 1, call: 2 };
const AREAS = [
  { k: 0, he: 'כל האזורים' }, { k: 1, he: '1 · צפון ת״א' }, { k: 2, he: '2 · הרצליה פיתוח' },
  { k: 3, he: '3 · ר״ה + הירוקה' }, { k: 4, he: '4 · רעננה והסביבה' }, { k: 5, he: 'שכונה לבדיקה' },
];
const REJECT = ['קומה', 'מחיר', 'אזור', 'גודל', 'מצב הנכס', 'רעש / שכנים', 'תחושה', 'כבר ראינו', 'אחר'];
const VERDICT_HE = { shortlist: 'מועמד', call: 'מעניין · שיחה', rejected: 'לא', visited: 'מעניין · סיור' };
const WHO_HE = { ohad: 'אוהד', yuval: 'יובל' };
const WHO_WIRE = { ohad: 'Ohad', yuval: 'Yuval' };
const DEAL_HE = { business_for_sale: 'עסק למסירה', hourly: 'לפי שעה', sublet: 'סאבלט', rent: 'השכרה', signal: 'אות מוקדם' };
const STAFF = { 'ohadyproductions@gmail.com': 'ohad', 'yuvalberkovitch@gmail.com': 'yuval' };
const STALE_H = 4;
// ONE type system that never changes with the app language (Ohad #860: the page jumped in size on he <-> en): the page
// is Hebrew-only, so every text uses the Hebrew face FH, fixed sizes and line heights; letter-spacing is pinned by the
// view's own <style> rule so both app languages space it the same.
const T = (size, weight = 400, extra = null) => ({ fontFamily: FH, fontSize: size, fontWeight: weight, letterSpacing: 0, lineHeight: 1.4, ...extra });
const GREEN = 'var(--c-gn, #2fbf71)', RED = 'var(--c-rd, #ef4444)', ORANGE = 'var(--c-or, #f5a524)';
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('he-IL'));
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : undefined);   // never a javascript: href from scraped data
const tabFromPath = (p) => { const s = segmentAfter(p, BASE); return TABS.some(t => t.k === s) ? s : 'new'; };
const uniq = (a) => [...new Set((a || []).filter(Boolean))];
const gateOf = (c) => (c.gate && c.gate.verdict) || 'unverified';
const SRC_HE = { yad2: 'יד2', madlan: 'מדלן', homeless: 'הומלס', onmap: 'OnMap', fb: 'פייסבוק', anglosaxon: 'אנגלו סכסון', menivim: 'מניבים',
  monopoli: 'מונופולי', yad2biz: 'יד2 עסקים', spacenter: 'Spacenter', bodyways: 'Bodyways', fitness360: 'Fitness360', news: 'חדשות', web: 'אתר', landlord: 'בעל הנכס' };
const srcHe = (s) => SRC_HE[s] || (String(s || '').startsWith('signal') ? 'אות מוקדם' : s);
// a history note written by the old scraper sheet ("auto-found by scraper ...") is noise, not a founder's note
const seenNote = (n) => (n && !/scraper|auto-found|^auto/i.test(n) ? n : '');
const floorHe = (f) => (f == null ? '?' : f === 0 ? 'קרקע' : f < 0 ? `מרתף ${f}` : String(f));

const chip = (kind) => ({   // a tag is coloured words, never a filled pill
  display: 'inline-block', ...T(12, 600), color: { good: GREEN, warn: ORANGE, bad: RED, info: C.tm }[kind] || C.tm,
});

// one labelled control row: the label sits in a fixed column so every row on every card lines up
function Row({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0,1fr)', alignItems: 'center', gap: 10 }}>
      <span style={{ ...T(12, 700), color: C.tm }}>{label}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

// the four facts that decide a space, as one table row: label above, value below, equal cells
function Facts({ c }) {
  const cells = [
    { l: 'גודל', v: c.size_m2 ? `${fmt(c.size_m2)} מ״ר` : '?' },
    { l: 'קומה', v: floorHe(c.floor) },
    { l: 'שכירות', v: c.price ? `₪${fmt(c.price)}` : '?' },
    { l: '₪ למ״ר', v: c.price && c.size_m2 ? fmt(c.price / c.size_m2) : '—' },
  ];
  return (
    <div className="nadlan-facts" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', border: `1px solid ${C.cardBd}` }}>
      {cells.map((x, i) => (
        <div key={x.l} style={{ padding: '7px 10px', borderInlineStart: i ? `1px solid ${C.cardBd}` : 'none', display: 'grid', gap: 2, minWidth: 0 }}>
          <span style={{ ...T(11, 600), color: C.tm }}>{x.l}</span>
          <span style={{ ...T(15, 700), color: x.v === '?' ? ORANGE : C.tx, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.v}</span>
        </div>
      ))}
    </div>
  );
}

// One card. Module-level (never defined inside the view's render), so an open <details> survives the other coach's
// vote arriving over realtime.
const PropertyCard = React.memo(function PropertyCard({ c, mine, others, thumb, me, busy, onVote }) {
  const g = c.gate || {};
  const pass = gateOf(c) === 'pass';
  const bad = (c.flags || []).some(f => /מעל התקרה|פינוי|שבת|מעטפת/.test(f));
  const links = (c.links || []).map(l => ({ ...l, url: safeUrl(l.url) })).filter(l => l.url);
  const qs = uniq(g.questions_he && g.questions_he.length ? g.questions_he : c.questions).slice(0, 6);   // this ad's own questions
  const can = !!me && !busy;
  const interested = ACTIVE.has(mine.verdict);
  const rejected = mine.verdict === 'rejected';
  const dis = (it) => ({ ...it, disabled: !can });
  const title = [c.ptype, c.street ? [c.street, c.house_no].filter(Boolean).join(' ') : null].filter(Boolean).join(' · ') || c.title || 'נכס';
  const place = [c.neighborhood, c.city].filter(Boolean).join(', ');
  return (
    <article className="nadlan-card" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,176px) minmax(0,1fr)', border: `1px solid ${bad ? RED : C.cardBd}`, borderRadius: 0, overflow: 'hidden', background: C.sf }}>
      <div className="nadlan-photo" style={{ position: 'relative', background: C.sf2, minHeight: 176 }}>
        {thumb ? <img alt="" src={`data:image/jpeg;base64,${thumb}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: C.tm, ...T(12) }}>{c.n_photos ? 'תמונות במודעה' : 'אין תמונות'}</div>}
        <div title="ציון התאמה של המנוע (0-100)" style={{ position: 'absolute', top: 8, insetInlineStart: 8, ...T(20, 800, { lineHeight: 1, fontVariantNumeric: 'tabular-nums' }), minWidth: 44, textAlign: 'center', padding: '6px 6px', background: C.sf, color: C.tx, border: `2px solid ${c.score >= 80 ? GREEN : c.score >= 60 ? ORANGE : C.bd}` }}>{Math.round(c.score)}</div>
      </div>
      <div style={{ padding: '12px 14px', display: 'grid', gap: 10, alignContent: 'start', minWidth: 0, direction: 'rtl', textAlign: 'right' }}>
        <header style={{ display: 'grid', gap: 2 }}>
          <h3 style={{ margin: 0, ...T(16, 700), color: C.tx }}>{title}</h3>
          <div style={{ ...T(12), color: C.tm }}>{place}{c.first_seen ? `${place ? ' · ' : ''}נמצא ${c.first_seen}` : ''}{c.broker ? ' · תיווך' : ''}</div>
        </header>
        <Facts c={c} />
        {(g.why_he || g.analysis_he) && (
          <section style={{ display: 'grid', gap: 4, borderInlineStart: `3px solid ${pass ? GREEN : ORANGE}`, paddingInlineStart: 10 }}>
            <div style={{ ...T(12, 700), color: pass ? GREEN : ORANGE }}>{pass ? 'עומד בכל הכללים' : 'חסר נתון לפני החלטה'}</div>
            {g.why_he && <div style={{ ...T(13, 600), color: C.tx }}>{g.why_he}</div>}
            {g.analysis_he && <div style={{ ...T(13), color: C.tx }}>{g.analysis_he}</div>}
          </section>
        )}
        {(c.inactive || (c.flags || []).length > 0 || c.n_ads > 1 || c.seen_before || c.scan_note || others.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
            {c.inactive && <span style={chip('warn')}>המודעה ירדה או כבר לא עומדת בכללים</span>}
            {uniq(c.flags).map(f => <span key={'f' + f} style={chip(/מעל|פינוי|שבת|מעטפת/.test(f) ? 'bad' : 'warn')}>{f}</span>)}
            {c.n_ads > 1 && <span style={chip('info')}>{c.n_ads} מודעות לאותו נכס</span>}
            {c.seen_before && <span style={chip('warn')}>נראה בעבר{seenNote(c.seen_note) ? `: ${seenNote(c.seen_note)}` : ''}</span>}
            {c.scan_note && !c.seen_before && <span style={chip('info')}>{c.scan_note}</span>}
            {others.map(o => <span key={'o' + o.voter} style={chip(o.verdict === 'rejected' ? 'bad' : 'good')}>{WHO_HE[o.voter]}: {VERDICT_HE[o.verdict]}{o.reason ? ` · ${o.reason}` : ''}{o.score ? ` · ${o.score}/5` : ''}</span>)}
          </div>
        )}
        {qs.length > 0 && (
          <details style={{ ...T(13), color: C.tx }}>
            <summary style={{ cursor: 'pointer', color: C.acText, minHeight: 28, display: 'list-item' }}>שאלות לשיחה על הנכס הזה ({qs.length})</summary>
            <ol style={{ margin: '6px 0 0', paddingInlineStart: 20, display: 'grid', gap: 4 }}>{qs.map(q => <li key={q}>{q}</li>)}</ol>
          </details>
        )}
        {links.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, ...T(13, 600) }}>
            {links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: C.acText, minHeight: 28, display: 'inline-flex', alignItems: 'center' }}>פתח ב{srcHe(l.src)}</a>)}
          </div>
        )}
        <div style={{ display: 'grid', gap: 8, borderTop: `1px solid ${C.cardBd}`, paddingTop: 10 }}>
          <Row label="החלטה">
            <ChipGrid ariaLabel="החלטה" soft cols={2} phoneCols={2}
              items={[dis({ k: 'yes', label: 'מעניין', color: GREEN, active: interested }), dis({ k: 'no', label: 'לא', color: RED, active: rejected })]}
              onChange={(k) => (k === 'yes' ? onVote(c, interested ? null : 'call') : onVote(c, rejected ? null : 'rejected'))} />
          </Row>
          {interested && (
            <Row label="שלב">
              <ChipGrid ariaLabel="שלב" soft cols={3} phoneCols={3} value={mine.verdict}
                items={STAGES.map(dis)} onChange={(k) => { if (k !== mine.verdict) onVote(c, k); }} />
            </Row>
          )}
          {rejected && (
            <Row label="למה">
              <ChipGrid ariaLabel="סיבה" soft cols={3} phoneCols={3} value={mine.reason}
                items={REJECT.map(r => dis({ k: r, label: r }))} onChange={(r) => onVote(c, 'rejected', mine.reason === r ? null : r)} />
            </Row>
          )}
          <Row label="ציון">
            <ChipGrid ariaLabel="ציון 1 עד 5" soft cols={5} phoneCols={5} value={mine.score || 0}
              cellStyle={{ fontFamily: FH, fontSize: 15, letterSpacing: 0 }}
              items={[1, 2, 3, 4, 5].map(n => dis({ k: n, label: String(n) }))}
              onChange={(n) => onVote(c, mine.verdict || null, undefined, mine.score === n ? 0 : n)} />
          </Row>
          {mine.task_id && <div style={chip('info')}>נפתחה משימה ברשימת המשימות שלך</div>}
        </div>
      </div>
    </article>
  );
});

function OppCard({ o }) {
  const url = safeUrl(o.url);
  return (
    <article style={{ border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '12px 14px', background: C.sf, display: 'grid', gap: 6, textAlign: 'right' }}>
      <h3 style={{ margin: 0, ...T(15, 700), color: C.tx }}>{o.title}</h3>
      {o.kind === 'signal' && <div style={{ ...T(12, 700), color: o.level === 'high' ? RED : o.level === 'med' ? ORANGE : C.tm }}>אות מוקדם{o.level === 'high' ? ' · חזק' : ''}</div>}
      <div style={{ ...T(12), color: C.tm }}>{[o.deal && DEAL_HE[o.deal], o.kind === 'signal' ? null : srcHe(o.src), o.city, o.date].filter(Boolean).join(' · ')}</div>
      {(o.size_m2 || o.price || o.asking) && (
        <div style={{ ...T(13, 600), color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{[o.size_m2 && `${Math.round(o.size_m2)} מ״ר`, o.price && `₪${fmt(o.price)} לחודש`, o.asking && `מבקשים ₪${fmt(o.asking)}`].filter(Boolean).join(' · ')}</div>
      )}
      {o.summary && <div style={{ ...T(13), color: C.tm }}>{o.summary}</div>}
      {Array.isArray(o.questions) && o.questions.length > 0 && (
        <details style={{ ...T(13), color: C.tx }}>
          <summary style={{ cursor: 'pointer', color: C.acText, minHeight: 28, display: 'list-item' }}>שאלות לבירור ({o.questions.length})</summary>
          <ol style={{ margin: '6px 0 0', paddingInlineStart: 20, display: 'grid', gap: 4 }}>{o.questions.map(q => <li key={q}>{q}</li>)}</ol>
        </details>
      )}
      {url && <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: C.acText, ...T(13, 600) }}>לפרטים</a>}
    </article>
  );
}

export default function PropertiesView() {
  const [me, setMe] = useState(null);               // 'ohad' | 'yuval' | null (unknown -> voting off; never guess a voter)
  const [cards, setCards] = useState([]);
  const [votes, setVotes] = useState({});           // card_id -> { ohad: row, yuval: row }
  const [opps, setOpps] = useState([]);
  const [run, setRun] = useState(null);
  const [thumbs, setThumbs] = useState({});
  const [area, setArea] = useState(0);
  const [limit, setLimit] = useState(20);           // cards rendered in this tab (a long tab pages by 20)
  const [busy, setBusy] = useState({});             // card_id -> true while a vote is in flight
  const [status, setStatus] = useState('טוען…');
  const [now, setNow] = useState(() => Date.now());
  const votesRef = useRef(votes); votesRef.current = votes;
  const inflight = useRef(new Set());
  const [tab, setTab] = useState(() => (typeof window !== 'undefined' ? tabFromPath(window.location.pathname) : 'new'));
  useUrlSync(tab, (v) => setTab(v || 'new'), {
    toPath: (v) => (typeof window !== 'undefined' && window.location.pathname.startsWith(BASE) ? `${BASE}/${v}` : null),
    fromPath: (p) => (p.startsWith(BASE) ? tabFromPath(p) : null),
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = (data?.session?.user?.email || '').toLowerCase();
      setMe(STAFF[email] || null);
    }).catch(() => setMe(null));
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const [c, v, m] = await Promise.all([
      supabase.from('nadlan_cards').select('id,score,verdict,area,data,first_seen,active,updated_at').order('score', { ascending: false }),
      supabase.from('nadlan_votes').select('*'),
      supabase.from('nadlan_meta').select('key,value,updated_at'),
    ]);
    if (c.error || v.error) { setStatus('הטעינה נכשלה: ' + ((c.error || v.error).message || '')); return; }
    const vv = {};
    for (const r of v.data || []) (vv[r.card_id] = vv[r.card_id] || {})[r.voter] = r;
    setVotes(vv);
    // active cards + any retired card someone still has a vote on (a decision never silently disappears)
    setCards((c.data || []).filter(r => r.active || Object.values(vv[r.id] || {}).some(x => x && x.verdict))
      .map(r => ({ ...r.data, id: r.id, score: r.score, verdict: r.verdict, area: r.area, first_seen: r.first_seen, inactive: !r.active })));
    const rows = m.data || [];
    const opp = rows.find(r => r.key === 'opps');
    setOpps(Array.isArray(opp?.value) ? opp.value : []);
    const runRow = rows.find(r => r.key === 'run');
    setRun(runRow ? { ...runRow.value, _updated: runRow.updated_at } : null);
    setStatus('');
  }, []);

  // live: the other coach's decisions and each engine cycle show up without a reload
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
    if (v?.verdict) return v.verdict === 'rejected' ? 'archive' : 'active';
    // history from before this engine: only a real decision moves a card (audit R5: "seen in a sheet" is not a decision -
    // a strong space the founders once glanced at stays in חדשים / לבירור with a "נראה בעבר" label)
    if (c.verdict === 'rejected') return 'archive';
    if (c.verdict === 'shortlist' || c.verdict === 'visited') return 'active';
    return gateOf(c) === 'pass' ? 'new' : 'check';
  }, [votes, me]);

  const counts = useMemo(() => {
    const n = { opportunities: opps.length };
    for (const c of cards) { if (area && c.area !== area) continue; const b = bucket(c); n[b] = (n[b] || 0) + 1; }
    return n;
  }, [cards, opps, bucket, area]);

  useEffect(() => { setLimit(20); }, [tab, area]);
  const shown = useMemo(() => {
    const list = cards.filter(c => bucket(c) === tab && (!area || c.area === area));
    if (tab === 'active') list.sort((a, b) => (STAGE_ORDER[votes[a.id]?.[me]?.verdict] ?? 3) - (STAGE_ORDER[votes[b.id]?.[me]?.verdict] ?? 3) || b.score - a.score);
    return list;
  }, [cards, bucket, tab, area, votes, me]);
  const page = useMemo(() => shown.slice(0, limit), [shown, limit]);

  // thumbnails for the cards on screen, 60 at a time until every card on screen has one (or none exists)
  useEffect(() => {
    const need = page.map(c => c.id).filter(id => !(id in thumbs)).slice(0, 60);
    if (!need.length) return undefined;
    let alive = true;
    supabase.from('nadlan_thumbs').select('card_id,jpeg_b64').in('card_id', need).then(({ data }) => {
      if (!alive) return;
      const add = Object.fromEntries(need.map(id => [id, null]));
      for (const r of data || []) add[r.card_id] = r.jpeg_b64;
      setThumbs(t => ({ ...t, ...add }));
    });
    return () => { alive = false; };
  }, [page, thumbs]);

  // a task in the Tasks wire format, so it lands in that coach's own queue with its priority; an open one is reused
  const ensureTask = async (c, kind) => {
    const where = [c.street, c.street ? c.house_no : null, c.neighborhood, c.city].filter(Boolean).join(' ');
    const verb = kind === 'call' ? 'להתקשר' : 'סיור';
    // ONE task per card x coach x kind, whatever the number of open tabs or devices: a fixed id makes a second insert a
    // no-op (23505) instead of a duplicate, and a task closed by un-pressing מעניין is reopened rather than re-created
    const tid = `note_nadlan_${c.id}_${me}_${kind}`;
    const { data: had } = await supabase.from('coach_notes').select('id,status').eq('id', tid).maybeSingle();
    if (had) {
      if (had.status === 'done') await supabase.from('coach_notes').update({ status: 'open', completed_at: null }).eq('id', tid);
      return tid;
    }
    const firstUrl = safeUrl(c.links?.[0]?.url) || '';
    const row = {
      id: tid,
      body: `${WHO_WIRE[me]}: ${c.score >= 85 ? '[HIGH] ' : ''}${verb}: ${c.ptype || 'נכס'} ${where}${c.size_m2 ? ` · ${fmt(c.size_m2)} מ"ר` : ''} · ${c.price ? '₪' + fmt(c.price) : 'מחיר לבירור'}${firstUrl ? ' ' + firstUrl : ''}`,
      target_kind: 'property', target_id: c.id, target_label: where || c.title || 'נכס', pinned: false, status: 'open',
      tags: ['נכס'], assigned_to: me, priority: c.score >= 85 ? 'high' : 'normal',
      context: { questions: uniq(c.gate?.questions_he?.length ? c.gate.questions_he : c.questions).slice(0, 6), analysis: c.gate?.analysis_he || null, score: c.score },
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('coach_notes').insert(row);
    if (error && error.code !== '23505') throw new Error('המשימה לא נפתחה: ' + (error.message || ''));
    return tid;
  };
  // 1. un-pressing מעניין (or moving to לא) closes the open tasks this card opened for this coach
  const closeTasks = async (c) => {
    await supabase.from('coach_notes').update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('target_kind', 'property').eq('target_id', c.id).eq('assigned_to', me).neq('status', 'done');
  };

  const vote = useCallback(async (c, verdict, reason, score) => {
    if (!me || inflight.current.has(c.id)) return;
    inflight.current.add(c.id);
    setBusy(b => ({ ...b, [c.id]: true }));
    const prev = votesRef.current[c.id]?.[me] || null;
    try {
      let taskId = prev?.task_id || null;
      if (verdict === 'call' || verdict === 'visited') taskId = await ensureTask(c, verdict);
      else if (ACTIVE.has(prev?.verdict) && !ACTIVE.has(verdict) && score === undefined) { await closeTasks(c); taskId = null; }
      const next = { card_id: c.id, voter: me, verdict: verdict || null,
        reason: reason !== undefined ? reason : (verdict === prev?.verdict ? prev?.reason ?? null : null),
        score: score !== undefined ? (score || null) : (prev?.score ?? null), task_id: taskId, updated_at: new Date().toISOString() };
      setVotes(vs => ({ ...vs, [c.id]: { ...(vs[c.id] || {}), [me]: next } }));
      const { error } = await supabase.from('nadlan_votes').upsert(next);
      if (error) {
        setVotes(vs => (vs[c.id]?.[me] === next ? { ...vs, [c.id]: { ...(vs[c.id] || {}), [me]: prev } } : vs));
        throw new Error('ההחלטה לא נשמרה: ' + error.message);
      }
      setStatus('נשמר');
    } catch (e) {
      setStatus(e.message || 'שגיאה');
    } finally {
      inflight.current.delete(c.id);
      setBusy(b => { const n = { ...b }; delete n[c.id]; return n; });
    }
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  // engine health: the time of the last engine publish, red when it is stale during the day
  const runAt = run?._updated ? new Date(run._updated) : null;
  const ageH = runAt ? (now - runAt.getTime()) / 3600000 : null;
  const hourIL = Number(new Date(now).toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }));
  // the first cycle of the day starts at 06:00 and can take ~2 h: from 10:00 a 4 h gap is stale; at any other hour only a
  // gap longer than the night (10 h) - so a dead engine is flagged at night too, and a quiet night never is
  const stale = ageH != null && (hourIL >= 10 ? ageH > STALE_H : ageH > 10);
  // the cycle can publish while every collector fails: freshness of the DATA is the last real collection
  const colAt = run?.last_collected_at ? new Date(run.last_collected_at) : null;
  const colH = colAt ? (now - colAt.getTime()) / 3600000 : null;
  const dry = !stale && colH != null && (hourIL >= 10 ? colH > 8 : colH > 14);
  const colLabel = colAt ? colAt.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const runLabel = runAt ? runAt.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div lang="he" dir="rtl" style={{ display: 'grid', gap: 12, direction: 'rtl' }} className="nadlan-view">
      {dry && (
        <div role="status" style={{ border: `1px solid ${ORANGE}`, color: ORANGE, padding: '10px 12px', ...T(13, 600) }}>
          המנוע פועל, אבל לא נאסף מידע חדש מהאתרים מאז {colLabel} ({Math.round(colH)} שעות).
        </div>
      )}
      {stale && (
        <div role="alert" style={{ border: `1px solid ${RED}`, color: RED, padding: '10px 12px', ...T(13, 600) }}>
          המנוע לא עדכן מאז {runLabel} ({Math.round(ageH)} שעות). הרשימה כאן עלולה להיות ישנה.
        </div>
      )}
      <ChipGrid ariaLabel="לשוניות נכסים" soft cols={5} phoneCols={3} value={tab} onChange={setTab}
        items={TABS.map(t => ({ k: t.k, label: t.he, n: counts[t.k] || 0 }))} />
      {tab !== 'opportunities' && (
        <ChipGrid ariaLabel="אזור" soft cols={3} phoneCols={2} value={area} onChange={setArea}
          items={AREAS.map(a => ({ k: a.k, label: a.he }))} />
      )}
      <div className="nadlan-status" style={{ ...T(12), display: 'grid', gap: 2, color: stale ? RED : C.tm }}>
        <div>{TAB_HINT[tab]}</div>
        <div role="status" aria-live="polite">{status || [runLabel && `עדכון אחרון של המנוע: ${runLabel}`, colLabel && `סריקה אחרונה: ${colLabel}`].filter(Boolean).join(' · ')}{!me && !status ? ' · ההחלטות כבויות עד שהזהות שלך נטענת' : ''}</div>
      </div>
      {tab === 'opportunities' ? (
        opps.length ? opps.slice(0, limit).map(o => <OppCard key={o.id || o.url} o={o} />)
          : <div style={{ color: C.tm, ...T(13), padding: 24, textAlign: 'center' }}>אין כרגע עסקים למסירה, חללים לפי שעה או אותות.</div>
      ) : shown.length ? page.map(c => (
        <PropertyCard key={c.id} c={c} me={me} thumb={thumbs[c.id]} busy={!!busy[c.id]}
          mine={votes[c.id]?.[me] || {}} others={Object.values(votes[c.id] || {}).filter(v => v && v.voter !== me && v.verdict)}
          onVote={vote} />
      )) : <div style={{ color: C.tm, ...T(13), padding: 24, textAlign: 'center' }}>{cards.length ? 'אין נכסים בלשונית הזו כרגע.' : 'המנוע עוד לא העלה נכסים לכאן.'}</div>}
      {tab === 'opportunities' && opps.length > limit && (
        <ChipGrid ariaLabel="עוד הזדמנויות" soft cols={1} phoneCols={1}
          items={[{ k: 'more', label: `עוד ${Math.min(20, opps.length - limit)} (מוצגים ${limit} מתוך ${opps.length})` }]}
          onChange={() => setLimit(l => l + 20)} />
      )}
      {tab !== 'opportunities' && shown.length > page.length && (
        <ChipGrid ariaLabel="עוד נכסים" soft cols={1} phoneCols={1}
          items={[{ k: 'more', label: `עוד ${Math.min(20, shown.length - page.length)} (מוצגים ${page.length} מתוך ${shown.length})` }]}
          onChange={() => setLimit(l => l + 20)} />
      )}
      <style>{`.nadlan-view, .nadlan-view *:not(svg):not(svg *) { letter-spacing: 0.02em !important } @media (max-width: 560px) { .nadlan-card { grid-template-columns: 1fr !important } .nadlan-photo { min-height: 0 !important; aspect-ratio: 16 / 9 } } @media (max-width: 480px) { .nadlan-facts { grid-template-columns: repeat(2, minmax(0,1fr)) !important } .nadlan-facts > div:nth-child(odd) { border-inline-start: none !important } .nadlan-facts > div:nth-child(n+3) { border-top: 1px solid var(--c-cardBd) } }`}</style>
    </div>
  );
}
