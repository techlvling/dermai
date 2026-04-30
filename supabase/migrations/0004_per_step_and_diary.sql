-- =============================================================================
-- DermAI — Phase 3: per-step routine tracking + diary backend sync
-- =============================================================================
--
-- 1. routine_logs: replace coarse am_done/pm_done booleans with a
--    steps_done jsonb of shape { am: { cleanser: bool, treatment: bool, ... },
--    pm: { ... } } so partial completion days count partially. Existing
--    rows are migrated into a coarse 'any' bucket so historical streaks
--    don't reset.
--
-- 2. diary_entries: new table for water/stress/sleep/mood, keyed by
--    (user_id, log_date), backed by RLS. Replaces localStorage-only
--    skin diary so values follow the user across devices.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. routine_logs — switch to per-step jsonb
-- ---------------------------------------------------------------------------

ALTER TABLE public.routine_logs
    ADD COLUMN steps_done jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: project legacy booleans into a coarse {slot:{any:true}} bucket so
-- the existing streak/heatmap stays consistent. New writes will populate the
-- granular {slot:{cleanser:true, treatment:true, ...}} shape.
UPDATE public.routine_logs
   SET steps_done = jsonb_build_object(
       'am', CASE WHEN am_done THEN jsonb_build_object('any', true) ELSE '{}'::jsonb END,
       'pm', CASE WHEN pm_done THEN jsonb_build_object('any', true) ELSE '{}'::jsonb END
   )
 WHERE steps_done = '{}'::jsonb;

ALTER TABLE public.routine_logs
    DROP COLUMN am_done,
    DROP COLUMN pm_done;

-- ---------------------------------------------------------------------------
-- 2. diary_entries — new table
-- ---------------------------------------------------------------------------

CREATE TABLE public.diary_entries (
    id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    log_date      date        NOT NULL,
    water_liters  numeric(4,2),
    stress_1_5    smallint    CHECK (stress_1_5 BETWEEN 1 AND 5),
    sleep_hours   numeric(3,1),
    mood          text,
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, log_date)
);

ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own diary entries"
    ON public.diary_entries
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX ON public.diary_entries (user_id);

-- updated_at auto-touch on row update
CREATE OR REPLACE FUNCTION public.touch_diary_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER diary_entries_touch_updated_at
    BEFORE UPDATE ON public.diary_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_diary_updated_at();

COMMIT;
