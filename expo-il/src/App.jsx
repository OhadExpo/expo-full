import React, { useState, useEffect } from 'react';
import { Analytics, track } from '@vercel/analytics/react';
import { C, FN, FB, CONTACT, buyOnWhatsApp } from './theme';
import { PROGRAMS } from './programs';
import { useT, useLang, setLang } from './i18n';

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
  borderRadius: 8, border: 'none', fontFamily: FB, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', letterSpacing: '0.02em', transition: 'all 0.15s',
};

// Real EXPO assets, copied into /public/ from _branding/ via
// scripts/trim-brand-assets.py.
function IconMark({ size = 32 }) {
  return (
    <img src="/expo-icon.png" alt="EXPO"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.18), display: 'block' }} />
  );
}
function Wordmark({ height = 56 }) {
  return (
    <img src="/expo-logo.png" alt="EXPO"
      style={{ height, width: 'auto', display: 'block', maxWidth: '90%' }} />
  );
}

function LangToggle() {
  const [lang] = useLang();
  const next = lang === 'he' ? 'en' : 'he';
  const label = lang === 'he' ? 'EN' : 'עב';
  return (
    <button onClick={() => setLang(next)} title="Toggle language" style={{
      ...baseBtn,
      background: 'transparent', color: C.tm,
      padding: '6px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1,
      borderRadius: 6, border: `1px solid ${C.bd}`,
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
    { key: 'programs', label: t('nav.programs'), count: null, anchor: 'top'     },
    { key: 'how',      label: t('nav.how'),      count: null, anchor: 'how'     },
    { key: 'contact',  label: t('nav.contact'),  count: null, anchor: 'contact' },
  ];
  const [active, setActive] = useState('programs');
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
          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10,
          marginRight: 12, height: 56,
        }}>
          <IconMark size={28} />
          <img className="fv-wordmark" src="/expo-logo.png" alt="EXPO"
            style={{ height: 18, display: 'block' }} />
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
                borderRadius: 6, padding: '6px 10px',
                fontSize: 12, fontWeight: on ? 700 : 500,
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
            title="Portal" style={{
              ...baseBtn,
              background: 'transparent', color: C.tm,
              padding: '6px 8px', fontSize: 14, borderRadius: 6,
            }}>
            {/* External-link glyph — same stroke-icon style as the coach header */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function Hero() {
  const t = useT();
  return (
    <section id="top" style={{
      maxWidth: 1100, margin: '0 auto', padding: '64px 24px 40px',
      textAlign: 'center',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
        <Wordmark height={92} />
      </div>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 14, fontWeight: 700,
      }}>
        {t('hero.badge')}
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
        <a href="#how" style={{
          ...baseBtn,
          background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '12px 24px',
          fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
        }}>
          {t('hero.cta.how')}
        </a>
      </div>
    </section>
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
          border: `1px solid ${C.bd}`, padding: '3px 8px', borderRadius: 6,
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
  const [hover, setHover] = useState(false);
  const currency = t('card.currency.' + p.currency) === 'card.currency.' + p.currency ? p.currency : t('card.currency.' + p.currency);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.sf,
        border: hover ? `2px solid ${C.ac}` : `0.25px solid ${C.ac4D}`,
        borderRadius: 12, padding: 14,
        display: 'flex', flexDirection: 'column', gap: 12,
        transition: 'border-color 150ms, transform 150ms, box-shadow 150ms, border-width 150ms',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hover ? `0 12px 32px -16px ${C.ac}55` : 'none',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
          background: C.acD, color: C.ac, padding: '4px 10px', borderRadius: 999,
          border: `1px solid ${C.ac4D}`,
        }}>{p.tag.toUpperCase()}</span>
        <span style={{ fontFamily: FN, fontSize: 11, color: C.td }}>{p.duration}</span>
      </div>
      <div>
        <h3 style={{ fontFamily: FB, fontSize: 20, fontWeight: 700, marginBottom: 4, lineHeight: 1.15 }}>{p.title}</h3>
        <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>{p.audience}</div>
      </div>
      <p style={{ fontFamily: FB, fontSize: 13, color: C.tx, opacity: 0.85, lineHeight: 1.55 }}>
        {p.summary}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {p.highlights.map((h, i) => (
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href={`#/programs/${p.id}`} style={{
            ...baseBtn,
            background: 'transparent', color: C.tm,
            border: `1px solid ${C.bd}`, padding: '8px 14px',
            fontSize: 12, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6,
          }}>
            {t('card.view')}
          </a>
          <a href={buildBuyLink(p, t)} target="_blank" rel="noopener noreferrer"
            onClick={() => trackAndOpen('buy_click', { programId: p.id, source: 'catalog_card' })}
            style={{
              ...baseBtn,
              background: C.ac, color: '#000', padding: '8px 16px',
              fontSize: 12, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6,
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {tags.map(tag => {
          const on = active === tag;
          const label = tag === '__all' ? t('catalog.chip.all') : tag.toUpperCase();
          return (
            <button key={tag} onClick={() => setActive(tag)} style={{
              ...baseBtn,
              background: on ? C.acD : 'transparent',
              color: on ? C.ac : C.tm,
              border: on ? `1px solid ${C.ac}` : `1px solid ${C.bd}`,
              padding: '6px 12px', borderRadius: 6,
              fontSize: 11, fontWeight: 700, letterSpacing: 1,
            }}>
              {label}
            </button>
          );
        })}
      </div>
      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
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

// PhoneFrame: a CSS-only mock of a phone showing the portal's "today" screen.
// Renders inline (no PNGs), stays sharp on all DPRs, and contains zero real
// client data. Width is fixed so it composes predictably inside the grid.
function PhoneFrame() {
  const t = useT();
  return (
    <div style={{
      width: 252, maxWidth: '100%', margin: '0 auto',
      borderRadius: 32, padding: 8,
      background: '#0d0d10', border: `1px solid ${C.bd2}`,
      boxShadow: `0 24px 64px -32px ${C.ac}55, 0 0 0 0.5px ${C.ac4D}`,
      position: 'relative',
    }}>
      {/* notch / speaker bar */}
      <div style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
        width: 56, height: 5, borderRadius: 3, background: '#1a1a1f',
      }} />
      <div style={{
        background: C.bg, borderRadius: 24, padding: '28px 12px 14px',
        minHeight: 420, display: 'flex', flexDirection: 'column', gap: 10,
        direction: 'ltr', textAlign: 'left',
      }}>
        {/* App header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: 8, borderBottom: `1px solid ${C.bd}`,
        }}>
          <span style={{
            fontFamily: FN, fontSize: 9, letterSpacing: 2, color: C.ac, fontWeight: 700,
          }}>EXPO</span>
          <span style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1 }}>
            {t('inside.mock.title')}
          </span>
        </div>

        {/* Active set widget (highlighted) */}
        <div style={{
          background: C.acD, border: `1px solid ${C.ac}`,
          borderRadius: 10, padding: '10px 12px',
        }}>
          <div style={{
            fontFamily: FN, fontSize: 8, color: C.ac, letterSpacing: 1.5, fontWeight: 700,
            marginBottom: 4,
          }}>
            {t('inside.mock.set')}
          </div>
          <div style={{ fontFamily: FB, fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 6 }}>
            {t('inside.mock.exa.t')}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{
              flex: 1, background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 6,
              padding: '6px 8px', fontFamily: FN, fontSize: 11, color: C.tx,
            }}>
              90 <span style={{ color: C.tm, fontSize: 9 }}>{t('inside.mock.weight')}</span>
            </div>
            <div style={{
              flex: 1, background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 6,
              padding: '6px 8px', fontFamily: FN, fontSize: 11, color: C.tx,
            }}>
              5 <span style={{ color: C.tm, fontSize: 9 }}>reps</span>
            </div>
            <div style={{
              background: C.ac, color: '#000', borderRadius: 6,
              padding: '6px 10px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1,
            }}>
              ✓
            </div>
          </div>
        </div>

        {/* Other exercises in session — dimmed */}
        {[
          { t: t('inside.mock.exb.t'), s: t('inside.mock.exb.s') },
          { t: t('inside.mock.exc.t'), s: t('inside.mock.exc.s') },
        ].map((ex, i) => (
          <div key={i} style={{
            border: `0.5px solid ${C.bd}`, borderRadius: 10, padding: '8px 12px',
            opacity: 0.55,
          }}>
            <div style={{ fontFamily: FB, fontSize: 12, fontWeight: 600, color: C.tx, marginBottom: 2 }}>
              {ex.t}
            </div>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: 0.5 }}>
              {ex.s}
            </div>
          </div>
        ))}

        {/* Bottom strip — set-tracking dots */}
        <div style={{ flex: 1 }} />
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 6,
          paddingTop: 10, borderTop: `1px solid ${C.bd}`,
        }}>
          {[1, 1, 0, 0].map((on, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: on ? C.ac : 'transparent',
              border: `1px solid ${on ? C.ac : C.bd2}`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WhatsInside() {
  const t = useT();
  const tiles = [
    { t: t('inside.tile1.t'), d: t('inside.tile1.d') },
    { t: t('inside.tile2.t'), d: t('inside.tile2.d') },
    { t: t('inside.tile3.t'), d: t('inside.tile3.d') },
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
        fontFamily: FB, color: C.tm, fontSize: 14, maxWidth: 720,
        lineHeight: 1.55, marginBottom: 28,
      }}>
        {t('inside.body')}
      </p>

      <div style={{
        display: 'grid', gap: 24, alignItems: 'center',
        gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr)',
      }} className="fv-inside-grid">
        <PhoneFrame />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tiles.map((tile, i) => (
            <div key={i} style={{
              background: C.sf, border: `0.25px solid ${C.ac4D}`,
              borderRadius: 12, padding: 14,
            }}>
              <div style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, marginBottom: 6, color: C.tx }}>
                {tile.t}
              </div>
              <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.55 }}>
                {tile.d}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p style={{
        fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1,
        marginTop: 20, textAlign: 'center',
      }}>
        {t('inside.disclaimer')}
      </p>
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
            borderRadius: 12, padding: '18px 16px',
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
          fontSize: 13, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6,
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
  const faq = [
    { q: t('how.faq.q1'), a: t('how.faq.a1') },
    { q: t('how.faq.q2'), a: t('how.faq.a2') },
    { q: t('how.faq.q3'), a: t('how.faq.a3') },
    { q: t('how.faq.q4'), a: t('how.faq.a4') },
  ];
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
            borderRadius: 12, padding: 14,
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

      <div style={{
        marginTop: 40, paddingTop: 28, borderTop: `1px solid ${C.bd}`,
      }}>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
          marginBottom: 16, fontWeight: 700,
        }}>{t('how.faq.h')}</div>
        <div style={{
          display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        }}>
          {faq.map((f, i) => (
            <div key={i} style={{
              background: C.sf, border: `0.25px solid ${C.ac4D}`,
              borderRadius: 12, padding: 14,
            }}>
              <div style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 6, lineHeight: 1.4 }}>
                {f.q}
              </div>
              <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.55 }}>
                {f.a}
              </div>
            </div>
          ))}
        </div>
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
            fontSize: 12, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6,
          }}>
          {t('contact.cta.whatsapp')}
        </a>
        <a href={`mailto:${CONTACT.email}`} style={{
          ...baseBtn,
          background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '10px 20px',
          fontSize: 12, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6,
        }}>
          {t('contact.cta.email')}
        </a>
        <a href={CONTACT.instagram} target="_blank" rel="noopener noreferrer" style={{
          ...baseBtn,
          background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '10px 20px',
          fontSize: 12, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6,
        }}>
          {t('contact.cta.instagram')}
        </a>
      </div>
    </section>
  );
}

function Footer() {
  const t = useT();
  return (
    <footer style={{
      borderTop: `1px solid ${C.bd}`, padding: '24px 16px',
      maxWidth: 1200, margin: '40px auto 0',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      flexWrap: 'wrap', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <IconMark size={22} />
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
    </footer>
  );
}

function SampleWeek({ sampleWeek, accent }) {
  const t = useT();
  if (!sampleWeek) {
    return (
      <div style={{
        background: C.sf, border: `1px dashed ${C.bd}`, borderRadius: 12,
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
            borderRadius: 12, padding: 14,
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
  const weekCount = (program.duration || '').split(' ')[0] || '';
  const currency = t('card.currency.' + program.currency) === 'card.currency.' + program.currency ? program.currency : t('card.currency.' + program.currency);
  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px 80px' }}>
      <a href="#/" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: FN, fontSize: 12, color: C.tm, marginBottom: 24, letterSpacing: 1,
      }}>
        {t('detail.back')}
      </a>

      <header style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18, alignItems: 'center' }}>
          <span style={{
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            background: C.acD, color: C.ac, padding: '4px 10px', borderRadius: 999,
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
          maxWidth: 760, marginBottom: 18,
        }}>
          {program.summary}
        </p>
        <ProgramMeta p={program} />
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
              background: C.sf, border: `0.25px solid ${C.ac4D}`, borderRadius: 12,
              padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start',
              fontFamily: FB, fontSize: 14, color: C.tx, lineHeight: 1.5,
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
        background: C.sf, border: `1px solid ${C.ac}`, borderRadius: 12,
        padding: 22, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        justifyContent: 'space-between', gap: 16,
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
            fontSize: 13, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6,
          }}>
          {t('detail.cta.buy')}
        </a>
      </section>
    </main>
  );
}

function Home() {
  return (
    <>
      <Hero />
      <Catalog />
      <WhatsInside />
      <WhyTemplates />
      <HowItWorks />
      <Contact />
    </>
  );
}

// Friendly 404 — replaces the silent home-redirect when a /programs/<id>
// link points at a slug that no longer exists.
function NotFound() {
  const t = useT();
  return (
    <main style={{
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
        fontSize: 13, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6,
      }}>
        {t('notfound.cta')}
      </a>
    </main>
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
          fontSize: 11, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6,
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
    body = <Home />;
    isHome = true;
  }

  // Update the browser tab title per route. Doesn't affect OG tags (those are
  // rendered server-side in index.html and need build-time prerendering to vary).
  useEffect(() => {
    document.title = t(docTitleKey, docTitleVars);
  }, [docTitleKey, docTitleVars && docTitleVars.title]);

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB }}>
      {/* Stack the "what's inside" grid (phone + tiles) on narrow viewports,
          and hide the sticky CTA on tablet+ where the user can already see
          the nav + buy buttons without scrolling. */}
      <style>{`
        /* Offset section anchors so the sticky 56px header doesn't overlap them. */
        #programs, #inside, #why, #how, #contact { scroll-margin-top: 64px; }
        @media (max-width: 720px) {
          .fv-inside-grid { grid-template-columns: 1fr !important; }
          .fv-why-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 721px) {
          .fv-sticky-cta { display: none !important; }
        }
      `}</style>
      <Nav />
      {body}
      <Footer />
      {isHome && <StickyCTA />}
      <Analytics />
    </div>
  );
}
