// Coach-acquisition marketing landing at expo-app.co.il/ (unauthed visitors).
// Authed visitors at / continue to AuthedApp's role-picker / portal flow.
//
// Pitch: a working coach's video-driven training platform — pose detection,
// auto rep counter, side-by-side compare, dormant-WhatsApp nudges, plan
// authoring, client portals. Same engine the visitor can try on /try.
// CTAs: try the demo (/try), join waitlist (Supabase `leads` row with
// source='coach_waitlist'), sign in (/login for existing users).
//
// No checkout, no signup, no multi-tenancy yet — this is a waitlist page.
// Stripe + the trainers table get built once the waitlist proves demand.
import React, { useState } from 'react';
import { C, FN, FB, EXPO_LOGO_NAV } from './theme';
import { EXPOMark } from './expoMark';

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const baseBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 22px', borderRadius: 8, border: 'none',
  fontFamily: FB, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', letterSpacing: 1.2, transition: 'all 0.15s',
  textDecoration: 'none',
};

function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (state === 'sending' || state === 'done') return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setState('error'); setErr('Enter a valid email'); return;
    }
    setState('sending'); setErr('');
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
          source: 'expo-app',
          context: 'coach_waitlist',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
        }),
      });
      // 409 = duplicate (already on the waitlist) — treat as success so the
      // visitor sees confirmation instead of a confusing error.
      if (!res.ok && res.status !== 409) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${txt ? ': ' + txt.slice(0, 80) : ''}`);
      }
      setState('done');
    } catch (e2) {
      console.error('Waitlist submit failed:', e2);
      setState('error'); setErr('Something went wrong. Try again in a minute.');
    }
  };
  if (state === 'done') {
    return (
      <div style={{
        fontFamily: FN, color: C.gn, fontSize: 13, letterSpacing: 1.2, fontWeight: 700,
        padding: '14px 20px', border: `1px solid ${C.gn}40`, borderRadius: 10,
        textAlign: 'center', maxWidth: 460, margin: '0 auto',
      }}>
        ✓ YOU'RE ON THE LIST. I'LL EMAIL YOU AS COACH SLOTS OPEN.
      </div>
    );
  }
  return (
    <form onSubmit={submit} style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: 460, margin: '0 auto', width: '100%',
    }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="email" autoComplete="email" value={email}
          onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
          placeholder="your@email.com"
          style={{
            background: C.sf, border: `1px solid ${C.bd2}`,
            borderRadius: 8, padding: '12px 14px', color: C.tx,
            fontFamily: FB, fontSize: 14, outline: 'none',
            flex: '1 1 220px', minWidth: 0,
          }} />
        <button type="submit" disabled={state === 'sending'} style={{
          ...baseBtn,
          background: state === 'sending' ? C.bd : C.ac,
          color: state === 'sending' ? C.tm : '#000',
          padding: '12px 20px',
        }}>{state === 'sending' ? '…' : 'JOIN WAITLIST'}</button>
      </div>
      {state === 'error' && (
        <div style={{
          fontFamily: FN, color: C.rd, fontSize: 11, letterSpacing: 1, textAlign: 'center',
        }}>{err}</div>
      )}
    </form>
  );
}

// Single embedded engine on the marketing page. The visitor uploads a clip,
// sees pose detection + rep count instantly. For the deep dives — the full
// coach surface (dashboard, trainees, plans, review) and the trainee POV
// engine — they click out to /try or /demo via the buttons under the embed.
// embed=1 strips TrySandbox's own header/footer so the engine slots cleanly
// inside the marketing page.
function DemoEmbed() {
  const [loaded, setLoaded] = useState(false);
  return (
    <div>
      <div className="cl-embed" style={{
        background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 14,
        overflow: 'hidden', maxWidth: 1180, margin: '0 auto', position: 'relative',
        boxShadow: `0 0 0 1px ${C.bd}, 0 30px 60px -20px rgba(0,0,0,0.6)`,
      }}>
        <style>{`
          .cl-embed { min-height: 720px; }
          .cl-embed iframe { height: 720px; }
          @media (max-width: 720px) { .cl-embed { min-height: 560px; } .cl-embed iframe { height: 560px; } }
          @media (max-width: 480px) { .cl-embed { min-height: 480px; } .cl-embed iframe { height: 480px; } }
          @keyframes cl-spin { to { transform: rotate(360deg); } }
        `}</style>
        {!loaded && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 14,
            background: `linear-gradient(180deg, ${C.sf2} 0%, ${C.sf} 100%)`,
            color: C.tm, fontFamily: FN, fontSize: 11, letterSpacing: 1.8,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              border: `2px solid ${C.bd}`, borderTopColor: C.ac,
              animation: 'cl-spin 0.9s linear infinite',
            }} />
            <div>LOADING ENGINE…</div>
            <div style={{ fontSize: 9, color: C.td, letterSpacing: 1.5 }}>POSE MODEL · ~6MB · FIRST LOAD ONLY</div>
          </div>
        )}
        <iframe src="/demo?embed=1" title="EXPO live engine"
          onLoad={() => setLoaded(true)}
          style={{
            display: 'block', width: '100%', border: 'none', position: 'relative', zIndex: 1,
            opacity: loaded ? 1 : 0, transition: 'opacity 0.3s',
          }} />
      </div>
      <div style={{
        textAlign: 'center', marginTop: 16,
        display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap',
      }}>
        <a href="/try" target="_blank" rel="noopener" style={{
          ...baseBtn, background: C.ac, color: '#000', padding: '11px 22px', fontSize: 12,
        }}>OPEN THE FULL COACH DEMO →</a>
        <a href="/demo" target="_blank" rel="noopener" style={{
          ...baseBtn, background: 'transparent', color: C.tx,
          border: `1px solid ${C.bd2}`, padding: '11px 22px', fontSize: 12,
        }}>OPEN THE TRAINEE VIEW →</a>
      </div>
    </div>
  );
}

function PricingTier({ name, slots, popular, features, cta, price, priceSub }) {
  return (
    <div style={{
      background: popular ? `linear-gradient(135deg, ${C.sf2} 0%, ${C.sf} 100%)` : C.sf,
      border: popular ? `1px solid rgba(57,189,255,0.40)` : `1px solid ${C.bd}`,
      borderRadius: 14, padding: '24px 20px', textAlign: 'left',
      position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 360,
    }}>
      {popular && (
        <div style={{
          position: 'absolute', top: -10, right: 14,
          fontFamily: FN, fontSize: 9, color: '#000', background: C.ac,
          letterSpacing: 1.5, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
        }}>FOUNDER FAVOURITE</div>
      )}
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 2.5, fontWeight: 700,
        marginBottom: 10,
      }}>{name}</div>
      {price && (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6,
        }}>
          <span style={{
            fontFamily: FB, fontSize: 30, fontWeight: 700, color: C.tx, letterSpacing: -0.6,
          }}>{price}</span>
          {priceSub && (
            <span style={{
              fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1,
            }}>{priceSub}</span>
          )}
        </div>
      )}
      <div style={{
        fontFamily: FB, fontSize: 14, fontWeight: 600, color: C.tm, opacity: 0.85,
        marginBottom: 6,
      }}>{slots}</div>
      <ul style={{
        listStyle: 'none', padding: 0, margin: '14px 0 18px',
        fontFamily: FB, fontSize: 13.5, lineHeight: 1.65, color: C.tx, opacity: 0.85,
      }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
            <span style={{ color: C.ac, flex: '0 0 auto' }}>✓</span><span>{f}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 'auto' }}>
        <a href="#waitlist" style={{
          ...baseBtn, width: '100%',
          background: popular ? C.ac : 'transparent',
          color: popular ? '#000' : C.tx,
          border: popular ? 'none' : `1px solid ${C.bd2}`,
          padding: '11px 16px', fontSize: 12,
        }}>{cta}</a>
      </div>
    </div>
  );
}

function FeatureCard({ tag, title, body }) {
  return (
    <div style={{
      background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14,
      padding: 22, textAlign: 'left',
    }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 10, letterSpacing: 2, fontWeight: 700,
        marginBottom: 10,
      }}>{tag}</div>
      <h3 style={{
        fontFamily: FB, fontSize: 17, fontWeight: 700, margin: '0 0 8px',
        letterSpacing: -0.2, color: C.tx,
      }}>{title}</h3>
      <p style={{
        fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 13.5, lineHeight: 1.55, margin: 0,
      }}>{body}</p>
    </div>
  );
}

export default function CoachLanding() {
  return (
    <div style={{
      background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB,
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes fade-up { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        a:focus-visible, button:focus-visible {
          outline: 2px solid ${C.ac}; outline-offset: 2px; border-radius: 4px;
        }
        /* Sticky bottom CTA bar — only on phones/small tablets where the
           hero buttons scroll out of view. Desktop already shows them in
           the header + hero, so the sticky bar would be redundant noise. */
        .cl-sticky-cta { display: none; }
        @media (max-width: 720px) {
          .cl-sticky-cta { display: flex; }
          /* Reserve room at the bottom of the page so the sticky bar
             doesn't cover the footer or last form. */
          main { padding-bottom: 76px; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        background: C.sf, borderBottom: `1px solid ${C.bd}`,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '0 16px',
          display: 'flex', alignItems: 'center', height: 60, gap: 14,
        }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto', textDecoration: 'none' }}>
            {/* Wrapper-clip — see CoachDemo header for the explanation. */}
            <div style={{ height: 16, overflow: 'hidden', display: 'inline-flex', alignItems: 'flex-end' }}>
              <img src={EXPO_LOGO_NAV} alt="EXPO" style={{ display: 'block', height: 23 }} />
            </div>
          </a>
          <span style={{
            fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 2, fontWeight: 700,
            padding: '4px 8px', background: C.acD, borderRadius: 6,
            border: `1px solid rgba(57,189,255,0.30)`, whiteSpace: 'nowrap',
          }}>FOR COACHES</span>
          <div style={{ flex: 1 }} />
          <a href="/try" style={{
            ...baseBtn, background: 'transparent', color: C.tx,
            border: `1px solid ${C.bd2}`, padding: '8px 14px', fontSize: 11,
          }}>SEE THE DEMO</a>
          <a href="/login" style={{
            ...baseBtn, background: 'transparent', color: C.tm,
            padding: '8px 14px', fontSize: 11,
          }}>SIGN IN →</a>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        {/* Hero */}
        <section style={{
          maxWidth: 920, margin: '0 auto', padding: '64px 20px 40px', textAlign: 'center',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
            marginBottom: 14,
          }}>
            <EXPOMark height={14} />
            <span>· COACHING PLATFORM</span>
          </div>
          <h1 style={{
            fontFamily: FB, fontSize: 'clamp(30px, 5vw, 50px)', fontWeight: 700,
            margin: '0 0 16px', letterSpacing: -0.6, lineHeight: 1.08,
          }}>Run your roster on the same engine your clients film with.</h1>
          <p style={{
            fontFamily: FB, color: C.tx, opacity: 0.85, fontSize: 16, lineHeight: 1.55,
            maxWidth: 680, margin: '0 auto 32px',
          }}>
            Pose detection, auto rep counter, side-by-side video review, plan authoring,
            client portals, and a dormant-client WhatsApp nudge — built by a working coach,
            running live on real clients.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 14 }}>
            <a href="/try" style={{
              ...baseBtn, background: C.ac, color: '#000', padding: '13px 26px', fontSize: 13,
            }}>SEE COACH VIEW →</a>
            <a href="/demo" style={{
              ...baseBtn, background: 'transparent', color: C.tx,
              border: `1px solid ${C.bd2}`, padding: '13px 26px', fontSize: 13,
            }}>SEE TRAINEE VIEW →</a>
            <a href="#waitlist" style={{
              ...baseBtn, background: 'transparent', color: C.tm,
              padding: '13px 18px', fontSize: 13,
            }}>OR JOIN WAITLIST</a>
          </div>
          <div style={{
            fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5, fontWeight: 700,
          }}>NO CARD · NO SIGNUP · DEMO RUNS ON YOUR OWN CLIP</div>
        </section>

        {/* Live demo — two-tab embed of /try (coach POV) and /demo (trainee POV) */}
        <section style={{
          maxWidth: 1180, margin: '0 auto', padding: '8px 16px 40px',
        }}>
          <div style={{
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
            marginBottom: 14, textAlign: 'center',
          }}>LIVE · NOT A SCREENSHOT</div>
          <h2 style={{
            fontFamily: FB, fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 700,
            margin: '0 0 14px', letterSpacing: -0.3, textAlign: 'center',
          }}>Upload a clip. Watch the engine work.</h2>
          <p style={{
            fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 14.5, lineHeight: 1.55,
            maxWidth: 680, margin: '0 auto 22px', textAlign: 'center',
          }}>
            The full engine, running below — same code your clients film with.
            For the deeper tour (dashboard, plan editor, review tool), open the
            full coach demo in a new tab.
          </p>
          <DemoEmbed />
        </section>

        {/* What you get */}
        <section style={{
          maxWidth: 1180, margin: '0 auto', padding: '60px 16px 20px',
        }}>
          <div style={{
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
            marginBottom: 12, textAlign: 'center',
          }}>WHAT YOU GET</div>
          <h2 style={{
            fontFamily: FB, fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 700,
            margin: '0 0 28px', letterSpacing: -0.3, textAlign: 'center',
          }}>The whole stack — not just video review.</h2>
          <div style={{
            display: 'grid', gap: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          }}>
            <FeatureCard tag="VIDEO ENGINE" title="Pose + auto rep counter"
              body="MediaPipe pose landmarks render live. Reps count from joint-angle troughs — squat / hinge / press / pull are auto-routed to the right channel. Compare two clips side-by-side." />
            <FeatureCard tag="PROGRAMMING" title="Block-based plan authoring"
              body="Build phases of training as named blocks. Day-by-day exercise lists with sets, reps, tempo, video links, supersets, week-by-week wave logs. Bulk import from xlsx." />
            <FeatureCard tag="CLIENT PORTAL" title="Branded portal per client"
              body="Each client logs in to a workout view with their plan, video reviews, and feedback. Couples share a couple-card. Bodyweight + session logging built in." />
            <FeatureCard tag="OPS" title="Dormant nudges via WhatsApp"
              body="Dashboard surfaces clients who haven't trained in N days. One-tap opens WhatsApp with a prefilled Hebrew/English check-in — phone numbers stay in the trainee record." />
            <FeatureCard tag="REVIEW" title="Per-rep video review"
              body="Pause on any frame, draw on the video, leave timestamped voice + text comments. The client sees the review from the same portal — no email back-and-forth." />
            <FeatureCard tag="NO LOCK-IN" title="Your data, your rules"
              body="Export every plan, exercise, and workout log to xlsx anytime. Bring your existing exercise library (xlsx, sheets, Trainerize export) — bulk import is part of onboarding." />
          </div>
        </section>

        {/* Why I'm building this */}
        <section style={{
          maxWidth: 920, margin: '0 auto', padding: '60px 16px 30px', textAlign: 'center',
        }}>
          <div style={{
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
            marginBottom: 12,
          }}>WHO BUILDS IT</div>
          <h2 style={{
            fontFamily: FB, fontSize: 'clamp(22px, 3.5vw, 28px)', fontWeight: 700,
            margin: '0 0 14px', letterSpacing: -0.3,
          }}>Built by a working coach for working coaches.</h2>
          <p style={{
            fontFamily: FB, color: C.tx, opacity: 0.85, fontSize: 15, lineHeight: 1.6,
            maxWidth: 660, margin: '0 auto',
          }}>
            I'm Ohad. I run my own roster on this exact platform — every line of it
            exists because I needed it on a Tuesday morning between sessions. Nothing
            in here is theoretical. If a feature doesn't survive contact with real
            clients, it gets cut.
          </p>
        </section>

        {/* Pricing tiers — placeholder slots, exact prices set on a founding-coach call */}
        <section id="pricing" style={{
          maxWidth: 1180, margin: '0 auto', padding: '60px 16px 20px',
        }}>
          <div style={{
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
            marginBottom: 12, textAlign: 'center',
          }}>FOUNDING-COACH PRICING</div>
          <h2 style={{
            fontFamily: FB, fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 700,
            margin: '0 0 14px', letterSpacing: -0.3, textAlign: 'center',
          }}>Pick the slot count that fits your roster.</h2>
          <p style={{
            fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 14.5, lineHeight: 1.6,
            maxWidth: 620, margin: '0 auto 32px', textAlign: 'center',
          }}>
            Per-coach, flat monthly — no per-client fees, no transaction cuts. Numbers
            below are indicative; founding-coach pricing gets locked one tier lower
            on a 20-minute intake call before your account opens.
          </p>
          <div style={{
            display: 'grid', gap: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          }}>
            <PricingTier
              name="STARTER"
              price="₪149"
              priceSub="/ MONTH"
              slots="Up to 10 active clients"
              cta="JOIN WAITLIST"
              features={[
                'Full video review engine',
                'Plan authoring + xlsx import',
                'Client portals + couple cards',
                'Dormant-WhatsApp nudges',
              ]}
            />
            <PricingTier
              name="GROWTH"
              price="₪249"
              priceSub="/ MONTH"
              slots="Up to 30 active clients"
              popular
              cta="JOIN WAITLIST"
              features={[
                'Everything in Starter',
                'Bulk plan duplication across clients',
                'Bodyweight + session payment tracking',
                'Priority email support',
              ]}
            />
            <PricingTier
              name="SCALE"
              price="₪399"
              priceSub="/ MONTH"
              slots="Unlimited clients"
              cta="JOIN WAITLIST"
              features={[
                'Everything in Growth',
                'Branded portal subdomain',
                'Direct line for product requests',
              ]}
            />
          </div>
          <div style={{
            marginTop: 18, textAlign: 'center',
            fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5,
          }}>NO CARD NOW · WAITLIST ONLY · I'LL REACH OUT TO LOCK PRICING</div>
        </section>

        {/* Waitlist CTA */}
        <section id="waitlist" style={{
          maxWidth: 720, margin: '0 auto', padding: '40px 16px 80px', textAlign: 'center',
        }}>
          <div style={{
            background: `linear-gradient(135deg, ${C.sf2} 0%, ${C.sf} 100%)`,
            border: `1px solid rgba(57,189,255,0.30)`, borderRadius: 14,
            padding: '36px 24px',
          }}>
            <div style={{
              fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
              marginBottom: 10,
            }}>FOUNDING COACH WAITLIST</div>
            <h2 style={{
              fontFamily: FB, fontSize: 'clamp(22px, 3.4vw, 28px)', fontWeight: 700,
              margin: '0 0 12px', letterSpacing: -0.3,
            }}>Get early access at founding-coach pricing.</h2>
            <p style={{
              fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 14.5, lineHeight: 1.6,
              maxWidth: 540, margin: '0 auto 22px',
            }}>
              Multi-coach access opens slot-by-slot. Drop your email — I'll reach out
              personally when it's your turn. No card. No commitment.
            </p>
            <WaitlistForm />
          </div>
        </section>
      </main>

      {/* Sticky mobile-only CTA bar — see <style> block at top of component. */}
      <div className="cl-sticky-cta" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
        background: C.sf, borderTop: `1px solid ${C.bd}`,
        padding: '10px 12px', gap: 8, alignItems: 'stretch',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
      }}>
        <a href="/try" style={{
          ...baseBtn, flex: 1, background: 'transparent', color: C.tx,
          border: `1px solid ${C.bd2}`, padding: '12px 14px', fontSize: 12,
        }}>TRY THE ENGINE</a>
        <a href="#waitlist" style={{
          ...baseBtn, flex: 1, background: C.ac, color: '#000',
          padding: '12px 14px', fontSize: 12,
        }}>WAITLIST →</a>
      </div>

      <footer style={{
        borderTop: `1px solid ${C.bd}`, padding: '20px 16px',
        maxWidth: 1180, margin: '0 auto', width: '100%',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1,
        }}>
          <EXPOMark height={11} style={{ opacity: 0.55 }} />
          <span>· COACHING PLATFORM · BUILT IN TEL AVIV · © {new Date().getFullYear()} ALL RIGHTS RESERVED</span>
        </span>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>
          <a href="/try" style={{ color: C.td, textDecoration: 'none' }}>DEMO</a>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href="/login" style={{ color: C.td, textDecoration: 'none' }}>SIGN IN</a>
        </span>
      </footer>
    </div>
  );
}
