// /coach/tasks — full-page view of the unified task/notes feed.
//
// Same data as the Dashboard widget (coach_notes table, surfaced via
// NotesWidget). On the dashboard the widget shares space with summary
// cards and alert tiles; on this dedicated tab it's the only thing on
// the page so the coach gets a wider canvas to scan and triage.
//
// The trainee/intake/review/general filter pills + pinned sorting come
// from NotesWidget itself; no extra logic here.

import React from 'react';
import { C, FN } from './theme';
import NotesWidget from './NotesWidget';

export default function CoachTasksView({ trainees, onSelectTrainee, onCreatePlanForTask }) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontFamily: FN, fontSize: 18, color: C.tx, letterSpacing: '0.04em' }}>TASKS</h2>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.tm }}>
          Unified feed — write a task from anywhere, tag it to a trainee, see it in three places.
        </div>
      </div>
      <NotesWidget
        trainees={trainees}
        onCreatePlanForTask={onCreatePlanForTask}
        onNavigate={(kind, id) => {
          if (kind === 'trainee' && onSelectTrainee) onSelectTrainee(id);
        }} />
    </div>
  );
}
