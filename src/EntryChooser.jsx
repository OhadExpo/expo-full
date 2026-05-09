// Front door at expo-app.co.il/ for unauthenticated visitors. Two tiles:
//   • Sign in       → /login  (existing user — coach OR client portal account)
//   • For coaches   → /demo (marketing landing for prospective SaaS buyers)
// The /try and /demo public routes stay reachable directly without going
// through this screen — they're entry points for visitors arriving from
// expo-il (athletes) or social posts (coaches).
//
// Authed visitors never see this. AuthGate short-circuits to AuthedApp's
// RolePicker / portal flow before EntryChooser can render.
import React from 'react';
import { C, FN, FB } from './theme';
import { EXPOMark } from './expoMark';

const tileBase = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  textAlign: 'center', textDecoration: 'none',
  borderRadius: 0, padding: '48px 28px',
  cursor: 'pointer', transition: 'transform 0.15s ease, border-color 0.15s ease, background 0.15s ease',
  minHeight: 280,
};

function Tile({ href, badge, title, sub, primary }) {
  return (
    <a href={href} style={{
      ...tileBase,
      background: 'transparent',
      border: primary ? `1px solid ${C.ac}` : `0.25px solid ${C.cardBd}`,
      color: C.tx,
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = C.ac; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = primary ? C.ac : `${C.cardBd}`; }}
    >
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
        marginBottom: 14,
      }}>{badge}</div>
      <h2 style={{
        fontFamily: FB, fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 700,
        margin: '0 0 10px', letterSpacing: -0.3, color: C.tx,
      }}>{title}</h2>
      <p style={{
        fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 14, lineHeight: 1.55,
        margin: 0, maxWidth: 320,
      }}>{sub}</p>
      <div style={{
        marginTop: 22,
        fontFamily: FN, color: primary ? C.ac : C.tm,
        fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
      }}>CONTINUE →</div>
    </a>
  );
}

export default function EntryChooser() {
  // Public surface — force dark while light-mode rollout is gated to the
  // coach app only. Once Ohad approves coach light mode, this attribute
  // will be removed so the surface follows the user's preference.
  return (
    <div data-theme="dark" style={{
      background: C.bg, color: C.tx, minHeight: '100vh',
      fontFamily: FB, display: 'flex', flexDirection: 'column',
    }}>
      <header style={{
        background: 'transparent', borderBottom: `0.25px solid ${C.cardBd}`,
      }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '0 16px',
          display: 'flex', alignItems: 'center', height: 60,
        }}>
          <EXPOMark theme="dark" height={36} style={{ marginBottom: 0 }} />
        </div>
      </header>

      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 16px',
      }}>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
          marginBottom: 14, textAlign: 'center',
        }}>WELCOME TO EXPO</div>
        <h1 style={{
          fontFamily: FB, fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 700,
          margin: '0 0 36px', letterSpacing: -0.4, textAlign: 'center', maxWidth: 720,
        }}>How can I help you today?</h1>

        <div style={{
          width: '100%', maxWidth: 880,
          display: 'grid', gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        }}>
          <Tile
            href="/login"
            badge="EXISTING USER"
            title="Sign in"
            sub="Coach or client account — pick up where you left off."
          />
          <Tile
            href="/demo"
            badge="NEW HERE"
            title="For coaches"
            sub="See how EXPO helps you run your roster — pose detection, rep counter, branded client portals."
            primary
          />
        </div>

        <div style={{
          marginTop: 28, fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.18em',
          textAlign: 'center',
        }}>
          {/* "Athlete view" intentionally NOT surfaced here — the route is
              still public at /demo/trainee, but visitors should land there
              via the "For coaches" tile → CoachLanding hero/demo embed,
              not as a peer link with the coach product. */}
          <a href="/demo/coach" style={{ color: C.td, textDecoration: 'none' }}>FULL COACH DEMO</a>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href="https://expo-il.co.il/" style={{ color: C.td, textDecoration: 'none' }}>BUY A PROGRAM</a>
        </div>
      </main>

      <footer style={{
        borderTop: `0.25px solid ${C.cardBd}`, padding: '14px 16px', textAlign: 'center',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1,
        }}>
          <EXPOMark theme="dark" height={14} style={{ opacity: 0.55 }} />
          <span>· COACHING PLATFORM · © {new Date().getFullYear()} ALL RIGHTS RESERVED</span>
        </span>
      </footer>
    </div>
  );
}
