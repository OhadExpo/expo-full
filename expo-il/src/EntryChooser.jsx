// EntryChooser — the new homepage on expo-il.co.il.
//
// Full-bleed split screen. Two immersive panels, 50/50 on desktop and
// stacked on mobile. Hovering one panel dims the other (cinema-curtain
// reveal). Brand-tight: only the canonical EXPO palette (#000 bg, cyan
// #39BDFF accent), Nord/JetBrains Mono typography, hairline cyan
// borders consistent with the rest of the platform.
//
// Routes:
//   #/        → this chooser (the entry)
//   #/online  → existing programs catalog (the SaaS / online side)
//   #/gym     → in-person training calendar (the studio side)

import React, { useState, useEffect } from 'react';
import { Analytics, track } from '@vercel/analytics/react';
import { C, FN, FB, EXPO_LOGO_NAV } from './theme';
import { useT, useLang, setLang } from './i18n';

// Google Calendar appointment-scheduler URLs — Ohad's two booking
// surfaces. The chooser sends a visitor straight to one of these on
// CTA click (target="_blank"). Updating either URL only requires a
// single-edit here.
export const GCAL_GYM = 'https://calendar.app.google/wDhdyNKLV9cVucaS7';
export const GCAL_ONLINE = 'https://calendar.app.google/wNCYaWSFzyz44C9H6';

function trackAndOpen(event, payload) {
  try { track(event, payload || {}); } catch {}
}

export default function EntryChooser() {
  const t = useT();
  const [lang] = useLang();
  const heb = lang === 'he';
  const [hover, setHover] = useState(null);

  return (
    <div dir={heb ? 'rtl' : 'ltr'} style={{
      background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes chooser-fade-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes chooser-pan-left { from { transform: scale(1.05) translateX(0) } to { transform: scale(1.0) translateX(0) } }
        @keyframes chooser-pan-right { from { transform: scale(1.05) translateX(0) } to { transform: scale(1.0) translateX(0) } }
        @media (max-width: 880px) {
          .chooser-split { flex-direction: column !important; }
          .chooser-panel { flex: 1 1 50% !important; min-height: 50vh; }
        }
      `}</style>

      <Header heb={heb} />

      <div className="chooser-split" style={{
        flex: 1, display: 'flex', position: 'relative',
      }}>
        {/* GYM panel — first / top per spec. Headline ("Athletic
            Performance Center" / "בית הספורטאי") is the largest text.
            CTA opens Ohad's Google Calendar appointment scheduler in a
            new tab — that's the master booking source of truth. */}
        <Panel
          side="left"
          heb={heb}
          dim={hover === 'right'}
          highlight={hover === 'left'}
          onEnter={() => setHover('left')}
          onLeave={() => setHover(null)}
          headline={heb ? 'בית הספורטאי' : 'ATHLETIC PERFORMANCE CENTER'}
          subhead={heb ? 'אימון אישי בנוכחות' : 'In-Person Coaching'}
          body={heb
            ? "אימון אחד-על-אחד עם אוהד. תוכנית מותאמת, ביצוע מדוייק, ליווי שבועי."
            : "One-on-one with Ohad. Tailored programming, hands-on cueing, weekly accountability."}
          benefits={heb
            ? ['אבחון תנועה', 'מעקב שבועי', 'יומן זימונים חי']
            : ['Movement assessment', 'Weekly check-ins', 'Live booking calendar']}
          cta={heb ? 'הזמנת אימון' : 'BOOK A SESSION'}
          href="#/gym"
          highlight2
          onClick={() => trackAndOpen('chooser_pick', { side: 'gym' })}
        />

        <Divider />

        {/* ONLINE panel — second / bottom. Headline ("Online" /
            "אונליין") is the largest text. CTA opens the online-side
            Google Calendar in a new tab. */}
        <Panel
          side="right"
          heb={heb}
          dim={hover === 'left'}
          highlight={hover === 'right'}
          onEnter={() => setHover('right')}
          onLeave={() => setHover(null)}
          headline={heb ? 'אונליין' : 'ONLINE'}
          subhead={heb ? 'תוכניות אימון מוכנות' : 'Ready-to-Run Programs'}
          body={heb
            ? 'בלוקים של 4 שבועות. תוכניות מקיפות של 12 שבועות. פלטפורמת אימון, מעקב, וניתוח טופס מבוסס AI.'
            : 'Four-week training blocks. Twelve-week phases. The full EXPO platform — programming, logging, AI-driven form analysis.'}
          benefits={heb
            ? ['קטלוג תוכניות', 'אפליקציה מלאה', 'תמיכה בוואטסאפ']
            : ['Program catalog', 'Full athlete app', 'WhatsApp support']}
          cta={heb ? 'שיחת היכרות' : 'BOOK A CALL'}
          href="#/online"
          highlight2
          onClick={() => trackAndOpen('chooser_pick', { side: 'online' })}
        />
      </div>

      <Analytics />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Header — minimal: logo + lang switch. No nav links here on purpose;
// the visitor's only decision on this screen is "which side".
// ─────────────────────────────────────────────────────────────────────
function Header({ heb }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 28px', borderBottom: `1px solid ${C.ac}26`,
      background: C.bg, position: 'relative', zIndex: 2,
    }}>
      <img src={EXPO_LOGO_NAV} alt="EXPO" style={{ height: 30, width: 'auto', transform: 'translateY(-2px)' }} />
      <LangSwitch />
    </header>
  );
}

function LangSwitch() {
  const [lang] = useLang();
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {['en', 'he'].map(code => {
        const active = lang === code;
        return (
          <button key={code} onClick={() => setLang(code)}
            style={{
              padding: '5px 11px', borderRadius: 0,
              background: active ? C.ac : 'transparent',
              color: active ? '#000000' : C.tm,
              border: `1px solid ${active ? C.ac : C.bd2}`,
              fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              cursor: 'pointer', textTransform: 'uppercase',
              transition: 'all 140ms ease',
            }}>{code === 'he' ? 'עבר' : 'EN'}</button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Divider — hairline cyan with a glow node midway. Vertical on desktop,
// horizontal on mobile (the CSS query swaps the flex direction).
// ─────────────────────────────────────────────────────────────────────
function Divider() {
  return (
    <div className="chooser-divider" style={{
      width: 1, background: `linear-gradient(180deg, transparent 0%, ${C.ac}80 50%, transparent 100%)`,
      position: 'relative', flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 8, height: 8, borderRadius: '50%',
        background: C.ac, boxShadow: `0 0 20px ${C.ac}`,
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Panel — one half of the split. Uses pseudo-image gradient backdrop
// (we don't load real images so the bundle stays thin); hover lifts the
// title + glows the CTA chip. Each panel is a giant anchor so the
// whole half is clickable — better tap-target on mobile.
// ─────────────────────────────────────────────────────────────────────
function Panel({ side, heb, dim, highlight, highlight2, onEnter, onLeave, headline, subhead, body, benefits, cta, href, external, onClick }) {
  const isLeft = side === 'left';
  // Identical symmetric backdrops on both panels — cyan radial parked
  // BELOW the content stack so it never overlaps the headline (overlap
  // was washing the gym title to gray). Both panels mirror each other.
  const baseGradient = isLeft
    ? `radial-gradient(ellipse 70% 50% at 30% 90%, ${C.ac}22 0%, transparent 60%), linear-gradient(180deg, ${C.bg} 0%, ${C.sf2} 100%)`
    : `radial-gradient(ellipse 70% 50% at 70% 90%, ${C.ac}22 0%, transparent 60%), linear-gradient(180deg, ${C.bg} 0%, ${C.sf2} 100%)`;
  // External link → new tab. Internal hash route → same tab.
  const linkProps = external
    ? { href, target: '_blank', rel: 'noopener noreferrer' }
    : { href };
  return (
    <a {...linkProps} onClick={onClick}
      className="chooser-panel"
      onMouseEnter={onEnter} onMouseLeave={onLeave}
      style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px 32px',
        background: baseGradient,
        textDecoration: 'none', color: 'inherit',
        opacity: dim ? 0.4 : 1,
        transition: 'opacity 320ms cubic-bezier(0.4, 0, 0.2, 1), transform 320ms ease',
        transform: highlight ? 'scale(1.005)' : 'scale(1)',
        cursor: 'pointer',
        minHeight: 480,
      }}>
      {/* Cyan hairline glow on hover — only on the active side */}
      <div style={{
        position: 'absolute', inset: 0,
        border: `1px solid ${C.ac}`,
        opacity: highlight ? 0.5 : 0,
        transition: 'opacity 240ms ease',
        pointerEvents: 'none',
      }} />

      {/* Inner content stack — flex column. Single unified headline
          font scale across BOTH panels and BOTH languages. Previous
          per-panel scaling tried to balance English's wrapped
          "ATHLETIC PERFORMANCE CENTER" against single-line "ONLINE"
          by scaling ONLINE up — but in Hebrew both headlines are short
          single words, so the same scaling produced jarring asymmetry
          ("אונליין" massively larger than "בית הספורטאי"). Same size
          on both sides is cleaner across languages. */}
      <div style={{
        maxWidth: 560, width: '100%', textAlign: 'center', position: 'relative', zIndex: 2,
        animation: `chooser-fade-in 540ms ease both`,
        animationDelay: isLeft ? '120ms' : '240ms',
        display: 'flex', flexDirection: 'column',
      }}>
        <h2 style={{
          margin: 0, fontFamily: FN,
          fontSize: 'clamp(36px, 5.6vw, 68px)',
          fontWeight: 800, letterSpacing: '-0.025em',
          lineHeight: 1.05,
          color: C.tx,
          textWrap: 'balance',
          minHeight: 190,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          textTransform: 'uppercase',
        }}>{headline}</h2>

        {/* Subhead — accent-cyan kicker line under the headline */}
        <div style={{
          fontFamily: FN, fontSize: 12, color: C.ac, letterSpacing: '0.24em',
          fontWeight: 700, padding: '14px 0 20px', textTransform: 'uppercase',
        }}>{subhead}</div>

        <p style={{
          margin: '0 0 28px', fontSize: 14, color: C.tm,
          lineHeight: 1.65, maxWidth: 440, marginInline: 'auto',
          // minHeight reserves space so a shorter body doesn't pull the
          // CTA up out of alignment with the other panel.
          minHeight: '4.5em',
        }}>{body}</p>

        {/* Benefit list — bullet-less, hairline divider between items */}
        <div style={{ marginBottom: 32 }}>
          {benefits.map((b, i) => (
            <div key={i} style={{
              fontFamily: FN, fontSize: 11, color: C.tx,
              letterSpacing: '0.04em', padding: '8px 0',
              borderTop: i === 0 ? `1px solid ${C.ac}26` : 'none',
              borderBottom: `1px solid ${C.ac}26`,
              fontWeight: 600,
            }}>{b}</div>
          ))}
        </div>

        <div>
          <span style={{
            display: 'inline-block',
            padding: '14px 28px',
            background: highlight2 ? C.ac : 'transparent',
            color: highlight2 ? '#000000' : C.ac,
            border: `1px solid ${C.ac}`,
            fontFamily: FN, fontSize: 12, fontWeight: 800, letterSpacing: '0.22em',
            boxShadow: highlight ? `0 0 32px ${C.ac}80` : 'none',
            transition: 'box-shadow 240ms ease, transform 240ms ease',
            transform: highlight ? 'translateY(-2px)' : 'translateY(0)',
          }}>{cta} {heb ? '←' : '→'}</span>
        </div>
      </div>

      {/* Vignette — barely-there frame so the panel reads as a "room" */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at center, transparent 40%, ${C.bg}88 100%)`,
        pointerEvents: 'none',
      }} />
    </a>
  );
}
