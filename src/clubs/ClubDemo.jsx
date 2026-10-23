// /demo/club/<slug> - a club's own sales demo of the zone (team version #904, Ohad 23.10: "demo for netanya needs to
// be perfect").
//
// The REAL zone (BhbcView) on a generated season (demoSeed.js), wearing the club's config (clubs.js). Every setter is
// in memory: a director can log a lift, record an injury or move a practice and watch the board change, and a reload
// starts the same story again. Nothing reads or writes the database.
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { DEMO_CLUBS } from './clubs';
import { buildDemoSeason } from './demoSeed';
import { buildSoccerSeason } from './soccerSeed';
import { SHARON, GALIL } from './demoClubs';
import ClubTour from './ClubTour';
import ClubDemoIndex from './ClubDemoIndex';
import { readLang } from '../i18n';
import { C, FN } from '../theme';

const BhbcView = lazy(() => import('../BhbcView'));

export default function ClubDemo({ slug }) {
  const club = { ...DEMO_CLUBS, sharon: SHARON, galil: GALIL }[slug] || null;
  const seed = useMemo(() => (!club ? null : club.sport === 'soccer' ? buildSoccerSeason(club) : buildDemoSeason(club)), [club]);
  const [trainees, setTrainees] = useState(() => (seed ? seed.trainees : []));
  const [loads, setLoads] = useState(() => (seed ? seed.loads : {}));
  const [fixtures, setFixtures] = useState(() => (seed ? seed.fixtures : []));
  const [medical, setMedical] = useState(() => (seed ? seed.medical : {}));
  // THE NAMES IN THE ZONE'S LANGUAGE: a Hebrew screen says the players' names in Hebrew (the league feed already does)
  const [zoneLang, setZoneLang] = useState('en');
  const shownTrainees = useMemo(() => (zoneLang === 'he' ? trainees.map((t) => (t && t.nameHe ? { ...t, name: t.nameHe } : t)) : trainees), [trainees, zoneLang]);
  // the banner + tour are drawn INSIDE the zone, in the zone's language (it owns the toggle)
  const demo = useMemo(() => (seed ? { activity: seed.activity, plans: seed.plans, chrome: (t) => <ClubTour he={t.he} base={club.routeBase} accent={club.palette.accent} onAccent={club.palette.onAccent} />, onLang: setZoneLang } : null), [seed, club]);

  // the club on the tab: its name and its crest (the zone's own shell is EXPO's index.html)
  useEffect(() => {
    if (!club) return undefined;
    const prevTitle = document.title;
    document.title = `${club.short} · S&C`;
    const icons = [...document.querySelectorAll('link[rel~="icon"]')];
    const prev = icons.map((l) => l.getAttribute('href'));
    icons.forEach((l) => l.setAttribute('href', club.crest));
    const tc = document.querySelector('meta[name="theme-color"]'); const prevTc = tc && tc.getAttribute('content');
    if (tc) tc.setAttribute('content', club.palette.header);
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    robots.setAttribute('content', 'noindex, nofollow');   // a prospect's demo is shared by link, never indexed
    return () => { document.title = prevTitle; icons.forEach((l, i) => l.setAttribute('href', prev[i])); if (tc && prevTc) tc.setAttribute('content', prevTc); };
  }, [club]);
  if (!slug) return <ClubDemoIndex lang={readLang()} />;
  if (!club) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.bg, color: C.tx, fontFamily: FN }}>Demo not found</div>;
  }
  return (
    <>
      <Suspense fallback={<div style={{ minHeight: '100vh', background: C.bg }} />}>
        <BhbcView club={club} demo={demo}
          trainees={shownTrainees} setTrainees={setTrainees} bhbcLoads={loads} setBhbcLoads={setLoads} bhbcFixtures={fixtures} setBhbcFixtures={setFixtures}
          league={seed.league} gameWarmup={seed.gameWarmup} medical={medical} setMedical={setMedical} planIndex={seed.planIndex}
          exercises={[]} clientWorkouts={[]} portalVis={{}} bwLog={[]} weeklyFocus={{}}
          coach={false} canMedical canLogLoad currentUser={seed.staff.sc} />
      </Suspense>
    </>
  );
}
