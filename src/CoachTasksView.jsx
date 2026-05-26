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
import TasksV2View from './TasksV2View';
import TasksV3View from './TasksV3View';

// URL param routes to prototype layouts so the legacy view stays the
// production default until one of them is promoted:
//   ?ui=v2  → flat-list layout with filter chips
//   ?ui=v3  → bordered sort bar + source-line per row + plate/alerts split
export default function CoachTasksView({ trainees, onSelectTrainee, onCreatePlanForTask, onOpenIntakeTab, onOpenReviewWorkout }) {
  const ui = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ui') : null;
  if (ui === 'v2') return <TasksV2View />;
  if (ui === 'v3') return <TasksV3View />;
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
