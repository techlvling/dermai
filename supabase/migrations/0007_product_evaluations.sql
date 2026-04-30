-- =============================================================================
-- DermAI — Phase 4 / Product-link entry + AI evaluation cache
-- =============================================================================
--
-- product_evaluations: globally cached AI verdicts on user-submitted products.
-- Keyed by a content hash of normalized brand+name+sorted-ingredient-ids so two
-- different users pasting the same product hit the same cache row instead of
-- spending tokens on the same AI evaluation twice.
--
-- Read-allow for any authenticated user; writes go through the service role
-- (the backend route inserts after AI evaluation).
--
-- Plus user_products gets two new optional columns: source_url (the link the
-- user pasted) and evaluation_id (FK to the cached verdict).
-- =============================================================================

BEGIN;

CREATE TABLE public.product_evaluations (
    id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    key                   text        NOT NULL UNIQUE,
    name                  text        NOT NULL,
    brand                 text,
    ingredients           text[]      NOT NULL DEFAULT '{}',
    unmapped_ingredients  text[]      NOT NULL DEFAULT '{}',
    category              text        NOT NULL CHECK (category IN ('cleanser','treatment','moisturizer','sunscreen')),
    best_time_of_day      text        NOT NULL CHECK (best_time_of_day IN ('AM','PM','both')),
    verdict_json          jsonb       NOT NULL,
    model                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    evaluated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed users can read product evaluations"
    ON public.product_evaluations FOR SELECT TO authenticated
    USING (true);

CREATE INDEX product_evaluations_key_idx ON public.product_evaluations(key);

ALTER TABLE public.user_products
    ADD COLUMN IF NOT EXISTS source_url    text,
    ADD COLUMN IF NOT EXISTS evaluation_id uuid REFERENCES public.product_evaluations(id) ON DELETE SET NULL;

COMMIT;
