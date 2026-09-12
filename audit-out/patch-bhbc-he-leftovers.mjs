// The club zone as the physio sees it in Hebrew, measured tab by tab
// (audit-out/probe-bhbc-coverage.mjs, 09-12): the English that was still UI -
// not names, not stat abbreviations - and where each line comes from.
import fs from 'node:fs';

const V = 'src/BhbcView.jsx';
let s = fs.readFileSync(V, 'utf8');
const did = [];
function rep(from, to, { all = false, label } = {}) {
  const n = s.split(from).length - 1;
  if (n === 0) throw new Error('not found: ' + (label || from.slice(0, 60)));
  if (!all && n !== 1) throw new Error('not unique (' + n + '): ' + (label || from.slice(0, 60)));
  s = all ? s.split(from).join(to) : s.replace(from, to);
  did.push((label || from.slice(0, 50)) + ' ×' + n);
}

// The month helper joins the date helpers it already imports.
rep("import { bhbcT, BhbcLangCtx, useT, useHe, setBhbcDateLang, dowFor, monDayFor, fxLabelFor } from './bhbcHe';",
    "import { bhbcT, BhbcLangCtx, useT, useHe, setBhbcDateLang, dowFor, monDayFor, monFor, fxLabelFor } from './bhbcHe';", { label: 'import monFor' });

// Positions are league data ("Point Guard", "Forward-Center") - the dictionary
// holds the handful the league uses; anything else stays as the league wrote it.
rep("{t.position || '—'}", "{tr(t.position) || '—'}", { all: true, label: 'position ×3' });

// Sentences and labels that were bare.
rep('<span style={mut}>No team sessions scheduled this week.</span>', "<span style={mut}>{tr('No team sessions scheduled this week.')}</span>");
rep("color: ORANGE }}>TODAY</span>}", "color: ORANGE }}>{tr('TODAY')}</span>}");
rep("Load anchored to the game: heaviest far out (MD-4/-3), taper MD-1 (hold intensity, cut volume), regenerate MD+1.</div>",
    "{tr('Load anchored to the game: heaviest far out (MD-4/-3), taper MD-1 (hold intensity, cut volume), regenerate MD+1.')}</div>", { label: 'load anchored' });
rep("padding: '5px 12px', cursor: 'pointer' }}>{l}</button>", "padding: '5px 12px', cursor: 'pointer' }}>{tr(l)}</button>", { label: 'month/week/list toggle' });
rep("<span style={{ fontWeight: 600 }}>Game</span>", "<span style={{ fontWeight: 600 }}>{tr('Game')}</span>");
rep("{ k: 'Margin', v: played", "{ k: tr('Margin'), v: played");
rep(">{currentSeason} · Pre-season</span>", ">{currentSeason} · {tr('Pre-season')}</span>");
rep("{historical ? 'Last season' : 'Live'}", "{historical ? tr('Last season') : tr('Live')}");
rep("No games played yet this season — team stats fill in automatically after tip-off.</div>",
    "{tr('No games played yet this season — team stats fill in automatically after tip-off.')}</div>", { label: 'no games (team)' });
rep("No {currentSeason} games played yet — per-player league numbers appear here after tip-off.</div>",
    "{tr('No {season} games played yet — per-player league numbers appear here after tip-off.').replace('{season}', currentSeason)}</div>", { label: 'no games (players)' });
rep("<span style={{ color: C.tx, fontWeight: 700 }}>ROM → Tempo → Intensity → Volume → Frequency</span>",
    "<span style={{ color: C.tx, fontWeight: 700 }}>{tr('ROM → Tempo → Intensity → Volume → Frequency')}</span>", { label: 'regression ladder' });

// Competition names come from the fixtures ("Winner Cup", "Champions League").
rep("{[g.comp, `${dow(g.date)} ${monDay(g.date)}`, g.venue]", "{[tr(g.comp), `${dow(g.date)} ${monDay(g.date)}`, g.venue]", { label: 'fixtures-ahead comp' });
rep("ORANGE_DEEP }}>{nextGame.comp}</div>}", "ORANGE_DEEP }}>{tr(nextGame.comp)}</div>}", { label: 'next-game comp' });
rep("const detail = [g.comp, g.venue].filter(Boolean).join(' · ');", "const detail = [tr(g.comp), g.venue].filter(Boolean).join(' · ');", { label: 'results comp' });

// Calendar day and month headings were the raw English arrays.
rep("C.tm }}>{DOW[d.getDay()]}</div>", "C.tm }}>{dowFor(d, DOW[d.getDay()])}</div>", { label: 'week day heading' });
rep("letterSpacing: '0.02em' }}>{MON[m]} {y}</div>", "letterSpacing: '0.02em' }}>{monFor(m, MON[m])} {y}</div>", { label: 'month heading' });
rep("return { list: out, label: `${MON[anchor.getMonth()]} ${anchor.getFullYear()}` };",
    "return { list: out, label: `${monFor(anchor.getMonth(), MON[anchor.getMonth()])} ${anchor.getFullYear()}` };", { label: 'month label' });

// The player table had no translator of its own.
rep("{th('name', 'Player', true)}", "{th('name', tr('Player'), true)}");
{
  const i = s.indexOf('function PlayerStatsTable(');
  if (i < 0) throw new Error('PlayerStatsTable');
  const nl = s.indexOf('\n', i);
  s = s.slice(0, nl + 1) + '  const tr = useT();\n' + s.slice(nl + 1);
  did.push('PlayerStatsTable: const tr = useT()');
}
fs.writeFileSync(V, s);

// ---- the dictionary ----
const H = 'src/bhbcHe.js';
let h = fs.readFileSync(H, 'utf8');
const monFor = `
// Month heading on the calendar ("Sep 2026"); index 0 = January.
export const monFor = (monthIndex, en) => (_dateLang === 'he' ? MON_HE[monthIndex] : en);
`;
const anchorMon = "export const monDayFor = (d, en) => (_dateLang === 'he' ? `${d.getDate()} ב${MON_HE[d.getMonth()]}` : en);\n";
if (!h.includes(anchorMon)) throw new Error('monDayFor anchor');
h = h.replace(anchorMon, anchorMon + monFor);

const keys = [
  ['TODAY', 'היום'],
  ['Month', 'חודש'], ['Week', 'שבוע'], ['List', 'רשימה'],
  ['Player', 'שחקן'], ['Margin', 'הפרש'], ['Last season', 'עונה שעברה'], ['Live', 'חי'],
  ['Champions League', 'ליגת האלופות'],
  ['Injury', 'פציעה'], ['Status', 'סטטוס'], ['Since · pain', 'מאז · כאב'], ['Reported by', 'דיווח'],
  ['Point Guard', 'פוינט גארד'], ['Shooting Guard', 'שוטינג גארד'], ['Guard', 'גארד'],
  ['Small Forward', 'סמול פורוורד'], ['Power Forward', 'פאוור פורוורד'], ['Forward', 'פורוורד'], ['Center', 'סנטר'],
  ['Guard-Forward', 'גארד-פורוורד'], ['Forward-Center', 'פורוורד-סנטר'],
  ['No team sessions scheduled this week.', 'אין אימוני קבוצה השבוע.'],
  ['Load anchored to the game: heaviest far out (MD-4/-3), taper MD-1 (hold intensity, cut volume), regenerate MD+1.',
   'העומס מעוגן למשחק: הכי כבד רחוק ממנו (MD-4/-3), הורדה ב-MD-1 (שומרים עצימות, חותכים נפח), התאוששות ב-MD+1.'],
  ['No games played yet this season — team stats fill in automatically after tip-off.',
   'עוד לא שוחקו משחקים העונה — נתוני הקבוצה יתמלאו לבד אחרי המשחק הראשון.'],
  ['No {season} games played yet — per-player league numbers appear here after tip-off.',
   'עוד לא שוחקו משחקים ב-{season} — מספרי הליגה של כל שחקן יופיעו כאן אחרי המשחק הראשון.'],
  ['ROM → Tempo → Intensity → Volume → Frequency', 'טווח תנועה ← טמפו ← עצימות ← נפח ← תדירות'],
];
const start = h.indexOf('export const HE = {');
if (start < 0) throw new Error('HE');
const has = (k) => new RegExp("^\\s*(?:'" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'|\"" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"|' + k + ')\\s*:', 'm').test(h);
const fresh = keys.filter(([k]) => !has(k));
const nl = h.indexOf('\n', start);
h = h.slice(0, nl + 1) + fresh.map(([k, v]) => `  '${k.replace(/'/g, "\\'")}': '${v}',`).join('\n') + '\n' + h.slice(nl + 1);
fs.writeFileSync(H, h);
console.log(did.join('\n'));
console.log('keys added', fresh.length, '·', fresh.map(([k]) => k).join(' | '));
