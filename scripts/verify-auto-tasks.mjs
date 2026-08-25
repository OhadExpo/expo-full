// Regression suite for the auto-task throttler.
//
// This is what decides whether Ohad's dashboard says "Diego needs outreach" once
// or three separate times, and the synthetic card it builds is what the
// mark-done path fans out over. It runs against real athletes every day and had
// no assertions at all.
import { throttleWhatsAppTasks, AUTO_KIND_ACTION, AUTO_KIND_LABEL } from '../src/autoTaskCards.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};

const row = (o) => ({ status: 'open', created_at: '2026-08-01T00:00:00Z', ...o });

console.log('AUTO-TASK THROTTLE\n');

// ── the whole point: one athlete, three reasons, ONE card ──────────────────
{
  const out = throttleWhatsAppTasks([
    row({ auto_kind: 'week_missed', target_id: 'tr_d', target_label: 'Diego', created_at: '2026-08-01T00:00:00Z' }),
    row({ auto_kind: 'at_risk_silent', target_id: 'tr_d', target_label: 'Diego', created_at: '2026-08-03T00:00:00Z' }),
    row({ auto_kind: 'payment_overdue', target_id: 'tr_d', target_label: 'Diego', created_at: '2026-08-02T00:00:00Z' }),
  ]);
  eq('three outreach reasons collapse to one card', out.length, 1);
  eq('the card is marked combined', out[0].auto_kind, 'whatsapp_combined');
  eq('it still resolves to a WhatsApp action', AUTO_KIND_ACTION[out[0].auto_kind], 'WHATSAPP');
  eq('every underlying row is carried for the fan-out close', out[0].__sources.length, 3);
  // The label is wrapped in Unicode isolate marks (U+2068/U+2069) on purpose so a
  // Hebrew name cannot drag neighbouring digits into its RTL run. Strip them
  // before matching rather than pretending they are not there.
  const plain = (x) => String(x).replace(/[\u2066-\u2069]/g, '');
  eq('the body names the athlete and counts the reasons', /Diego · 3 reasons:/.test(plain(out[0].body)), true);
  eq('it floats at the FRESHEST row time', out[0].created_at, '2026-08-03T00:00:00Z');
}

// ── different athletes never merge ─────────────────────────────────────────
{
  const out = throttleWhatsAppTasks([
    row({ auto_kind: 'week_missed', target_id: 'tr_a', target_label: 'A' }),
    row({ auto_kind: 'week_missed', target_id: 'tr_b', target_label: 'B' }),
  ]);
  eq('two athletes stay two cards', out.length, 2);
}

// ── non-outreach kinds are never merged away ───────────────────────────────
{
  const out = throttleWhatsAppTasks([
    row({ auto_kind: 'week_missed', target_id: 'tr_d', target_label: 'Diego' }),
    row({ auto_kind: 'form_video_pending_review', target_id: 'tr_d', target_label: 'Diego' }),
    row({ auto_kind: 'next_block_due', target_id: 'tr_d', target_label: 'Diego' }),
  ]);
  eq('a REVIEW and a NEW_PROGRAM task survive alongside the outreach', out.length, 3);
  eq('and they keep their own kinds',
    out.map((r) => r.auto_kind).sort(),
    ['form_video_pending_review', 'next_block_due', 'week_missed']);
}

// ── a done row is left alone ───────────────────────────────────────────────
{
  const out = throttleWhatsAppTasks([
    row({ auto_kind: 'week_missed', target_id: 'tr_d', target_label: 'Diego', status: 'done' }),
    row({ auto_kind: 'payment_overdue', target_id: 'tr_d', target_label: 'Diego' }),
  ]);
  eq('a completed task is not folded into a live card', out.length, 2);
}

// ── a general task with no target cannot be grouped ────────────────────────
{
  const out = throttleWhatsAppTasks([
    row({ auto_kind: 'week_missed' }),
    row({ auto_kind: 'week_missed' }),
  ]);
  eq('targetless outreach rows stay separate', out.length, 2);
}

// ── pinning survives the merge ─────────────────────────────────────────────
{
  const out = throttleWhatsAppTasks([
    row({ auto_kind: 'week_missed', target_id: 'tr_d', target_label: 'Diego' }),
    row({ auto_kind: 'payment_overdue', target_id: 'tr_d', target_label: 'Diego', pinned: true }),
  ]);
  eq('a pinned reason keeps the merged card pinned', !!out[0].pinned, true);
}

// ── it takes RAW rows — and is deliberately not idempotent ────────────────
// A combined card maps back to a WHATSAPP action, so feeding this its own output
// re-wraps it and loses the __sources the mark-done fan-out closes. The single
// call site passes freshly filtered store rows. Asserting the real behaviour so
// nobody "fixes" it into a double-apply.
{
  const once = throttleWhatsAppTasks([
    row({ auto_kind: 'week_missed', target_id: 'tr_d', target_label: 'Diego' }),
    row({ auto_kind: 'payment_overdue', target_id: 'tr_d', target_label: 'Diego' }),
  ]);
  eq('one pass over raw rows carries both reasons', once[0].__sources.length, 2);
  const twice = throttleWhatsAppTasks(once);
  eq('a second pass collapses the sources — do NOT double-apply', twice[0].__sources.length, 1);
}

// ── a cancelled reason is terminal too ────────────────────────────────────
{
  const out = throttleWhatsAppTasks([
    row({ auto_kind: 'week_missed', target_id: 'tr_d', target_label: 'Diego', status: 'cancelled' }),
    row({ auto_kind: 'payment_overdue', target_id: 'tr_d', target_label: 'Diego' }),
  ]);
  eq('a cancelled reason is not folded into a live card', out.length, 2);
}

// ── every kind has a label and an action ───────────────────────────────────
{
  const kinds = Object.keys(AUTO_KIND_ACTION);
  const missingLabel = kinds.filter((k) => !AUTO_KIND_LABEL[k]);
  eq('no kind is missing its human label', missingLabel, []);
}

// ── degenerate ─────────────────────────────────────────────────────────────
eq('null input', throttleWhatsAppTasks(null), []);
eq('empty input', throttleWhatsAppTasks([]), []);

console.log(`\nAUTO-TASK THROTTLE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
