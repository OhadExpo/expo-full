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

export default function DemoTraineePortal() {
  // Local stand-ins for the setters ClientPortal expects. All writes stay
  // in-memory — closing the tab discards them.
  const [clientWorkouts, setClientWorkouts] = useState(DEMO_CLIENT_WORKOUTS);
  const [bwLog, setBwLog] = useState(DEMO_BW_LOG);
  const [weeklyFocus, setWeeklyFocus] = useState(DEMO_WEEKLY_FOCUS);
  const onDecrementSession = () => {};
  const updateFormVideos = () => {};
  const signOut = async () => { window.location.href = '/demo'; };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: C.bg }}>
      {/* Demo banner — slim, fixed at the top, non-intrusive */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 60,
        background: `linear-gradient(90deg, ${C.ac}22 0%, ${C.ac}10 100%)`,
        borderBottom: `1px solid ${C.ac}55`,
        padding: '6px 14px',
        fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
        color: C.ac, textAlign: 'center',
      }}>
        DEMO · ATHLETE PORTAL · CHANGES DON'T PERSIST
      </div>
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
      />
    </div>
  );
}
