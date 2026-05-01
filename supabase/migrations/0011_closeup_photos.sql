-- =============================================================================
-- DermAI — Phase 8 / Optional close-up photos with per-spot AI findings
-- =============================================================================
--
-- Adds an optional fourth (and beyond, up to 3) photo path to the scan flow.
-- The user can flag specific concerns ("this mole on my cheek", "the bump
-- that won't go") with a close-up photo + short note. The AI returns a
-- spotFindings[] array inside result_json — that part needs no schema change
-- since result_json is jsonb. This migration only persists the photo URLs +
-- notes the user attached, so the report can echo them back.
--
-- Shape of closeup_meta:
--   [{ "url": "https://drive.google.com/...", "note": "user text" }, ...]
-- Length 0–3. Null when the user took the standard 3-angle path with no
-- closeups (the common case), so existing scans render unchanged.
-- =============================================================================

ALTER TABLE public.scans
  ADD COLUMN closeup_meta jsonb;

-- Light shape guard: must be a JSON array if set, with at most 3 entries.
-- Per-entry schema (url string, note string ≤ 200 chars) is enforced server-
-- side in routes/photos.js because Postgres array constraints get noisy.
ALTER TABLE public.scans
  ADD CONSTRAINT scans_closeup_meta_array_3
    CHECK (closeup_meta IS NULL
        OR (jsonb_typeof(closeup_meta) = 'array' AND jsonb_array_length(closeup_meta) <= 3));
