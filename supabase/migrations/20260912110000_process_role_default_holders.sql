-- Process OS: the designated holder of a process role holds it.
--
-- An app user has ONE app role, but in a ten-person company one person wears
-- several hats (the factory manager also runs accounts). process_role_defaults
-- already names who holds each process role; this makes that assignment
-- authoritative for permission checks too, so the holder passes the role
-- gate whatever their app role says. Mirrors userHasProcessRole() in
-- apps/web/src/lib/process/permissions.ts.

CREATE OR REPLACE FUNCTION public.process_user_has_role(p_user UUID, p_role_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user
      AND (u.role = ANY (public.process_role_app_roles(p_role_key))
           OR u.role IN ('founder', 'owner'))
  ) OR EXISTS (
    SELECT 1 FROM public.process_role_defaults d
    WHERE d.role_key = p_role_key AND d.user_id = p_user
  );
$$;

-- ROLLBACK: re-run the definition of process_user_has_role from
-- 20260912100000_process_os.sql (without the second EXISTS).
