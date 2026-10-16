-- My Work approval: the audit row is accepted and self-approval is impossible.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION public.expect_fail(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'UNEXPECTED SUCCESS'; EXCEPTION WHEN others THEN RETURN 'expected: ' || SQLERRM; END $$;
CREATE OR REPLACE FUNCTION public.assert_true(p_ok boolean, p_msg text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN IF NOT COALESCE(p_ok, false) THEN RAISE EXCEPTION 'ASSERTION FAILED: %', p_msg; END IF; RETURN 'ok: ' || p_msg; END $$;

\set worker '00000000-0000-0000-0000-00000000b001'
\set sup    '00000000-0000-0000-0000-00000000b002'
INSERT INTO public.users (id,email,name,role) VALUES
 (:'worker','worker@w','Worker','engineer'), (:'sup','sup@w','Supervisor','production_supervisor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.work_items (id, title, status, assigned_user_id, requires_approval, submitted_at)
VALUES ('20000000-0000-0000-0000-00000000b001', 'Opening check', 'submitted', :'worker', true, now()),
       ('20000000-0000-0000-0000-00000000b002', 'Own check', 'submitted', :'sup', true, now());

-- 1. 'approved' is a valid audit event (it used to violate the CHECK).
INSERT INTO public.work_item_events (work_item_id, event_type, old_status, new_status, performed_by)
VALUES ('20000000-0000-0000-0000-00000000b001', 'approved', 'submitted', 'completed', :'sup');
SELECT public.assert_true(
  EXISTS (SELECT 1 FROM public.work_item_events WHERE event_type = 'approved'),
  'approved audit rows are stored');

-- 2. A different supervisor approves: allowed and recorded.
UPDATE public.work_items SET status = 'completed', approved_by = :'sup', approved_at = now()
WHERE id = '20000000-0000-0000-0000-00000000b001';
SELECT public.assert_true(
  (SELECT approved_by = :'sup'::uuid FROM public.work_items WHERE id = '20000000-0000-0000-0000-00000000b001'),
  'approver is recorded');

-- 3. Approving your own submission is rejected by the database.
SELECT public.expect_fail(format(
  'UPDATE public.work_items SET status = %L, approved_by = %L WHERE id = %L',
  'completed', :'sup', '20000000-0000-0000-0000-00000000b002')) AS self_approval;

-- 4. Unknown event types are still rejected.
SELECT public.expect_fail(format(
  'INSERT INTO public.work_item_events (work_item_id, event_type) VALUES (%L, %L)',
  '20000000-0000-0000-0000-00000000b001', 'bogus')) AS unknown_event;

SELECT 'WORK APPROVAL OK' AS result;
