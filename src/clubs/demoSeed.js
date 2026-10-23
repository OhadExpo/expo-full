// A WHOLE SEASON FOR A DEMO CLUB (team version #904, Ohad 23.10: "demo for netanya needs to be perfect").
//
// Generated, never real: every player, number, check-in and injury below comes from a seeded random generator, so the
// same story plays on every demo, and every date is relative to TODAY, so the demo is always "this week". The shapes
// are exactly the live zone's store keys (expo-trainees rows tagged team 'BHBC', expo-bhbc-loads, -fixtures, -medical,
// -league, -gamewarmup, -activity) - the zone renders them through its normal code, nothing is special-cased.
//
// The story a club director sees:
//   - next game in two days, today is a practice + lift day, the morning check-in is in for most of the squad
//   - one player reported pain 5 this morning (the brief tells the coach to regress him today)
//   - one player is returning from an ankle sprain (limited -> return-to-play target in three days)
//   - one fresh hamstring strain (out), one managed knee tendinopathy (available, monitored), one resolved calf
//   - an import signing lands in four days
//   - a league table, results, box scores and per-player season stats, all consistent with each other

const DAY = 86400000;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const localToday = () => iso(new Date());
const add = (isoDate, n) => { const [y, m, d] = isoDate.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── the squad (fictional) ────────────────────────────────────────────────────────────────────────────────────────
const SQUAD = [
  // name, Hebrew name (the league feed's spelling), jersey, position, height cm, weight kg, age, nationality, role
  ['Marcus Whitfield', 'מרקוס וויטפילד', 1, 'Guard', 188, 84, 27, 'USA', 'starter'],
  ['Itay Ben-David', 'איתי בן דוד', 3, 'Guard', 186, 82, 25, 'ISR', 'starter'],
  ['Omer Shalev', 'עומר שלו', 5, 'Guard', 191, 86, 23, 'ISR', 'rotation'],
  ['Yonatan Peretz', 'יונתן פרץ', 7, 'Guard', 184, 79, 20, 'ISR', 'bench'],
  ['Kyle Brenner', 'קייל ברנר', 8, 'Forward', 203, 98, 26, 'USA', 'starter'],
  ['Noam Azulay', 'נועם אזולאי', 9, 'Guard', 194, 88, 28, 'ISR', 'rotation'],
  ['Daniel Mizrahi', 'דניאל מזרחי', 10, 'Forward', 199, 94, 30, 'ISR', 'starter'],
  ['Ido Friedman', 'עידו פרידמן', 12, 'Forward', 201, 97, 22, 'ISR', 'rotation'],
  ['Amit Rosen', 'עמית רוזן', 14, 'Forward', 197, 92, 19, 'ISR', 'bench'],
  ['Tomer Gabay', 'תומר גבאי', 15, 'Center', 207, 108, 29, 'ISR', 'rotation'],
  ['Liran Hadad', 'לירן חדד', 21, 'Guard', 189, 83, 24, 'ISR', 'bench'],
  ['Jalen Okafor', "ג'יילן אוקפור", 22, 'Forward', 204, 101, 25, 'USA', 'starter'],
  ['Eyal Biton', 'אייל ביטון', 24, 'Forward', 198, 93, 21, 'ISR', 'bench'],
  ['Darius Holloway', 'דריוס הולוואי', 33, 'Center', 210, 114, 28, 'USA', 'starter-new'],
];

// the league (12 clubs; the demo club is one of them). English = the club calendar's spelling, Hebrew = the feed's.
const LEAGUE_CLUBS = [
  ['Hapoel Kfar Saba', 'הפועל כפר סבא', 'Kfar Saba'], ['Maccabi Haifa', 'מכבי חיפה', 'Haifa'], ['Elitzur Yavne', 'אליצור יבנה', 'Yavne'],
  ['Hapoel Ramat Gan', 'הפועל רמת גן גבעתיים', 'Ramat Gan'], ['Hapoel Afula', 'הפועל עפולה', 'Afula'], ['Maccabi Hod HaSharon', 'מכבי הוד השרון', 'Hod HaSharon'],
  ['Ironi Kiryat Ata', 'עירוני קריית אתא', 'Kiryat Ata'], ['Hapoel Haifa', 'הפועל חיפה', 'Haifa'], ['Maccabi Kiryat Gat', 'מכבי קריית גת', 'Kiryat Gat'],
  ["Hapoel Ra'anana", 'הפועל רעננה', "Ra'anana"], ["Hapoel Be'er Sheva", 'הפועל באר שבע', "Be'er Sheva"],
];

const STAFF = { sc: 'gil.cohen@demo.club', head: 'ronen.levi@demo.club', pt: 'dana.mor@demo.club', asst: 'shai.amar@demo.club' };

const WARMUP = {
  title: 'Warm-Up',
  sections: [
    { name: 'Sidelines', drills: [
      ['Jog', '1 Way', 'Easy pace, tall posture'], ['A-Skip', '1 Way', 'Knee up, toe up, punch the ground'], ['B-Skip', '1 Way', 'Extend and paw back'],
      ['Carioca', '1 Way each side', 'Hips turn, shoulders stay square'], ['Lateral Shuffle', '1 Way each side', 'Low hips, no heel clicks'],
      ['Walking Lunge + Reach', '1 Way', 'Back knee kisses the floor'], ['Inchworm', '5 reps', 'Hands walk out to plank'], ['World\'s Greatest Stretch', '3 each side', 'Elbow to instep, rotate open'],
      ['Leg Swings Front/Back', '10 each', 'Hold the baseline'], ['Leg Swings Side', '10 each', 'Hips square'], ['Pogo Jumps', '2 x 10', 'Stiff ankles, quick contacts'],
      ['Backpedal', '1 Way', 'Chest over toes'], ['Build-up Sprint 70%', '1 Way', 'Relax the face'], ['Build-up Sprint 90%', '1 Way', 'Accelerate through the line'],
    ] },
    { name: 'Baseline', drills: [['Defensive Slides + Closeout', '3 trips', 'Chop the feet, high hands']] },
    { name: '2 Lines Facing the Basket', drills: [['Jump Stop + Pivot', '2 each', 'Land balanced, chin over knees']] },
    { name: 'Baseline + Top', drills: [['Partner Mirror Drill', '2 x 15s', 'React, do not guess']] },
  ].map((s) => ({ name: s.name, drills: s.drills.map(([name, dose, cue], i) => ({ n: i + 1, name, dose, cue })) })),
};

const LIFT_NOTES = ['Lower body strength', 'Upper body + trunk', 'Power: jumps + trap bar', 'Recovery flush + mobility'];
const SC_NOTES = ['Acceleration + change of direction', 'Landing mechanics + reactive jumps', 'Repeat sprint ability', 'Deceleration + closeouts'];

export function buildDemoSeason(club, today = localToday()) {
  const R = rng(9041023);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const between = (a, b) => a + Math.floor(R() * (b - a + 1));
  const T = today;
  const ids = SQUAD.map((s) => `demo_${club.id}_${s[2]}`);

  // ── roster ──
  const arrivalOf = { 33: add(T, 4) };   // the new center lands in four days
  const trainees = SQUAD.map(([name, nameHe, jersey, position, heightCm, weight, age, nationality], i) => {
    const y = new Date().getFullYear() - age;
    return {
      id: ids[i], name, nameHe, team: 'BHBC', format: club.short, status: 'Active', jersey, position, heightCm, height: (heightCm / 100).toFixed(2),
      weight, age, dob: `${y}-${String(1 + (jersey * 5) % 12).padStart(2, '0')}-${String(1 + (jersey * 7) % 27).padStart(2, '0')}`, nationality,
      ...(arrivalOf[jersey] ? { arrival: arrivalOf[jersey] } : {}), startDate: add(T, -70),
    };
  });
  const byJersey = Object.fromEntries(SQUAD.map((s, i) => [s[2], ids[i]]));

  // ── the calendar: a game every 7 days, two days from today ──
  const G0 = add(T, 2);                 // the next game
  const fixtures = [];
  const FIRST = -63, LAST = 49;          // pre-season start .. seven weeks ahead
  const gameDates = [];
  for (let k = -5; add(G0, k * 7) <= add(T, LAST); k++) gameDates.push(add(G0, k * 7));
  const scrimDates = [add(G0, -6 * 7 - 1), add(G0, -7 * 7 - 1), add(G0, -8 * 7 - 1)].filter((d) => d >= add(T, FIRST));
  const opp = LEAGUE_CLUBS.slice();      // round order
  const gameInfo = {};
  gameDates.forEach((d, r) => {
    const o = opp[r % opp.length]; const home = r % 2 === 0;
    gameInfo[d] = { round: r + 1, opp: o, home };
    fixtures.push({ date: d, type: 'game', start: '20:00', end: '22:00', minutes: 120, title: `${home ? 'vs' : '@'} ${o[0]}`, opponent: o[0], home, comp: club.league ? club.league.name : 'League', venue: home ? club.venue : `${o[2]} Sports Hall`, source: 'calendar',
      ...(!home && r % 4 === 1 ? { travel: { out: { date: d, dep: '15:30', arr: '17:15', label: 'Team bus' }, back: { date: d, dep: '22:45', arr: '00:30', label: 'Team bus' } } } : {}) });
    fixtures.push({ date: d, type: 'shootaround', start: '11:00', end: '12:00', minutes: 60, title: 'Shootaround', source: 'calendar', location: home ? club.venue : `${o[2]} Sports Hall` });
  });
  const SCRIM_OPP = [['Hapoel Even Yehuda', 'Pre-season'], ['Maccabi Ra\'anana', 'Pre-season'], ['Hapoel Hadera', 'Pre-season']];
  scrimDates.forEach((d, i) => { const us = between(74, 92), them = between(70, 90); fixtures.push({ date: d, type: 'scrimmage', start: '17:00', end: '19:00', minutes: 120, title: `Scrimmage vs ${SCRIM_OPP[i][0]}`, opponent: SCRIM_OPP[i][0], comp: 'Pre-season', home: i % 2 === 0, venue: i % 2 === 0 ? club.venue : 'Away', us, them: us === them ? them - 3 : them, played: add(d, 0) < T, source: 'calendar' }); });
  // practices + lifts around each game day (G): G-4 practice+lift, G-3 practice, G-2 practice+lift, G-1 practice (short), G+1 lift (recovery), G+2 off
  const dayKind = (d) => {
    for (const g of gameDates) {
      const diff = Math.round((new Date(d) - new Date(g)) / DAY);
      if (diff === 0) return 'game';
      if (diff === -1) return 'p90';
      if (diff === -2 || diff === -4) return 'p+l';
      if (diff === -3) return 'p';
      if (diff === 1) return 'rec';
      if (diff === 2) return 'off';
    }
    return null;
  };
  for (let n = FIRST; n <= LAST; n++) {
    const d = add(T, n);
    let k = dayKind(d);
    if (!k) k = new Date(d).getDay() === 6 ? 'off' : (n % 2 ? 'p' : 'p+l');   // pre-season: before the first league game
    if (scrimDates.includes(d)) continue;
    if (k === 'p' || k === 'p+l' || k === 'p90') fixtures.push({ date: d, type: 'practice', start: '16:00', end: k === 'p90' ? '17:30' : '18:00', minutes: k === 'p90' ? 90 : 120, title: 'Practice', source: 'calendar', location: club.venue });
    if (k === 'p+l') fixtures.push({ date: d, type: 'lift', start: '14:15', end: '15:15', minutes: 60, title: 'Weights', source: 'calendar', location: 'Club gym' });
    if (k === 'rec') fixtures.push({ date: d, type: 'lift', start: '11:00', end: '11:45', minutes: 45, title: 'Recovery + mobility', source: 'calendar', location: 'Club gym', optional: true });
  }
  fixtures.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  // ── medical: four stories + one closed file ──
  const J = byJersey;
  const inj = ({ j, ...o }) => ({ id: `inj_demo_${j}_${o.onsetDate.replace(/-/g, '')}`, by: STAFF.pt, updatedBy: STAFF.pt, createdAt: `${o.onsetDate}T09:30:00.000Z`, updatedAt: `${o.progress[o.progress.length - 1].date}T12:00:00.000Z`, pain: o.progress[o.progress.length - 1].pain, ...o, progress: o.progress.slice().reverse(), resolved: !!o.resolved });   // the zone keeps a file newest-first
  const medical = {
    [J[3]]: { injuries: [inj({ j: 3, bodyPart: 'Ankle', side: 'Left', type: 'Sprain', mechanism: 'Landed on a foot in a rebound', onsetDate: add(T, -12), rtpTarget: add(T, 3), status: 'limited', notes: 'Lateral ankle sprain, grade 1-2. Taping for court work; single-leg balance and hop progression.', progress: [
      { date: add(T, -12), status: 'out', pain: 6, note: 'Swelling, painful weight bearing. Ice, compression, protected walking.', by: STAFF.pt },
      { date: add(T, -8), status: 'non-contact', pain: 3, note: 'Full weight bearing. Bike + straight-line jog; balance work.', by: STAFF.pt },
      { date: add(T, -3), status: 'limited', pain: 2, note: 'Cutting at 80%. Practice without 5-on-5 contact.', by: STAFF.pt },
      { date: add(T, -1), status: 'limited', pain: 1, note: 'Hop tests 92% of the other side. Full practice Sunday if no reaction.', by: STAFF.pt },
    ] })] },
    [J[12]]: { injuries: [inj({ j: 12, bodyPart: 'Hamstring', side: 'Right', type: 'Strain', mechanism: 'Felt it on a sprint in transition', onsetDate: add(T, -3), rtpTarget: add(T, 18), status: 'out', notes: 'Posterior thigh pain on sprinting, tender mid-belly. Isometrics from day 2; running progression when pain-free.', progress: [
      { date: add(T, -3), status: 'out', pain: 5, note: 'Stopped practice. No sprinting; isometric bridges, walking.', by: STAFF.pt },
      { date: add(T, -1), status: 'out', pain: 3, note: 'Pain-free walking. Starting long-lever isometrics.', by: STAFF.pt },
    ] })] },
    [J[15]]: { injuries: [inj({ j: 15, bodyPart: 'Knee', side: 'Right', type: 'Tendinopathy', mechanism: 'Overuse - jump volume', onsetDate: add(T, -26), rtpTarget: add(T, -20), status: 'available', notes: 'Patellar tendon, managed. Heavy slow resistance twice a week; jump volume capped in practice.', progress: [
      { date: add(T, -26), status: 'limited', pain: 4, note: 'Pain on landing. Jump volume halved.', by: STAFF.pt },
      { date: add(T, -20), status: 'available', pain: 2, note: 'Full practice, HSR program twice a week.', by: STAFF.pt },
      { date: add(T, -6), status: 'available', pain: 1, note: 'Stable. Keep monitoring morning pain.', by: STAFF.pt },
    ] })] },
    [J[24]]: { injuries: [inj({ j: 24, bodyPart: 'Calf', side: 'Left', type: 'Strain', mechanism: 'Push-off on a closeout', onsetDate: add(T, -44), rtpTarget: add(T, -32), status: 'available', resolved: true, notes: 'Medial gastrocnemius strain. Returned after 12 days.', progress: [
      { date: add(T, -44), status: 'out', pain: 5, note: 'Tender, painful heel raise.', by: STAFF.pt },
      { date: add(T, -38), status: 'non-contact', pain: 2, note: 'Running progression.', by: STAFF.pt },
      { date: add(T, -32), status: 'available', pain: 0, note: 'Cleared. Full practice.', by: STAFF.pt },
    ] })] },
  };
  const AV_OF = { out: 4, 'non-contact': 3, limited: 2, available: 1 };
  // a player's medical availability on a date, from his file's progress notes
  const medAvail = (id, d) => {
    const m = medical[id]; if (!m) return 1;
    let av = 1;
    for (const i of m.injuries) {
      if (d < i.onsetDate) continue;
      const steps = i.progress.filter((p) => p.date <= d).sort((x, y) => x.date.localeCompare(y.date)); if (!steps.length) continue;
      av = Math.max(av, AV_OF[steps[steps.length - 1].status] || 1);
    }
    return av;
  };

  // ── loads: sessions, attendance, availability, readiness, bodyweight ──
  const loads = {};
  const SLEEP = ['poor', 'ok', 'good', 'great'], ENERGY = ['low', 'ok', 'good', 'high'];
  ids.forEach((id, i) => {
    const s = SQUAD[i];
    const rec = { loads: {}, sessions: {}, readiness: {}, attendance: {}, availability: {}, bw: {} };
    const arrival = arrivalOf[s[2]];
    for (let n = FIRST; n <= 0; n++) {
      const d = add(T, n);
      if (arrival && d < arrival) continue;
      const av = medAvail(id, d);
      const personal = s[2] === 21 && n === -9;   // one personal day (family)
      if (av > 1 || personal) rec.availability[d] = personal ? 5 : av;
      const dayFx = fixtures.filter((f) => f.date === d);
      if (!dayFx.length) continue;
      // morning check-in: most of the squad, most days
      if (n >= -20 && (R() < (n === 0 ? 0.86 : 0.8) || (n === 0 && s[2] === 9))) {   // the story player always checks in
        let sl = R() < 0.8 ? between(2, 3) : 1, en = R() < 0.8 ? between(2, 3) : 1, pain = av >= 3 ? between(3, 5) : av === 2 ? between(1, 3) : (R() < 0.85 ? 0 : between(1, 2));
        if (s[2] === 9 && n === 0) { sl = 0; en = 1; pain = 5; }                 // today's red flag
        if (s[2] === 10 && n >= -4) { sl = Math.min(sl, 1); en = Math.min(en, 1); } // short sleep run (travel, new baby)
        rec.readiness[d] = { sleep: SLEEP[sl], energy: ENERGY[en], pain };
        if (R() < 0.35) rec.bw[d] = Math.round((s[5] + (R() - 0.5) * 2.4) * 10) / 10;
      }
      if (n === 0) continue;   // today's sessions are not logged yet - the coach logs them
      const out = av === 4 || personal;
      const rows = [];
      for (const f of dayFx) {
        if (f.type === 'practice') {
          rec.attendance[`${d}|${f.start}`] = out ? 'out' : 'in';
          if (out) continue;
          const wu = { kind: 'warmup', type: 'Warm-up', min: 5, rpe: null, load: 0, team: true, start: f.start, attended: true, note: 'Court warm-up', teamNote: 'Court warm-up', ownNote: '', by: STAFF.sc };
          const scMin = av === 3 ? 0 : pick([10, 12, 15, 15, 20]);
          rows.push(wu);
          if (scMin) rows.push({ kind: 'sc', type: 'Conditioning', min: scMin, rpe: null, load: 0, team: true, start: f.start, attended: true, note: SC_NOTES[(n + 70) % 4], teamNote: SC_NOTES[(n + 70) % 4], ownNote: av === 2 ? 'No contact - modified volume' : '', by: STAFF.sc });
        }
        if (f.type === 'lift' && !out && !(f.optional && R() < 0.35)) rows.push({ kind: 'lift', type: 'Lift', min: f.optional ? 30 : between(38, 50), rpe: null, load: 0, team: false, attended: true, note: f.optional ? LIFT_NOTES[3] : LIFT_NOTES[(n + 70) % 3], by: STAFF.sc });
        if (f.type === 'shootaround' && !out) rows.push({ type: 'Shootaround', min: 60, team: true, start: '11:00', source: 'calendar' });
      }
      if (rows.length) rec.sessions[d] = rows;
    }
    loads[id] = rec;
  });

  // ── games: minutes + box scores, consistent with the result ──
  const leagueName = club.shortHe || club.short;
  const ROLE_MIN = { starter: [28, 35], 'starter-new': [0, 0], rotation: [16, 24], bench: [0, 12] };
  const playerLog = Object.fromEntries(ids.map((id) => [id, []]));
  const ourResults = {};
  for (const d of gameDates.filter((g) => g < T)) {
    const g = gameInfo[d];
    let us = 0; const lines = [];
    ids.forEach((id, i) => {
      const s = SQUAD[i];
      if ((arrivalOf[s[2]] && d < arrivalOf[s[2]]) || medAvail(id, d) >= 3) return;
      const [a, b] = ROLE_MIN[s[8]]; let min = between(a, b);
      if (s[8] === 'bench' && R() < 0.3) min = 0;
      if (!min) return;
      const big = s[3] === 'Center' || s[3] === 'Forward';
      const usage = min / 34 * (s[8] === 'starter' ? 1.15 : 0.85);
      const fg2a = Math.round((big ? 6 : 3.5) * usage + R() * 2), fg3a = Math.round((big ? 1 : 3.5) * usage + R() * 1.5), fta = Math.round(3 * usage * R() + (big ? 1 : 0));
      const fg2m = Math.round(fg2a * (0.45 + R() * 0.2)), fg3m = Math.round(fg3a * (0.28 + R() * 0.16)), ftm = Math.round(fta * (0.65 + R() * 0.25));
      const pts = fg2m * 2 + fg3m * 3 + ftm; us += pts;
      const oreb = Math.round((big ? 2.2 : 0.6) * usage * R() * 1.6), dreb = Math.round((big ? 5 : 2.4) * usage * (0.6 + R() * 0.8));
      const ast = Math.round((s[3] === 'Guard' ? 4.5 : 1.6) * usage * (0.5 + R())), stl = Math.round(R() * 2 * usage), blk = big ? Math.round(R() * 1.6 * usage) : 0, to = Math.round(R() * 2.6 * usage), pf = between(0, 4), fd = between(0, 4);
      lines.push({ id, s, min, box: { pts, reb: oreb + dreb, oreb, dreb, ast, stl, blk, blka: between(0, 1), to, pf, fd, fg2: { a: fg2a, m: fg2m }, fg3: { a: fg3a, m: fg3m }, ft: { a: fta, m: ftm }, starter: s[8] === 'starter', pm: 0, pir: 0 } });
    });
    const margin = [7, -4, 12, -9, 5, 3][g.round % 6];
    const them = Math.max(55, us - margin);
    ourResults[d] = { us, them };
    for (const l of lines) {
      const b = l.box;
      b.pm = Math.round((us - them) * (l.min / 40) + (R() - 0.5) * 8);
      b.pir = b.pts + b.reb + b.ast + b.stl + b.blk + b.fd - (b.fg2.a - b.fg2.m) - (b.fg3.a - b.fg3.m) - (b.ft.a - b.ft.m) - b.to - b.pf - b.blka;
      const rec = loads[l.id];
      rec.sessions[d] = [...(rec.sessions[d] || []), { kind: 'game', type: 'Game', min: l.min, box: b, opp: g.opp[0], comp: club.league ? club.league.name : 'League', home: g.home, start: '20:00', rpe: null, load: 0, source: 'league feed', attended: true }];
      playerLog[l.id].push({ date: d, opp: g.opp[1], min: l.min, jersey: l.s[2], name: l.s[1], ...b, tp: b.fg3 });
    }
  }
  // the played scrimmages: minutes only (no feed for a prep game)
  for (const f of fixtures.filter((x) => x.type === 'scrimmage' && x.played)) {
    ids.forEach((id, i) => { if (medAvail(id, f.date) >= 3 || (arrivalOf[SQUAD[i][2]] && f.date < arrivalOf[SQUAD[i][2]])) return; const rec = loads[id]; rec.sessions[f.date] = [...(rec.sessions[f.date] || []), { kind: 'game', type: 'Game', min: between(10, 30), rpe: null, load: 0, opp: f.opponent, comp: 'Pre-season', home: f.home, start: '17:00', attended: true }]; rec.attendance[`${f.date}|17:00`] = 'in'; });
  }
  fixtures.forEach((f) => { if (f.type === 'game' && ourResults[f.date]) { f.us = ourResults[f.date].us; f.them = ourResults[f.date].them; f.played = true; } });

  // ── the league feed: all 12 clubs, a round a week ──
  const teams = [[club.short, leagueName], ...LEAGUE_CLUBS.map((c) => [c[0], c[1]])];
  const strength = teams.map((_, i) => (i === 0 ? 0 : [6, 4, 2, 1, -1, -2, -3, 3, -5, 0, -4][i - 1]));
  const games = [];
  gameDates.forEach((d, r) => {
    const g = gameInfo[d];
    const oi = teams.findIndex((t) => t[0] === g.opp[0]);
    const others = teams.map((_, i) => i).filter((i) => i !== 0 && i !== oi);
    // rotate the other ten into five pairs
    const rot = others.map((_, k) => others[(k + r) % others.length]);
    const pairs = [[0, oi], ...Array.from({ length: 5 }, (_, k) => [rot[k], rot[9 - k]])];
    pairs.forEach(([h0, a0], k) => {
      const [h, a] = k === 0 ? (g.home ? [0, oi] : [oi, 0]) : (r % 2 ? [a0, h0] : [h0, a0]);
      const played = d < T;
      let hs = null, as = null;
      if (played) {
        if (k === 0) { const res = ourResults[d]; hs = g.home ? res.us : res.them; as = g.home ? res.them : res.us; }
        else { hs = between(72, 92) + strength[h] + 3; as = between(72, 92) + strength[a]; if (hs === as) hs += 2; }
      }
      games.push({ round: r + 1, stage: null, gameId: `demo-${r + 1}-${k + 1}`, date: d, time: k === 0 ? '20:00' : ['19:00', '19:30', '20:00', '20:30', '21:00'][k - 1], home: teams[h][1], away: teams[a][1], arena: h === 0 ? club.venueHe || club.venue : `אולם ${LEAGUE_CLUBS[h - 1] ? LEAGUE_CLUBS[h - 1][1].split(' ').slice(1).join(' ') : ''}`, played, hs, as });
    });
  });
  const table = teams.map((t) => ({ team: t[1], gp: 0, w: 0, l: 0, pf: 0, pa: 0, form: [] }));
  for (const g of games.filter((x) => x.played)) {
    const hi = teams.findIndex((t) => t[1] === g.home), ai = teams.findIndex((t) => t[1] === g.away);
    const H = table[hi], A = table[ai];
    H.gp++; A.gp++; H.pf += g.hs; H.pa += g.as; A.pf += g.as; A.pa += g.hs;
    if (g.hs > g.as) { H.w++; A.l++; H.form.push('W'); A.form.push('L'); } else { A.w++; H.l++; A.form.push('W'); H.form.push('L'); }
  }
  const standings = table.map((t) => ({ ...t, diff: t.pf - t.pa, form: t.form.slice(-5) }))
    .sort((x, y) => (y.w - x.w) || (y.diff - x.diff)).map((t, i) => ({ rank: i + 1, ...t }));
  const us = table[0];
  const players = ids.map((id, i) => {
    const log = playerLog[id]; if (!log.length) return null;
    const sum = (f) => log.reduce((a, x) => a + (typeof f === 'function' ? f(x) : x[f]), 0);
    const gp = log.length, min = sum('min'), pts = sum('pts'), reb = sum('reb'), ast = sum('ast'), fta = sum((x) => x.ft.a), ftm = sum((x) => x.ft.m), tpa = sum((x) => x.fg3.a), tpm = sum((x) => x.fg3.m), pir = sum('pir');
    const r1 = (v) => Math.round(v * 10) / 10;
    return { name: SQUAD[i][1], jersey: SQUAD[i][2], gp, min, mpg: r1(min / gp), pts, ppg: r1(pts / gp), reb, rpg: r1(reb / gp), ast, apg: r1(ast / gp), stl: sum('stl'), to: sum('to'), pm: sum('pm'), pir, pirpg: r1(pir / gp), fta, ftm, ftp: fta ? Math.round(ftm / fta * 100) : 0, tpa, tpm, tpp: tpa ? Math.round(tpm / tpa * 100) : 0, log };
  }).filter(Boolean);
  // the season the zone calls current (it rolls over in August)
  const now = new Date(); const seasonStart = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const league = {
    season: `${seasonStart}/${String((seasonStart + 1) % 100).padStart(2, '0')}`, cYear: seasonStart + 1,
    team: { name: leagueName, gp: us.gp, w: us.w, l: us.l, pf: us.pf, pa: us.pa, ppg: us.gp ? Math.round(us.pf / us.gp * 10) / 10 : 0, oppg: us.gp ? Math.round(us.pa / us.gp * 10) / 10 : 0 },
    games, standings, players, archive: {}, updatedAt: `${add(T, 0)}T06:00:00.000Z`,
  };

  // ── programs (the athlete-portal block each player is on) ──
  const planIndex = [], plans = {};
  const DAYS = [
    { name: 'Day A - Lower', ex: [['Trap Bar Deadlift', '4', '5', 'Explode up, control down'], ['Rear-Foot Elevated Split Squat', '3', '6 each', '3 s down'], ['Nordic Hamstring Curl', '3', '5', 'Hold the line as long as you can'], ['Copenhagen Plank', '3', '20 s each', ''], ['Pogo Jumps', '3', '15', 'Quick ground contacts']] },
    { name: 'Day B - Upper', ex: [['Dumbbell Bench Press', '4', '6', ''], ['Chest-Supported Row', '4', '8', 'Squeeze 1 s at the top'], ['Landmine Press', '3', '8 each', ''], ['Pull-Up', '3', '6', 'Full hang to chin over'], ['Pallof Press', '3', '10 each', 'Ribs down']] },
    { name: 'Day C - Power', ex: [['Hang Clean Pull', '4', '3', 'Fast elbows'], ['Box Jump', '4', '3', 'Stick the landing'], ['Med Ball Rotational Throw', '3', '5 each', ''], ['Single-Leg RDL', '3', '6 each', ''], ['Tibialis Raise', '2', '15', '']] },
  ];
  ids.forEach((id, i) => {
    const pid = `plan_demo_${id}`;
    planIndex.push({ id: pid, traineeId: id, name: `In-season Block #${2 + (i % 2)}`, weeks: 4, active: true });
    plans[pid] = { id: pid, name: `In-season Block #${2 + (i % 2)}`, weeks: 4, days: DAYS.map((dd) => ({ name: dd.name, exercises: dd.ex.map(([title, sets, reps, notes]) => ({ title, sets, reps, notes })) })) };
  });

  // ── the activity trail (owner view): the staff working in the zone ──
  const activity = [];
  const at = (d, hh, mm) => new Date(`${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).toISOString();
  for (let n = -10; n <= 0; n++) {
    const d = add(T, n); const kinds = fixtures.filter((f) => f.date === d).map((f) => f.type);
    if (n < 0 && kinds.includes('practice')) activity.push({ at: at(d, 18, 20 + (n & 7)), by: STAFF.sc, kind: 'session', what: `logged the practice and an S&C session on ${d} 16:00 · ${pick([12, 15, 20])} min · ${between(11, 13)} in` });
    if (n < 0 && kinds.includes('lift')) activity.push({ at: at(d, 15, 30), by: STAFF.sc, kind: 'session', what: `logged a lift on ${d} · ${between(38, 50)} min` });
    if (kinds.length) activity.push({ at: at(d, 8, 10 + (n & 15)), by: STAFF.sc, kind: 'checkin', what: `saved the readiness check-in for ${d}` });
    if (n < 0 && kinds.includes('game')) activity.push({ at: at(add(d, 1), 9, 5), by: STAFF.sc, kind: 'game', what: `logged game minutes for ${d}` });
    activity.push({ at: at(d, 7, 40), by: STAFF.head, kind: 'open', what: 'opened the club zone' });
  }
  activity.push({ at: at(add(T, -3), 19, 2), by: STAFF.pt, kind: 'medical', what: 'updated a medical record' });
  activity.push({ at: at(add(T, -1), 13, 15), by: STAFF.pt, kind: 'medical', what: 'updated a medical record' });
  activity.push({ at: at(add(T, -5), 21, 0), by: STAFF.head, kind: 'schedule', what: `changed a slot on ${add(T, 1)}` });
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return { trainees, loads, fixtures, medical, league, gameWarmup: WARMUP, planIndex, plans, activity, staff: STAFF };
}
