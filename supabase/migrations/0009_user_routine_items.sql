-- =============================================================================
-- DermAI — Phase 6 / Dashboard IA revamp
-- =============================================================================
--
-- Replaces user_products (BYO typed entries) with a simpler "products this
-- user has bought from the catalog" list. Catalog product ids are text
-- (prod_tret_01 etc.) — no FK because catalog lives in products.json,
-- not Postgres.
--
-- Drops:
--   - user_products (was BYO catalog)
--   - product_evaluations (was AI verdict cache for the BYO link-paste flow)
-- Both go away with the BYO entry surface being removed from the frontend.
-- =============================================================================

CREATE TABLE public.user_routine_items (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id   text        NOT NULL,
    slot         text        NOT NULL CHECK (slot IN ('cleanser','treatment','moisturizer','sunscreen')),
    time_of_day  text        NOT NULL CHECK (time_of_day IN ('AM','PM','both')),
    order_index  int         NOT NULL DEFAULT 0,
    added_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, product_id, slot, time_of_day)
);

ALTER TABLE public.user_routine_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own routine items"
    ON public.user_routine_items FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own routine items"
    ON public.user_routine_items FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own routine items"
    ON public.user_routine_items FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own routine items"
    ON public.user_routine_items FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

CREATE INDEX user_routine_items_user_idx ON public.user_routine_items(user_id);

-- Drop the BYO tables
DROP TABLE IF EXISTS public.user_products CASCADE;
DROP TABLE IF EXISTS public.product_evaluations CASCADE;
