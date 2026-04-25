import React, { useState, useEffect } from 'react';
import { C, FN, FB, CONTACT, buyOnWhatsApp } from './theme';
import { PROGRAMS } from './programs';

// ───────────────────────────────────────────────────────────────────────────
// Hash-based routing
//
// We use the hash fragment so the SPA Vercel rewrite (everything → /index.html)
// doesn't need to think about it, and so links are shareable. Only two views
// for now:
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

function nav(href) {
  // window.location.hash assignment triggers hashchange
  window.location.hash = href;
}

// Filter chips — derived from the catalog so adding a new program with a
// new tag automatically gets a chip without code changes.
function uniqueTags(list) {
  const set = new Set();
  for (const p of list) set.add(p.tag);
  return ['All', ...Array.from(set)];
}

function Nav() {
  const linkStyle = { color: C.tm, fontFamily: FN, fontSize: 12, letterSpacing: 1, padding: '6px 10px', cursor: 'pointer' };
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(10,10,11,0.78)', backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${C.bd}`,
      padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <a href="#/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Logo size={26} />
        <span style={{ fontFamily: FN, fontWeight: 700, letterSpacing: 2, fontSize: 14 }}>EXPO</span>
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <a href="#/" style={linkStyle}>PROGRAMS</a>
        <a href="#/#how" style={linkStyle}>HOW IT WORKS</a>
        <a href="#/#contact" style={linkStyle}>CONTACT</a>
      </div>
    </nav>
  );
}

// Compact SVG of the EXPO mark — same proportions as the PWA icon.
function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="EXPO">
      <rect width="100" height="100" rx="14" fill="#000" />
      <path d="M22 28 L50 60 L78 28" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 78 L50 50 L78 78" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 38 L50 28 L60 38" fill="none" stroke={C.ac} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Hero() {
  return (
    <section id="top" style={{
      maxWidth: 1100, margin: '0 auto', padding: '80px 24px 60px',
      textAlign: 'center',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <Logo size={68} />
      </div>
      <div style={{ fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, marginBottom: 14 }}>
        PROGRAMMED TRAINING
      </div>
      <h1 style={{
        fontFamily: FB, fontWeight: 700, fontSize: 'clamp(34px, 6vw, 60px)',
        lineHeight: 1.05, marginBottom: 18, letterSpacing: -1,
      }}>
        תוכניות אימון<br />
        <span style={{ color: C.ac }}>שעובדות בפועל</span>
      </h1>
      <p style={{
        fontFamily: FB, color: C.tm, fontSize: 'clamp(15px, 1.6vw, 18px)',
        maxWidth: 620, margin: '0 auto 32px', lineHeight: 1.55,
      }}>
        Block-periodised templates for hypertrophy, strength, rehab, and time-poor schedules.
        Same engine I use with private clients — now available as standalone purchases you can run yourself.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a href="#programs" style={{
          background: C.ac, color: '#0a0a0b', padding: '14px 26px', borderRadius: 10,
          fontFamily: FN, fontWeight: 700, fontSize: 13, letterSpacing: 1.5,
        }}>
          BROWSE PROGRAMS ↓
        </a>
        <a href="#how" style={{
          background: 'transparent', color: C.tm, border: `1px solid ${C.bd}`,
          padding: '14px 26px', borderRadius: 10, fontFamily: FN, fontWeight: 700, fontSize: 13, letterSpacing: 1.5,
        }}>
          HOW IT WORKS
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

function ProgramCard({ p }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.sf, border: `1px solid ${hover ? p.accent : C.bd}`,
        borderRadius: 14, padding: 22,
        display: 'flex', flexDirection: 'column', gap: 14,
        transition: 'border-color 150ms, transform 150ms, box-shadow 150ms',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hover ? `0 12px 32px -16px ${p.accent}55` : 'none',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
          background: `${p.accent}1a`, color: p.accent, padding: '4px 10px', borderRadius: 999,
          border: `1px solid ${p.accent}40`,
        }}>{p.tag.toUpperCase()}</span>
        <span style={{ fontFamily: FN, fontSize: 11, color: C.td }}>{p.duration}</span>
      </div>
      <div>
        <h3 style={{ fontFamily: FB, fontSize: 22, fontWeight: 700, marginBottom: 4, lineHeight: 1.15 }}>{p.title}</h3>
        <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>{p.audience}</div>
      </div>
      <p style={{ fontFamily: FB, fontSize: 14, color: C.tx, opacity: 0.85, lineHeight: 1.55 }}>
        {p.summary}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {p.highlights.map((h, i) => (
          <li key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.45,
          }}>
            <span style={{ color: p.accent, fontFamily: FN, marginTop: 1 }}>›</span>
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
          <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>PRICE</div>
          <div style={{ fontFamily: FN, fontSize: 22, fontWeight: 700, color: C.tx }}>
            {p.price} <span style={{ fontSize: 13, color: C.tm }}>{p.currency}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href={`#/programs/${p.id}`}
            style={{
              background: 'transparent', color: C.tm, border: `1px solid ${C.bd}`,
              padding: '10px 14px', borderRadius: 8,
              fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
            }}>
            VIEW
          </a>
          <a href={buyOnWhatsApp(p)} target="_blank" rel="noopener noreferrer"
            style={{
              background: p.accent, color: '#0a0a0b',
              padding: '10px 18px', borderRadius: 8,
              fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
            }}>
            BUY →
          </a>
        </div>
      </div>
    </div>
  );
}

function Catalog() {
  const tags = uniqueTags(PROGRAMS);
  const [active, setActive] = useState('All');
  const list = active === 'All' ? PROGRAMS : PROGRAMS.filter(p => p.tag === active);
  return (
    <section id="programs" style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 60px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>CATALOG</div>
        <h2 style={{ fontFamily: FB, fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 700, marginBottom: 8 }}>
          Pick the block that matches where you are.
        </h2>
        <p style={{ fontFamily: FB, color: C.tm, fontSize: 15, maxWidth: 720, lineHeight: 1.55 }}>
          Every program ships as a 4-week block (or longer) inside the EXPO portal — log sets on your phone,
          watch your bodyweight trend, and follow the same auto-regulation rules I use with private clients.
        </p>
      </div>
      <div style={{
        display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap',
      }}>
        {tags.map(t => (
          <button key={t} onClick={() => setActive(t)} style={{
            background: active === t ? C.acD : 'transparent',
            color: active === t ? C.ac : C.tm,
            border: `1px solid ${active === t ? C.ac : C.bd}`,
            padding: '6px 14px', borderRadius: 999,
            fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
            transition: 'background 150ms, color 150ms, border-color 150ms',
          }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{
        display: 'grid', gap: 18,
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
      }}>
        {list.map(p => <ProgramCard key={p.id} p={p} />)}
      </div>
      {list.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: C.td, fontFamily: FN, fontSize: 12 }}>
          NO PROGRAMS IN THIS CATEGORY
        </div>
      )}
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: '01', t: 'Pick a program', d: 'Browse the catalog above. Each card shows the duration, who it\'s for, and what\'s inside.' },
    { n: '02', t: 'Pay via Bit', d: `Tap "Buy" on the program — opens WhatsApp with everything pre-filled. Pay through Bit (${CONTACT.bitPhone}) and send a screenshot of the confirmation.` },
    { n: '03', t: 'Get your account', d: 'Within a few hours you receive an email with a sign-in link to expo-app.co.il. Your purchased program is already loaded.' },
    { n: '04', t: 'Train', d: 'Log every set on your phone. The program adapts to your bodyweight, RPE, and sessions completed — same engine as my private clients.' },
  ];
  return (
    <section id="how" style={{
      maxWidth: 1100, margin: '0 auto', padding: '60px 24px',
    }}>
      <div style={{ fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>HOW IT WORKS</div>
      <h2 style={{ fontFamily: FB, fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 700, marginBottom: 30 }}>
        From buy to first set in under a day.
      </h2>
      <div style={{
        display: 'grid', gap: 18,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
      }}>
        {steps.map(s => (
          <div key={s.n} style={{
            background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 20,
          }}>
            <div style={{ fontFamily: FN, color: C.ac, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>
              {s.n}
            </div>
            <div style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{s.t}</div>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.5 }}>{s.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" style={{
      maxWidth: 720, margin: '0 auto', padding: '60px 24px 40px', textAlign: 'center',
    }}>
      <div style={{ fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>CONTACT</div>
      <h2 style={{ fontFamily: FB, fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, marginBottom: 12 }}>
        Questions before you buy?
      </h2>
      <p style={{ fontFamily: FB, color: C.tm, fontSize: 14, lineHeight: 1.55, marginBottom: 24 }}>
        WhatsApp is the fastest. Tell me what you train for, your equipment, and how many days you can give me — I'll point you at the right program.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
        <a href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent('שלום אוהד, יש לי שאלה לגבי התוכניות')}`}
          target="_blank" rel="noopener noreferrer"
          style={{
            background: C.ac, color: '#0a0a0b', padding: '12px 22px', borderRadius: 10,
            fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
          }}>
          WHATSAPP
        </a>
        <a href={`mailto:${CONTACT.email}`}
          style={{
            background: 'transparent', color: C.tm, border: `1px solid ${C.bd}`,
            padding: '12px 22px', borderRadius: 10,
            fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
          }}>
          EMAIL
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{
      borderTop: `1px solid ${C.bd}`, padding: '28px 24px',
      maxWidth: 1200, margin: '40px auto 0',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Logo size={20} />
        <span style={{ fontFamily: FN, color: C.td, fontSize: 11 }}>
          © {new Date().getFullYear()} EXPO · Ohad Yossifoff
        </span>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <a href="https://expo-app.co.il" target="_blank" rel="noopener noreferrer"
          style={{ fontFamily: FN, fontSize: 11, color: C.tm }}>
          PORTAL ↗
        </a>
        <a href={CONTACT.instagram} target="_blank" rel="noopener noreferrer"
          style={{ fontFamily: FN, fontSize: 11, color: C.tm }}>
          INSTAGRAM ↗
        </a>
      </div>
    </footer>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ProgramDetail — lives at #/programs/<id>
//
// Renders the full pitch for one program plus a sample-week preview when
// `program.sampleWeek` is filled in. The detail page is the place to send
// people on Instagram / WhatsApp when they ask "what's actually in it?"
// ───────────────────────────────────────────────────────────────────────────

function SampleWeek({ sampleWeek, accent }) {
  if (!sampleWeek) {
    return (
      <div style={{
        background: C.sf, border: `1px dashed ${C.bd}`, borderRadius: 12,
        padding: 28, textAlign: 'center', color: C.td,
        fontFamily: FN, fontSize: 12, letterSpacing: 1,
      }}>
        SAMPLE WEEK COMING SOON
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
        const label = dayKey.startsWith('day') ? `Day ${dayKey.replace('day', '').toUpperCase()}` : dayKey;
        return (
          <div key={dayKey} style={{
            background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18,
          }}>
            <div style={{
              fontFamily: FN, fontSize: 11, color: accent, fontWeight: 700,
              letterSpacing: 2, marginBottom: 12,
            }}>
              {label.toUpperCase()}
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
                      {ex.tempo ? `tempo ${ex.tempo}` : ''}
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
  // Scroll to top when arriving at a detail page.
  useEffect(() => { window.scrollTo(0, 0); }, [program.id]);

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>
      <a href="#/" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: FN, fontSize: 12, color: C.tm, marginBottom: 24, letterSpacing: 1,
      }}>
        ← ALL PROGRAMS
      </a>

      <header style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18, alignItems: 'center' }}>
          <span style={{
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            background: `${program.accent}1a`, color: program.accent, padding: '4px 10px', borderRadius: 999,
            border: `1px solid ${program.accent}40`,
          }}>{program.tag.toUpperCase()}</span>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.td }}>{program.duration}</span>
        </div>
        <h1 style={{
          fontFamily: FB, fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 700,
          lineHeight: 1.1, marginBottom: 10, letterSpacing: -0.5,
        }}>
          {program.title}
        </h1>
        <div style={{ fontFamily: FB, fontSize: 16, color: C.tm, marginBottom: 16 }}>{program.audience}</div>
        <p style={{
          fontFamily: FB, fontSize: 16, color: C.tx, lineHeight: 1.6,
          maxWidth: 760, marginBottom: 18,
        }}>
          {program.summary}
        </p>
        <ProgramMeta p={program} />
      </header>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{
          fontFamily: FN, fontSize: 11, color: program.accent, fontWeight: 700,
          letterSpacing: 3, marginBottom: 14,
        }}>
          WHAT'S DIFFERENT
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
          {program.highlights.map((h, i) => (
            <li key={i} style={{
              background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10,
              padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
              fontFamily: FB, fontSize: 14, color: C.tx, lineHeight: 1.5,
            }}>
              <span style={{ color: program.accent, fontFamily: FN, fontWeight: 700, marginTop: 1 }}>›</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{
          fontFamily: FN, fontSize: 11, color: program.accent, fontWeight: 700,
          letterSpacing: 3, marginBottom: 14,
        }}>
          SAMPLE WEEK
        </h2>
        <p style={{ fontFamily: FB, color: C.tm, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          A look at one full microcycle. The full block escalates and varies these patterns
          across {program.duration.split(' ')[0] || 'several'} weeks.
        </p>
        <SampleWeek sampleWeek={program.sampleWeek} accent={program.accent} />
      </section>

      <section style={{
        background: C.sf, border: `1px solid ${program.accent}40`, borderRadius: 14,
        padding: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        justifyContent: 'space-between', gap: 16,
      }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 2, marginBottom: 4 }}>PRICE</div>
          <div style={{ fontFamily: FN, fontSize: 32, fontWeight: 700, color: C.tx, lineHeight: 1 }}>
            {program.price} <span style={{ fontSize: 16, color: C.tm }}>{program.currency}</span>
          </div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 6 }}>
            One-time payment · lifetime access in the EXPO portal
          </div>
        </div>
        <a href={buyOnWhatsApp(program)} target="_blank" rel="noopener noreferrer"
          style={{
            background: program.accent, color: '#0a0a0b',
            padding: '14px 28px', borderRadius: 10,
            fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
          }}>
          BUY VIA WHATSAPP →
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
      <HowItWorks />
      <Contact />
    </>
  );
}

export default function App() {
  const route = useHashRoute();
  let body;
  if (route.view === 'detail') {
    const program = PROGRAMS.find(p => p.id === route.programId);
    if (program) {
      body = <ProgramDetail program={program} />;
    } else {
      // Unknown id — bounce back to catalog. Use replace so back button works.
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '#/');
      }
      body = <Home />;
    }
  } else {
    body = <Home />;
  }
  return (
    <>
      <Nav />
      {body}
      <Footer />
    </>
  );
}
