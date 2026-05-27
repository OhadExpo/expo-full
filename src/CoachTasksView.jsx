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
import NotesWidget from './NotesWidget';
import TasksV8View from './TasksV8View';

// URL param routes:
//   ?ui=v8  → list-first with view toggle to board (Linear/Things 3 pattern)
//             — the current iteration. v6/v7 deleted.
export default function CoachTasksView({ trainees, onSelectTrainee, onCreatePlanForTask, onOpenIntakeTab, onOpenReviewWorkout }) {
  const ui = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ui') : null;
  if (ui === 'v8') return <TasksV8View />;
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 4px' }}>
      <NotesWidget
        trainees={trainees}
        onCreatePlanForTask={onCreatePlanForTask}
        onOpenIntakeTab={onOpenIntakeTab}
        onNavigate={(kind, id) => {
          if (kind === 'trainee' && onSelectTrainee) onSelectTrainee(id);
          else if (kind === 'review' && id) {
            try { sessionStorage.setItem('expo-pendingReviewWorkout', id); } catch {}
            onOpenReviewWorkout?.(id);
          }
        }} />
    </div>
  );
}
