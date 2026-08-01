-- ============================================================================
-- Data fix: strip the " 100" artifact from auto-created lead names.
--
-- Cause: extractNameFromFilename() stripped phone numbers with [6-9]\d{9}
-- BEFORE removing Superfone's 13-digit epoch suffix. In a filename like
--   Superfone_Recording_Murali_Kanchipuram_+919444481791_1785442187000.wav
-- the phone pattern matched "7854421870" *inside* the epoch 1785442187000,
-- leaving "1" + "00" behind. The follow-up \b\d+\b cleanup could not remove it
-- because the fragment was still glued to an underscore ("__100") and `_` is a
-- regex word character, so no word boundary existed. Underscores only became
-- spaces afterwards — too late.
--
-- Parser fixed in apps/web/src/lib/telegram-webhook.ts (epoch removed first,
-- number cleanup moved after underscore conversion). This migration repairs the
-- rows already written.
--
-- Scope guard: only leads that came from the call-recording pipeline, matched
-- either by a linked recording or by phone. A manually typed name that happens
-- to end in 100 is left alone. Names ending in a full phone number (e.g.
-- "Mr. Yuvraj 9840804100") do not match ' 100$' and are untouched.
-- Idempotent: re-running finds nothing to change.
-- ============================================================================

UPDATE public.leads AS l
SET name = regexp_replace(l.name, '\s+100$', '')
WHERE l.name ~ '\s100$'
  AND EXISTS (
    SELECT 1
    FROM public.call_recordings cr
    WHERE cr.lead_id = l.id
       OR right(regexp_replace(cr.phone_number, '\D', '', 'g'), 10)
          = right(regexp_replace(l.contact, '\D', '', 'g'), 10)
  );
