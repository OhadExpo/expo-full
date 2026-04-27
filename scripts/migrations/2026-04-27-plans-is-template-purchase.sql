-- Plans: add is_template_purchase column.
--
-- Why: substitution UI is gated on whether a plan is a template purchase
-- (template buyers can swap exercises themselves; manually-coached private
-- clients should not — Ohad handles their substitutions). Until this column
-- existed the gate ran off a name-prefix regex, which is fragile.
--
-- App code already writes data->>'isTemplatePurchase' inside the JSONB blob.
-- This migration promotes that to a typed column + backfills from the blob.
--
-- Run via the Supabase dashboard SQL editor.
-- Safe to re-run: IF NOT EXISTS guards every step.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS is_template_purchase boolean NOT NULL DEFAULT false;

-- Backfill: any plan whose JSONB data carries isTemplatePurchase=true OR
-- whose name uses the legacy template prefix gets the flag. Idempotent.
UPDATE plans
SET is_template_purchase = true
WHERE is_template_purchase = false
  AND (
    (data->>'isTemplatePurchase')::boolean = true
    OR lower(name) LIKE '[expo]%'
    OR lower(name) LIKE 'expo · %'
    OR lower(name) LIKE 'expo - %'
  );

-- Index for the substitution-gate read path. Filtered partial index keeps
-- the index small — most plans are coach-managed (false), only template
-- purchases are true.
CREATE INDEX IF NOT EXISTS plans_is_template_purchase_idx
  ON plans (is_template_purchase)
  WHERE is_template_purchase = true;
