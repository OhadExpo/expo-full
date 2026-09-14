// Give each component that now calls the translator its own binding. They are
// all React components (PascalCase, rendered as JSX); the hook goes on the
// first line of the body, which is where every other component in these files
// declares it.
import fs from 'node:fs';

const TARGETS = {
  'App.jsx': [['function AuthedApp() {', 'tt']],
  'BhbcView.jsx': [
    ['function WellnessModal({ roster, bhbcLoads, onClose, onSave }) {', 'tr'],
    ['function SessionPlanModal({ slot, fixtures, plan, onClose, onSave, onPick, rows = [], medical = {} }) {', 'tr'],
    ['function GameEditModal({ game, onClose, onSave }) {', 'tr'],
    ['function StandingsTable({ standings }) {', 'tr'],
  ],
  'ChallengesView.jsx': [['function Leaderboard(', 'tt']],
  'PlansView.jsx': [
    ['function PlanPrintSheet({ plan, athleteName, exercises }) {', 'tt'],
    ['function AthleteCombo({ value, options, onPick, title }) {', 'tt'],
    ['function ShareAthleteModal({ trainees, shareSearch, setShareSearch, onPick, onClose }) {', 'tt'],
  ],
  'TasksV8View.jsx': [
    ['function MigrationPendingHint() {', 'tt'],
    ['function ExpandedDetail(', 'tt'],
  ],
  'TraineeDetail.jsx': [
    ['function ProgramCard({ plan: p, isVis, onOpen, onUnassign, onOnly, onToggleVis }) {', 't'],
    ['function BwAddRow({ onAdd }) {', 't'],
  ],
  'WorkoutReview.jsx': [['function ReviewHotkeys({ enabled, onFire, onJump }) {', 'tt']],
};
const HOOK = { 'BhbcView.jsx': 'useT()', 'PlansView.jsx': 'useAppT()', 'ChallengesView.jsx': 'useAppT()', 'WorkoutReview.jsx': 'useAppT()' };

for (const [f, list] of Object.entries(TARGETS)) {
  const p = 'src/' + f;
  let s = fs.readFileSync(p, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  for (const [anchor, name] of list) {
    const i = s.indexOf(anchor);
    if (i < 0) { console.log('MISS', f, anchor.slice(0, 40)); continue; }
    const nl = s.indexOf('\n', i);
    const decl = '  const ' + name + ' = ' + (HOOK[f] || 'useT()') + ';';
    if (s.slice(nl, nl + 400).includes(decl.trim())) { console.log('have', f, anchor.slice(9, 34)); continue; }
    s = s.slice(0, nl + 1) + decl + eol + s.slice(nl + 1);
    console.log('ok  ', f, anchor.slice(9, 34), '→', decl.trim());
  }
  fs.writeFileSync(p, s);
}
