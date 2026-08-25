-- ============================================================================
-- Pin search_path on the two Unit Economics trigger functions.
--
-- Supabase's database linter flags functions with a role-mutable search_path
-- (lint 0011). Both of these are SECURITY INVOKER trigger functions, so the
-- exposure is smaller than for a SECURITY DEFINER function, but a caller can
-- still prepend a schema and change which table an unqualified name resolves
-- to. Pinning it is free and removes the warning.
--
-- publish_std_cost_draft() already sets it (it is SECURITY DEFINER, where this
-- matters most) and is revoked from anon and authenticated.
-- ============================================================================

ALTER FUNCTION public.std_cost_guard_published() SET search_path = public;
ALTER FUNCTION public.std_cost_check_breakdown() SET search_path = public;
