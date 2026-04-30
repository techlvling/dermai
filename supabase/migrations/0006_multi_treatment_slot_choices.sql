-- =============================================================================
-- DermAI — Phase 4+ revamp / Multi-treatment routine slots
-- =============================================================================
--
-- routine_logs.slot_choices shape evolves from
--   {am:{key:{source,id}}, pm:{...}}                  (single product per step)
-- to
--   {am:{key:[{source,id},...]}, pm:{...}}            (multiple products per step)
--
-- so the user can layer treatments in the same time-of-day slot (e.g.
-- salicylic acid + niacinamide both in AM).
--
-- The column type stays jsonb. Backend reader normalizes any single-object
-- legacy shape into a 1-element array on read, so we keep back-compat with
-- clients that haven't picked up the new bundle yet.
--
-- No data backfill required at apply-time: production routine_logs.slot_choices
-- was empty when this migration ran.
-- =============================================================================

COMMENT ON COLUMN public.routine_logs.slot_choices IS
  'Per-day per-slot product choices. Shape: {"am":{"cleanser":[{"source":"catalog","id":"prod_cle_01"}],"treatment":[{"source":"user","id":"<uuid>"},{"source":"catalog","id":"prod_tre_03"}]},"pm":{...}}. Single-object legacy shape is also accepted on write and normalized to a 1-element array.';
