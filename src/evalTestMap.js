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
// Stubbed (coming): broad_jump needs a horizontal scale reference; iso_* need a
// hold timer; the ROM joints need the pose goniometer. Listed here as
// `status:'soon'` so the UI can show a disabled "TEST · soon" affordance instead
// of pretending. drop_jump / sl_pogo are now LIVE — reactiveJumpMetrics gives
// ground-contact + RSI, and the jump tool branches to reactive mode on jumpType.

// jumpType drives the on-screen cue/label inside the jump tool. side:true means
// the test stores a per-limb { L, R } object and the button is offered per side.
export const EVAL_TEST_TOOLS = {
  // Jumping & Landing — vertical height from flight time (h = g·t²/8)
  svj:        { tool: 'jump', jumpType: 'svj', label: 'Standing Vertical Jump', toValue: j => String(j.heightCm) },
  cmj:        { tool: 'jump', jumpType: 'cmj', label: 'Countermovement Jump',   toValue: j => String(j.heightCm) },
  sl_jump:    { tool: 'jump', jumpType: 'sl',  label: 'Single-Leg Jump', side: true, toValue: j => String(j.heightCm) },

  // Reactive jumps — ground-contact + RSI via reactiveJumpMetrics. The jump
  // tool segments airborne windows and contacts; the result carries heightCm,
  // contactMs (the SSC/LSC ground-contact time), and rsi. toValue folds those
  // into the composite eval field (matching evaluationSchema composite ids).
  drop_jump:  { tool: 'jump', jumpType: 'drop', label: 'Drop Jump (RSI)',
                toValue: j => ({ height_cm: String(j.heightCm), ssc_ms: String(j.contactMs), rsi: String(j.rsi) }) },
  sl_pogo:    { tool: 'jump', jumpType: 'pogo', side: true, label: 'POGO (RSI)',
                toValue: j => ({ ssc_ms: String(j.contactMs), rsi: String(j.rsi) }) },

  // Isometric holds — coach-operated hold-to-failure timer (no pose; a
  // stopwatch is the right tool). Result is whole seconds; sided tests store
  // { L, R }. unit in evaluationSchema is 'sec'.
  iso_sl_stand: { tool: 'hold', side: true, label: 'ISO Single-Leg Stand', goal: '30 sec E', toValue: s => String(s) },
  iso_dead_hang:{ tool: 'hold', label: 'ISO Dead Hang', goal: '30 sec', toValue: s => String(s) },
  iso_sa_pushup:{ tool: 'hold', side: true, label: 'ISO SA Push-Up Stance', goal: '15 sec E', toValue: s => String(s) },

  // not yet — surfaced as disabled so the eval shows the intended coverage
  broad_jump: { tool: 'jump', status: 'soon', label: 'Broad Jump' },
};

export const toolForTest = (testId) => EVAL_TEST_TOOLS[testId] || null;
