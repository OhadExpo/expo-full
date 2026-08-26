// /demo/trainee — renders the REAL ClientPortal in demoMode with a fixture
// dataset. Same component, same styling, same UX — only the data layer is
// stubbed and writes are no-ops. Lets a visiting coach see exactly what
// their athletes would see, without an account or any DB pollution.
import React, { useState } from 'react';
import ClientPortal from './ClientPortal';
import { C, FN } from './theme';
import {
  DEMO_CLIENT_ID,
  DEMO_TRAINEE,
  DEMO_PLANS,
  DEMO_EXERCISES,
  DEMO_CLIENT_WORKOUTS,
  DEMO_BW_LOG,
  DEMO_WEEKLY_FOCUS,
  DEMO_PORTAL_VIS,
} from './demoTraineeData';

export default function DemoTraineePortal({ onFilmSet = null } = {}) {
  // Local stand-ins for the setters ClientPortal expects. All writes stay
  // in-memory — closing the tab discards them.
  const [clientWorkouts, setClientWorkouts] = useState(DEMO_CLIENT_WORKOUTS);
  const [bwLog, setBwLog] = useState(DEMO_BW_LOG);
  const [weeklyFocus, setWeeklyFocus] = useState(DEMO_WEEKLY_FOCUS);
  const onDecrementSession = () => {};
  const updateFormVideos = () => {};
  const signOut = async () => { window.location.href = '/demo'; };
  // CoachLanding mounts this route in an iframe with `?embed=1` to render a
  // clean POV preview alongside the marketing copy. In that mode we hide
  // the sticky DEMO banner AND the ClientPortal EXPO header logo so the
  // iframe doesn't double-brand the page.
  const isEmbed = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('embed') === '1';

  return (
    // /demo/trainee — public marketing demo. Force dark while light-mode
    // rollout is gated to the coach app only.
    <div data-theme="dark" style={{ position: 'relative', minHeight: '100vh', background: C.bg }}>
      {/* Demo banner — slim, fixed at the top, non-intrusive */}
      {!isEmbed && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 60,
          background: 'transparent',
          borderBottom: `1px solid ${C.ac}`,
          padding: '6px 14px',
          fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
          color: C.ac, textAlign: 'center',
        }}>
          DEMO · ATHLETE PORTAL · CHANGES DON'T PERSIST
        </div>
      )}
      <ClientPortal
        clientId={DEMO_CLIENT_ID}
        signOut={signOut}
        clientWorkouts={clientWorkouts}
        setClientWorkouts={setClientWorkouts}
        bwLog={bwLog}
        setBwLog={setBwLog}
        weeklyFocus={weeklyFocus}
        setWeeklyFocus={setWeeklyFocus}
        portalVis={DEMO_PORTAL_VIS}
        trainerExercises={DEMO_EXERCISES}
        trainees={[DEMO_TRAINEE]}
        onDecrementSession={onDecrementSession}
        updateFormVideos={updateFormVideos}
        demoMode
        demoPlans={DEMO_PLANS}
        onFilmSet={onFilmSet}
        embedded={isEmbed}
      />
    </div>
  );
}
