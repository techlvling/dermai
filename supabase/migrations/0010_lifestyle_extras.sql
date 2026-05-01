-- =============================================================================
-- DermAI — Phase 7 / Daily Scan + Post-Scan Lifestyle Check-in
-- =============================================================================
--
-- Extends diary_entries with lifestyle metrics asked post-scan (or via the
-- standalone "Quick Check-in" button on Routine), plus a derived wellness
-- score and an optional FK linking the entry back to the scan that triggered
-- it. The Diary tab is being removed; lifestyle data is now collected
-- post-scan and surfaced as 6 stacked heatmaps on Overview.
--
-- All new columns are nullable so existing rows (water/sleep/stress only)
-- continue to work without backfill.
-- =============================================================================

ALTER TABLE public.diary_entries
  ADD COLUMN sun_minutes     int,
  ADD COLUMN alcohol_drinks  smallint,
  ADD COLUMN symptoms        text[],
  ADD COLUMN wellness_score  smallint,
  ADD COLUMN scan_id         bigint REFERENCES public.scans(id) ON DELETE SET NULL;

-- Range guards. Loose bounds that catch obvious bad input without rejecting
-- edge cases (e.g. an outdoor day-hike could legitimately be 6+ hours).
ALTER TABLE public.diary_entries
  ADD CONSTRAINT diary_entries_sun_minutes_range
    CHECK (sun_minutes IS NULL OR (sun_minutes >= 0 AND sun_minutes <= 720)),
  ADD CONSTRAINT diary_entries_alcohol_drinks_range
    CHECK (alcohol_drinks IS NULL OR (alcohol_drinks >= 0 AND alcohol_drinks <= 20)),
  ADD CONSTRAINT diary_entries_wellness_score_range
    CHECK (wellness_score IS NULL OR (wellness_score >= 0 AND wellness_score <= 100));

CREATE INDEX diary_entries_scan_id_idx ON public.diary_entries(scan_id);
