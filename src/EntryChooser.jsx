// Front door at expo-app.co.il/ for unauthenticated visitors. Full-bleed
// split screen — two immersive panels (50/50 on desktop, stacked on mobile),
// hover dims the other (cinema-curtain reveal). Mirrors the expo-il
// PERFORMANCE CENTER / ONLINE TRAINING chooser so the two front doors share
// one visual language.
//   • Sign in      → /login  (existing user — coach OR client portal account)
//   • For coaches  → /demo    (marketing landing for prospective SaaS buyers)
// The /try and /demo public routes stay reachable directly without going
// through this screen.
//
// Authed visitors never see this. AuthGate short-circuits to AuthedApp's
// RolePicker / portal flow before EntryChooser can render.
import React, { useState } from 'react';
import { track } from '@vercel/analytics';
import { C, FN, FB } from './theme';
import { EXPOMark } from './expoMark';

// Funnel: which front-door does a visitor pick? Mirrors expo-il's
// chooser_pick event. track() is a no-op until Analytics is enabled in the
// Vercel dashboard, so this is safe to ship now.
function pick(side) { try { track('chooser_pick', { side }); } catch {} }

export default function EntryChooser() {
  // Public surface — force dark while the light-mode rollout is gated to the
  // coach app only.
  const [hover, setHover] = useState(null);
  return (
    <div data-theme="dark" style={{
      background: C.bg, color: C.tx, minHeight: '100vh',
      fontFamily: FB, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes chooser-fade-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @media (max-width: 880px) {
          .chooser-split { flex-direction: column !important; }
          .chooser-panel { flex: 1 1 50% !important; min-height: 50vh; }
          .chooser-divider { width: 100% !important; height: 1px !important; background: linear-gradient(90deg, transparent 0%, var(--c-ac) 50%, transparent 100%) !important; }
        }
      `}</style>

      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 28px', borderBottom: `1px solid ${C.cardBd}`,
        background: C.bg, position: 'relative', zIndex: 2,
      }}>
        <EXPOMark theme="dark" height={30} style={{ marginBottom: 0 }} />
        <div style={{
          fontFamily: FN, color: C.tm, fontSize: 10, letterSpacing: '0.2em', fontWeight: 700,
          textTransform: 'uppercase',
        }}>Coaching Platform</div>
      </header>

      <div className="chooser-split" style={{ flex: 1, display: 'flex', position: 'relative' }}>
        {/* SIGN IN — existing coach OR client account. */}
        <Panel
          side="left"
          dim={hover === 'right'}
          highlight={hover === 'left'}
          onEnter={() => setHover('left')}
          onLeave={() => setHover(null)}
          headline="SIGN IN"
          subhead="Existing User"
          body="Coach or client account — pick up exactly where you left off, on any device."
          benefits={['Coach + athlete login', 'Plans · video · payments', 'Synced across every device']}
          cta="CONTINUE"
          href="/login"
          onClick={() => pick('signin')}
        />

        <Divider />

        {/* FOR COACHES — marketing landing for prospective SaaS buyers. */}
        <Panel
          side="right"
          dim={hover === 'left'}
          highlight={hover === 'right'}
          onEnter={() => setHover('right')}
          onLeave={() => setHover(null)}
          headline="FOR COACHES"
          subhead="New Here"
          body="See EXPO run your whole roster — pose detection, auto rep counter, branded client portals. Built by a working coach, live on real clients."
          benefits={['Pose + auto rep counter', 'Branded athlete portals', 'Plan authoring + xlsx import']}
          cta="CONTINUE"
          href="/demo"
          onClick={() => pick('coaches')}
        />
      </div>

      <footer style={{
        borderTop: `1px solid ${C.cardBd}`, padding: '12px 16px', textAlign: 'center',
        position: 'relative', zIndex: 2, background: C.bg,
      }}>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.16em' }}>
          <a href="/demo/coach" style={{ color: C.td, textDecoration: 'none' }}>FULL COACH DEMO</a>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href="https://expo-il.co.il/" style={{ color: C.td, textDecoration: 'none' }}>BUY A PROGRAM</a>
          <span style={{ margin: '0 10px', opacity: 0.5 }}>·</span>
          © {new Date().getFullYear()} EXPO
        </span>
      </footer>
    </div>
  );
}

// Vertical hairline divider with a glowing node midway (horizontal on mobile
// via the CSS query above).
function Divider() {
  return (
    <div className="chooser-divider" style={{
      width: 1, background: `linear-gradient(180deg, transparent 0%, ${C.ac}80 50%, transparent 100%)`,
      position: 'relative', flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 8, height: 8, borderRadius: '50%', background: C.ac, boxShadow: `0 0 20px ${C.ac}`,
      }} />
    </div>
  );
}

// One half of the split. The whole panel is a giant anchor (better tap-target
// on mobile). Hover lifts the CTA + glows a hairline cyan frame.
function Panel({ side, dim, highlight, onEnter, onLeave, onClick, headline, subhead, body, benefits, cta, href }) {
  const isLeft = side === 'left';
  const baseGradient = isLeft
    ? `radial-gradient(ellipse 70% 50% at 30% 90%, ${C.ac}22 0%, transparent 60%), linear-gradient(180deg, ${C.bg} 0%, ${C.sf2} 100%)`
    : `radial-gradient(ellipse 70% 50% at 70% 90%, ${C.ac}22 0%, transparent 60%), linear-gradient(180deg, ${C.bg} 0%, ${C.sf2} 100%)`;
  return (
    <a href={href} onClick={onClick}
      className="chooser-panel"
      onMouseEnter={onEnter} onMouseLeave={onLeave}
      style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 32px', background: baseGradient,
        textDecoration: 'none', color: 'inherit',
        opacity: dim ? 0.4 : 1,
        transition: 'opacity 320ms cubic-bezier(0.4, 0, 0.2, 1), transform 320ms ease',
        transform: highlight ? 'scale(1.005)' : 'scale(1)',
        cursor: 'pointer', minHeight: 480,
      }}>
      {/* Cyan hairline glow on hover — active side only */}
      <div style={{
        position: 'absolute', inset: 0, border: `1px solid ${C.ac}`,
        opacity: highlight ? 0.5 : 0, transition: 'opacity 240ms ease', pointerEvents: 'none',
      }} />

      <div style={{
        maxWidth: 560, width: '100%', textAlign: 'center', position: 'relative', zIndex: 2,
        animation: 'chooser-fade-in 540ms ease both',
        animationDelay: isLeft ? '120ms' : '240ms',
        display: 'flex', flexDirection: 'column',
      }}>
        <h2 style={{
          margin: 0, fontFamily: FN, fontSize: 'clamp(34px, 4.5vw, 60px)',
          fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.05, color: C.tx,
          textWrap: 'balance', minHeight: 190,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          textTransform: 'uppercase',
        }}>{headline}</h2>

        <div style={{
          fontFamily: FN, fontSize: 12, color: C.ac, letterSpacing: '0.24em',
          fontWeight: 700, padding: '14px 0 20px', textTransform: 'uppercase',
        }}>{subhead}</div>

        <p style={{
          margin: '0 0 28px', fontSize: 14, color: C.tm, lineHeight: 1.65,
          // 6.8em reserves room for the longest body (3 lines side-by-side) so
          // both panels' bodies occupy equal height — keeps the benefits + CTA
          // vertically symmetric across the two panels (they're centered, so an
          // uneven body offsets the CTAs). Panels stack < 880px, where it's moot.
          maxWidth: 440, marginInline: 'auto', minHeight: '6.8em',
        }}>{body}</p>

        <div style={{ marginBottom: 32 }}>
          {benefits.map((b, i) => (
            <div key={i} style={{
              fontFamily: FN, fontSize: 11, color: C.tx, letterSpacing: '0.04em', padding: '8px 0',
              borderTop: i === 0 ? `1px solid ${C.ac}26` : 'none',
              borderBottom: `1px solid ${C.ac}26`, fontWeight: 600,
              // Single line per benefit so both panels' benefit blocks are
              // identical height at every width — otherwise an uneven wrap
              // offsets the vertically-centered content and the two headlines
              // (SIGN IN / FOR COACHES) sit at different heights.
              whiteSpace: 'nowrap', lineHeight: 1.4,
            }}>{b}</div>
          ))}
        </div>

        <div>
          <span style={{
            display: 'inline-block', padding: '14px 28px',
            background: C.ac, color: '#000000', border: `1px solid ${C.ac}`,
            fontFamily: FN, fontSize: 12, fontWeight: 800, letterSpacing: '0.22em',
            boxShadow: highlight ? `0 0 32px ${C.ac}80` : 'none',
            transition: 'box-shadow 240ms ease, transform 240ms ease',
            transform: highlight ? 'translateY(-2px)' : 'translateY(0)',
          }}>{cta} →</span>
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
