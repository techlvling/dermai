-- =============================================================================
-- DermAI — Phase 5B / Ingredient evidence cache for the weekly PubMed cron
-- =============================================================================
--
-- Single-row cache for ingredient evidence. Vercel's runtime filesystem is
-- read-only so the weekly PubMed refresh cron can't write to ingredients.json.
-- Instead we store the freshly-fetched payload here as a jsonb blob and the
-- /api/ingredients endpoint prefers the cache over the on-disk fallback.
--
-- Read access for both authed and anon roles (the /api/ingredients endpoint
-- is public). Writes are service-role only — the cron handler uses the admin
-- client.
-- =============================================================================

CREATE TABLE public.evidence_cache (
    id              text         PRIMARY KEY DEFAULT 'singleton'
                                 CHECK (id = 'singleton'),
    ingredients     jsonb        NOT NULL DEFAULT '[]'::jsonb,
    last_refreshed  timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.evidence_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed users can read evidence cache"
    ON public.evidence_cache FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Anon can read evidence cache"
    ON public.evidence_cache FOR SELECT TO anon
    USING (true);

INSERT INTO public.evidence_cache (id, ingredients, last_refreshed)
VALUES ('singleton', '[]'::jsonb, now())
ON CONFLICT (id) DO NOTHING;
