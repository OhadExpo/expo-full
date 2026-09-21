// WHO IS A CLUB ATHLETE, in one place.
//
// Bnei Herzliya players are tagged into the BHBC zone and the CLUB pays for
// them — they are not paying clients of EXPO. Ohad, 21.9: "whenever athletes
// are tagged to bhbc / bnei hertzelia … remove the payments and billing from
// all their names".
//
// The predicate itself already existed FOUR times — DashboardView, TraineesView,
// TraineeDetail (as isClubAthleteRow) and inline in PlansView — which is how a
// rule ends up applied in three places and missed in the fourth. One export,
// imported everywhere.
//
// Three fields, because membership has been written three ways over time:
//   team   === 'BHBC'            the zone tag (Manage roster writes this)
//   format === 'Bnei Herzliya'   the athlete's training format
//   branch === 'Bnei Herzliya'   an older import path
// Any one of them means club.
export const isClubAthlete = (t) => !!t && (
  t.format === 'Bnei Herzliya' || t.branch === 'Bnei Herzliya' || t.team === 'BHBC'
);

// Kept as a named alias so the TraineeDetail call sites read the same as they
// did before the consolidation.
export const isClubAthleteRow = isClubAthlete;

export default isClubAthlete;
