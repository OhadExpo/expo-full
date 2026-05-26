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

// `?ui=v2` activates the Option 5 layout prototype (continuous list with
// NOW line, Monday status pills, assignee dots, inline expand). Read-only
// prototype rendered from existing coach_notes data. Throw away if
// rejected; otherwise Phase 1 lands real schema (assigned_to / due_at /
// 4-state status) and the prototype becomes the canonical view.
export default function CoachTasksView({ trainees, onSelectTrainee, onCreatePlanForTask, onOpenIntakeTab, onOpenReviewWorkout }) {
  const useV2 = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ui') === 'v2';
  if (useV2) return <TasksV2View />;
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
