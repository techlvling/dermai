-- Admin action audit log. Writable via service role only.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id            bigserial PRIMARY KEY,
  ts            timestamptz NOT NULL DEFAULT now(),
  admin_email   text NOT NULL,
  action        text NOT NULL,
  resource_type text,
  resource_id   text,
  payload       jsonb
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
-- No public read — service role only (admin panel reads it)
