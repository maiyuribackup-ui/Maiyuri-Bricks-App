-- ============================================================================
-- Security: stop exposing Smart Quote sales intelligence to the anon key.
--
-- smart_quotes carried `FOR SELECT USING (true)`, so anyone holding the
-- publishable anon key (which ships in the browser bundle by design) could
-- list EVERY quote row — including the internal columns the customer is never
-- meant to see: stage, persona, primary_angle, secondary_angle,
-- route_decision, top_objections, risk_flags and scores, each joined to a
-- lead_id.
--
-- Nothing in the app relies on that policy. The public quote page
-- (app/sq/[slug]/page.tsx) server-fetches /api/sq/[slug], and every one of the
-- /api/sq/* routes (read, events, estimate, submit) uses the service-role
-- client, which bypasses RLS. There is no browser-side Supabase query anywhere
-- under src/components/smart-quote/. Staff access is unaffected: the
-- founder-all and assigned-staff policies below are left in place, and the
-- Quotes Inbox reads through the service role too.
--
-- smart_quote_events allowed INSERT to anyone (WITH CHECK true), so engagement
-- could be forged against any quote id — views, section reads and CTA clicks
-- all feed the "this customer is warm" signal staff act on. Real events are
-- written by POST /api/sq/[slug]/events using the service role, so public
-- insert is unnecessary.
-- ============================================================================

DROP POLICY IF EXISTS smart_quotes_public_read ON public.smart_quotes;
DROP POLICY IF EXISTS smart_quote_events_insert ON public.smart_quote_events;

-- Belt and braces: RLS denies by default once the permissive policies are
-- gone, but make the intent explicit for anyone reading the schema later.
REVOKE SELECT ON public.smart_quotes FROM anon;
REVOKE INSERT ON public.smart_quote_events FROM anon;
