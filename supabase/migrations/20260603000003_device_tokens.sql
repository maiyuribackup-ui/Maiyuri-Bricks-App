-- Push notifications (Phase 2): FCM device tokens per user.
-- A user can have multiple devices; a token is globally unique (reassigned to
-- the latest user on conflict). Mirrors existing RLS conventions.

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android','ios','web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_tokens_auth_all ON public.device_tokens;
CREATE POLICY device_tokens_auth_all ON public.device_tokens
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
