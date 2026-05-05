-- Affiliate region tags — one row per Amazon regional TLD.
-- Seeded with the 18 regions from frontend/js/recommendations.js:amazonRegions.

CREATE TABLE IF NOT EXISTS public.affiliate_regions (
  country_code text PRIMARY KEY,
  country_name text,
  tld          text NOT NULL,
  tag          text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_regions ENABLE ROW LEVEL SECURITY;
-- Public read so the frontend recommendations.js can fetch it
CREATE POLICY "affiliate_regions_select" ON public.affiliate_regions FOR SELECT TO anon, authenticated USING (true);

-- Seed with the 18 regions from the hardcoded amazonRegions map
INSERT INTO public.affiliate_regions (country_code, country_name, tld, tag) VALUES
  ('IN',  'India',          'in',     'tinkref-21'),
  ('US',  'United States',  'com',    ''),
  ('GB',  'United Kingdom', 'co.uk',  ''),
  ('DE',  'Germany',        'de',     ''),
  ('FR',  'France',         'fr',     ''),
  ('IT',  'Italy',          'it',     ''),
  ('ES',  'Spain',          'es',     ''),
  ('CA',  'Canada',         'ca',     ''),
  ('AU',  'Australia',      'com.au', ''),
  ('JP',  'Japan',          'co.jp',  ''),
  ('BR',  'Brazil',         'com.br', ''),
  ('MX',  'Mexico',         'com.mx', ''),
  ('AE',  'UAE',            'ae',     ''),
  ('SA',  'Saudi Arabia',   'sa',     ''),
  ('SG',  'Singapore',      'sg',     ''),
  ('NL',  'Netherlands',    'nl',     ''),
  ('SE',  'Sweden',         'se',     ''),
  ('PL',  'Poland',         'pl',     '')
ON CONFLICT (country_code) DO NOTHING;
