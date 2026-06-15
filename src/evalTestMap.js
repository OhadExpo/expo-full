// Maps Athletic-Evaluation test ids → the camera tool that measures them and
// how to fold the tool's result into that test's eval field value. This is the
// spine of the "test inside the eval" flow: the editor shows a TEST button next
// to every id listed here, launches the tool, and writes the measured value
// straight into scores[id].
//
// Only what the camera measures RELIABLY today is wired. Reliability ceiling is
// frame rate (per research: native slow-mo upload ≈ ±1cm at 240fps; live web
// camera ≈ ±3–10cm at 30–60fps), so jumps prefer an uploaded slow-mo clip.
//
// Stubbed (coming): drop_jump / sl_pogo need ground-contact + RSI math;
// broad_jump needs a horizontal scale reference; iso_* need a hold timer; the
// ROM joints need the pose goniometer. Listed here as `status:'soon'` so the UI
// can show a disabled "TEST · soon" affordance instead of pretending.

// jumpType drives the on-screen cue/label inside the jump tool. side:true means
// the test stores a per-limb { L, R } object and the button is offered per side.
export const EVAL_TEST_TOOLS = {
  // Jumping & Landing — vertical height from flight time (h = g·t²/8)
  svj:        { tool: 'jump', jumpType: 'svj', label: 'Standing Vertical Jump', toValue: j => String(j.heightCm) },
  cmj:        { tool: 'jump', jumpType: 'cmj', label: 'Countermovement Jump',   toValue: j => String(j.heightCm) },
  sl_jump:    { tool: 'jump', jumpType: 'sl',  label: 'Single-Leg Jump', side: true, toValue: j => String(j.heightCm) },

  // not yet — surfaced as disabled so the eval shows the intended coverage
  drop_jump:  { tool: 'jump', status: 'soon', label: 'Drop Jump (RSI)' },
  sl_pogo:    { tool: 'jump', status: 'soon', side: true, label: 'POGO (RSI)' },
  broad_jump: { tool: 'jump', status: 'soon', label: 'Broad Jump' },
  iso_sl_stand: { tool: 'hold', status: 'soon', side: true, label: 'ISO Single-Leg Stand' },
  iso_dead_hang:{ tool: 'hold', status: 'soon', label: 'ISO Dead Hang' },
  iso_sa_pushup:{ tool: 'hold', status: 'soon', side: true, label: 'ISO SA Push-Up Stance' },
};

export const toolForTest = (testId) => EVAL_TEST_TOOLS[testId] || null;
