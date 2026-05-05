-- AI call log for usage observability in the admin panel.
-- Fire-and-forget inserts from routes/analyze.js and routes/compare.js.
-- No RLS needed for anon/authenticated — admin panel reads via service role.

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id               bigserial PRIMARY KEY,
  ts               timestamptz NOT NULL DEFAULT now(),
  route            text,
  provider         text,
  model            text,
  prompt_tokens    int,
  completion_tokens int,
  status           text,
  user_id          text,
  error            text
);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
-- No public read — only service role (admin panel) can read/write
