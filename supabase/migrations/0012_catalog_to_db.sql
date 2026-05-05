-- Catalog tables: products, ingredients, concerns, conflicts
-- These replace the on-disk JSON files. Column names match existing JSON keys (snake_case).
-- RLS: public read (anon + authenticated), writes via service role only — same pattern as evidence_cache.

-- Products
CREATE TABLE IF NOT EXISTS public.products (
  id                   text PRIMARY KEY,
  name                 text NOT NULL,
  brand                text,
  primary_ingredient_id text,
  category             text,
  best_time_of_day     text,
  concerns             text[],
  price_tier           text,
  product_evidence_tier int,
  category_note        text,
  product_trials       jsonb,
  search_query         text,
  asin_overrides       jsonb,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select" ON public.products FOR SELECT TO anon, authenticated USING (true);

-- Ingredients
CREATE TABLE IF NOT EXISTS public.ingredients (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  evidence_tier int,
  evidence_type text,
  key_studies   jsonb,
  summary       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingredients_select" ON public.ingredients FOR SELECT TO anon, authenticated USING (true);

-- Concerns
CREATE TABLE IF NOT EXISTS public.concerns (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  target_ingredients  text[],
  rationale           text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.concerns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concerns_select" ON public.concerns FOR SELECT TO anon, authenticated USING (true);

-- Conflicts (severity stored as text matching JSON: "high"/"medium"/"low")
CREATE TABLE IF NOT EXISTS public.conflicts (
  id         bigserial PRIMARY KEY,
  a          text NOT NULL,
  b          text NOT NULL,
  severity   text,
  title      text,
  reason     text,
  tip        text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conflicts_select" ON public.conflicts FOR SELECT TO anon, authenticated USING (true);
