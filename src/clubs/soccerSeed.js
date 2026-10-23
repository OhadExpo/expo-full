// A WHOLE SEASON FOR A DEMO SOCCER CLUB (team version #904, Ohad 23.10: "Israeli sports team > soccer and basketball").
// Same contract as demoSeed.js (basketball): generated, deterministic, dated from today, in the zone's own store shapes.
// Football's week is the MD cycle: a match every 7 days, today = MD-2.
//
// The story: the derby is in two days; a midfielder reported pain this morning; the first-choice right back is back
// from an adductor strain (limited, return target in four days); a striker pulled a hamstring at the weekend (out);
// a centre back manages Achilles pain; a winger's ankle is closed; a loan signing lands in five days.
import { localToday } from './demoSeed.js';

const add = (isoDate, n) => { const [y, m, d] = isoDate.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// name, jersey, position, height cm, weight kg, age, nationality, role (xi = first eleven, sub, res = reserve)
const SQUAD = [
  ['Ofer Halfon', 1, 'Goalkeeper', 188, 82, 29, 'ISR', 'xi'], ['Roi Saban', 22, 'Goalkeeper', 190, 84, 23, 'ISR', 'res'], ['Ilay Dahan', 31, 'Goalkeeper', 186, 80, 19, 'ISR', 'res'],
  ['Guy Hazan', 2, 'Defender', 178, 72, 26, 'ISR', 'xi'], ['Matan Elkayam', 4, 'Defender', 187, 83, 28, 'ISR', 'xi'], ['Nikola Petrovic', 5, 'Defender', 191, 86, 30, 'SRB', 'xi'],
  ['Oren Levy', 3, 'Defender', 180, 74, 24, 'ISR', 'xi'], ['Eden Shalom', 13, 'Defender', 183, 77, 21, 'ISR', 'sub'], ['Bar Kedem', 15, 'Defender', 185, 80, 25, 'ISR', 'sub'],
  ['Yuval Ashkenazi', 23, 'Defender', 176, 70, 20, 'ISR', 'res'], ['Shay Malka', 26, 'Defender', 184, 79, 22, 'ISR', 'res'],
  ['Dor Amsalem', 6, 'Midfielder', 179, 73, 27, 'ISR', 'xi'], ['Tomas Ferreira', 8, 'Midfielder', 176, 71, 26, 'POR', 'xi'], ['Lior Avidan', 10, 'Midfielder', 172, 66, 24, 'ISR', 'xi'],
  ['Amir Biton', 14, 'Midfielder', 181, 75, 29, 'ISR', 'sub'], ['Neta Golan', 16, 'Midfielder', 175, 69, 21, 'ISR', 'sub'], ['Sagi Zaken', 18, 'Midfielder', 177, 72, 19, 'ISR', 'res'],
  ['Elior Mizrahi', 20, 'Midfielder', 174, 68, 23, 'ISR', 'sub'],
  ['Kwame Mensah', 7, 'Striker', 177, 72, 25, 'GHA', 'xi'], ['Itamar Sela', 9, 'Striker', 186, 81, 27, 'ISR', 'xi'], ['Daniel Ohayon', 11, 'Striker', 173, 67, 22, 'ISR', 'xi'],
  ['Gal Shriki', 17, 'Striker', 180, 74, 24, 'ISR', 'sub'], ['Moshe Avraham', 19, 'Striker', 182, 76, 20, 'ISR', 'res'], ['Lucas Moreau', 21, 'Striker', 184, 78, 23, 'FRA', 'new'],
];
const CLUBS = [
  ['Hapoel Hadera FC', 'הפועל חדרה'], ['Ironi Kiryat Shmona', 'עירוני קריית שמונה'], ['Hapoel Nof HaGalil', 'הפועל נוף הגליל'], ['Hapoel Jerusalem FC', 'הפועל ירושלים'],
  ['Hapoel Ramat Gan FC', 'הפועל רמת גן'], ['Hapoel Kfar Saba FC', 'הפועל כפר סבא'], ['Maccabi Jaffa', 'מכבי יפו'], ['Hapoel Afula FC', 'הפועל עפולה'],
  ['Hapoel Rishon LeZion', 'הפועל ראשון לציון'], ['Hapoel Umm al-Fahm', 'הפועל אום אל פאחם'], ['Ironi Tiberias', 'עירוני טבריה'], ['Hapoel Akko', 'הפועל עכו'],
  ['Maccabi Kabilio Jaffa', 'מכבי קביליו יפו'], ['Hapoel Petah Tikva', 'הפועל פתח תקווה'], ['Sektzia Ness Ziona', 'סקציה נס ציונה'],
];
const STAFF = { sc: 'nir.tal@demo.club', head: 'avi.shitrit@demo.club', pt: 'noam.ben@demo.club' };

const WARMUP = {
  title: 'Warm-Up',
  sections: [
    { name: 'Running', drills: [['Jog straight ahead', '2 lengths', 'Easy, relaxed'], ['Hip out', '2 lengths', 'Open the knee, stay tall'], ['Hip in', '2 lengths', 'Close the knee across'], ['Circling partner', '2 lengths', 'Small steps, low hips'], ['Shoulder contact', '2 lengths', 'Jump and meet the shoulder'], ['Quick forwards and backwards', '2 lengths', 'Short steps back']] },
    { name: 'Strength, plyometrics, balance', drills: [['Plank', '3 x 20 s', 'Straight line head to heel'], ['Side plank', '3 x 20 s each', 'Hips high'], ['Nordic hamstring', '1 x 5', 'Hold the fall as long as you can'], ['Single-leg balance + ball', '2 x 30 s each', 'Knee over toes'], ['Squats + toe raise', '2 x 30 s', 'Knee never caves in'], ['Jumping: vertical', '2 x 30 s', 'Land softly']] },
    { name: 'Running, fast', drills: [['Across the pitch', '2 lengths', '75-80% of top speed'], ['Bounding', '2 lengths', 'Knee up, land on the forefoot'], ['Plant and cut', '2 lengths', 'Cut off the outside foot']] },
  ].map((s) => ({ name: s.name, drills: s.drills.map(([name, dose, cue], i) => ({ n: i + 1, name, dose, cue })) })),
};

// the players' names in Hebrew (a Hebrew screen says them in Hebrew)
const NAME_HE = {1: 'עופר חלפון', 22: 'רועי סבן', 31: 'עילאי דגן', 2: 'גיא חזן', 4: 'מתן אלקיים', 5: 'ניקולה פטרוביץ׳', 3: 'אורן לוי', 13: 'עדן שלום', 15: 'בר קדם', 23: 'יובל אשכנזי', 26: 'שי מלכה', 6: 'דור אמסלם', 8: 'תומאס פריירה', 10: 'ליאור אבידן', 14: 'אמיר ביטון', 16: 'נטע גולן', 18: 'שגיא זכן', 20: 'אליאור מזרחי', 7: 'קוואמה מנסה', 9: 'איתמר סלע', 11: 'דניאל אוחיון', 17: 'גל שריקי', 19: 'משה אברהם', 21: 'לוקה מורו'};

export function buildSoccerSeason(club, today = localToday()) {
  const R = rng(9041024);
  const between = (a, b) => a + Math.floor(R() * (b - a + 1));
  const T = today;
  const ids = SQUAD.map((s) => `demo_${club.id}_${s[1]}`);
  const arrivalOf = { 21: add(T, 5) };
  const trainees = SQUAD.map(([name, jersey, position, heightCm, weight, age, nationality], i) => ({
    id: ids[i], name, nameHe: NAME_HE[jersey], team: 'BHBC', format: club.short, status: 'Active', jersey, position, heightCm, height: (heightCm / 100).toFixed(2), weight, age,
    dob: `${new Date().getFullYear() - age}-${String(1 + (jersey * 5) % 12).padStart(2, '0')}-${String(1 + (jersey * 7) % 27).padStart(2, '0')}`, nationality,
    ...(arrivalOf[jersey] ? { arrival: arrivalOf[jersey] } : {}), startDate: add(T, -80),
  }));
  const byJ = Object.fromEntries(SQUAD.map((s, i) => [s[1], ids[i]]));

  // ── the calendar: MD cycle, match in two days ──
  const G0 = add(T, 2), FIRST = -70, LAST = 49;
  const gameDates = []; for (let k = -7; add(G0, k * 7) <= add(T, LAST); k++) gameDates.push(add(G0, k * 7));
  const gameInfo = {}, fixtures = [];
  gameDates.forEach((d, r) => {
    const o = CLUBS[r % CLUBS.length]; const home = r % 2 === 1;
    gameInfo[d] = { round: r + 1, opp: o, home };
    fixtures.push({ date: d, type: 'game', start: '19:00', end: '21:00', minutes: 120, title: `${home ? 'vs' : '@'} ${o[0]}`, opponent: o[0], home, comp: club.league.name, venue: home ? club.venue : `${o[0].replace(/ FC$/, '')} Stadium`, source: 'calendar' });
  });
  const md = (d) => { for (const g of gameDates) { const x = Math.round((new Date(d) - new Date(g)) / 86400000); if (x >= -5 && x <= 1) return x; } return null; };
  for (let n = FIRST; n <= LAST; n++) {
    const d = add(T, n); const m = md(d);
    if (m === 0 || m === -5 || m == null && new Date(d).getDay() === 6) continue;   // match day, and MD+2 (= MD-5) off
    if (m === 1) { fixtures.push({ date: d, type: 'practice', start: '10:00', end: '11:00', minutes: 60, title: 'Recovery', source: 'calendar', location: 'Training ground', optional: true }); continue; }
    if (m === -1) { fixtures.push({ date: d, type: 'practice', start: '10:00', end: '11:00', minutes: 60, title: 'Activation', source: 'calendar', location: club.venue }); continue; }
    fixtures.push({ date: d, type: 'practice', start: '10:00', end: '11:30', minutes: 90, title: 'Training', source: 'calendar', location: 'Training ground' });
    if (m === -4 || m === -2 || m == null) fixtures.push({ date: d, type: 'lift', start: '12:00', end: '12:45', minutes: 45, title: 'Gym', source: 'calendar', location: 'Club gym' });
  }
  fixtures.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  // ── medical ──
  const inj = ({ j, ...o }) => ({ id: `inj_demo_${j}_${o.onsetDate.replace(/-/g, '')}`, by: STAFF.pt, updatedBy: STAFF.pt, createdAt: `${o.onsetDate}T09:30:00.000Z`, updatedAt: `${o.progress[o.progress.length - 1].date}T12:00:00.000Z`, pain: o.progress[o.progress.length - 1].pain, ...o, progress: o.progress.slice().reverse(), resolved: !!o.resolved });
  const p = (n, status, pain, note) => ({ date: add(T, n), status, pain, note, by: STAFF.pt });
  const medical = {
    [byJ[2]]: { injuries: [inj({ j: 2, bodyPart: 'Groin', side: 'Left', type: 'Strain', mechanism: 'Long pass under fatigue', onsetDate: add(T, -16), rtpTarget: add(T, 4), status: 'limited', notes: 'Adductor longus strain, grade 1. Copenhagen progression; long passing reintroduced.', progress: [p(-16, 'out', 5, 'Pain on squeeze test 4/10.'), p(-10, 'non-contact', 3, 'Running straight lines, no long passing.'), p(-4, 'limited', 2, 'Joined team work without small-sided games.'), p(-1, 'limited', 1, 'Squeeze test pain-free. Full training Sunday if no reaction.')] })] },
    [byJ[9]]: { injuries: [inj({ j: 9, bodyPart: 'Hamstring', side: 'Right', type: 'Strain', mechanism: 'Sprint in behind, 70th minute', onsetDate: add(T, -5), rtpTarget: add(T, 16), status: 'out', notes: 'Biceps femoris, mid-belly. Isometrics, then the running ladder.', progress: [p(-5, 'out', 6, 'Came off in the match. Ice and protected walking.'), p(-2, 'out', 3, 'Pain-free walking, isometric bridges.')] })] },
    [byJ[5]]: { injuries: [inj({ j: 5, bodyPart: 'Achilles', side: 'Left', type: 'Tendinopathy', mechanism: 'Overuse', onsetDate: add(T, -30), rtpTarget: add(T, -24), status: 'available', notes: 'Mid-portion, managed. Heavy calf loading 3x a week; morning stiffness tracked.', progress: [p(-30, 'limited', 4, 'Morning stiffness, pain on hopping.'), p(-24, 'available', 2, 'Full training with calf program.'), p(-7, 'available', 1, 'Stable.')] })] },
    [byJ[11]]: { injuries: [inj({ j: 11, bodyPart: 'Ankle', side: 'Right', type: 'Sprain', mechanism: 'Tackle', onsetDate: add(T, -48), rtpTarget: add(T, -36), status: 'available', resolved: true, notes: 'Lateral sprain, grade 1. Returned after 12 days.', progress: [p(-48, 'out', 5, 'Swelling.'), p(-42, 'non-contact', 2, 'Running.'), p(-36, 'available', 0, 'Cleared.')] })] },
  };
  const AV = { out: 4, 'non-contact': 3, limited: 2, available: 1 };
  const medAvail = (id, d) => { const m = medical[id]; if (!m) return 1; let av = 1; for (const i of m.injuries) { const st = i.progress.filter((x) => x.date <= d).sort((a, b) => a.date.localeCompare(b.date)); if (st.length) av = Math.max(av, AV[st[st.length - 1].status] || 1); } return av; };

  // ── loads ──
  const SLEEP = ['poor', 'ok', 'good', 'great'], ENERGY = ['low', 'ok', 'good', 'high'];
  const loads = {};
  ids.forEach((id, i) => {
    const s = SQUAD[i]; const rec = { loads: {}, sessions: {}, readiness: {}, attendance: {}, availability: {}, bw: {} };
    for (let n = FIRST; n <= 0; n++) {
      const d = add(T, n); if (arrivalOf[s[1]] && d < arrivalOf[s[1]]) continue;
      const av = medAvail(id, d); if (av > 1) rec.availability[d] = av;
      const dayFx = fixtures.filter((f) => f.date === d); if (!dayFx.length) continue;
      if (n >= -20 && (R() < (n === 0 ? 0.9 : 0.82) || (n === 0 && s[1] === 6))) {   // the story player always checks in
        let sl = R() < 0.8 ? between(2, 3) : 1, en = R() < 0.8 ? between(2, 3) : 1, pain = av >= 3 ? between(3, 5) : av === 2 ? between(1, 3) : (R() < 0.88 ? 0 : between(1, 2));
        if (s[1] === 6 && n === 0) { sl = 1; en = 1; pain = 4; }
        rec.readiness[d] = { sleep: SLEEP[sl], energy: ENERGY[en], pain };
        if (R() < 0.3) rec.bw[d] = Math.round((s[4] + (R() - 0.5) * 2) * 10) / 10;
      }
      if (n === 0) continue;
      const out = av === 4; const rows = [];
      for (const f of dayFx) {
        if (f.type === 'practice') {
          if (f.optional && s[7] !== 'xi') continue;   // recovery is for the players who played
          rec.attendance[`${d}|${f.start}`] = out ? 'out' : 'in'; if (out) continue;
          rows.push({ kind: 'warmup', type: 'Warm-up', min: 10, rpe: null, load: 0, team: true, start: f.start, attended: true, note: 'FIFA 11+', teamNote: 'FIFA 11+', ownNote: '', by: STAFF.sc });
          if (!f.optional && av < 3) rows.push({ kind: 'sc', type: 'Conditioning', min: between(12, 20), rpe: null, load: 0, team: true, start: f.start, attended: true, note: ['Speed + change of direction', 'Repeated sprints', 'Small-sided games 4v4', 'Aerobic intervals'][(n + 80) % 4], teamNote: '', ownNote: av === 2 ? 'Modified - no long passing' : '', by: STAFF.sc });
        }
        if (f.type === 'lift' && !out) rows.push({ kind: 'lift', type: 'Lift', min: between(35, 45), rpe: null, load: 0, team: false, attended: true, note: ['Lower body strength', 'Upper body + trunk', 'Power + injury prevention'][(n + 80) % 3], by: STAFF.sc });
      }
      if (rows.length) rec.sessions[d] = rows;
    }
    loads[id] = rec;
  });

  // ── matches: minutes, goals, assists, cards ──
  const stats = Object.fromEntries(ids.map((id) => [id, { apps: 0, min: 0, goals: 0, assists: 0, yc: 0 }]));
  const results = {};
  for (const d of gameDates.filter((g) => g < T)) {
    const g = gameInfo[d];
    const avail = ids.map((id, i) => ({ id, s: SQUAD[i] })).filter(({ id, s }) => !(arrivalOf[s[1]] && d < arrivalOf[s[1]]) && medAvail(id, d) < 3);
    const xi = avail.filter((x) => x.s[7] === 'xi').slice(0, 11);
    const bench = avail.filter((x) => x.s[7] === 'sub');
    while (xi.length < 11 && bench.length) xi.push(bench.shift());
    const subs = bench.slice(0, 3);
    const us = [2, 1, 0, 3, 1, 2, 1, 0][g.round % 8], them = [1, 1, 2, 1, 0, 2, 0, 0][g.round % 8];
    results[d] = { us, them };
    const lines = [];
    xi.forEach((x, k) => lines.push({ ...x, min: k < 8 ? 90 : between(60, 78) }));
    subs.forEach((x) => lines.push({ ...x, min: between(10, 30) }));
    const scorers = lines.filter((l) => l.s[2] !== 'Goalkeeper');
    const weight = (l) => (l.s[2] === 'Striker' ? 5 : l.s[2] === 'Midfielder' ? 2.5 : 0.7) * (l.min / 90);
    const pickW = () => { const tot = scorers.reduce((a, l) => a + weight(l), 0); let r = R() * tot; for (const l of scorers) { r -= weight(l); if (r <= 0) return l; } return scorers[0]; };
    const gl = {}, as = {}, yc = {};
    for (let k = 0; k < us; k++) { const sc = pickW(); gl[sc.id] = (gl[sc.id] || 0) + 1; if (R() < 0.75) { let a = pickW(); if (a.id === sc.id) a = pickW(); if (a.id !== sc.id) as[a.id] = (as[a.id] || 0) + 1; } }
    if (R() < 0.8) { const c = lines[between(1, lines.length - 1)]; yc[c.id] = 1; }
    for (const l of lines) {
      const st = stats[l.id]; st.apps++; st.min += l.min; st.goals += gl[l.id] || 0; st.assists += as[l.id] || 0; st.yc += yc[l.id] || 0;
      const rec = loads[l.id];
      rec.sessions[d] = [...(rec.sessions[d] || []), { kind: 'game', type: 'Game', min: l.min, opp: g.opp[0], comp: club.league.name, home: g.home, start: '19:00', rpe: null, load: 0, source: 'league feed', attended: true, ...(gl[l.id] ? { goals: gl[l.id] } : {}), ...(as[l.id] ? { assists: as[l.id] } : {}) }];
    }
  }
  fixtures.forEach((f) => { if (f.type === 'game' && results[f.date]) { f.us = results[f.date].us; f.them = results[f.date].them; f.played = true; } });

  // ── the league: 16 clubs, a round a week ──
  const teams = [[club.short, club.shortHe], ...CLUBS];
  const games = [];
  gameDates.forEach((d, r) => {
    const g = gameInfo[d];
    const oi = teams.findIndex((t) => t[0] === g.opp[0]);
    const others = teams.map((_, i) => i).filter((i) => i !== 0 && i !== oi);
    const rot = others.map((_, k) => others[(k + r * 3) % others.length]);
    const pairs = [[0, oi], ...Array.from({ length: 7 }, (_, k) => [rot[k], rot[13 - k]])];
    pairs.forEach(([h0, a0], k) => {
      const [h, a] = k === 0 ? (g.home ? [0, oi] : [oi, 0]) : [h0, a0];
      const played = d < T;
      let hs = null, as2 = null;
      if (played) { if (k === 0) { hs = g.home ? results[d].us : results[d].them; as2 = g.home ? results[d].them : results[d].us; } else { hs = between(0, 3); as2 = between(0, 2); } }
      games.push({ round: r + 1, stage: null, gameId: `demo-s-${r + 1}-${k + 1}`, date: d, time: k === 0 ? '19:00' : ['15:00', '17:00', '17:30', '19:30', '20:00', '20:30', '21:00'][k - 1], home: teams[h][1], away: teams[a][1], arena: '', played, hs, as: as2 });
    });
  });
  const tab = teams.map((t) => ({ team: t[1], teamEn: t[0], p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] }));
  for (const g of games.filter((x) => x.played)) {
    const H = tab[teams.findIndex((t) => t[1] === g.home)], A = tab[teams.findIndex((t) => t[1] === g.away)];
    H.p++; A.p++; H.gf += g.hs; H.ga += g.as; A.gf += g.as; A.ga += g.hs;
    if (g.hs > g.as) { H.w++; A.l++; H.form.push('W'); A.form.push('L'); } else if (g.hs < g.as) { A.w++; H.l++; A.form.push('W'); H.form.push('L'); } else { H.d++; A.d++; H.form.push('D'); A.form.push('D'); }
  }
  const table = tab.map((t) => ({ ...t, gd: t.gf - t.ga, pts: t.w * 3 + t.d, form: t.form.slice(-5) }))
    .sort((x, y) => (y.pts - x.pts) || (y.gd - x.gd) || (y.gf - x.gf)).map((t, i) => ({ rank: i + 1, ...t }));
  const now = new Date(); const seasonStart = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const me = table.find((t) => t.team === club.shortHe);
  const league = {
    season: `${seasonStart}/${String((seasonStart + 1) % 100).padStart(2, '0')}`, cYear: seasonStart + 1,
    team: { name: club.shortHe, gp: me.p, w: me.w, l: me.l, pf: me.gf, pa: me.ga, ppg: 0, oppg: 0 },
    games, standings: [], players: [], archive: {}, updatedAt: `${T}T06:00:00.000Z`,
    soccer: { table, players: ids.map((id, i) => ({ jersey: SQUAD[i][1], ...stats[id] })).filter((x) => x.apps > 0) },
  };

  // ── programs + activity ──
  const planIndex = [], plans = {};
  const DAYS = [
    { name: 'MD-4 - Strength', ex: [['Trap Bar Deadlift', '4', '4', ''], ['Bulgarian Split Squat', '3', '6 each', '3 s down'], ['Nordic Hamstring Curl', '3', '5', ''], ['Copenhagen Plank', '3', '20 s each', 'Adductor protection'], ['Calf Raise, single leg', '3', '12 each', '']] },
    { name: 'MD-2 - Power', ex: [['Hang Power Clean', '4', '3', 'Fast elbows'], ['Countermovement Jump', '4', '3', 'Stick the landing'], ['Med Ball Scoop Toss', '3', '5 each', ''], ['Pallof Press', '3', '10 each', '']] },
  ];
  ids.forEach((id) => { const pid = `plan_demo_${id}`; planIndex.push({ id: pid, traineeId: id, name: 'In-season Block #2', weeks: 4, active: true }); plans[pid] = { id: pid, name: 'In-season Block #2', weeks: 4, days: DAYS.map((dd) => ({ name: dd.name, exercises: dd.ex.map(([title, sets, reps, notes]) => ({ title, sets, reps, notes })) })) }; });
  const activity = [];
  const at = (d, hh, mm) => new Date(`${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).toISOString();
  for (let n = -10; n <= 0; n++) {
    const d = add(T, n); const kinds = fixtures.filter((f) => f.date === d).map((f) => f.type);
    if (n < 0 && kinds.includes('practice')) activity.push({ at: at(d, 12, 5 + (n & 7)), by: STAFF.sc, kind: 'session', what: `logged the practice and an S&C session on ${d} 10:00 · ${between(12, 20)} min · ${between(19, 22)} in` });
    if (n < 0 && kinds.includes('lift')) activity.push({ at: at(d, 13, 10), by: STAFF.sc, kind: 'session', what: `logged a lift on ${d} · ${between(35, 45)} min` });
    if (kinds.length) activity.push({ at: at(d, 8, 30 + (n & 15)), by: STAFF.sc, kind: 'checkin', what: `saved the readiness check-in for ${d}` });
    if (n < 0 && kinds.includes('game')) activity.push({ at: at(add(d, 1), 9, 0), by: STAFF.sc, kind: 'game', what: `logged game minutes for ${d}` });
    activity.push({ at: at(d, 8, 0), by: STAFF.head, kind: 'open', what: 'opened the club zone' });
  }
  activity.push({ at: at(add(T, -4), 18, 40), by: STAFF.pt, kind: 'medical', what: 'updated a medical record' });
  activity.push({ at: at(add(T, -2), 14, 5), by: STAFF.pt, kind: 'medical', what: 'updated a medical record' });
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return { trainees, loads, fixtures, medical, league, gameWarmup: WARMUP, planIndex, plans, activity, staff: STAFF };
}
