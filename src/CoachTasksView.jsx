// /coach/tasks — v8 (list-first with source sections, sort + search +
// filter chips, status-icon popovers, Calendar sync). Default surface.
//
// `?ui=legacy` falls back to the original NotesWidget if something
// blows up in v8 — safety net only.

import React from 'react';
import NotesWidget from './NotesWidget';
import TasksV8View from './TasksV8View';

export default function CoachTasksView({ trainees, onSelectTrainee, onCreatePlanForTask, onOpenIntakeTab, onOpenReviewWorkout }) {
  const ui = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ui') : null;
  if (ui === 'legacy') {
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
  return <TasksV8View />;
}
