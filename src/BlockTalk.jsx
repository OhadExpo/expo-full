// WHAT WAS SAID (16.10 #826) - the coach's analysis reads the block's words next to its numbers: his session notes and
// check-ins, his notes on an exercise, the weekly focus the coach wrote, the coach's video comments - week by week - and
// a line for every session where he reported pain and a lift came in under its last top set. Data: athleteContext.js.
// House rules: one frame, colour on the words only, no fills, no glyphs, Hebrew isolated around English names.
import React from 'react';
import { C, FN, FB } from './theme';
import { FitStrip } from './StrengthReview';

const L = (he, en, hb) => (he ? hb : en);
const I = (s) => `⁦${s}⁩`;
const card = { border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', marginTop: 12 };
const ddmm = (d) => { const x = new Date(d); return isFinite(x) ? `${x.getDate()}.${x.getMonth() + 1}` : ''; };
const mmss = (t) => (t == null ? '' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
const WORD = {
  pain: { high: ['high pain', 'כאב חזק'], moderate: ['moderate pain', 'כאב בינוני'] },
  sleep: { poor: ['slept badly', 'ישן רע'] },
  energy: { low: ['low energy', 'אנרגיה נמוכה'] },
};
const flagWord = (he, [k, v], coach = true) => { if (!coach && he && k === 'sleep' && v === 'poor') return 'ישנת רע'; const w = WORD[k] && WORD[k][v]; return w ? (he ? w[1] : w[0]) : `${k} ${v}`; };
// 'A, B and C' / 'A, B ו־C'
const list = (he, arr) => { const x = arr.map((t) => (he ? I(t) : t)); return x.length < 2 ? (x[0] || '') : `${x.slice(0, -1).join(', ')} ${he ? 'ו־' : 'and '}${x[x.length - 1]}`; };

function Label({ children, color }) {
  return <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 0, textTransform: 'uppercase', color: color || C.tm, marginBottom: 2 }}>{children}</div>;
}

export default function BlockTalk({ ctx, he, coach = true }) {
  if (!ctx) return null;
  const c = ctx.counts;
  const parts = (coach ? [
    c.notes ? (he ? (c.notes === 1 ? 'הערה אחת שלו' : `${I(c.notes)} הערות שלו`) : `${c.notes} note${c.notes === 1 ? '' : 's'} from him`) : null,
    c.exNotes ? (he ? (c.exNotes === 1 ? 'הערה אחת שלו על תרגיל' : `${I(c.exNotes)} הערות שלו על תרגילים`) : `${c.exNotes} note${c.exNotes === 1 ? '' : 's'} from him on an exercise`) : null,
    c.pain ? (he ? (c.pain === 1 ? 'דיווח על כאב פעם אחת' : `דיווח על כאב ${I(c.pain)} פעמים`) : `pain reported ${c.pain === 1 ? 'once' : `${c.pain} times`}`) : null,
    c.focus ? (he ? (c.focus === 1 ? 'הערת פוקוס אחת שלך' : `${I(c.focus)} הערות פוקוס שלך`) : `${c.focus} weekly focus note${c.focus === 1 ? '' : 's'} from you`) : null,
    c.comments ? (he ? (c.comments === 1 ? 'הערה אחת שלך על וידאו' : `${I(c.comments)} הערות שלך על וידאו`) : `${c.comments} video comment${c.comments === 1 ? '' : 's'} from you`) : null,
  ] : [
    // the athlete's voice: his notes are 'yours', the coach's words are 'your coach's'
    c.focus ? (he ? (c.focus === 1 ? 'הערת פוקוס אחת מהמאמן' : `${I(c.focus)} הערות פוקוס מהמאמן`) : `${c.focus} weekly focus note${c.focus === 1 ? '' : 's'} from your coach`) : null,
    c.comments ? (he ? (c.comments === 1 ? 'הערה אחת של המאמן על וידאו' : `${I(c.comments)} הערות של המאמן על וידאו`) : `${c.comments} video comment${c.comments === 1 ? '' : 's'} from your coach`) : null,
    c.notes ? (he ? (c.notes === 1 ? 'הערה אחת שלך' : `${I(c.notes)} הערות שלך`) : `${c.notes} note${c.notes === 1 ? '' : 's'} of yours`) : null,
    c.exNotes ? (he ? (c.exNotes === 1 ? 'הערה אחת שלך על תרגיל' : `${I(c.exNotes)} הערות שלך על תרגילים`) : `${c.exNotes} note${c.exNotes === 1 ? '' : 's'} of yours on an exercise`) : null,
  ]).filter(Boolean);   // both voices drop the empty counts (the coach's '· · ·' line, 16.10)
  const title = coach ? L(he, 'What was said', 'מה נאמר בבלוק') : L(he, 'Notes and focus', 'הערות ופוקוס');
  if (!ctx.any) {
    return (
      <div style={card} data-block-talk>
        <FitStrip he={he} title={title} />
        <div style={{ padding: '10px 14px', fontFamily: FB, fontSize: 12.5, color: C.tm, lineHeight: 1.5 }}>
          {coach ? L(he, 'No notes, check-ins, weekly focus or video comments in this block yet - the numbers are all there is to read.', 'בבלוק הזה עוד אין הערות, דיווחי מוכנות, פוקוס שבועי או הערות על וידאו - יש רק את המספרים.')
            : L(he, 'No notes or weekly focus in this block yet.', 'בבלוק הזה עוד אין הערות או פוקוס שבועי.')}
        </div>
      </div>
    );
  }
  const pains = ctx.painDays.filter((p) => p.under.length);
  return (
    <div style={card} data-block-talk>
      <FitStrip he={he} title={title} />
      {parts.length > 0 && <div style={{ padding: '10px 14px 2px', fontFamily: FB, fontSize: 13, color: C.tx, lineHeight: 1.5 }}>{parts.join(' · ')}</div>}
      {coach && pains.length > 0 && (
        <div style={{ padding: '6px 14px 0' }}>
          {pains.map((p, i) => (
            <div key={i} style={{ padding: '6px 0', paddingInlineStart: 10, marginTop: i ? 6 : 0, borderInlineStart: `3px solid ${p.pain === 'high' ? C.rd : C.or}`, fontFamily: FB, fontSize: 13, lineHeight: 1.5, color: C.tx }}>
              {he
                ? `${p.pain === 'high' ? 'כאב חזק' : 'כאב בינוני'} ב־${I(ddmm(p.date))}${p.day ? ` (${I(p.day)})` : ''} - ובאותו אימון ${p.under.length === 1 ? `${I(p.under[0])} היה מתחת לטופ סט הקודם שלו` : `${list(he, p.under.slice(0, 3))} היו מתחת לטופ סט הקודם שלהם`}. תבדוק את זה לפני שאתה מעלה ${p.under.length === 1 ? 'בו' : 'בהם'} משקל.`
                : `${p.pain === 'high' ? 'High' : 'Moderate'} pain on ${ddmm(p.date)}${p.day ? ` (${p.day})` : ''} - and in that session ${list(he, p.under.slice(0, 3))} came in under ${p.under.length === 1 ? 'its' : 'their'} last top set. Check it before adding load there.`}
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: '4px 14px 12px' }}>
        {ctx.weeks.filter((w) => w.focus.length || w.sessions.some((x) => x.note || x.flags.length || x.exNotes.length || x.comments.length)).map((w) => (
          <div key={String(w.week)} style={{ borderTop: `1px solid ${C.cardBd}`, padding: '10px 0', marginTop: 8 }}>
            <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.ac, textTransform: 'uppercase', letterSpacing: he ? 0 : '0.08em', marginBottom: 6 }}>
              {w.week != null ? (he ? `שבוע ${I(w.week)}` : `Week ${w.week}`) : L(he, 'No week number', 'בלי מספר שבוע')}
            </div>
            {w.focus.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <Label color={C.ac}>{coach ? L(he, 'Your focus for this week', 'הפוקוס שלך לשבוע הזה') : L(he, 'Coach\'s focus for this week', 'הפוקוס של המאמן לשבוע הזה')}</Label>
                {/* grouped by day, in day order; each line = the lift and what to do */}
                {[...new Set(w.focus.slice().sort((x, y) => x.dayIdx - y.dayIdx || x.day.localeCompare(y.day)).map((f) => f.day))].map((day) => (
                  <div key={day} style={{ marginTop: 4 }}>
                    <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: 0 }}><bdi>{day}</bdi></div>
                    {w.focus.filter((f) => f.day === day).map((f, i) => (
                      <div key={i} style={{ fontFamily: FB, fontSize: 12.5, color: C.tx, lineHeight: 1.5, marginTop: 2 }}>
                        {f.title && <span style={{ color: C.tm }}><bdi>{f.title}</bdi>: </span>}<bdi>{f.text}</bdi>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {w.sessions.map((s) => {
              const has = s.note || s.flags.length || s.exNotes.length || s.comments.length;
              if (!has) return null;
              return (
                <div key={s.id || s.date} style={{ marginBottom: 8 }}>
                  <Label><bdi>{s.day}</bdi>{' · '}<bdi>{ddmm(s.date)}</bdi></Label>
                  {s.flags.length > 0 && <div style={{ fontFamily: FB, fontSize: 12.5, color: s.flags.some((f) => f[0] === 'pain') ? C.or : C.tm, lineHeight: 1.5 }}>{s.flags.map((f) => flagWord(he, f, coach)).join(' · ')}</div>}
                  {s.note && <div style={{ fontFamily: FB, fontSize: 12.5, color: C.tx, lineHeight: 1.5 }}><span style={{ color: C.tm }}>{coach ? L(he, 'his note: ', 'ההערה שלו: ') : L(he, 'your note: ', 'ההערה שלך: ')}</span><bdi>{s.note}</bdi></div>}
                  {s.exNotes.map((n, i) => (
                    <div key={'n' + i} style={{ fontFamily: FB, fontSize: 12.5, color: C.tx, lineHeight: 1.5 }}><span style={{ color: C.tm }}><bdi>{n.title}</bdi>: </span><bdi>{n.text}</bdi></div>
                  ))}
                  {s.comments.map((n, i) => (
                    <div key={'c' + i} style={{ fontFamily: FB, fontSize: 12.5, color: C.tx, lineHeight: 1.5 }}><span style={{ color: C.ac }}>{coach ? L(he, 'you, on ', 'ההערה שלך על ') : L(he, 'coach, on ', 'ההערה של המאמן על ')}<bdi>{n.title}</bdi>{n.ts != null ? <> <bdi dir="ltr">{mmss(n.ts)}</bdi></> : null}: </span><bdi>{n.text}</bdi></div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
