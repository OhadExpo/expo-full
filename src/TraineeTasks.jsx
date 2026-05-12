// Trainee-card slice for the in-app task manager. Renders inside the CRM
// strip on TraineeDetail showing the open tasks linked to this trainee.
//
// Shows up to 3 open tasks inline; "VIEW ALL N" link routes to /coach/tasks
// pre-filtered to this trainee. Quick "+ NEW TASK" button creates a task
// with related_kind='trainee' pre-filled so the coach doesn't have to pick
// the trainee twice.

import React, { useState } from 'react';
import { C, FN, FB, FH } from './theme';
import { isRefined5b } from './ui';
import { useCoachTasks } from './coachTasks';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

const STATUS_COLOR = { todo: C.tm, in_progress: C.ac, done: C.gn };
const STATUS_LABEL = { todo: 'TODO', in_progress: 'WIP', done: 'DONE' };

const dueColor = (dueDate, status) => {
  if (!dueDate || status === 'done') return C.tm;
  const days = Math.floor((new Date(dueDate) - Date.now()) / 86400000);
  if (days < 0) return C.rd;
  if (days <= 1) return C.or;
  return C.tm;
};

export default function TraineeTasks({ trainee, onOpenTasks }) {
  const traineeId = trainee?.id;
  const traineeName = trainee?.name || '';
  const { rows, create, update } = useCoachTasks({
    relatedKind: 'trainee', relatedId: traineeId, status: 'open',
  });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');

  const onCreate = async () => {
    const t = title.trim();
    if (!t || !traineeId) return;
    await create({
      title: t, assignee: assignee || null, dueDate: due || null,
      relatedKind: 'trainee', relatedId: traineeId, relatedLabel: traineeName,
    });
    setTitle(''); setAssignee(''); setDue(''); setAdding(false);
  };

  if (!traineeId) return null;
  const open = rows.filter(r => r.status !== 'done').slice(0, 3);
  const totalOpen = rows.filter(r => r.status !== 'done').length;

  return (
    <div style={{
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 14, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>
          DELEGATED TASKS ({totalOpen})
        </div>
        {totalOpen > 3 && onOpenTasks && (
          <button onClick={onOpenTasks}
            style={{ background: 'none', border: 'none', color: C.ac, cursor: 'pointer',
              fontFamily: FN, fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>
            VIEW ALL {totalOpen} →
          </button>
        )}
      </div>

      {open.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: C.td, marginBottom: 10 }}>
          No delegated tasks. Hand off operational work below.
        </div>
      )}

      {open.map(r => {
        const heb = isHebrew(r.title);
        const col = STATUS_COLOR[r.status] || C.tm;
        const advance = () => {
          const next = r.status === 'todo' ? 'in_progress' : 'done';
          update(r.id, { status: next });
        };
        return (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
            borderBottom: `1px solid ${C.cardBd}`,
          }}>
            <button onClick={advance} title={`Status: ${STATUS_LABEL[r.status]} (click to advance)`}
              style={{
                background: 'transparent', border: `1px solid ${col}`, color: col,
                fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                padding: '2px 6px', borderRadius: 0, cursor: 'pointer', flexShrink: 0,
              }}>{STATUS_LABEL[r.status]}</button>
            <div style={{
              flex: 1, minWidth: 0, fontSize: 13, color: C.tx,
              direction: heb ? 'rtl' : 'ltr', fontFamily: heb ? FH : FB,
            }}>{r.title}</div>
            {r.assignee && (
              <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, flexShrink: 0 }}>@ {r.assignee}</span>
            )}
            {r.due_date && (
              <span style={{
                fontFamily: FN, fontSize: 10, color: dueColor(r.due_date, r.status),
                letterSpacing: '0.06em', flexShrink: 0,
              }}>{new Date(r.due_date).toLocaleDateString()}</span>
            )}
          </div>
        );
      })}

      {adding ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px', gap: 6, marginTop: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onCreate(); }}
            placeholder="What needs to happen?" autoFocus
            style={{
              gridColumn: '1 / -1', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
              padding: '8px 10px', color: C.tx, fontSize: 13, outline: 'none', boxSizing: 'border-box',
              direction: isHebrew(title) ? 'rtl' : 'ltr', fontFamily: isHebrew(title) ? FH : FB,
            }} />
          <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Assignee"
            style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
              padding: '6px 8px', color: C.tx, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          <input type="date" value={due} onChange={e => setDue(e.target.value)}
            style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
              padding: '6px 8px', color: C.tx, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setAdding(false); setTitle(''); }}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 0, border: `1px solid ${C.cardBd}`, background: 'transparent',
                color: C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }}>CANCEL</button>
            <button onClick={onCreate} disabled={!title.trim()}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 0,
                border: `1px solid ${title.trim() ? C.ac : C.cardBd}`, background: 'transparent',
                color: title.trim() ? C.ac : C.td, fontFamily: FN, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', cursor: title.trim() ? 'pointer' : 'default' }}>CREATE</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{
            width: '100%', marginTop: 10, padding: '6px 0', background: 'transparent',
            border: `1px dashed ${C.ac}`, color: C.ac,
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
          }}>+ NEW TASK FOR {(traineeName || 'TRAINEE').toUpperCase()}</button>
      )}
    </div>
  );
}
