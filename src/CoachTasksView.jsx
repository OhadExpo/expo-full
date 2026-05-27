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
import TasksV3View from './TasksV3View';
import TasksV4View from './TasksV4View';
import TasksV5View from './TasksV5View';
import TasksV6View from './TasksV6View';

// URL param routes:
//   ?ui=v3  → sort bar + source-line per row + plate/alerts split
//   ?ui=v4  → conversation feed (message bubbles)
//   ?ui=v5  → source cards grid
//   ?ui=v6  → v3 + v5 hybrid: owner tabs + sort bar + source cards (latest)
export default function CoachTasksView({ trainees, onSelectTrainee, onCreatePlanForTask, onOpenIntakeTab, onOpenReviewWorkout }) {
  const ui = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ui') : null;
  if (ui === 'v3') return <TasksV3View />;
  if (ui === 'v4') return <TasksV4View />;
  if (ui === 'v5') return <TasksV5View />;
  if (ui === 'v6') return <TasksV6View />;
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
