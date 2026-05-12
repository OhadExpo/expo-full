// In-app task manager — full TASKS tab page.
//
// Layout: filter strip on top (search + assignee + status), then a list
// grouped by status (TODO / IN PROGRESS / DONE). Each task row expands
// inline to show description, notes log, and edit controls.
//
// Designed for Ohad + 1-3 trusted trainee-operators. v1 ships with shared
// auth (operators sign in as the coach); proper operator accounts move with
// the multi-tenant pass.

import React, { useMemo, useState } from 'react';
import { C, FN, FB, FH } from './theme';
import { isRefined5b } from './ui';
import {
  useCoachTasks, useTaskAssignees,
  TASK_STATUSES, TASK_PRIORITIES,
} from './coachTasks';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

const STATUS_LABEL = { todo: 'TODO', in_progress: 'IN PROGRESS', done: 'DONE' };
const STATUS_COLOR = { todo: C.tm, in_progress: C.ac, done: C.gn };

const dueColor = (dueDate, status) => {
  if (!dueDate || status === 'done') return C.tm;
  const days = Math.floor((new Date(dueDate) - Date.now()) / 86400000);
  if (days < 0) return C.rd;
  if (days <= 1) return C.or;
  return C.tm;
};

const fmtDate = (s) => s ? new Date(s).toLocaleDateString() : '—';
const fmtDateTime = (s) => s ? new Date(s).toLocaleString() : '—';

function TaskRow({ task, onUpdate, onRemove, onAppendNote, trainees }) {
  const [expanded, setExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editAssignee, setEditAssignee] = useState(task.assignee || '');
  const [editDue, setEditDue] = useState(task.due_date || '');
  const [editDesc, setEditDesc] = useState(task.description || '');
  const [editPriority, setEditPriority] = useState(task.priority);
  const [newNote, setNewNote] = useState('');

  const heb = isHebrew(task.title);
  const statusCol = STATUS_COLOR[task.status] || C.tm;
  const isDone = task.status === 'done';

  const cycleStatus = () => {
    const order = ['todo', 'in_progress', 'done'];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    onUpdate(task.id, { status: next });
  };

  const saveEdits = () => {
    onUpdate(task.id, {
      title: editTitle.trim() || task.title,
      assignee: editAssignee.trim() || null,
      due_date: editDue || null,
      description: editDesc || null,
      priority: editPriority,
    });
    setExpanded(false);
  };

  return (
    <div style={{
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${statusCol}`,
      borderRadius: 0, marginBottom: 6, opacity: isDone ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <button onClick={cycleStatus}
          title={`Status: ${STATUS_LABEL[task.status]} (click to advance)`}
          style={{
            background: 'transparent', border: `1px solid ${statusCol}`,
            color: statusCol, fontFamily: FN, fontSize: 9, fontWeight: 700,
            letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 0,
            cursor: 'pointer', flexShrink: 0,
          }}>{STATUS_LABEL[task.status]}</button>

        <div onClick={() => setExpanded(!expanded)}
          style={{
            flex: 1, minWidth: 0, cursor: 'pointer',
            fontSize: 13, color: C.tx, fontWeight: 600,
            textDecoration: isDone ? 'line-through' : 'none',
            direction: heb ? 'rtl' : 'ltr',
            fontFamily: heb ? FH : FB,
          }}>{task.title}</div>

        {task.priority === 'high' && (
          <span style={{
            fontFamily: FN, fontSize: 9, color: C.or, letterSpacing: '0.08em',
            fontWeight: 700, border: `1px solid ${C.or}`, padding: '2px 6px', flexShrink: 0,
          }}>HIGH</span>
        )}
        {task.assignee && (
          <span style={{
            fontFamily: FN, fontSize: 11, color: C.ac, flexShrink: 0,
          }}>@ {task.assignee}</span>
        )}
        {task.related_label && (
          <span style={{
            fontFamily: FN, fontSize: 10, color: C.tm, flexShrink: 0,
            border: `1px solid ${C.cardBd}`, padding: '2px 6px',
          }}>{task.related_label}</span>
        )}
        {task.due_date && (
          <span style={{
            fontFamily: FN, fontSize: 10, color: dueColor(task.due_date, task.status),
            letterSpacing: '0.06em', flexShrink: 0,
          }}>{fmtDate(task.due_date)}</span>
        )}
        <button onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', color: C.td, cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.cardBd}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>TITLE</div>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
                  padding: '6px 8px', color: C.tx, fontSize: 12, outline: 'none', boxSizing: 'border-box',
                  direction: isHebrew(editTitle) ? 'rtl' : 'ltr', fontFamily: isHebrew(editTitle) ? FH : FB }} />
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>ASSIGNEE</div>
              <input value={editAssignee} onChange={e => setEditAssignee(e.target.value)}
                placeholder="(unassigned)"
                style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
                  padding: '6px 8px', color: C.tx, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>DUE</div>
              <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
                style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
                  padding: '6px 8px', color: C.tx, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>PRIORITY</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {TASK_PRIORITIES.map(p => (
                  <button key={p} onClick={() => setEditPriority(p)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 0,
                      border: `1px solid ${editPriority === p ? C.ac : C.cardBd}`,
                      background: 'transparent', color: editPriority === p ? C.ac : C.tm,
                      fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
                    }}>{p.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>DESCRIPTION</div>
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2}
              style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
                padding: '6px 8px', color: C.tx, fontSize: 12, outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                direction: isHebrew(editDesc) ? 'rtl' : 'ltr', fontFamily: isHebrew(editDesc) ? FH : FB }} />
          </div>

          {/* Notes log */}
          {(task.notes_log || []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>
                NOTES ({task.notes_log.length})
              </div>
              <div style={{ border: `1px solid ${C.cardBd}` }}>
                {[...task.notes_log].reverse().map((n, i) => (
                  <div key={i} style={{
                    padding: '6px 10px', borderBottom: i < task.notes_log.length - 1 ? `1px solid ${C.cardBd}` : 'none',
                    fontSize: 11, color: C.tx,
                    direction: isHebrew(n.note) ? 'rtl' : 'ltr',
                    fontFamily: isHebrew(n.note) ? FH : FB,
                  }}>
                    <span style={{ color: C.td, fontFamily: FN, fontSize: 9, marginRight: 8 }}>{fmtDateTime(n.ts)}</span>
                    {n.note}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input value={newNote} onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newNote.trim()) { onAppendNote(task.id, newNote); setNewNote(''); } }}
              placeholder="+ note (Enter to save)"
              style={{ flex: 1, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
                padding: '6px 8px', color: C.tx, fontSize: 12, outline: 'none', boxSizing: 'border-box',
                direction: isHebrew(newNote) ? 'rtl' : 'ltr', fontFamily: isHebrew(newNote) ? FH : FB }} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'space-between' }}>
            <button onClick={() => { if (confirm('Delete this task?')) onRemove(task.id); }}
              style={{ background: 'none', border: 'none', color: C.rd, cursor: 'pointer', fontFamily: FN, fontSize: 11, letterSpacing: '0.1em' }}>
              DELETE
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setExpanded(false)}
                style={{ padding: '6px 12px', borderRadius: 0, border: `1px solid ${C.cardBd}`, background: 'transparent',
                  color: C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }}>CANCEL</button>
              <button onClick={saveEdits}
                style={{ padding: '6px 12px', borderRadius: 0, border: `1px solid ${C.ac}`, background: 'transparent',
                  color: C.ac, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }}>SAVE</button>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: FN, color: C.td, letterSpacing: '0.08em' }}>
            Created {fmtDateTime(task.created_at)}
            {task.completed_at && ` · Completed ${fmtDateTime(task.completed_at)}`}
          </div>
        </div>
      )}
    </div>
  );
}

export function NewTaskInline({ onCreate, defaultRelated, trainees, planIndex }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('normal');
  const [relatedKind, setRelatedKind] = useState(defaultRelated?.kind || '');
  const [relatedId, setRelatedId] = useState(defaultRelated?.id || '');
  const [relatedLabel, setRelatedLabel] = useState(defaultRelated?.label || '');

  const onSubmit = async () => {
    const t = title.trim();
    if (!t) return;
    await onCreate({
      title: t, assignee: assignee || null, dueDate: due || null, priority,
      relatedKind: relatedKind || null, relatedId: relatedId || null, relatedLabel: relatedLabel || null,
    });
    setTitle(''); setAssignee(''); setDue(''); setPriority('normal');
    if (!defaultRelated) { setRelatedKind(''); setRelatedId(''); setRelatedLabel(''); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{
          width: '100%', padding: '12px', borderRadius: 0,
          background: 'transparent', border: `1px dashed ${C.ac}`, color: C.ac,
          fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
          marginBottom: 12,
        }}>+ NEW TASK</button>
    );
  }

  return (
    <div style={{
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid ${C.ac}`, borderRadius: 0, padding: 14, marginBottom: 12,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px', gap: 8 }}>
        <input value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
          placeholder="What needs to happen?" autoFocus
          style={{ gridColumn: '1 / -1', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
            padding: '10px 12px', color: C.tx, fontSize: 14, outline: 'none', boxSizing: 'border-box',
            direction: isHebrew(title) ? 'rtl' : 'ltr', fontFamily: isHebrew(title) ? FH : FB }} />
        <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Assignee (e.g. Sara)"
          style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
            padding: '8px 10px', color: C.tx, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
        <input type="date" value={due} onChange={e => setDue(e.target.value)}
          style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
            padding: '8px 10px', color: C.tx, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {TASK_PRIORITIES.map(p => (
            <button key={p} onClick={() => setPriority(p)}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 0,
                border: `1px solid ${priority === p ? C.ac : C.cardBd}`,
                background: 'transparent', color: priority === p ? C.ac : C.tm,
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
              }}>{p.toUpperCase()}</button>
          ))}
        </div>
      </div>
      {!defaultRelated && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <select value={relatedKind} onChange={e => { setRelatedKind(e.target.value); setRelatedId(''); setRelatedLabel(''); }}
            style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
              padding: '8px 10px', color: C.tx, fontSize: 12, outline: 'none' }}>
            <option value="">— Link to —</option>
            <option value="trainee">Trainee</option>
            <option value="plan">Plan</option>
          </select>
          {relatedKind === 'trainee' && (
            <select value={relatedId}
              onChange={e => {
                setRelatedId(e.target.value);
                const t = (trainees || []).find(tr => tr.id === e.target.value);
                setRelatedLabel(t?.name || '');
              }}
              style={{ flex: 1, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
                padding: '8px 10px', color: C.tx, fontSize: 12, outline: 'none' }}>
              <option value="">— Pick trainee —</option>
              {(trainees || []).filter(t => t.status !== 'Archived').map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          {relatedKind === 'plan' && (
            <select value={relatedId}
              onChange={e => {
                setRelatedId(e.target.value);
                const p = (planIndex || []).find(pl => pl.id === e.target.value);
                setRelatedLabel(p?.name || '');
              }}
              style={{ flex: 1, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
                padding: '8px 10px', color: C.tx, fontSize: 12, outline: 'none' }}>
              <option value="">— Pick plan —</option>
              {(planIndex || []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={() => { setOpen(false); setTitle(''); }}
          style={{ padding: '8px 14px', borderRadius: 0, border: `1px solid ${C.cardBd}`, background: 'transparent',
            color: C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }}>CANCEL</button>
        <button onClick={onSubmit} disabled={!title.trim()}
          style={{ padding: '8px 14px', borderRadius: 0,
            border: `1px solid ${title.trim() ? C.ac : C.cardBd}`, background: 'transparent',
            color: title.trim() ? C.ac : C.td, fontFamily: FN, fontSize: 11,
            fontWeight: 700, letterSpacing: '0.1em', cursor: title.trim() ? 'pointer' : 'default' }}>CREATE</button>
      </div>
    </div>
  );
}

export default function CoachTasksView({ trainees, planIndex }) {
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const assignees = useTaskAssignees();
  const filter = useMemo(() => ({
    search, assignee: assigneeFilter || undefined, status: statusFilter || undefined,
  }), [search, assigneeFilter, statusFilter]);
  const { rows, loading, create, update, remove, appendNote } = useCoachTasks(filter);

  // Group by status for sectioned rendering.
  const grouped = useMemo(() => {
    const g = { todo: [], in_progress: [], done: [] };
    for (const r of rows) (g[r.status] || g.todo).push(r);
    return g;
  }, [rows]);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontFamily: FN, fontSize: 18, color: C.tx, letterSpacing: '0.04em' }}>TASKS</h2>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.tm }}>
          {grouped.todo.length} todo · {grouped.in_progress.length} in progress · {grouped.done.length} done
        </div>
      </div>

      {/* Filter strip */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks…"
          style={{ flex: '1 1 220px', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
            padding: '8px 12px', color: C.tx, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
          style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
            padding: '8px 10px', color: C.tx, fontSize: 12, outline: 'none' }}>
          <option value="">All assignees</option>
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 0 }}>
          {[['open', 'OPEN'], ['todo', 'TODO'], ['in_progress', 'IN PROGRESS'], ['done', 'DONE'], ['', 'ALL']].map(([k, l]) => (
            <button key={k || 'all'} onClick={() => setStatusFilter(k)}
              style={{
                padding: '8px 10px', borderRadius: 0,
                border: `1px solid ${statusFilter === k ? C.ac : C.cardBd}`,
                background: 'transparent', color: statusFilter === k ? C.ac : C.tm,
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
                marginLeft: -1,
              }}>{l}</button>
          ))}
        </div>
      </div>

      <NewTaskInline onCreate={create} trainees={trainees} planIndex={planIndex} />

      {loading && <div style={{ color: C.td, padding: 14, fontSize: 13 }}>Loading…</div>}

      {!loading && rows.length === 0 && (
        <div style={{
          background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
          border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 30, textAlign: 'center',
        }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>NO TASKS</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.5 }}>
            Create a task above to delegate work. Tasks linked to a trainee surface on that trainee's card.
          </div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        ['todo', 'in_progress', 'done'].map(status => {
          const group = grouped[status] || [];
          if (group.length === 0) return null;
          return (
            <div key={status} style={{ marginBottom: 18 }}>
              <div style={{
                fontFamily: FN, fontSize: 9, color: STATUS_COLOR[status], letterSpacing: '0.18em',
                fontWeight: 700, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.cardBd}`,
              }}>
                {STATUS_LABEL[status]} ({group.length})
              </div>
              {group.map(t => (
                <TaskRow key={t.id} task={t}
                  onUpdate={update} onRemove={remove} onAppendNote={appendNote}
                  trainees={trainees} />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
