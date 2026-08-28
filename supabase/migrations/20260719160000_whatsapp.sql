-- WhatsApp AI Concierge: full conversation log per lead (inbound + outbound).
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  wa_phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  body TEXT,
  wa_message_id TEXT UNIQUE,
  ai_replied BOOLEAN NOT NULL DEFAULT false,
  handoff BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_messages_lead ON public.whatsapp_messages (lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_messages_phone ON public.whatsapp_messages (wa_phone, created_at);
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_messages_read" ON public.whatsapp_messages;
CREATE POLICY "wa_messages_read" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (true);
