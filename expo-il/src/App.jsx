import React, { useState, useEffect, useRef } from 'react';
import { Analytics, track } from '@vercel/analytics/react';
import { C, FN, FB, CONTACT, buyOnWhatsApp, EXPO_LOGO_NAV } from './theme';
import { PROGRAMS } from './programs';
import { useT, useLang, setLang } from './i18n';
import Chat from './Chat';

// Wrapped <a> that fires a Vercel Analytics custom event before the click is
// honoured. Vercel Analytics has to be enabled in the project dashboard for
// the events to actually land somewhere — until then track() is a no-op.
function trackAndOpen(event, payload) {
  try { track(event, payload || {}); } catch {}
}

// ───────────────────────────────────────────────────────────────────────────
// Hash-based routing — see programs.js header for the schema.
//
//   #/                         → catalog (Home)
//   #/programs/<program-id>    → ProgramDetail
//
// Anything else falls back to Home.
// ───────────────────────────────────────────────────────────────────────────

function parseHash(hash) {
  const h = (hash || '').replace(/^#\/?/, '');
  if (!h) return { view: 'home' };
  const m = h.match(/^programs\/([a-z0-9-]+)$/i);
  if (m) return { view: 'detail', programId: m[1] };
  return { view: 'home' };
}

function useHashRoute() {
  const [route, setRoute] = useState(() =>
    typeof window === 'undefined' ? { view: 'home' } : parseHash(window.location.hash)
  );
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function uniqueTags(list) {
  const set = new Set();
  for (const p of list) set.add(p.tag);
  return ['__all', ...Array.from(set)];
}

function buildBuyLink(program, t) {
  const text = t('wa.buy.tmpl', { title: program.title, id: program.id });
  return buyOnWhatsApp(program, text);
}

// Same shared base used in the coach app (src/ui.jsx → baseBtn). Inlined
// here so expo-il stays self-contained.
const baseBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px',
  borderRadius: 0, border: 'none', fontFamily: FN, fontSize: 11, fontWeight: 700,
  cursor: 'pointer', letterSpacing: '0.18em', textTransform: 'uppercase', transition: 'all 0.15s',
};

// Generic modal shell used by the quiz, exit-intent capture, and the
// interactive demo screens. Locks body scroll while open, closes on
// backdrop click + Escape. Stays accessible (role=dialog, focus trap to
// the close button on open).
function Modal({ open, onClose, children, title, maxWidth = 560 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={title}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, animation: 'fv-fade 180ms ease',
      }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 0,
        width: '100%', maxWidth, maxHeight: '92vh', overflow: 'auto',
        boxShadow: `0 28px 80px -24px ${C.ac}33`,
        position: 'relative', textAlign: 'start',
        animation: 'fv-pop 180ms ease',
      }}>
        {children}
      </div>
    </div>
  );
}

function ModalCloseBtn({ onClose, label }) {
  return (
    <button onClick={onClose} aria-label={label} title={label} style={{
      position: 'absolute', top: 10, insetInlineEnd: 10,
      width: 32, height: 32, borderRadius: 0,
      background: 'transparent', color: C.tm, border: `1px solid ${C.bd}`,
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FN, fontSize: 16, lineHeight: 1, padding: 0,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

// EXPO brand marks — pulled from the coach app's brand system (src/theme.js)
// via expo-il/scripts/sync-brand-from-coach.py so the landing site reads as
// the same product, not a generic re-skin. Never inline alternate cropped PNGs
// in expo-il/public/ — those drifted from the canonical mark before.
function BrandMark({ height = 22 }) {
  // The nav PNG packs caret + wordmark + transparent breathing room
  // above and below; the visible wordmark sits in the lower ~63% of
  // the image. Use a fixed-pixel lift so the wordmark sits visually
  // centered across every height we use (h=14 footer through h=36 nav).
  // Was percentage-based; that overcorrected at h=36 after the bump.
  return (
    <img src={EXPO_LOGO_NAV} alt="EXPO"
      decoding="async"
      style={{ height, width: 'auto', display: 'block', transform: 'translateY(-3px)' }} />
  );
}

// Lead capture: posts {email, context} directly to the Supabase REST API.
// No SDK dependency — keeps the landing-site bundle thin. The `leads` table
// + RLS policy live in scripts/migrations/2026-04-27-leads-table.sql.
//
// `compact` mode = single inline row (hero use); full mode = block layout
// with a label (footer use). Both share the same submit + state machine.
const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
function LeadCapture({ context = 'hero', compact = false }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // 'idle' | 'sending' | 'done' | 'error'
  const [errMsg, setErrMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (state === 'sending' || state === 'done') return;
    const trimmed = email.trim();
    // Cheap client-side check — server policy enforces this too.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setState('error'); setErrMsg(t('lead.err.invalid')); return;
    }
    setState('sending'); setErrMsg('');
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${SUPA_PUBLISHABLE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          email: trimmed,
          source: 'expo-il',
          context,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
        }),
      });
      // 409 = unique-constraint violation on (lower(email), source) — treat
      // a re-submit as success so the visitor sees "thanks" instead of an
      // error. We can't use Prefer: resolution=merge-duplicates because that
      // turns the POST into an UPSERT and our anon RLS policy only grants
      // INSERT (UPDATE is restricted to is_trainer()).
      if (!res.ok && res.status !== 409) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${txt ? ': ' + txt.slice(0, 80) : ''}`);
      }
      track && track('lead_capture', { context });
      setState('done');
    } catch (err) {
      console.error('Lead capture failed:', err);
      setState('error');
      setErrMsg(t('lead.err.generic'));
    }
  };
  if (state === 'done') {
    return (
      <div style={{
        fontFamily: FN, color: C.gn || '#28d95b', fontSize: compact ? 12 : 13,
        letterSpacing: 1.2, fontWeight: 700, textAlign: 'center',
        padding: compact ? '8px 12px' : '14px 18px',
        border: `1px solid ${(C.gn || '#28d95b') + '40'}`, borderRadius: 0,
      }}>
        {t('lead.thanks')}
      </div>
    );
  }
  const inputStyle = {
    background: '#0d0d10', border: `1px solid ${C.bd}`,
    borderRadius: 0, padding: '10px 14px', color: C.tx,
    fontFamily: FB, fontSize: 14, outline: 'none',
    flex: 1, minWidth: 0, textAlign: 'center',
  };
  const btnStyle = {
    background: state === 'sending' ? C.bd : C.ac,
    color: state === 'sending' ? C.tm : '#000',
    border: 'none', borderRadius: 0,
    padding: '10px 18px', fontFamily: FN, fontSize: 12, fontWeight: 700,
    letterSpacing: 1.5, cursor: state === 'sending' ? 'wait' : 'pointer',
  };
  return (
    <form onSubmit={submit} style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: compact ? 420 : 480, margin: '0 auto', width: '100%',
    }}>
      {!compact && (
        <div style={{
          fontFamily: FN, color: C.tm, fontSize: 11, letterSpacing: 2,
          textAlign: 'center', fontWeight: 700,
        }}>
          {t('lead.label')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="email" required value={email}
          onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
          placeholder={t('lead.placeholder')}
          aria-label={t('lead.label')}
          style={inputStyle} />
        <button type="submit" disabled={state === 'sending'} style={btnStyle}>
          {state === 'sending' ? t('lead.sending') : t('lead.cta')}
        </button>
      </div>
      {state === 'error' && (
        <div style={{
          fontFamily: FN, color: C.rd || '#ff5e5e', fontSize: 11, letterSpacing: 1,
          textAlign: 'center', marginTop: 2,
        }}>{errMsg}</div>
      )}
    </form>
  );
}

function LangToggle() {
  const [lang] = useLang();
  const next = lang === 'he' ? 'en' : 'he';
  const label = lang === 'he' ? 'EN' : 'עב';
  const ariaLabel = lang === 'he' ? 'Switch to English' : 'עבור לעברית';
  return (
    <button onClick={() => setLang(next)} title={ariaLabel} aria-label={ariaLabel} style={{
      ...baseBtn,
      background: 'transparent', color: C.tm,
      padding: '6px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1,
      borderRadius: 0, border: `1px solid ${C.bd}`,
    }}>
      {label}
    </button>
  );
}

// Coach-style nav: same 56px sticky header, same {label}{count} tab pattern,
// same active-pill (C.acD background, C.ac text). The "count" we surface here
// is the number of public programs — gives the page the same data-density
// signal the coach side uses.
function Nav() {
  const t = useT();
  // anchor 'top' = scroll to top of home; otherwise = id of section to scroll into view.
  // Two-stage navigation handles the case where the user clicks How/Contact while
  // sitting on a /programs/<id> detail page: navigate home first, wait for the
  // re-render, then scroll. We can't rely on the native browser anchor because
  // our hashes look like '#/' not '#contact', so id-based anchor scrolling never fires.
  const tabs = [
    { key: 'programs', label: t('nav.programs'), count: PROGRAMS.length, anchor: 'top'     },
    { key: 'about',    label: t('nav.about'),    count: null,            anchor: 'about'   },
    { key: 'how',      label: t('nav.how'),      count: null,            anchor: 'how'     },
    { key: 'faq',      label: t('nav.faq'),      count: null,            anchor: 'faq'     },
    { key: 'contact',  label: t('nav.contact'),  count: null,            anchor: 'contact' },
  ];
  const [active, setActive] = useState('programs');
  // Scroll-spy: as the user scrolls, mark whichever section is closest to the
  // top of the viewport as the active tab. Same behavior as the coach app's
  // observer-driven highlighting. Honors the 56px sticky header.
  useEffect(() => {
    const ids = ['programs', 'about', 'how', 'faq', 'contact'];
    const onScroll = () => {
      let best = 'programs';
      let bestDist = Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top - 80;
        if (top <= 0 && Math.abs(top) < bestDist) {
          bestDist = Math.abs(top);
          best = id;
        }
      }
      setActive(best);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const goToAnchor = (anchor) => {
    const onHome = location.hash === '' || location.hash === '#' || location.hash === '#/';
    const doScroll = () => {
      if (anchor === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const el = document.getElementById(anchor);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    if (onHome) {
      doScroll();
    } else {
      // Navigate home, then scroll after the re-render flushes the new tree.
      location.hash = '#/';
      setTimeout(doScroll, 60);
    }
  };
  return (
    <header style={{
      background: C.sf, borderBottom: `1px solid ${C.bd}`,
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      <style>{`.fv-hdr-scroll::-webkit-scrollbar{display:none}`}</style>
      <div className="fv-hdr-scroll" style={{
        maxWidth: 1200, margin: '0 auto', padding: '0 16px',
        display: 'flex', alignItems: 'center', height: 56,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        msOverflowStyle: 'none', scrollbarWidth: 'none',
      }}>
        <a href="#/" style={{
          flex: '0 0 auto', display: 'flex', alignItems: 'center',
          marginRight: 12, height: 56,
        }}>
          <BrandMark height={36} />
        </a>
        <nav style={{
          display: 'flex', gap: 2, alignItems: 'center',
          flex: '1 1 auto', justifyContent: 'center', minWidth: 'max-content',
        }}>
          {tabs.map(tab => {
            const on = active === tab.key;
            return (
              <button key={tab.key} onClick={() => { setActive(tab.key); goToAnchor(tab.anchor); }} style={{
                ...baseBtn,
                background: on ? C.acD : 'transparent',
                color: on ? C.ac : C.tm,
                borderRadius: 0, padding: '6px 10px',
                // Always 700 — inactive=500 was too thin in Hebrew (Heebo
                // Medium reads light against bold Nord). Match the
                // coach-app's tabs: weight stays bold; active state shows
                // through background tint + color shift.
                fontSize: 12, fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span style={{
                    fontSize: 10, color: on ? C.ac : C.td, fontFamily: FN,
                  }}>{tab.count}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div style={{
          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12,
        }}>
          <LangToggle />
          <a href="https://expo-app.co.il" target="_blank" rel="noopener noreferrer"
            title="Open the EXPO portal" aria-label="Open the EXPO portal" style={{
              ...baseBtn,
              background: 'transparent', color: C.tm,
              padding: '6px 8px', fontSize: 14, borderRadius: 0,
            }}>
            {/* External-link glyph — same stroke-icon style as the coach header */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero({ onOpenQuiz }) {
  const t = useT();
  return (
    <section id="top" style={{
      maxWidth: 1100, margin: '0 auto', padding: '64px 24px 40px',
      textAlign: 'center',
    }}>
      {/* EXPO caret icon (80px, sourced from the 512px PWA install glyph
          for sharpness at any DPR) above the "PROGRAMMED TRAINING" badge.
          Mirrors the coach-app /demo hero pattern so the two marketing
          surfaces read as one product. Was a 92px wordmark (`expo-hero-
          logo.png`) — that file is no longer referenced here but stays
          on disk for any inbound link / OG previews. */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
        marginBottom: 14,
      }}>
        <img src="/icon-512.png" alt="EXPO" width="80" height="80"
          fetchpriority="high" decoding="async"
          style={{ display: 'block' }} />
        <span>{t('hero.badge')}</span>
      </div>
      <h1 style={{
        fontFamily: FB, fontWeight: 700, fontSize: 'clamp(34px, 6vw, 60px)',
        lineHeight: 1.05, marginBottom: 18, letterSpacing: -1,
      }}>
        {t('hero.h1.line1')}<br />
        <span style={{ color: C.ac }}>{t('hero.h1.line2')}</span>
      </h1>
      <p style={{
        fontFamily: FB, color: C.tm, fontSize: 'clamp(15px, 1.6vw, 18px)',
        maxWidth: 620, margin: '0 auto 24px', lineHeight: 1.55,
      }}>
        {t('hero.subhead')}
      </p>

      {/* Social-proof strip — three credibility numbers in one row.
          Stacks on mobile via flex-wrap. */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap',
        marginBottom: 32, paddingTop: 4,
      }}>
        {[
          { n: t('hero.stat1.n'), l: t('hero.stat1.l') },
          { n: t('hero.stat2.n'), l: t('hero.stat2.l') },
          { n: t('hero.stat3.n'), l: t('hero.stat3.l') },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: 'center', minWidth: 96 }}>
            <div style={{
              fontFamily: FN, fontSize: 22, fontWeight: 700, color: C.ac,
              lineHeight: 1, marginBottom: 4,
            }}>{s.n}</div>
            <div style={{
              fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5, fontWeight: 700,
            }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a href="#programs" style={{
          ...baseBtn,
          background: C.ac, color: '#000', padding: '12px 24px',
          fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
        }}>
          {t('hero.cta.browse')}
        </a>
        <a href="https://expo-app.co.il/try"
           target="_blank" rel="noopener"
           onClick={() => trackAndOpen('try_click', { from: 'hero' })}
           style={{
             ...baseBtn,
             background: 'transparent', color: C.ac,
             border: `1px solid ${C.ac}`, padding: '12px 24px',
             fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
             textDecoration: 'none',
           }}>
          {t('hero.cta.try')}
        </a>
        <button onClick={onOpenQuiz} style={{
          ...baseBtn,
          background: 'transparent', color: C.tx,
          border: `1px solid ${C.ac4D}`, padding: '12px 24px',
          fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
        }}>
          {t('hero.cta.quiz')}
        </button>
        <a href="#how" style={{
          ...baseBtn,
          background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '12px 24px',
          fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
        }}>
          {t('hero.cta.how')}
        </a>
      </div>

      {/* Email capture for visitors who aren't ready to buy today. Posts to
          the Supabase `leads` table — see scripts/migrations/2026-04-27-leads-table.sql. */}
      <div style={{ marginTop: 28 }}>
        <LeadCapture context="hero" compact />
      </div>
    </section>
  );
}

// ShareButton: uses the Web Share API on mobile (one-tap to system share
// sheet — WhatsApp, Telegram, etc.) and falls back to copy-to-clipboard on
// desktop browsers without it. The shared URL is the canonical clean
// /programs/<id> path so the recipient lands on the per-program OG card.
function ShareButton({ programId, programTitle, size = 'sm' }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const handleShare = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `https://expo-il.co.il/programs/${programId}`;
    const text = t('card.share.text.tmpl', { title: programTitle });
    // Native share sheet on mobile if available.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: programTitle, text, url });
        trackAndOpen('program_share', { programId, channel: 'webshare' });
        return;
      } catch (err) {
        // User cancelled or share failed — fall through to clipboard fallback.
        if (err && err.name === 'AbortError') return;
      }
    }
    // Clipboard fallback.
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      trackAndOpen('program_share', { programId, channel: 'clipboard' });
    } catch {}
  };
  const dim = size === 'lg' ? { padding: '8px 14px', fontSize: 12 } : { padding: '6px 10px', fontSize: 11 };
  return (
    <button onClick={handleShare} aria-label={t('card.share')} title={t('card.share')} style={{
      ...baseBtn,
      background: copied ? C.acD : 'transparent',
      color: copied ? C.ac : C.tm,
      border: `1px solid ${copied ? C.ac : C.bd}`,
      borderRadius: 0, fontWeight: 700, letterSpacing: 1,
      ...dim,
    }}>
      {copied ? (
        <span>{t('card.share.copied')}</span>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      )}
    </button>
  );
}

function ProgramMeta({ p }) {
  const meta = [];
  if (p.level) meta.push(p.level);
  if (Array.isArray(p.equipment) && p.equipment.length) meta.push(p.equipment.join(' · '));
  if (meta.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {meta.map((m, i) => (
        <span key={i} style={{
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 0.5,
          border: `1px solid ${C.bd}`, padding: '3px 8px', borderRadius: 0,
          background: C.sf2,
        }}>{m.toUpperCase()}</span>
      ))}
    </div>
  );
}

// Card stroke ruling (mirrors feedback_stroke_ruling.md from the coach side):
//   inactive border = 0.25px solid C.ac4D (30% alpha)
//   hover/active    = 2px solid C.ac (full accent)
// The 0.25px hairline only renders correctly above 1× DPR; on 1× displays it
// rounds up to 1px, which still reads as a hairline against the dark surface.
function ProgramCard({ p }) {
  const t = useT();
  const [lang] = useLang();
  const isHe = lang === 'he';
  const [hover, setHover] = useState(false);
  const currency = t('card.currency.' + p.currency) === 'card.currency.' + p.currency ? p.currency : t('card.currency.' + p.currency);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.sf,
        border: hover ? `2px solid ${C.ac}` : `0.25px solid ${C.ac4D}`,
        borderRadius: 0, padding: 14,
        display: 'flex', flexDirection: 'column', gap: 12,
        transition: 'border-color 150ms, transform 150ms, box-shadow 150ms, border-width 150ms',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hover ? `0 12px 32px -16px ${C.ac}55` : 'none',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
          background: 'transparent', border: `0.25px solid ${C.ac}`, color: C.ac, padding: '4px 10px', borderRadius: 0,
          border: `1px solid ${C.ac4D}`,
        }}>{(isHe && p.tagHe ? p.tagHe : p.tag).toUpperCase()}</span>
        <span style={{ fontFamily: FN, fontSize: 11, color: C.td }}>{isHe ? (p.durationHe || p.duration) : p.duration}</span>
      </div>
      <div>
        <h3 style={{ fontFamily: FB, fontSize: 20, fontWeight: 700, marginBottom: 4, lineHeight: 1.15 }}>{isHe ? (p.titleHe || p.title) : p.title}</h3>
        <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>{isHe ? (p.audienceHe || p.audience) : p.audience}</div>
      </div>
      <p style={{ fontFamily: FB, fontSize: 13, color: C.tx, opacity: 0.85, lineHeight: 1.55 }}>
        {isHe ? (p.summaryHe || p.summary) : p.summary}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(isHe && p.highlightsHe ? p.highlightsHe : p.highlights).map((h, i) => (
          <li key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.45,
          }}>
            <span style={{ color: C.ac, fontFamily: FN, marginTop: 1 }}>›</span>
            <span>{h}</span>
          </li>
        ))}
      </ul>
      <ProgramMeta p={p} />
      <div style={{ flex: 1 }} />
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        paddingTop: 12, borderTop: `1px solid ${C.bd}`, gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>{t('card.price')}</div>
          <div style={{ fontFamily: FN, fontSize: 22, fontWeight: 700, color: C.tx }}>
            {p.price} <span style={{ fontSize: 13, color: C.tm }}>{currency}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ShareButton programId={p.id} programTitle={p.title} />
          <a href={`#/programs/${p.id}`} style={{
            ...baseBtn,
            background: 'transparent', color: C.tm,
            border: `1px solid ${C.bd}`, padding: '8px 14px',
            fontSize: 12, fontWeight: 700, letterSpacing: 1.5, borderRadius: 0,
          }}>
            {t('card.view')}
          </a>
          <a href={buildBuyLink(p, t)} target="_blank" rel="noopener noreferrer"
            onClick={() => trackAndOpen('buy_click', { programId: p.id, source: 'catalog_card' })}
            style={{
              ...baseBtn,
              background: C.ac, color: '#000', padding: '8px 16px',
              fontSize: 12, fontWeight: 700, letterSpacing: 1.5, borderRadius: 0,
            }}>
            {t('card.buy')}
          </a>
        </div>
      </div>
    </div>
  );
}

function Catalog() {
  const t = useT();
  const tags = uniqueTags(PROGRAMS);
  const [active, setActive] = useState('__all');
  const list = active === '__all' ? PROGRAMS : PROGRAMS.filter(p => p.tag === active);
  return (
    <section id="programs" style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px 60px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
          marginBottom: 8, fontWeight: 700,
        }}>{t('catalog.badge')}</div>
        <h2 style={{ fontFamily: FB, fontSize: 'clamp(24px, 3.6vw, 32px)', fontWeight: 700, marginBottom: 8, letterSpacing: -0.3 }}>
          {t('catalog.h2')}
        </h2>
        <p style={{ fontFamily: FB, color: C.tm, fontSize: 14, maxWidth: 720, lineHeight: 1.55 }}>
          {t('catalog.body')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {tags.map(tag => {
          const on = active === tag;
          const label = tag === '__all' ? t('catalog.chip.all') : tag.toUpperCase();
          // Count of programs in this tag — gives the chip a data signal so
          // the user knows how many they'll see when they filter.
          const count = tag === '__all' ? PROGRAMS.length : PROGRAMS.filter(p => p.tag === tag).length;
          return (
            <button key={tag} onClick={() => setActive(tag)} style={{
              ...baseBtn,
              background: on ? C.acD : 'transparent',
              color: on ? C.ac : C.tm,
              border: on ? `1px solid ${C.ac}` : `1px solid ${C.bd}`,
              padding: '6px 12px', borderRadius: 0,
              fontSize: 11, fontWeight: 700, letterSpacing: 1,
              gap: 6,
            }}>
              <span>{label}</span>
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: on ? C.ac : C.td,
                opacity: 0.85,
              }}>{count}</span>
            </button>
          );
        })}
      </div>
      <div style={{
        display: 'grid', gap: 14,
        // auto-fit collapses empty tracks AND `justifyContent: center`
        // pushes the surviving tracks to the middle, so a single-result
        // filter (e.g. POWERBUILD → 1 program) renders centered instead
        // of pinned to the start (right edge in RTL Hebrew).
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 320px))',
        justifyContent: 'center',
      }}>
        {list.map(p => <ProgramCard key={p.id} p={p} />)}
      </div>
      {list.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: C.td, fontFamily: FN, fontSize: 12 }}>
          {t('catalog.empty')}
        </div>
      )}
    </section>
  );
}

// PhoneFrame: shared chrome (rounded body, notch bar, dark inner canvas).
// The interesting bits live in `children` — each WhatsInside feature renders a
// different inner panel inside the same frame so the row reads as one product.
//
// When `onClick` is supplied, the frame becomes a button (keyboard + screen
// reader friendly) and a "TAP TO TRY" badge appears on hover/focus. The badge
// is positioned outside the frame's inner canvas so it doesn't clutter the
// mock and disappears once the modal opens.
function PhoneFrame({ children, tag, height = 360, onClick, label }) {
  const t = useT();
  const interactive = typeof onClick === 'function';
  const [hot, setHot] = useState(false);
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? (label || t('demo.tap')) : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      } : undefined}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      style={{
        width: 220, maxWidth: '100%', margin: '0 auto',
        borderRadius: 28, padding: 7,
        background: '#0d0d10',
        border: interactive && hot ? `1px solid ${C.ac}` : `1px solid ${C.bd2}`,
        boxShadow: interactive && hot
          ? `0 32px 80px -24px ${C.ac}88, 0 0 0 0.5px ${C.ac}`
          : `0 24px 64px -32px ${C.ac}55, 0 0 0 0.5px ${C.ac4D}`,
        position: 'relative',
        cursor: interactive ? 'pointer' : 'default',
        transform: interactive && hot ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
      }}>
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        width: 50, height: 4, borderRadius: 2, background: '#1a1a1f', zIndex: 2,
      }} />
      <div style={{
        background: C.bg, borderRadius: 22, padding: '24px 10px 12px',
        minHeight: height, display: 'flex', flexDirection: 'column', gap: 8,
        direction: 'ltr', textAlign: 'left',
      }}>
        {/* App header — same across all three frames */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: 6, borderBottom: `1px solid ${C.bd}`,
        }}>
          <span style={{
            fontFamily: FN, fontSize: 9, letterSpacing: 2, color: C.ac, fontWeight: 700,
          }}>EXPO</span>
          <span style={{
            fontFamily: FN, fontSize: 8, color: C.td, letterSpacing: 1.2, fontWeight: 700,
          }}>{tag}</span>
        </div>
        {children}
      </div>
      {interactive && (
        <div aria-hidden="true" style={{
          position: 'absolute', bottom: -10, left: '50%',
          transform: `translateX(-50%) translateY(${hot ? 0 : 4}px)`,
          background: C.ac, color: '#000',
          fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
          padding: '5px 12px', borderRadius: 0,
          opacity: hot ? 1 : 0.85,
          transition: 'opacity 200ms ease, transform 200ms ease',
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          {t('demo.tap')}
        </div>
      )}
    </div>
  );
}

// PoseScreen: stick-figure squat with key-joint markers + skeleton lines.
// Animates a 2.2s squat cycle (down → bottom → up) via React state so the
// joint coordinates re-render — same MediaPipe-style overlay the portal
// renders on a real trainee clip, just running on a synthetic skeleton.
function PoseScreen() {
  const t = useT();
  const [phase, setPhase] = useState(0.5); // 0..1 squat phase (mid-default for reduced-motion)
  useEffect(() => {
    // Honour prefers-reduced-motion — leave the figure parked at mid-squat
    // (phase 0.5) instead of cycling. Better for vestibular-sensitive users
    // and Lighthouse accessibility score.
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf, t0;
    const tick = (now) => {
      if (!t0) t0 = now;
      const elapsed = ((now - t0) % 2200) / 2200; // 2.2s loop
      const tri = elapsed < 0.5 ? elapsed * 2 : (1 - elapsed) * 2;
      const eased = tri < 0.5 ? 2 * tri * tri : 1 - Math.pow(-2 * tri + 2, 2) / 2;
      setPhase(eased);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Squat depth: hip drops up to 18 units, knee drops up to 10 units.
  // Knee tracks slightly forward (toes) at the bottom — the small x offset
  // makes the side-on read "this is a squat" instead of "this is a sit".
  const hipDrop = phase * 18;
  const kneeDrop = phase * 10;
  const kneeFwd = phase * 2;
  // Knee/hip angles change with depth — surfaced in the floating badges.
  const kneeAngle = Math.round(170 - phase * 80); // 170° standing → 90° bottom
  const hipAngle = Math.round(170 - phase * 90);  // 170° standing → 80° bottom
  const depthLabel = phase < 0.3 ? 'TOP' : phase > 0.7 ? 'BOTTOM' : 'MID';
  const joints = {
    head:   [50, 22], shoulderL:[40, 38], shoulderR:[60, 38],
    elbowL: [34, 58], elbowR:   [66, 58], wristL:   [30, 78], wristR: [70, 78],
    hipL:   [44, 78 + hipDrop], hipR: [56, 78 + hipDrop],
    kneeL:  [42 - kneeFwd, 102 + kneeDrop], kneeR: [58 + kneeFwd, 102 + kneeDrop],
    ankleL: [40, 128], ankleR:  [60, 128],
  };
  const lines = [
    ['shoulderL','shoulderR'], ['shoulderL','elbowL'], ['elbowL','wristL'],
    ['shoulderR','elbowR'], ['elbowR','wristR'],
    ['shoulderL','hipL'], ['shoulderR','hipR'], ['hipL','hipR'],
    ['hipL','kneeL'], ['kneeL','ankleL'],
    ['hipR','kneeR'], ['kneeR','ankleR'],
  ];
  return (
    <>
      <div style={{
        flex: 1, position: 'relative', borderRadius: 0,
        background: 'linear-gradient(180deg, #0e0e12 0%, #08080a 100%)',
        border: `1px solid ${C.bd}`, overflow: 'hidden',
      }}>
        <svg viewBox="0 0 100 140" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}>
          <ellipse cx="50" cy="72" rx="22" ry="50" fill={C.bd} opacity="0.25" />
          {lines.map(([a, b], i) => (
            <line key={i} x1={joints[a][0]} y1={joints[a][1]}
              x2={joints[b][0]} y2={joints[b][1]}
              stroke={C.ac} strokeWidth="0.8" strokeLinecap="round" opacity="0.85" />
          ))}
          <circle cx={joints.head[0]} cy={joints.head[1]} r="6" fill="none" stroke={C.ac} strokeWidth="0.8" />
          {Object.values(joints).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.6" fill={C.ac} />
          ))}
          {/* Crosshair on knee + hip pulses with the squat — wider at depth */}
          <circle cx={joints.kneeL[0]} cy={joints.kneeL[1]} r={3.2 + phase * 1.2} fill="none" stroke={C.ac} strokeWidth="0.7" opacity={0.5 + phase * 0.5} />
          <circle cx={joints.hipL[0]} cy={joints.hipL[1]} r={3.2 + phase * 1.2} fill="none" stroke={C.ac} strokeWidth="0.7" opacity={0.5 + phase * 0.5} />
        </svg>

        <div style={{
          position: 'absolute', top: 8, left: 8, padding: '3px 6px',
          fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: 0.8,
          background: C.acD, color: C.ac, borderRadius: 0,
          border: `1px solid ${C.ac4D}`,
        }}>KNEE {kneeAngle}°</div>
        <div style={{
          position: 'absolute', bottom: 8, right: 8, padding: '3px 6px',
          fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: 0.8,
          background: C.acD, color: C.ac, borderRadius: 0,
          border: `1px solid ${C.ac4D}`,
        }}>{depthLabel}</div>
      </div>
      <div style={{
        fontFamily: FN, fontSize: 8, color: C.td, letterSpacing: 1.2,
        textAlign: 'center', paddingTop: 6,
      }}>{t('inside.pose.foot')}</div>
    </>
  );
}

// RepCounterScreen: video-thumb-style tile with a counter that ticks up to
// 8 over ~3.2s, troughs lighting up one by one in sync with the count. Loops
// back to 0 with a 1s pause at full so the "8/8" reads as an arrival before
// resetting. Mirrors the prominence=25 trough algorithm the portal runs on
// real clips.
function RepCounterScreen() {
  const t = useT();
  const TROUGH_X = [16, 40, 65, 90, 114, 138, 162, 186];
  const TARGET = TROUGH_X.length;
  // Reduced-motion: park the counter at full so the static screenshot still
  // reads "completed set" without animating every 4 seconds.
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [count, setCount] = useState(reducedMotion ? TARGET : 0);
  useEffect(() => {
    if (reducedMotion) return;
    let timer;
    const step = () => {
      setCount(c => {
        if (c >= TARGET) {
          timer = setTimeout(() => setCount(0), 1000);
          return c;
        }
        timer = setTimeout(step, 380);
        return c + 1;
      });
    };
    timer = setTimeout(step, 700);
    return () => clearTimeout(timer);
  }, [count === 0 ? 'restart' : 'ticking']);
  // Sine-ish path with dips at each trough x.
  const pathPoints = [];
  for (let x = 0; x <= 200; x += 2) {
    let y = 18;
    for (const tx of TROUGH_X) {
      const d = Math.abs(x - tx);
      if (d < 12) y += (12 - d) * 1.4;
    }
    pathPoints.push(`${x},${y}`);
  }
  const pathStr = 'M ' + pathPoints.join(' L ');
  return (
    <>
      <div style={{
        flex: 1, position: 'relative', borderRadius: 0,
        background: 'linear-gradient(135deg, #0d0d11 0%, #14141a 50%, #0a0a0c 100%)',
        border: `1px solid ${C.bd}`, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox="0 0 100 100" width="56" height="56"
          style={{ position: 'absolute', opacity: 0.12 }}>
          <polygon points="35,25 35,75 78,50" fill={C.tx} />
        </svg>
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{
            fontFamily: FN, fontWeight: 700, fontSize: 42,
            color: C.ac, lineHeight: 1, letterSpacing: -1,
            textShadow: `0 0 24px ${C.ac}66`,
            transition: 'transform 120ms ease',
            transform: count === TARGET ? 'scale(1.08)' : 'scale(1)',
          }}>{count}/{TARGET}</div>
          <div style={{
            fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: 3,
            fontWeight: 700, marginTop: 4,
          }}>{t('inside.rep.label')}</div>
        </div>
      </div>

      <div style={{
        background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 0,
        padding: '6px 8px',
      }}>
        <svg viewBox="0 0 200 32" width="100%" height="32"
          preserveAspectRatio="none" style={{ display: 'block' }}>
          <path d={pathStr} fill="none" stroke={C.tm} strokeWidth="1" />
          {TROUGH_X.map((x, i) => {
            const lit = i < count;
            return (
              <circle key={i} cx={x} cy="32" r={lit ? 2.6 : 1.6}
                fill={lit ? C.ac : C.bd2}
                style={{ transition: 'fill 200ms ease, r 200ms ease' }} />
            );
          })}
        </svg>
      </div>

      <div style={{
        fontFamily: FN, fontSize: 8, color: C.td, letterSpacing: 1.2,
        textAlign: 'center', paddingTop: 4,
      }}>{t('inside.rep.foot')}</div>
    </>
  );
}

// CompareScreen: two video thumbs stacked, labeled with weight + a quick
// rep-quality cue. Mirrors the "side-by-side at the same load" view the
// portal exposes once a clip is uploaded.
function CompareScreen() {
  const t = useT();
  const Tile = ({ title, sub, dimmed, repsOk }) => (
    <div style={{
      flex: 1, position: 'relative',
      borderRadius: 0, border: dimmed ? `1px solid ${C.bd}` : `1px solid ${C.ac}`,
      background: dimmed
        ? 'linear-gradient(135deg, #0d0d11 0%, #14141a 100%)'
        : 'linear-gradient(135deg, #101018 0%, #181826 100%)',
      overflow: 'hidden', minHeight: 0,
      display: 'flex', alignItems: 'flex-end', padding: 8,
      opacity: dimmed ? 0.7 : 1,
      transition: 'opacity 350ms ease, border-color 350ms ease, background 350ms ease',
    }}>
      {/* Faux play triangle */}
      <svg viewBox="0 0 100 100" width="22" height="22"
        style={{ position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', opacity: 0.18 }}>
        <polygon points="35,25 35,75 78,50" fill={C.tx} />
      </svg>
      {/* Tiny rep dots row top-right */}
      <div style={{
        position: 'absolute', top: 6, right: 6,
        display: 'flex', gap: 3,
      }}>
        {Array.from({ length: repsOk.length }).map((_, i) => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: repsOk[i] ? C.ac : 'transparent',
            border: `1px solid ${repsOk[i] ? C.ac : C.bd2}`,
            transition: 'background 220ms ease, border-color 220ms ease',
          }} />
        ))}
      </div>
      <div>
        <div style={{
          fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
          color: dimmed ? C.tm : C.ac,
        }}>{title}</div>
        <div style={{
          fontFamily: FN, fontSize: 8, color: C.td, letterSpacing: 0.8,
          marginTop: 2,
        }}>{sub}</div>
      </div>
    </div>
  );
  // Animate the "now" tile's rep dots filling left-to-right, then briefly
  // flip the focus highlight onto the "last" tile so the eye reads "compare,
  // not just play". Loop runs ~3.6s.
  // Reduced-motion: render the "now" tile fully filled and skip the cycle.
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [nowReps, setNowReps] = useState(reducedMotion ? 5 : 0);
  const [activeTop, setActiveTop] = useState(false);
  useEffect(() => {
    if (reducedMotion) return;
    let timer;
    const cycle = () => {
      setActiveTop(false);
      setNowReps(0);
      const fillStep = (i) => {
        if (i > 5) {
          timer = setTimeout(() => {
            setActiveTop(true);
            timer = setTimeout(() => { cycle(); }, 1100);
          }, 700);
          return;
        }
        setNowReps(i);
        timer = setTimeout(() => fillStep(i + 1), 280);
      };
      fillStep(1);
    };
    cycle();
    return () => clearTimeout(timer);
  }, []);
  const lastReps = [1, 1, 1, 0];
  const nowRepsArr = Array.from({ length: 5 }, (_, i) => i < nowReps ? 1 : 0);
  return (
    <>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <Tile title={t('inside.cmp.last.t')} sub={t('inside.cmp.last.s')}
          dimmed={!activeTop} repsOk={lastReps} />
        <Tile title={t('inside.cmp.now.t')} sub={t('inside.cmp.now.s')}
          dimmed={activeTop} repsOk={nowRepsArr} />
      </div>
      <div style={{
        fontFamily: FN, fontSize: 8, color: C.td, letterSpacing: 1.2,
        textAlign: 'center', paddingTop: 4,
      }}>{t('inside.cmp.foot')}</div>
    </>
  );
}

// PoseDemoInteractive: scrubable squat. The user drags the slider; the same
// joint coordinates the read-only PoseScreen animates live update from the
// slider value instead of from a requestAnimationFrame loop. Same maths, same
// look — but the user controls it.
function PoseDemoInteractive() {
  const t = useT();
  const [phase, setPhase] = useState(0.5);
  const hipDrop = phase * 18;
  const kneeDrop = phase * 10;
  const kneeFwd = phase * 2;
  const kneeAngle = Math.round(170 - phase * 80);
  const hipAngle = Math.round(170 - phase * 90);
  const depthLabel = phase < 0.3 ? 'TOP' : phase > 0.7 ? 'BOTTOM' : 'MID';
  const joints = {
    head:   [50, 22], shoulderL:[40, 38], shoulderR:[60, 38],
    elbowL: [34, 58], elbowR:   [66, 58], wristL:   [30, 78], wristR: [70, 78],
    hipL:   [44, 78 + hipDrop], hipR: [56, 78 + hipDrop],
    kneeL:  [42 - kneeFwd, 102 + kneeDrop], kneeR: [58 + kneeFwd, 102 + kneeDrop],
    ankleL: [40, 128], ankleR:  [60, 128],
  };
  const lines = [
    ['shoulderL','shoulderR'], ['shoulderL','elbowL'], ['elbowL','wristL'],
    ['shoulderR','elbowR'], ['elbowR','wristR'],
    ['shoulderL','hipL'], ['shoulderR','hipR'], ['hipL','hipR'],
    ['hipL','kneeL'], ['kneeL','ankleL'],
    ['hipR','kneeR'], ['kneeR','ankleR'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        position: 'relative', borderRadius: 0, height: 280,
        background: 'linear-gradient(180deg, #0e0e12 0%, #08080a 100%)',
        border: `1px solid ${C.bd}`, overflow: 'hidden',
      }}>
        <svg viewBox="0 0 100 140" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}>
          <ellipse cx="50" cy="72" rx="22" ry="50" fill={C.bd} opacity="0.25" />
          {lines.map(([a, b], i) => (
            <line key={i} x1={joints[a][0]} y1={joints[a][1]}
              x2={joints[b][0]} y2={joints[b][1]}
              stroke={C.ac} strokeWidth="0.8" strokeLinecap="round" opacity="0.85" />
          ))}
          <circle cx={joints.head[0]} cy={joints.head[1]} r="6" fill="none" stroke={C.ac} strokeWidth="0.8" />
          {Object.values(joints).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.6" fill={C.ac} />
          ))}
          <circle cx={joints.kneeL[0]} cy={joints.kneeL[1]} r={3.2 + phase * 1.2} fill="none" stroke={C.ac} strokeWidth="0.7" opacity={0.5 + phase * 0.5} />
          <circle cx={joints.hipL[0]} cy={joints.hipL[1]} r={3.2 + phase * 1.2} fill="none" stroke={C.ac} strokeWidth="0.7" opacity={0.5 + phase * 0.5} />
        </svg>
        <div style={{
          position: 'absolute', top: 10, left: 12, padding: '4px 8px',
          fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1,
          background: C.acD, color: C.ac, borderRadius: 0,
          border: `1px solid ${C.ac4D}`,
        }}>KNEE {kneeAngle}°</div>
        <div style={{
          position: 'absolute', top: 10, right: 12, padding: '4px 8px',
          fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1,
          background: C.acD, color: C.ac, borderRadius: 0,
          border: `1px solid ${C.ac4D}`,
        }}>HIP {hipAngle}°</div>
        <div style={{
          position: 'absolute', bottom: 10, right: 12, padding: '4px 8px',
          fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1,
          background: C.acD, color: C.ac, borderRadius: 0,
          border: `1px solid ${C.ac4D}`,
        }}>{depthLabel}</div>
      </div>
      <div style={{
        background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 0, padding: 12,
      }}>
        <div style={{
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 2,
          fontWeight: 700, marginBottom: 8,
        }}>
          {t('demo.pose.scrub')} — {Math.round(phase * 100)}%
        </div>
        <input type="range" min={0} max={100} value={Math.round(phase * 100)}
          onChange={e => setPhase(Number(e.target.value) / 100)}
          aria-label={t('demo.pose.scrub')}
          style={{ width: '100%', accentColor: C.ac, cursor: 'pointer' }} />
      </div>
    </div>
  );
}

// RepDemoInteractive: tap the bar to add a rep. Each tap lights another
// trough — same trough-detection visualisation the read-only RepCounterScreen
// shows, but the user is the input source.
function RepDemoInteractive() {
  const t = useT();
  const TROUGH_X = [16, 40, 65, 90, 114, 138, 162, 186];
  const TARGET = TROUGH_X.length;
  const [count, setCount] = useState(0);
  const pathPoints = [];
  for (let x = 0; x <= 200; x += 2) {
    let y = 18;
    for (const tx of TROUGH_X) {
      const d = Math.abs(x - tx);
      if (d < 12) y += (12 - d) * 1.4;
    }
    pathPoints.push(`${x},${y}`);
  }
  const pathStr = 'M ' + pathPoints.join(' L ');
  const inc = () => setCount(c => Math.min(c + 1, TARGET));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        height: 200, borderRadius: 0,
        background: 'linear-gradient(135deg, #0d0d11 0%, #14141a 50%, #0a0a0c 100%)',
        border: `1px solid ${C.bd}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: FN, fontWeight: 700, fontSize: 56,
            color: C.ac, lineHeight: 1, letterSpacing: -1,
            textShadow: `0 0 24px ${C.ac}66`,
            transition: 'transform 120ms ease',
            transform: count === TARGET ? 'scale(1.08)' : 'scale(1)',
          }}>{count}/{TARGET}</div>
          <div style={{
            fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 3,
            fontWeight: 700, marginTop: 8,
          }}>{t('inside.rep.label')}</div>
        </div>
      </div>
      <button onClick={inc} aria-label="Add rep" style={{
        background: C.sf2, border: `1px solid ${C.ac4D}`, borderRadius: 0,
        padding: '10px 12px', cursor: 'pointer',
        transition: 'border-color 150ms ease',
      }}>
        <svg viewBox="0 0 200 32" width="100%" height="40"
          preserveAspectRatio="none" style={{ display: 'block' }}>
          <path d={pathStr} fill="none" stroke={C.tm} strokeWidth="1" />
          {TROUGH_X.map((x, i) => {
            const lit = i < count;
            return (
              <circle key={i} cx={x} cy="32" r={lit ? 3.2 : 1.8}
                fill={lit ? C.ac : C.bd2}
                style={{ transition: 'fill 200ms ease, r 200ms ease' }} />
            );
          })}
        </svg>
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5, fontWeight: 700,
        }}>
          {t('inside.rep.foot')}
        </div>
        <button onClick={() => setCount(0)} style={{
          ...baseBtn,
          background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '6px 12px',
          fontSize: 10, fontWeight: 700, letterSpacing: 1.2, borderRadius: 0,
        }}>
          {t('demo.rep.reset')}
        </button>
      </div>
    </div>
  );
}

// CompareDemoInteractive: tap a tile to focus it. Same dim/active treatment
// the read-only CompareScreen cycles, with the user driving the swap.
function CompareDemoInteractive() {
  const t = useT();
  const [focus, setFocus] = useState('now');
  const Tile = ({ id, title, sub, repsOk }) => {
    const active = focus === id;
    return (
      <button onClick={() => setFocus(id)} aria-pressed={active} style={{
        flex: 1, position: 'relative', padding: 12, minHeight: 110,
        borderRadius: 0,
        border: active ? `2px solid ${C.ac}` : `1px solid ${C.bd}`,
        background: active
          ? 'linear-gradient(135deg, #101018 0%, #181826 100%)'
          : 'linear-gradient(135deg, #0d0d11 0%, #14141a 100%)',
        opacity: active ? 1 : 0.65,
        textAlign: 'start', cursor: 'pointer',
        transition: 'opacity 250ms ease, border-color 250ms ease',
      }}>
        <svg viewBox="0 0 100 100" width="22" height="22"
          style={{ position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)', opacity: 0.18 }}>
          <polygon points="35,25 35,75 78,50" fill={C.tx} />
        </svg>
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
          {repsOk.map((ok, i) => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: ok ? C.ac : 'transparent',
              border: `1px solid ${ok ? C.ac : C.bd2}`,
            }} />
          ))}
        </div>
        <div style={{
          position: 'absolute', bottom: 10, left: 12, right: 12,
        }}>
          <div style={{
            fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
            color: active ? C.ac : C.tm,
          }}>{title}</div>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.td, marginTop: 2 }}>{sub}</div>
        </div>
      </button>
    );
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Tile id="last" title={t('inside.cmp.last.t')} sub={t('inside.cmp.last.s')}
        repsOk={[1, 1, 1, 0]} />
      <Tile id="now" title={t('inside.cmp.now.t')} sub={t('inside.cmp.now.s')}
        repsOk={[1, 1, 1, 1, 1]} />
      <div style={{
        fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.2,
        textAlign: 'center', fontWeight: 700, marginTop: 4,
      }}>
        {t('inside.cmp.foot')}
      </div>
    </div>
  );
}

const DEMOS = {
  pose: { titleKey: 'demo.pose.h', bodyKey: 'demo.pose.body', Body: PoseDemoInteractive },
  rep:  { titleKey: 'demo.rep.h',  bodyKey: 'demo.rep.body',  Body: RepDemoInteractive  },
  cmp:  { titleKey: 'demo.cmp.h',  bodyKey: 'demo.cmp.body',  Body: CompareDemoInteractive },
};

function DemoModal({ which, onClose }) {
  const t = useT();
  const open = !!which;
  const cfg = which ? DEMOS[which] : null;
  if (!cfg) return <Modal open={false} onClose={onClose} />;
  const Body = cfg.Body;
  return (
    <Modal open={open} onClose={onClose} title={t(cfg.titleKey)} maxWidth={460}>
      <ModalCloseBtn onClose={onClose} label={t('demo.close')} />
      <div style={{ padding: '22px 22px 26px' }}>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
          marginBottom: 6, fontWeight: 700,
        }}>{t('inside.badge')}</div>
        <div style={{
          fontFamily: FB, fontSize: 18, fontWeight: 700, color: C.tx,
          marginBottom: 10, letterSpacing: -0.2, paddingInlineEnd: 36,
        }}>
          {t(cfg.titleKey)}
        </div>
        <p style={{
          fontFamily: FB, color: C.tm, fontSize: 13, lineHeight: 1.55,
          marginBottom: 18,
        }}>
          {t(cfg.bodyKey)}
        </p>
        <Body />
      </div>
    </Modal>
  );
}

function WhatsInside() {
  const t = useT();
  const [demo, setDemo] = useState(null); // 'pose' | 'rep' | 'cmp' | null
  const cards = [
    { key: 'pose', tag: t('inside.pose.tag'), h: t('inside.pose.h'), d: t('inside.pose.d'), Inner: PoseScreen        },
    { key: 'rep',  tag: t('inside.rep.tag'),  h: t('inside.rep.h'),  d: t('inside.rep.d'),  Inner: RepCounterScreen  },
    { key: 'cmp',  tag: t('inside.cmp.tag'),  h: t('inside.cmp.h'),  d: t('inside.cmp.d'),  Inner: CompareScreen     },
  ];
  return (
    <section id="inside" style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>{t('inside.badge')}</div>
      <h2 style={{ fontFamily: FB, fontSize: 'clamp(24px, 3.6vw, 32px)', fontWeight: 700, marginBottom: 12, letterSpacing: -0.3 }}>
        {t('inside.h2')}
      </h2>
      <p style={{
        fontFamily: FB, color: C.tm, fontSize: 14, maxWidth: 760,
        lineHeight: 1.55, marginBottom: 32,
      }}>
        {t('inside.body')}
      </p>

      <div className="fv-inside-grid" style={{
        display: 'grid', gap: 28, alignItems: 'start',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      }}>
        {cards.map((card) => {
          const Inner = card.Inner;
          return (
            <div key={card.key} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              paddingBottom: 14, // room for the floating "TAP TO TRY" badge
            }}>
              <PhoneFrame tag={card.tag}
                onClick={() => { setDemo(card.key); trackAndOpen('demo_open', { which: card.key }); }}
                label={t(`demo.${card.key}.h`)}
              >
                <Inner />
              </PhoneFrame>
              <div style={{ textAlign: 'center', maxWidth: 280 }}>
                <div style={{
                  fontFamily: FB, fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 6,
                }}>{card.h}</div>
                <div style={{
                  fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.55,
                }}>{card.d}</div>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{
        fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1,
        marginTop: 28, textAlign: 'center',
      }}>
        {t('inside.note')}
      </p>

      {/* Outbound CTA → public sandbox at expo-app.co.il/try where the visitor
          uploads their own clip and runs it through pose detection + rep
          counter live. PhoneFrame mocks above are browse-engagement; this is
          the conversion lever. */}
      <div style={{ textAlign: 'center', marginTop: 22 }}>
        <a href="https://expo-app.co.il/try"
           onClick={() => trackAndOpen('try_click', { from: 'whats_inside' })}
           target="_blank" rel="noopener"
           style={{
             display: 'inline-block',
             fontFamily: FB, fontSize: 14, fontWeight: 700,
             color: '#000', background: C.ac,
             padding: '12px 22px', borderRadius: 0,
             textDecoration: 'none', letterSpacing: 0.2,
           }}>
          {t('inside.tryCta')}
        </a>
      </div>

      <DemoModal which={demo} onClose={() => setDemo(null)} />
    </section>
  );
}

// About: short coach intro section. The portrait slot uses the EXPO mark as a
// placeholder until Ohad ships a real photo into public/coach-portrait.jpg —
// detection is via natural-load fallback. Three credentials in a strip below
// give scannable credibility (background, athletic history, owner-operator).
function AboutCoach() {
  const t = useT();
  const [hasPortrait, setHasPortrait] = useState(false);
  const credentials = [
    { t: t('about.cred1'), s: t('about.cred1.s') },
    { t: t('about.cred2'), s: t('about.cred2.s') },
    { t: t('about.cred3'), s: t('about.cred3.s') },
  ];
  return (
    <section id="about" style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>{t('about.badge')}</div>
      <h2 style={{ fontFamily: FB, fontSize: 'clamp(24px, 3.6vw, 32px)', fontWeight: 700, marginBottom: 24, letterSpacing: -0.3, lineHeight: 1.2, maxWidth: 800 }}>
        {t('about.h2')}
      </h2>

      <div className="fv-about-grid" style={{
        display: 'grid', gap: 28, alignItems: 'start',
        gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)',
      }}>
        {/* Portrait — real photo if present, otherwise a styled placeholder
            with the EXPO mark behind a "PHOTO COMING" caption. */}
        <div style={{
          aspectRatio: '4 / 5', position: 'relative',
          borderRadius: 0, overflow: 'hidden',
          background: `linear-gradient(160deg, ${C.sf} 0%, ${C.sf2} 100%)`,
          border: `1px solid ${C.bd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src="/coach-portrait.jpg" alt="Ohad Yossifoff" loading="lazy"
            decoding="async" width="800" height="1000"
            onLoad={() => setHasPortrait(true)}
            onError={() => setHasPortrait(false)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', display: hasPortrait ? 'block' : 'none',
            }} />
          {!hasPortrait && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <img src="/expo-hero-logo.png" alt="" aria-hidden="true"
                width="320" height="92" decoding="async" loading="lazy"
                style={{ height: 56, width: 'auto', opacity: 0.4, marginBottom: 12 }} />
              <div style={{
                fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 2, fontWeight: 700,
              }}>
                {t('about.photo.note')}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontFamily: FB, fontSize: 15, color: C.tx, lineHeight: 1.6 }}>
            {t('about.p1')}
          </p>
          <p style={{ fontFamily: FB, fontSize: 15, color: C.tx, lineHeight: 1.6 }}>
            {t('about.p2')}
          </p>
          <p style={{ fontFamily: FB, fontSize: 15, color: C.tx, lineHeight: 1.6 }}>
            {t('about.p3')}
          </p>
        </div>
      </div>

      {/* Credentials strip */}
      <div style={{
        marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.bd}`,
        display: 'grid', gap: 18,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
      }}>
        {credentials.map((c, i) => (
          <div key={i}>
            <div style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
              {c.t}
            </div>
            <div style={{
              fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1,
            }}>
              {c.s}
            </div>
          </div>
        ))}
      </div>

      {/* "What I value" — three philosophy tiles. Stronger credibility signal
          than the credentials strip alone because they tell the buyer how
          decisions get made inside the program. */}
      <div style={{ marginTop: 36 }}>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
          marginBottom: 16, fontWeight: 700,
        }}>{t('about.values.h')}</div>
        <div style={{
          display: 'grid', gap: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        }}>
          {[
            { t: t('about.values.t1'), d: t('about.values.d1') },
            { t: t('about.values.t2'), d: t('about.values.d2') },
            { t: t('about.values.t3'), d: t('about.values.d3') },
          ].map((v, i) => (
            <div key={i} style={{
              background: C.sf, border: `0.25px solid ${C.ac4D}`,
              borderRadius: 0, padding: 16,
            }}>
              <div style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 6 }}>
                {v.t}
              </div>
              <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.55 }}>
                {v.d}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// 3-column comparison: Self-coached vs EXPO templates vs Private coaching.
// Frames the price by anchoring against the alternatives. Middle column is
// emphasised (accent border) since it's the option being sold.
function WhyTemplates() {
  const t = useT();
  const rows = [
    { key: 'cost',       label: t('why.row.cost') },
    { key: 'programmed', label: t('why.row.programmed') },
    { key: 'autoreg',    label: t('why.row.autoreg') },
    { key: 'form',       label: t('why.row.form') },
    { key: 'setup',      label: t('why.row.setup') },
  ];
  const cols = [
    { key: 'col1', title: t('why.col1.t'), accent: false },
    { key: 'col2', title: t('why.col2.t'), accent: true  },
    { key: 'col3', title: t('why.col3.t'), accent: false },
  ];
  return (
    <section id="why" style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>{t('why.badge')}</div>
      <h2 style={{ fontFamily: FB, fontSize: 'clamp(24px, 3.6vw, 32px)', fontWeight: 700, marginBottom: 12, letterSpacing: -0.3 }}>
        {t('why.h2')}
      </h2>
      <p style={{
        fontFamily: FB, color: C.tm, fontSize: 14, maxWidth: 720,
        lineHeight: 1.55, marginBottom: 28,
      }}>
        {t('why.body')}
      </p>

      <div className="fv-why-grid" style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        alignItems: 'stretch',
      }}>
        {cols.map((col) => (
          <div key={col.key} style={{
            background: col.accent ? C.sf2 : C.sf,
            border: col.accent ? `2px solid ${C.ac}` : `0.25px solid ${C.ac4D}`,
            borderRadius: 0, padding: '18px 16px',
            display: 'flex', flexDirection: 'column', gap: 12,
            boxShadow: col.accent ? `0 12px 32px -16px ${C.ac}55` : 'none',
          }}>
            <div style={{
              fontFamily: FN, fontSize: 11, letterSpacing: 2, fontWeight: 700,
              color: col.accent ? C.ac : C.tm, textAlign: 'center',
              paddingBottom: 10, borderBottom: `1px solid ${C.bd}`,
            }}>
              {col.title}
            </div>
            {rows.map((row) => (
              <div key={row.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{
                  fontFamily: FN, fontSize: 9, letterSpacing: 1.5, color: C.td, fontWeight: 700,
                }}>
                  {row.label}
                </div>
                <div style={{
                  fontFamily: FB, fontSize: 13, color: col.accent ? C.tx : C.tm,
                  lineHeight: 1.45, fontWeight: col.accent ? 600 : 400,
                }}>
                  {t(`why.${col.key}.${row.key}`)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'center', marginTop: 28,
      }}>
        <a href="#programs" style={{
          ...baseBtn,
          background: C.ac, color: '#000', padding: '12px 24px',
          fontSize: 13, fontWeight: 700, letterSpacing: 1.5, borderRadius: 0,
        }}>
          {t('why.cta')}
        </a>
      </div>
      <p style={{
        fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1,
        marginTop: 18, textAlign: 'center', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto',
        lineHeight: 1.6,
      }}>
        {t('why.note')}
      </p>
    </section>
  );
}

function HowItWorks() {
  const t = useT();
  const steps = [
    { n: '01', t: t('how.01.t'), d: t('how.01.d') },
    { n: '02', t: t('how.02.t'), d: t('how.02.d.tmpl', { bit: CONTACT.bitPhone }) },
    { n: '03', t: t('how.03.t'), d: t('how.03.d') },
    { n: '04', t: t('how.04.t'), d: t('how.04.d') },
  ];
  // FAQ block lives in a dedicated section now (FAQ component); this used to
  // host an inline 4-question version + JSON-LD which we removed to avoid
  // duplicate FAQPage structured data + back-to-back FAQ feel.
  return (
    <section id="how" style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>{t('how.badge')}</div>
      <h2 style={{ fontFamily: FB, fontSize: 'clamp(24px, 3.6vw, 32px)', fontWeight: 700, marginBottom: 12, letterSpacing: -0.3 }}>
        {t('how.h2')}
      </h2>
      <p style={{
        fontFamily: FB, color: C.tm, fontSize: 14, maxWidth: 720,
        lineHeight: 1.55, marginBottom: 24,
      }}>
        {t('how.intro')}
      </p>
      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
      }}>
        {steps.map(s => (
          <div key={s.n} style={{
            background: C.sf, border: `0.25px solid ${C.ac4D}`,
            borderRadius: 0, padding: 14,
          }}>
            <div style={{
              fontFamily: FN, color: C.ac, fontSize: 11, fontWeight: 700,
              letterSpacing: 2, marginBottom: 8,
            }}>
              {s.n}
            </div>
            <div style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{s.t}</div>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.5 }}>{s.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Contact() {
  const t = useT();
  return (
    <section id="contact" style={{
      maxWidth: 720, margin: '0 auto', padding: '40px 16px 32px', textAlign: 'center',
    }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>{t('contact.badge')}</div>
      <h2 style={{ fontFamily: FB, fontSize: 'clamp(22px, 3.2vw, 28px)', fontWeight: 700, marginBottom: 12, letterSpacing: -0.3 }}>
        {t('contact.h2')}
      </h2>
      <p style={{ fontFamily: FB, color: C.tm, fontSize: 14, lineHeight: 1.55, marginBottom: 16 }}>
        {t('contact.body')}
      </p>
      <p style={{
        fontFamily: FN, color: C.td, fontSize: 11, letterSpacing: 1,
        marginBottom: 24,
      }}>
        {t('contact.hours')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
        <a href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(t('contact.wa.prefill'))}`}
          target="_blank" rel="noopener noreferrer"
          onClick={() => trackAndOpen('contact_click', { channel: 'whatsapp', source: 'contact_section' })}
          style={{
            ...baseBtn,
            background: C.ac, color: '#000', padding: '10px 20px',
            fontSize: 12, fontWeight: 700, letterSpacing: 1.5, borderRadius: 0,
          }}>
          {t('contact.cta.whatsapp')}
        </a>
        <a href={`mailto:${CONTACT.email}`} style={{
          ...baseBtn,
          background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '10px 20px',
          fontSize: 12, fontWeight: 700, letterSpacing: 1.5, borderRadius: 0,
        }}>
          {t('contact.cta.email')}
        </a>
        <a href={CONTACT.instagram} target="_blank" rel="noopener noreferrer" style={{
          ...baseBtn,
          background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '10px 20px',
          fontSize: 12, fontWeight: 700, letterSpacing: 1.5, borderRadius: 0,
        }}>
          {t('contact.cta.instagram')}
        </a>
      </div>
    </section>
  );
}

// Testimonials: 3 placeholder slots wired up so we can drop real client
// quotes (with photo + permission) without touching component structure
// later. Each entry below has an `empty: true` flag — the renderer shows a
// "coming soon" plate for empty entries so the layout still reads as
// finished. Replace `empty: true` with `quote / who / role / photoSrc`
// once a real testimonial is cleared.
const TESTIMONIALS = [
  // Example shape (uncomment + fill once you have permission):
  // {
  //   quote: 'הראשון בלוק אחרי כמה שנים בלי תוכנית. כל אימון ידעתי בדיוק מה לעשות.',
  //   who: 'Diego Day',
  //   role: 'Hypertrophy 16',
  //   photoSrc: '/testimonials/diego.jpg',
  // },
  { empty: true },
  { empty: true },
  { empty: true },
];

function Testimonials() {
  const t = useT();
  const realCount = TESTIMONIALS.filter(x => !x.empty).length;
  return (
    <section id="testimonials" style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700, textAlign: 'center',
      }}>{t('testi.badge')}</div>
      <h2 style={{ fontFamily: FB, fontSize: 'clamp(22px, 3.2vw, 28px)', fontWeight: 700, marginBottom: 24, letterSpacing: -0.3, textAlign: 'center' }}>
        {t('testi.h2')}
      </h2>
      {realCount === 0 && (
        <p style={{
          fontFamily: FB, color: C.tm, fontSize: 13, lineHeight: 1.55,
          maxWidth: 560, margin: '0 auto 24px', textAlign: 'center',
        }}>
          {t('testi.empty')}
        </p>
      )}
      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
      }}>
        {TESTIMONIALS.map((q, i) => (
          <div key={i} style={{
            background: C.sf, border: `0.25px solid ${C.ac4D}`,
            borderRadius: 0, padding: 18,
            display: 'flex', flexDirection: 'column', gap: 12,
            minHeight: 200,
          }}>
            {q.empty ? (
              <>
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 1.5,
                  fontWeight: 700, textAlign: 'center', minHeight: 90,
                  border: `1px dashed ${C.bd}`, borderRadius: 0,
                }}>
                  QUOTE · COMING SOON
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: C.sf2, border: `1px solid ${C.bd}`,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 1, fontWeight: 700 }}>NAME</div>
                    <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 0.6, marginTop: 2 }}>PROGRAM</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  flex: 1, fontFamily: FB, fontSize: 14, color: C.tx,
                  lineHeight: 1.55,
                }}>
                  <span style={{ color: C.ac, fontFamily: FN, fontSize: 18, marginRight: 4, verticalAlign: '-2px' }}>“</span>
                  {q.quote}
                  <span style={{ color: C.ac, fontFamily: FN, fontSize: 18, marginLeft: 4, verticalAlign: '-2px' }}>”</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src={q.photoSrc} alt={q.who} loading="lazy" decoding="async"
                    width="72" height="72"
                    style={{
                      width: 36, height: 36, borderRadius: '50%',
                      objectFit: 'cover', border: `1px solid ${C.bd}`,
                    }}
                    onError={e => { e.currentTarget.style.display = 'none'; }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, fontWeight: 700 }}>{q.who}</div>
                    <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 0.6, marginTop: 2 }}>{q.role}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// Quiz scoring — given the user's answers, score every program and return
// the matches sorted by fit. Distilled from the full Initial Assessment Google
// Form so the public-side surface stays short (6 Q vs 25). Real follow-up
// (sleep, stress, body history, injury detail) lives behind the deep-link to
// the actual form on the result screen.
//
// Scoring rules:
//   • Hard filter: rehab state.
//       answer 'rehab' → only programs with forRehab='only' survive
//       answer 'fine'/'minor'/'rom' → drop programs with forRehab='only'
//   • Hard filter: couples.
//       answer 'couple' → only couples programs
//       answer 'solo' → drop couples programs
//   • Soft score:
//       +3 if level matches (mapped from q2 + q3)
//       +3 if goal in program.quiz.goals
//       +2 if daysPerWeek covers the user's chosen frequency
// Best 1 = 'BEST MATCH'; second is shown if score ≥ 5 ('ALSO WORKS').
function scoreQuiz(answers) {
  const level = quizLevel(answers);
  const goal  = answers.goal;
  const days  = answers.days;
  const isCouple = answers.who === 'couple';
  const isRehab  = answers.body === 'rehab';
  const survivors = PROGRAMS.filter(p => {
    const q = p.quiz; if (!q) return false;
    if (isCouple && !q.couplesOnly) return false;
    if (!isCouple && q.couplesOnly) return false;
    if (isRehab && q.forRehab !== 'only') return false;
    if (!isRehab && q.forRehab === 'only') return false;
    return true;
  });
  const scored = survivors.map(p => {
    let s = 0;
    if (level && p.quiz.levels.includes(level)) s += 3;
    if (goal && p.quiz.goals.includes(goal)) s += 3;
    if (days && p.quiz.daysPerWeek.includes(days)) s += 2;
    return { p, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.filter(x => x.s > 0);
}

function quizLevel(a) {
  if (a.first === 'never') return 'beginner';
  if (a.exp === 'lt6')   return 'beginner';
  if (a.exp === '6to12') return 'beginner';
  if (a.exp === '1to3')  return 'intermediate';
  if (a.exp === 'gt3')   return 'advanced';
  return 'intermediate';
}

// Build the deep-link to the full Initial Assessment Google Form, pre-filling
// what we already know from the quiz so the buyer doesn't re-answer the same
// six things. The form's prefill keys come from the form itself — these are
// stable per question once the form is published. If Ohad reorders the form,
// these IDs need updating; currently they map to the request-edit-access
// fallback URL (Google forces signin for /edit), so until we generate a real
// public viewform URL with entry IDs, we link to the form's normal /viewform
// endpoint without pre-fill.
const FULL_FORM_VIEWFORM = 'https://docs.google.com/forms/d/1KtA2M5yQZYM9JFwUm5eQRD6QED8jBrd8bJjJTqp58Mk/viewform';

function QuizModal({ open, onClose }) {
  const t = useT();
  const STEPS = ['who', 'first', 'exp', 'body', 'goal', 'days', 'result'];
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  // Q3 (experience length) is skipped if the user is a total beginner.
  const stepsForRun = answers.first === 'never'
    ? STEPS.filter(s => s !== 'exp')
    : STEPS;
  const totalQuestions = stepsForRun.length - 1; // exclude 'result' from the X/N count

  // Reset state every time the modal is reopened, so a second visit doesn't
  // resume a half-finished run.
  useEffect(() => {
    if (open) { setAnswers({}); setStep(0); }
  }, [open]);

  const setAns = (key, val) => {
    setAnswers(a => ({ ...a, [key]: val }));
    // Auto-advance: clicking an option moves to the next step. Feels more
    // natural than tapping NEXT for every question.
    setTimeout(() => setStep(s => Math.min(s + 1, stepsForRun.length - 1)), 140);
  };

  const goBack = () => setStep(s => Math.max(s - 1, 0));
  const restart = () => { setAnswers({}); setStep(0); };

  const currentKey = stepsForRun[step];
  const stepNum = Math.min(step + 1, totalQuestions);

  // ───── question registry ─────
  // Each entry: { q: i18n key, opts: [{value, label}] }
  const Q = {
    who: {
      q: 'quiz.q1',
      key: 'who',
      opts: [
        { v: 'solo',   l: 'quiz.q1.solo' },
        { v: 'couple', l: 'quiz.q1.couple' },
      ],
    },
    first: {
      q: 'quiz.q2',
      key: 'first',
      opts: [
        { v: 'never',  l: 'quiz.q2.never' },
        { v: 'before', l: 'quiz.q2.before' },
      ],
    },
    exp: {
      q: 'quiz.q3',
      key: 'exp',
      opts: [
        { v: 'lt6',   l: 'quiz.q3.lt6' },
        { v: '6to12', l: 'quiz.q3.6to12' },
        { v: '1to3',  l: 'quiz.q3.1to3' },
        { v: 'gt3',   l: 'quiz.q3.gt3' },
      ],
    },
    body: {
      q: 'quiz.q4',
      key: 'body',
      opts: [
        { v: 'fine',  l: 'quiz.q4.fine' },
        { v: 'minor', l: 'quiz.q4.minor' },
        { v: 'rom',   l: 'quiz.q4.rom' },
        { v: 'rehab', l: 'quiz.q4.rehab' },
      ],
    },
    goal: {
      q: 'quiz.q5',
      key: 'goal',
      opts: [
        { v: 'lose_weight',    l: 'quiz.q5.lose' },
        { v: 'muscle',         l: 'quiz.q5.muscle' },
        { v: 'strength',       l: 'quiz.q5.strength' },
        { v: 'general_health', l: 'quiz.q5.health' },
        { v: 'sport',          l: 'quiz.q5.sport' },
      ],
    },
    days: {
      q: 'quiz.q6',
      key: 'days',
      opts: [
        { v: 2, l: 'quiz.q6.2' },
        { v: 3, l: 'quiz.q6.3' },
        { v: 4, l: 'quiz.q6.4' },
        { v: 5, l: 'quiz.q6.5' },
      ],
    },
  };

  // ───── result rendering ─────
  let body;
  if (currentKey === 'result') {
    const matches = scoreQuiz(answers).slice(0, 2);
    body = (
      <div>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
          marginBottom: 6, fontWeight: 700,
        }}>{t('quiz.r.h')}</div>
        <p style={{
          fontFamily: FB, color: C.tm, fontSize: 13, lineHeight: 1.55,
          marginBottom: 18,
        }}>
          {t('quiz.r.body')}
        </p>
        {matches.length === 0 ? (
          <div style={{
            background: C.sf2, border: `0.25px solid ${C.ac4D}`,
            borderRadius: 0, padding: 16, marginBottom: 18,
            fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.55,
          }}>
            {t('quiz.r.empty')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {matches.map((m, i) => {
              const isBest = i === 0;
              return (
                <a key={m.p.id} href={`#/programs/${m.p.id}`} onClick={onClose}
                  style={{
                    display: 'block', textDecoration: 'none',
                    background: isBest ? C.sf2 : C.sf,
                    border: isBest ? `2px solid ${C.ac}` : `0.25px solid ${C.ac4D}`,
                    borderRadius: 0, padding: 14,
                    boxShadow: isBest ? `0 12px 32px -16px ${C.ac}55` : 'none',
                    color: 'inherit',
                  }}>
                  <div style={{
                    fontFamily: FN, fontSize: 9, letterSpacing: 2, fontWeight: 700,
                    color: C.ac, marginBottom: 6,
                  }}>
                    {isBest ? t('quiz.r.fit.high') : t('quiz.r.fit.med')}
                  </div>
                  <div style={{
                    fontFamily: FB, fontSize: 16, fontWeight: 700, color: C.tx, marginBottom: 4,
                  }}>{m.p.title}</div>
                  <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.5 }}>
                    {m.p.summary}
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.bd}`,
                  }}>
                    <span style={{ fontFamily: FN, fontSize: 11, color: C.td }}>{m.p.duration}</span>
                    <span style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, color: C.ac }}>
                      {m.p.price} ₪
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        <div style={{
          background: C.sf2, border: `0.25px solid ${C.ac4D}`,
          borderRadius: 0, padding: 14, marginBottom: 14,
        }}>
          <div style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 6 }}>
            {t('quiz.r.full.h')}
          </div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.55, marginBottom: 12 }}>
            {t('quiz.r.full.body')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <a href={FULL_FORM_VIEWFORM} target="_blank" rel="noopener noreferrer"
              onClick={() => trackAndOpen('quiz_full_form', answers)}
              style={{
                ...baseBtn,
                background: C.ac, color: '#000', padding: '10px 16px',
                fontSize: 12, fontWeight: 700, letterSpacing: 1.2, borderRadius: 0,
              }}>
              {t('quiz.r.full.cta')}
            </a>
            <a href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(t('contact.wa.prefill'))}`}
              target="_blank" rel="noopener noreferrer"
              onClick={() => trackAndOpen('contact_click', { channel: 'whatsapp', source: 'quiz_result' })}
              style={{
                ...baseBtn,
                background: 'transparent', color: C.tm,
                border: `1px solid ${C.bd}`, padding: '10px 16px',
                fontSize: 12, fontWeight: 700, letterSpacing: 1.2, borderRadius: 0,
              }}>
              {t('quiz.r.wa.cta')}
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button onClick={restart} style={{
            ...baseBtn,
            background: 'transparent', color: C.tm,
            border: `1px solid ${C.bd}`, padding: '8px 14px',
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, borderRadius: 0,
          }}>
            {t('quiz.restart')}
          </button>
        </div>
      </div>
    );
  } else {
    const cur = Q[currentKey];
    const selected = answers[cur.key];
    body = (
      <div>
        <div style={{
          fontFamily: FN, color: C.td, fontSize: 10, letterSpacing: 2, fontWeight: 700,
          marginBottom: 12,
        }}>
          {t('quiz.step.tmpl', { n: stepNum, total: totalQuestions })}
        </div>
        <div style={{
          fontFamily: FB, fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 18,
          lineHeight: 1.3,
        }}>
          {t(cur.q)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {cur.opts.map(o => {
            const on = selected === o.v;
            return (
              <button key={String(o.v)} onClick={() => setAns(cur.key, o.v)}
                style={{
                  ...baseBtn,
                  display: 'block', width: '100%', textAlign: 'start',
                  background: on ? C.acD : C.sf2,
                  color: on ? C.ac : C.tx,
                  border: on ? `2px solid ${C.ac}` : `0.25px solid ${C.ac4D}`,
                  padding: '12px 14px', borderRadius: 0,
                  fontFamily: FB, fontSize: 14, fontWeight: on ? 700 : 500,
                  letterSpacing: 0,
                }}>
                {t(o.l)}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={goBack} disabled={step === 0} style={{
            ...baseBtn,
            background: 'transparent', color: step === 0 ? C.td : C.tm,
            border: `1px solid ${C.bd}`, padding: '8px 14px',
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, borderRadius: 0,
            opacity: step === 0 ? 0.4 : 1,
          }}>
            {t('quiz.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={t('quiz.modal.title')} maxWidth={520}>
      <ModalCloseBtn onClose={onClose} label={t('quiz.modal.close')} />
      <div style={{ padding: '22px 22px 22px' }}>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
          marginBottom: 4, fontWeight: 700,
        }}>{t('quiz.badge')}</div>
        <div style={{
          fontFamily: FB, fontSize: 20, fontWeight: 700, color: C.tx, marginBottom: 22,
          letterSpacing: -0.2, paddingInlineEnd: 36,
        }}>{t('quiz.modal.title')}</div>
        {body}
      </div>
    </Modal>
  );
}

// QuizSection: a small home-page section that pitches the quiz and opens the
// modal. Lives between the catalog and the WhatsInside section so the user
// who scrolled the catalog without clicking has a guided next move.
function QuizSection({ onOpen }) {
  const t = useT();
  return (
    <section id="quiz" style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{
        background: `linear-gradient(135deg, ${C.sf2} 0%, ${C.sf} 100%)`,
        border: `1px solid ${C.ac4D}`, borderRadius: 0,
        padding: '28px 22px', textAlign: 'center',
      }}>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
          marginBottom: 8, fontWeight: 700,
        }}>{t('quiz.badge')}</div>
        <h2 style={{
          fontFamily: FB, fontSize: 'clamp(22px, 3.2vw, 28px)', fontWeight: 700,
          marginBottom: 12, letterSpacing: -0.3,
        }}>{t('quiz.h2')}</h2>
        <p style={{
          fontFamily: FB, color: C.tm, fontSize: 14, lineHeight: 1.55,
          maxWidth: 620, margin: '0 auto 18px',
        }}>{t('quiz.body')}</p>
        <button onClick={onOpen} style={{
          ...baseBtn,
          background: C.ac, color: '#000', padding: '12px 24px',
          fontSize: 13, fontWeight: 700, letterSpacing: 1.5, borderRadius: 0,
        }}>
          {t('quiz.cta')}
        </button>
      </div>
    </section>
  );
}

// Israeli trust signals — five tiles that pre-empt the wallet-out moment.
// Bit, Green Invoice, מע״מ included, 7-day refund, Hebrew WhatsApp. Lives
// between WhyTemplates and Testimonials so it follows the price comparison
// directly. Icon glyphs are stroke-only SVG to stay within the design system.
function TrustStrip() {
  const t = useT();
  // Icons inline so the tiles read at a glance without the cognitive cost of
  // switching to text-only credibility blocks. Stroke-only matches the rest
  // of the site (header external-link icon, share, 404).
  const stroke = {
    fill: 'none', stroke: C.ac, strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  const items = [
    { t: t('trust.bit.t'), s: t('trust.bit.s'), icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path d="M7 10v5M11 10v5M15 10v5" />
      </svg>
    ) },
    { t: t('trust.invoice.t'), s: t('trust.invoice.s'), icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
        <path d="M6 3h9l4 4v14a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V3z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h7M9 17h5" />
      </svg>
    ) },
    { t: t('trust.vat.t'), s: t('trust.vat.s'), icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
        <path d="M5 8h14l-1.5 11a2 2 0 0 1-2 1.7H8.5A2 2 0 0 1 6.5 19L5 8z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        <path d="M9 13l3 3 3-3" />
      </svg>
    ) },
    { t: t('trust.refund.t'), s: t('trust.refund.s'), icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-3.5-7.1" />
        <path d="M21 4v5h-5" />
      </svg>
    ) },
    { t: t('trust.he.t'), s: t('trust.he.s'), icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-3-6.7L21 4l-1 4-3.6-1" />
        <path d="M8 11h8M8 15h5" />
      </svg>
    ) },
  ];
  return (
    <section id="trust" style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 18, fontWeight: 700,
      }}>{t('trust.badge')}</div>
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
      }}>
        {items.map((it, i) => (
          <div key={i} style={{
            background: C.sf, border: `0.25px solid ${C.ac4D}`,
            borderRadius: 0, padding: 14,
            display: 'flex', flexDirection: 'column', gap: 8,
            alignItems: 'flex-start', textAlign: 'start',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 0,
              background: C.acD, border: `1px solid ${C.ac4D}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {it.icon}
            </div>
            <div style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: C.tx }}>
              {it.t}
            </div>
            <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.5 }}>
              {it.s}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// FAQ — eight common pre-buy questions, expandable details. Lives in its own
// section so it can be linked from nav + scroll-spied. Each item is a real
// <details> element so it works without JS, gets free keyboard support, and
// lands in the FAQPage structured data block below for Google rich results.
function FAQ() {
  const t = useT();
  const items = Array.from({ length: 8 }, (_, i) => ({
    q: t(`faq.q${i + 1}`),
    a: t(`faq.a${i + 1}`),
  }));
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(it => ({
      '@type': 'Question', name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
  return (
    <section id="faq" style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 16px' }}>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>{t('faq.badge')}</div>
      <h2 style={{ fontFamily: FB, fontSize: 'clamp(24px, 3.6vw, 32px)', fontWeight: 700, marginBottom: 12, letterSpacing: -0.3 }}>
        {t('faq.h2')}
      </h2>
      <p style={{
        fontFamily: FB, color: C.tm, fontSize: 14, maxWidth: 720,
        lineHeight: 1.55, marginBottom: 24,
      }}>
        {t('faq.body')}
      </p>
      {/* Native <details>: keyboard-accessible, no JS needed, indexable.
          Tweaked summary styling (no default arrow, custom + → × glyph). */}
      <style>{`
        .fv-faq-item summary { list-style: none; cursor: pointer; }
        .fv-faq-item summary::-webkit-details-marker { display: none; }
        .fv-faq-item .fv-faq-glyph { transition: transform 200ms ease; }
        .fv-faq-item[open] .fv-faq-glyph { transform: rotate(45deg); }
      `}</style>
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
      }}>
        {items.map((it, i) => (
          <details key={i} className="fv-faq-item" style={{
            background: C.sf, border: `0.25px solid ${C.ac4D}`,
            borderRadius: 0, padding: '14px 16px',
          }}>
            <summary style={{
              display: 'flex', justifyContent: 'space-between', gap: 10,
              alignItems: 'flex-start',
            }}>
              <span style={{
                fontFamily: FB, fontSize: 14, fontWeight: 700, color: C.tx,
                lineHeight: 1.4, flex: 1,
              }}>
                {it.q}
              </span>
              <span className="fv-faq-glyph" aria-hidden="true" style={{
                fontFamily: FN, fontSize: 18, fontWeight: 700, color: C.ac,
                lineHeight: 1, marginTop: 2, flex: '0 0 auto',
              }}>+</span>
            </summary>
            <div style={{
              fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.65,
              paddingTop: 10, marginTop: 10, borderTop: `1px solid ${C.bd}`,
            }}>
              {it.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  const t = useT();
  return (
    <footer style={{
      borderTop: `1px solid ${C.bd}`, padding: '40px 16px 24px',
      maxWidth: 1200, margin: '40px auto 0',
    }}>
      {/* Footer lead capture — second touch point for the visitor who scrolled
          past the hero without subscribing. */}
      <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: `1px solid ${C.bd}` }}>
        <LeadCapture context="footer" />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandMark height={14} />
          <span style={{ fontFamily: FN, color: C.td, fontSize: 11 }}>
            {t('footer.copy.tmpl', { year: new Date().getFullYear() })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <a href="https://expo-app.co.il" target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>
            {t('footer.portal')}
          </a>
          <a href={CONTACT.instagram} target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>
            {t('footer.instagram')}
          </a>
        </div>
      </div>
    </footer>
  );
}

function SampleWeek({ sampleWeek, accent }) {
  const t = useT();
  if (!sampleWeek) {
    return (
      <div style={{
        background: C.sf, border: `1px dashed ${C.bd}`, borderRadius: 0,
        padding: 28, textAlign: 'center', color: C.td,
        fontFamily: FN, fontSize: 12, letterSpacing: 1,
      }}>
        {t('detail.sample.empty')}
      </div>
    );
  }
  const days = Object.entries(sampleWeek);
  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`,
    }}>
      {days.map(([dayKey, exercises]) => {
        const letter = dayKey.startsWith('day') ? dayKey.replace('day', '').toUpperCase() : dayKey;
        const label = t('detail.day.label.tmpl', { x: letter });
        return (
          <div key={dayKey} style={{
            background: C.sf, border: `0.25px solid ${C.ac4D}`,
            borderRadius: 0, padding: 14,
          }}>
            <div style={{
              fontFamily: FN, fontSize: 11, color: accent || C.ac, fontWeight: 700,
              letterSpacing: 2, marginBottom: 12,
            }}>
              {label}
            </div>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(exercises || []).map((ex, i) => (
                <li key={i} style={{
                  paddingBottom: 10, borderBottom: i < exercises.length - 1 ? `1px solid ${C.bd}` : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: FB, fontSize: 14, color: C.tx, fontWeight: 600 }}>{ex.title}</span>
                    <span style={{ fontFamily: FN, fontSize: 12, color: C.tm, whiteSpace: 'nowrap' }}>{ex.prescribed}</span>
                  </div>
                  {(ex.tempo || ex.notes) && (
                    <div style={{ fontFamily: FN, fontSize: 11, color: C.td, marginTop: 4 }}>
                      {ex.tempo ? t('detail.tempo.tmpl', { tempo: ex.tempo }) : ''}
                      {ex.tempo && ex.notes ? ' · ' : ''}
                      {ex.notes || ''}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function ProgramDetail({ program }) {
  const t = useT();
  useEffect(() => { window.scrollTo(0, 0); }, [program.id]);
  // Inject Product structured data so Google + WhatsApp render rich previews.
  // Cleaned up on unmount so we don't leak stale schema across routes.
  useEffect(() => {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: program.title,
      description: program.summary,
      sku: program.id,
      brand: { '@type': 'Brand', name: 'EXPO' },
      category: 'Training Program',
      offers: {
        '@type': 'Offer',
        priceCurrency: program.currency || 'NIS',
        price: program.price,
        availability: 'https://schema.org/InStock',
        url: `https://expo-il.co.il/#/programs/${program.id}`,
      },
    };
    const tag = document.createElement('script');
    tag.type = 'application/ld+json';
    tag.dataset.programLd = program.id;
    tag.textContent = JSON.stringify(ld);
    document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, [program.id, program.title, program.summary, program.price, program.currency]);
  const weekCount = (program.duration || '').split(' ')[0] || '';
  const currency = t('card.currency.' + program.currency) === 'card.currency.' + program.currency ? program.currency : t('card.currency.' + program.currency);
  return (
    <article style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px 80px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 24, flexWrap: 'wrap',
      }}>
        <a href="#/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: FN, fontSize: 12, color: C.tm, letterSpacing: 1,
        }}>
          {t('detail.back')}
        </a>
        <ShareButton programId={program.id} programTitle={program.title} size="lg" />
      </div>

      <header style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18, alignItems: 'center', justifyContent: 'center' }}>
          <span style={{
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            background: 'transparent', border: `0.25px solid ${C.ac}`, color: C.ac, padding: '4px 10px', borderRadius: 0,
            border: `1px solid ${C.ac4D}`,
          }}>{program.tag.toUpperCase()}</span>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.td }}>{program.duration}</span>
        </div>
        <h1 style={{
          fontFamily: FB, fontSize: 'clamp(28px, 4.5vw, 42px)', fontWeight: 700,
          lineHeight: 1.1, marginBottom: 10, letterSpacing: -0.5,
        }}>
          {program.title}
        </h1>
        <div style={{ fontFamily: FB, fontSize: 15, color: C.tm, marginBottom: 16 }}>{program.audience}</div>
        <p style={{
          fontFamily: FB, fontSize: 15, color: C.tx, lineHeight: 1.6,
          maxWidth: 760, marginBottom: 18, marginLeft: 'auto', marginRight: 'auto',
        }}>
          {program.summary}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ProgramMeta p={program} />
        </div>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{
          fontFamily: FN, fontSize: 11, color: C.ac, fontWeight: 700,
          letterSpacing: 3, marginBottom: 14,
        }}>
          {t('detail.section.different')}
        </h2>
        <ul style={{
          listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        }}>
          {program.highlights.map((h, i) => (
            <li key={i} style={{
              background: C.sf, border: `0.25px solid ${C.ac4D}`, borderRadius: 0,
              padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start',
              justifyContent: 'center',
              fontFamily: FB, fontSize: 14, color: C.tx, lineHeight: 1.5, textAlign: 'center',
            }}>
              <span style={{ color: C.ac, fontFamily: FN, fontWeight: 700, marginTop: 1 }}>›</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{
          fontFamily: FN, fontSize: 11, color: C.ac, fontWeight: 700,
          letterSpacing: 3, marginBottom: 14,
        }}>
          {t('detail.section.sample')}
        </h2>
        <p style={{ fontFamily: FB, color: C.tm, fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
          {t('detail.sample.body.tmpl', { weeks: weekCount })}
        </p>
        <SampleWeek sampleWeek={program.sampleWeek} accent={C.ac} />
      </section>

      <section style={{
        background: C.sf, border: `1px solid ${C.ac}`, borderRadius: 0,
        padding: 22, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        justifyContent: 'center', gap: 24,
      }}>
        <div>
          <div style={{
            fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 2, marginBottom: 4,
          }}>{t('detail.price')}</div>
          <div style={{ fontFamily: FN, fontSize: 30, fontWeight: 700, color: C.tx, lineHeight: 1 }}>
            {program.price} <span style={{ fontSize: 15, color: C.tm }}>{currency}</span>
          </div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 6 }}>
            {t('detail.price.note')}
          </div>
        </div>
        <a href={buildBuyLink(program, t)} target="_blank" rel="noopener noreferrer"
          onClick={() => trackAndOpen('buy_click', { programId: program.id, source: 'detail_page' })}
          style={{
            ...baseBtn,
            background: C.ac, color: '#000', padding: '12px 24px',
            fontSize: 13, fontWeight: 700, letterSpacing: 1.5, borderRadius: 0,
          }}>
          {t('detail.cta.buy')}
        </a>
      </section>
    </article>
  );
}

function Home({ onOpenQuiz }) {
  return (
    <>
      <Hero onOpenQuiz={onOpenQuiz} />
      <Catalog />
      <QuizSection onOpen={onOpenQuiz} />
      <WhatsInside />
      <AboutCoach />
      <WhyTemplates />
      <TrustStrip />
      <Testimonials />
      <HowItWorks />
      <FAQ />
      <Contact />
    </>
  );
}

// Friendly 404 — replaces the silent home-redirect when a /programs/<id>
// link points at a slug that no longer exists.
function NotFound() {
  const t = useT();
  return (
    <section style={{
      maxWidth: 720, margin: '0 auto', padding: '64px 16px 80px', textAlign: 'center',
    }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 4,
        marginBottom: 14, fontWeight: 700,
      }}>
        {t('notfound.badge')}
      </div>
      <h1 style={{
        fontFamily: FB, fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 700,
        marginBottom: 14, letterSpacing: -0.4, lineHeight: 1.15,
      }}>
        {t('notfound.h2')}
      </h1>
      <p style={{
        fontFamily: FB, color: C.tm, fontSize: 14, lineHeight: 1.6,
        maxWidth: 520, margin: '0 auto 28px',
      }}>
        {t('notfound.body')}
      </p>
      <a href="#/" style={{
        ...baseBtn,
        background: C.ac, color: '#000', padding: '12px 24px',
        fontSize: 13, fontWeight: 700, letterSpacing: 1.5, borderRadius: 0,
      }}>
        {t('notfound.cta')}
      </a>
    </section>
  );
}

// ExitIntentModal: a single-shot lead capture that fires at the first of
//   • mouse leaves the viewport top (desktop intent-to-leave)
//   • user scrolls past 50% of the page
// once per session (sessionStorage flag). Reuses LeadCapture under the hood
// so the email lands in the same Supabase `leads` table with a different
// context tag ('exit_intent') the trainer panel can filter on later.
function ExitIntentModal() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    // Don't re-trigger once it has fired in this session, even if the user
    // doesn't submit. Closing via × counts as "seen" and the modal stays gone
    // until the visitor opens a new tab.
    if (typeof window === 'undefined') return;
    try {
      if (sessionStorage.getItem('expo-il-exit-seen') === '1') {
        fired.current = true;
        return;
      }
    } catch {}

    const trigger = () => {
      if (fired.current) return;
      fired.current = true;
      try { sessionStorage.setItem('expo-il-exit-seen', '1'); } catch {}
      // Small grace window so the modal doesn't fight a click the user is
      // already mid-action on (e.g. tapping a card).
      setTimeout(() => setOpen(true), 120);
    };

    // Mouse-leave-top: only fire when the cursor leaves through the top edge
    // (intent to switch tab / close), not when the cursor leaves sideways.
    const onMouseOut = (e) => {
      if (e.clientY > 0) return;
      if (e.relatedTarget || e.toElement) return;
      trigger();
    };

    let lastScrollFire = 0;
    const onScroll = () => {
      // Throttle: scroll fires constantly; we only need the first time we
      // cross 50% of the document height.
      if (fired.current) return;
      const now = Date.now();
      if (now - lastScrollFire < 200) return;
      lastScrollFire = now;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      const y = window.scrollY || 0;
      if (docH <= winH) return;
      const pct = (y + winH) / docH;
      if (pct >= 0.5) trigger();
    };

    document.addEventListener('mouseout', onMouseOut);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t('exit.title')} maxWidth={460}>
      <ModalCloseBtn onClose={() => setOpen(false)} label={t('exit.close')} />
      <div style={{ padding: '24px 22px' }}>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
          marginBottom: 8, fontWeight: 700,
        }}>{t('exit.title')}</div>
        <p style={{
          fontFamily: FB, color: C.tx, fontSize: 14, lineHeight: 1.6,
          marginBottom: 18,
        }}>
          {t('exit.body')}
        </p>
        <LeadCapture context="exit_intent" compact />
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button onClick={() => setOpen(false)} style={{
            ...baseBtn,
            background: 'transparent', color: C.td,
            border: 'none', padding: '6px 10px',
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
          }}>
            {t('exit.dismiss')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// StickyCTA: thin fixed bar at the bottom of the viewport on mobile only.
// Hidden until the user scrolls past the hero, hidden on the program-detail
// route (that page has its own buy CTA), and hidden when the contact section
// is on screen (the WhatsApp button is already there).
function StickyCTA() {
  const t = useT();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      // Hide near the bottom (last ~360px) so it doesn't sit on top of Contact / Footer.
      const nearBottom = (y + winH) > (docH - 360);
      setVisible(y > 480 && !nearBottom);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const href = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(t('contact.wa.prefill'))}`;
  return (
    <div className="fv-sticky-cta" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      background: C.sf, borderTop: `1px solid ${C.bd}`,
      padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      transform: visible ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 200ms ease',
      zIndex: 90,
      // Avoid sitting under iOS home indicator.
      paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
    }}>
      <span style={{
        flex: 1, fontFamily: FB, fontSize: 12, color: C.tm,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {t('cta.sticky.label')}
      </span>
      <a href={href} target="_blank" rel="noopener noreferrer"
        onClick={() => trackAndOpen('contact_click', { channel: 'whatsapp', source: 'sticky_cta' })}
        style={{
          ...baseBtn,
          background: C.ac, color: '#000', padding: '8px 14px',
          fontSize: 11, fontWeight: 700, letterSpacing: 1.5, borderRadius: 0,
          flex: '0 0 auto',
        }}>
        {t('cta.sticky.btn')}
      </a>
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  const t = useT();
  // Quiz modal state lives at the App root so the hero, the dedicated
  // QuizSection, and the nav can all open it from anywhere on the page.
  const [quizOpen, setQuizOpen] = useState(false);
  const openQuiz = () => { setQuizOpen(true); trackAndOpen('quiz_open', {}); };
  let body;
  let isHome = false;
  let docTitleKey = 'doc.title.home';
  let docTitleVars = null;
  if (route.view === 'detail') {
    const program = PROGRAMS.find(p => p.id === route.programId);
    if (program) {
      body = <ProgramDetail program={program} />;
      docTitleKey = 'doc.title.detail.tmpl';
      docTitleVars = { title: program.title };
    } else {
      // No silent redirect — show a real 404 page so visitors with stale links
      // know what happened and can recover.
      body = <NotFound />;
      docTitleKey = 'doc.title.notfound';
    }
  } else {
    body = <Home onOpenQuiz={openQuiz} />;
    isHome = true;
  }

  // Update the browser tab title per route. Doesn't affect OG tags (those are
  // rendered server-side in index.html and need build-time prerendering to vary).
  useEffect(() => {
    document.title = t(docTitleKey, docTitleVars);
  }, [docTitleKey, docTitleVars && docTitleVars.title]);

  // Scroll-fade: add .fv-visible to each <section> once it enters the viewport.
  // Once visible, stay visible (no flicker on scroll-up). Disabled if the
  // browser doesn't support IntersectionObserver — in that case the section
  // stays at its initial transform, so we set the class up-front as fallback.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll('section').forEach((s) => s.classList.add('fv-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('fv-visible');
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    document.querySelectorAll('section').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [docTitleKey]);

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB, textAlign: 'center' }}>
      {/* Stack the "what's inside" grid (phone + tiles) on narrow viewports,
          and hide the sticky CTA on tablet+ where the user can already see
          the nav + buy buttons without scrolling. */}
      <style>{`
        /* Offset section anchors so the sticky 56px header doesn't overlap them. */
        #programs, #quiz, #inside, #about, #why, #trust, #how, #faq, #contact { scroll-margin-top: 64px; }
        /* Modal entrance animations — opacity + subtle pop. */
        @keyframes fv-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fv-pop  { from { opacity: 0; transform: translateY(8px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] > * { animation: none !important; }
        }
        /* Center-align everything by default — root sets text-align:center
           and only the few places that need otherwise (phone-mock inner
           screens, which mimic a left-aligned mobile UI) override locally. */
        /* Scroll-fade: sections start invisible, fade + slide in once visible.
           Honors prefers-reduced-motion. */
        section { opacity: 0; transform: translateY(12px); transition: opacity 600ms ease, transform 600ms ease; }
        section.fv-visible { opacity: 1; transform: translateY(0); }
        @media (prefers-reduced-motion: reduce) {
          section { opacity: 1 !important; transform: none !important; transition: none !important; }
        }
        @media (max-width: 980px) {
          .fv-inside-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 620px) {
          .fv-inside-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 720px) {
          .fv-why-grid { grid-template-columns: 1fr !important; }
          .fv-about-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 721px) {
          .fv-sticky-cta { display: none !important; }
        }
        /* Visible focus ring for keyboard users on every interactive element.
           Mouse users don't see it (focus-visible). */
        a:focus-visible, button:focus-visible {
          outline: 2px solid ${C.ac};
          outline-offset: 2px;
          border-radius: 4px;
        }
        /* Skip-link: visually hidden until focused, then anchored top-left. */
        .fv-skip {
          position: absolute; top: -40px; left: 12px;
          background: ${C.ac}; color: #000; padding: 8px 14px;
          font-family: ${FN}; font-size: 12px; font-weight: 700;
          letter-spacing: 1px; border-radius: 6px;
          z-index: 200; transition: top 150ms;
        }
        .fv-skip:focus { top: 12px; }
      `}</style>
      <a className="fv-skip" href="#programs">Skip to content</a>
      <Nav />
      <main id="main">
        {body}
      </main>
      <Footer />
      {isHome && <StickyCTA />}
      {isHome && <ExitIntentModal />}
      <QuizModal open={quizOpen} onClose={() => setQuizOpen(false)} />
      <Chat />
      <Analytics />
    </div>
  );
}
