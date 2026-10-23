// /demo/club/<slug> - a club's own sales demo of the zone (team version #904, Ohad 23.10: "demo for netanya needs to
// be perfect").
//
// The REAL zone (BhbcView) on a generated season (demoSeed.js), wearing the club's config (clubs.js). Every setter is
// in memory: a director can log a lift, record an injury or move a practice and watch the board change, and a reload
// starts the same story again. Nothing reads or writes the database.
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { buildDemoSeason } from './demoSeed';
import { buildSoccerSeason } from './soccerSeed';
import { demoClubBySlug } from './demoClubs';
import ClubTour from './ClubTour';
import { hebrewFixtures, hebrewLoads, hebrewMedical, hebrewWarmup, hebrewPlanIndex, hebrewPlans, hebrewStaffName } from './demoHebrew';
import ClubDemoIndex from './ClubDemoIndex';
import { readLang } from '../i18n';
import { C, FN } from '../theme';

const BhbcView = lazy(() => import('../BhbcView'));

export default function ClubDemo({ slug }) {
  const club = demoClubBySlug(slug);
  const seed = useMemo(() => (!club ? null : club.sport === 'soccer' ? buildSoccerSeason(club) : buildDemoSeason(club)), [club]);
  const [trainees, setTrainees] = useState(() => (seed ? seed.trainees : []));
  const [loads, setLoads] = useState(() => (seed ? seed.loads : {}));
  const [fixtures, setFixtures] = useState(() => (seed ? seed.fixtures : []));
  const [medical, setMedical] = useState(() => (seed ? seed.medical : {}));
  // THE NAMES IN THE ZONE'S LANGUAGE: a Hebrew screen says the players' names in Hebrew (the league feed already does)
  const [zoneLang, setZoneLang] = useState('en');
  const he = zoneLang === 'he';
  const shownTrainees = useMemo(() => (he ? trainees.map((t) => (t && t.nameHe ? { ...t, name: t.nameHe } : t)) : trainees), [trainees, he]);
  // ...and the season's own text too (notes, opponents, venues, warm-up cues, programs) - display only (demoHebrew.js)
  const shownLoads = useMemo(() => (he ? hebrewLoads(loads) : loads), [loads, he]);
  const shownFixtures = useMemo(() => (he ? hebrewFixtures(fixtures, club) : fixtures), [fixtures, he, club]);
  const shownMedical = useMemo(() => (he ? hebrewMedical(medical) : medical), [medical, he]);
  const shownWarmup = useMemo(() => (seed && he ? hebrewWarmup(seed.gameWarmup) : seed && seed.gameWarmup), [seed, he]);
  const shownPlanIndex = useMemo(() => (seed && he ? hebrewPlanIndex(seed.planIndex) : seed && seed.planIndex), [seed, he]);
  // THE PLAYER'S OWN APP (the athlete portal, the real one in demo mode): each player's program in the portal's shape,
  // its exercises as a small library (titles; no videos in a demo). One stable object per player - the portal reloads
  // when the reference changes.
  const portal = useMemo(() => {
    if (!seed) return null;
    const plans = he ? hebrewPlans(seed.plans) : seed.plans;
    const lib = new Map();
    const idOf = (title) => { const id = 'cx_' + String(title).toLowerCase().replace(/[^a-z0-9]+/g, '_'); if (!lib.has(id)) lib.set(id, { id, title }); return id; };
    const byPlayer = {};
    for (const p of seed.planIndex) {
      const full = plans[p.id]; if (!full) continue;
      byPlayer[p.traineeId] = [{ id: full.id, name: full.name, traineeId: p.traineeId, active: true, weeks: full.weeks || 4, createdAt: new Date(Date.now() - 9 * 86400000).toISOString(),
        days: (full.days || []).map((d) => ({ name: d.name, exercises: (d.exercises || []).map((e) => ({ eid: idOf(e.title), s: e.sets, r: e.reps, notes: e.notes || '' })) })) }];
    }
    return { plansFor: (id) => byPlayer[id] || [], exercises: [...lib.values()] };
  }, [seed, he]);
  // the banner + tour are drawn INSIDE the zone, in the zone's language (it owns the toggle)
  const demo = useMemo(() => (seed ? { activity: seed.activity, plans: he ? hebrewPlans(seed.plans) : seed.plans, chrome: (t) => <ClubTour he={t.he} base={club.routeBase} accent={club.palette.accent} onAccent={club.palette.onAccent} />, onLang: setZoneLang, staffName: he ? hebrewStaffName : null, portalPlans: portal && portal.plansFor, portalExercises: portal && portal.exercises } : null), [seed, club, he, portal]);

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
          trainees={shownTrainees} setTrainees={setTrainees} bhbcLoads={shownLoads} setBhbcLoads={setLoads} bhbcFixtures={shownFixtures} setBhbcFixtures={setFixtures}
          league={seed.league} gameWarmup={shownWarmup} medical={shownMedical} setMedical={setMedical} planIndex={shownPlanIndex}
          exercises={[]} clientWorkouts={[]} portalVis={{}} bwLog={[]} weeklyFocus={{}}
          coach={false} canMedical canLogLoad currentUser={seed.staff.sc} />
      </Suspense>
    </>
  );
}
