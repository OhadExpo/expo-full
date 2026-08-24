// sessionMerge.js — how a coach device folds another coach device's
// full-session broadcast into its own state.
//
// The group-session coach mirror broadcasts the WHOLE session on every edit and
// receivers used to replace their state wholesale. On the floor that meant the
// phone's snapshot — built a moment before the big screen's keystroke landed —
// reverted that keystroke mid-typing, and the big screen's next broadcast
// reverted the phone's check-in straight back. Whichever device wrote last also
// won the shared debounced store write, so one of the two changes was lost
// durably (audit 2026-08-22 #43).
//
// The rule: take the incoming snapshot, but keep OUR row for any athlete this
// device edited within PROTECT_MS. The sender built its snapshot before our edit
// existed, so applying it would silently undo it — and our own broadcast is
// already on its way, which converges the other device.
//
// Deliberately clock-safe: it compares a LOCAL timestamp against a LOCAL now,
// never against the sender's clock.

export const PROTECT_MS = 2500;

export function mergeIncomingSession(prev, incoming, touched, now) {
  if (!prev || !Array.isArray(prev.athletes)) return incoming;
  if (!incoming || !Array.isArray(incoming.athletes)) return prev;
  const mineByRow = new Map(prev.athletes.map((a) => [a.rowId, a]));
  return {
    ...incoming,
    athletes: incoming.athletes.map((inA) => {
      const t = touched && touched.get ? touched.get(inA.rowId) : null;
      const mine = mineByRow.get(inA.rowId);
      return (t && now - t < PROTECT_MS && mine) ? mine : inA;
    }),
  };
}
