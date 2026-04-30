-- =============================================================================
-- DermAI — Phase 4: bring-your-own products + per-slot product choice
-- =============================================================================
--
-- 1. user_products: each user can save the products they actually own and
--    slot them into routines alongside curated catalog items.
--
-- 2. routine_logs.slot_choices: which product was used in each routine slot,
--    sourced either from the curated catalog or from user_products.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. user_products
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_products (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name               text        NOT NULL,
    brand              text,
    category           text        NOT NULL CHECK (category IN ('cleanser','treatment','moisturizer','sunscreen')),
    best_time_of_day   text        NOT NULL CHECK (best_time_of_day IN ('AM','PM','both')),
    ingredients        text[]      NOT NULL DEFAULT '{}',
    created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own products"
    ON public.user_products FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own products"
    ON public.user_products FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products"
    ON public.user_products FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products"
    ON public.user_products FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

CREATE INDEX user_products_user_idx ON public.user_products(user_id);

-- ---------------------------------------------------------------------------
-- 2. routine_logs.slot_choices
--    Shape: {"am":{"cleanser":{"source":"catalog","id":"prod_cle_01"},
--                  "treatment":{"source":"user","id":"<uuid>"}},"pm":{...}}
-- ---------------------------------------------------------------------------

ALTER TABLE public.routine_logs
    ADD COLUMN IF NOT EXISTS slot_choices jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
