// J10 - "i don't like the way you show full history on the player's tab, it's
// not very convenient scrolling down like this. figure out a better smarter
// way" (Ohad, 15.9, phone AND desktop).
//
// It was one flat list of everything the athlete has ever done, newest first,
// in a 431px box. Twenty-one rows for a player three weeks into pre-season;
// by March it is three hundred. Scrolling is the only way through it and every
// row costs the same whether you are looking for last night's game or a note
// from August.
//
// Now: chips that filter by KIND (games / practice / gym / notes, each with its
// count), and the rows grouped by MONTH with a summary on the header - how many
// entries, how many minutes, how many games. The newest month is open, the rest
// are one line each, so the whole history of a season is four taps from the top
// instead of a thousand pixels of scroll.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

// ---- 1. every entry says what KIND it is -----------------------------------
rep(`activity.push({ date: d, label: s.rpe == null ? \``,
    `activity.push({ kind: /^(lift|weights|gym)$/i.test(String(s.type || '')) || !s.type ? 'gym' : /game|scrimmage/i.test(String(s.type || '')) ? 'game' : 'practice', date: d, label: s.rpe == null ? \``, 'session kind');
rep(`activity.push({ date: d, label: \`Gym · \${nEx} lift`,
    `activity.push({ kind: 'gym', date: d, label: \`Gym · \${nEx} lift`, 'workout kind');
rep(`activity.push({ date: d, label: \`Bodyweight \${kg} kg\`, load: null })`,
    `activity.push({ kind: 'other', date: d, label: \`Bodyweight \${kg} kg\`, load: null })`, 'bw kind');
rep(`activity.push({ date: d, label: \`Availability · \${AVAIL[code].label}\`, load: null })`,
    `activity.push({ kind: 'other', date: d, label: \`Availability · \${AVAIL[code].label}\`, load: null })`, 'avail kind');
rep(`activity.push({ date: k.split('|')[0], label: \`Note — \${n}\`, load: null });`,
    `activity.push({ kind: 'note', date: k.split('|')[0], label: \`Note — \${n}\`, load: null });`, 'note kind');
rep(`activity.push({ date: g.date, game: {`, `activity.push({ kind: 'game', date: g.date, game: {`, 'league kind');

// ---- 2. the state -----------------------------------------------------------
rep(`  const [editSess, setEditSess] = useState(null); // { date, idx, min } — inline minutes edit in the history`,
`  const [editSess, setEditSess] = useState(null); // { date, idx, min } — inline minutes edit in the history
  const [histKind, setHistKind] = useState('all');  // which chip is picked
  const [monthOpen, setMonthOpen] = useState({});   // month → open; unset = newest open, rest shut`, 'state');

// ---- 3. the grouping --------------------------------------------------------
rep(`  activity.sort((a, b) => b.date.localeCompare(a.date));
  return (`,
`  activity.sort((a, b) => b.date.localeCompare(a.date));
  // Counts per kind for the chips, then the visible rows grouped by month.
  const KIND_LABEL = { game: 'Games', practice: 'Practice', gym: 'Gym', note: 'Notes', other: 'Other' };
  const kindCount = {};
  activity.forEach((a) => { kindCount[a.kind || 'other'] = (kindCount[a.kind || 'other'] || 0) + 1; });
  const kindChips = ['game', 'practice', 'gym', 'note', 'other'].filter((k) => kindCount[k]);
  const shownActivity = histKind === 'all' ? activity : activity.filter((a) => (a.kind || 'other') === histKind);
  const monthKeys = [];
  const byMonth = {};
  shownActivity.forEach((a) => { const m = String(a.date).slice(0, 7); if (!byMonth[m]) { byMonth[m] = []; monthKeys.push(m); } byMonth[m].push(a); });
  const monthOpenAt = (m, i) => (m in monthOpen ? monthOpen[m] : i === 0);
  const monthSummary = (list) => {
    const games = list.filter((a) => a.kind === 'game').length;
    const mins = list.reduce((n, a) => n + (a.sess && Number(a.sess.min) ? Number(a.sess.min) : (a.game && Number(a.game.min) ? Number(a.game.min) : 0)), 0);
    return [\`\${list.length}\`, mins ? \`\${mins} \${tr('min')}\` : null, games ? \`\${games} \${tr(games === 1 ? 'game' : 'games')}\` : null].filter(Boolean).join(' · ');
  };
  return (`, 'grouping');
fs.writeFileSync(f, s);
