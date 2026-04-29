// Front door at expo-app.co.il/ for unauthenticated visitors. Two tiles:
//   • Sign in       → /login  (existing user — coach OR client portal account)
//   • For coaches   → /coaches (marketing landing for prospective SaaS buyers)
// The /try and /demo public routes stay reachable directly without going
// through this screen — they're entry points for visitors arriving from
// expo-il (athletes) or social posts (coaches).
//
// Authed visitors never see this. AuthGate short-circuits to AuthedApp's
// RolePicker / portal flow before EntryChooser can render.
import React from 'react';
import { C, FN, FB, EXPO_LOGO_NAV } from './theme';

const tileBase = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  textAlign: 'center', textDecoration: 'none',
  borderRadius: 16, padding: '48px 28px',
  cursor: 'pointer', transition: 'transform 0.15s ease, border-color 0.15s ease, background 0.15s ease',
  minHeight: 280,
};

function Tile({ href, badge, title, sub, primary }) {
  return (
    <a href={href} style={{
      ...tileBase,
      background: primary ? `linear-gradient(135deg, ${C.acD} 0%, ${C.sf} 100%)` : C.sf,
      border: primary ? `1px solid rgba(57,189,255,0.40)` : `1px solid ${C.bd}`,
      color: C.tx,
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = C.ac; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = primary ? 'rgba(57,189,255,0.40)' : C.bd; }}
    >
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 2.5, fontWeight: 700,
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
        fontSize: 11, letterSpacing: 1.5, fontWeight: 700,
      }}>CONTINUE →</div>
    </a>
  );
}

export default function EntryChooser() {
  return (
    <div style={{
      background: C.bg, color: C.tx, minHeight: '100vh',
      fontFamily: FB, display: 'flex', flexDirection: 'column',
    }}>
      <header style={{
        background: C.sf, borderBottom: `1px solid ${C.bd}`,
      }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '0 16px',
          display: 'flex', alignItems: 'center', height: 60,
        }}>
          <img src={EXPO_LOGO_NAV} alt="EXPO" style={{ display: 'block', height: 32 }} />
        </div>
      </header>

      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 16px',
      }}>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
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
            href="/coaches"
            badge="NEW HERE"
            title="For coaches"
            sub="See how EXPO helps you run your roster — pose detection, rep counter, branded client portals."
            primary
          />
        </div>

        <div style={{
          marginTop: 28, fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5,
          textAlign: 'center',
        }}>
          <a href="/try" style={{ color: C.td, textDecoration: 'none' }}>TRY THE ENGINE</a>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href="/demo" style={{ color: C.td, textDecoration: 'none' }}>CLIENT DEMO</a>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href="https://expo-il.co.il/" style={{ color: C.td, textDecoration: 'none' }}>BUY A PROGRAM</a>
        </div>
      </main>

      <footer style={{
        borderTop: `1px solid ${C.bd}`, padding: '14px 16px', textAlign: 'center',
      }}>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>
          EXPO · COACHING PLATFORM
        </span>
      </footer>
    </div>
  );
}
