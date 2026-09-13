\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION public.expect_fail(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'UNEXPECTED SUCCESS'; EXCEPTION WHEN others THEN RETURN 'expected: ' || SQLERRM; END $$;
INSERT INTO public.users (id,email,name,role) VALUES
 ('00000000-0000-0000-0000-000000000001','ram@x','Ram','founder'),
 ('00000000-0000-0000-0000-000000000002','srini@x','Srinivasan','sales'),
 ('00000000-0000-0000-0000-000000000003','rajesh@x','Rajesh','production_supervisor'),
 ('00000000-0000-0000-0000-000000000004','acc@x','Accounts','accountant');
INSERT INTO public.process_role_defaults (role_key,user_id) VALUES
 ('SALES_ENGINEER','00000000-0000-0000-0000-000000000002'),
 ('FACTORY_MANAGER','00000000-0000-0000-0000-000000000003'),
 ('FINANCE','00000000-0000-0000-0000-000000000004');
INSERT INTO public.leads (id,name,assigned_staff) VALUES ('10000000-0000-0000-0000-000000000001','Kumar','00000000-0000-0000-0000-000000000002');

SELECT public.process_import_definition($j$
{"process_key":"T","name":"Test","category":"SALES","version":"1.0","entity_type":"lead","stages":[
 {"key":"A","name":"Start","type":"ACTION","owner_role":"SALES_ENGINEER","is_start":true,"sla_minutes":15,
  "checklist":[{"key":"A1","title":"do a1","required":true},{"key":"A2","title":"opt","required":false}],
  "gates":[{"key":"CL","type":"checklist_complete"}],
  "transitions":[{"key":"NEXT","to":"D"}]},
 {"key":"D","name":"Decide","type":"DECISION","owner_role":"SALES_ENGINEER","config":{"outcomes":["GO","NO"],"outcomes_requiring_reason":["NO"]},
  "transitions":[{"key":"GO","to":"PAY","condition":{"outcome":"GO"}},{"key":"NO","to":"END","condition":{"outcome":"NO"}}]},
 {"key":"PAY","name":"Advance","type":"ACTION","owner_role":"FINANCE",
  "gates":[{"key":"ADV","type":"advance_verified","overridable":false,"failure_message":"Advance not verified"}],
  "transitions":[{"key":"NEXT","to":"HO"}]},
 {"key":"HO","name":"Factory Handover","type":"HANDOVER","owner_role":"FACTORY_MANAGER","sla_minutes":120,
  "checklist":[{"key":"H1","title":"check stock"}],
  "gates":[{"key":"ACC","type":"handover_accepted"}],
  "transitions":[{"key":"NEXT","to":"QC"},{"key":"RETURN","to":"PAY","is_exception":true}]},
 {"key":"QC","name":"QC","type":"ACTION","owner_role":"FACTORY_MANAGER",
  "gates":[{"key":"QCOK","type":"manual_confirmation","condition":{"role":"FACTORY_MANAGER","evidence_type":"qc_release"}}],
  "transitions":[{"key":"NEXT","to":"END"}]},
 {"key":"END","name":"Done","type":"END","owner_role":"SALES_ENGINEER"}
]}$j$::jsonb, '00000000-0000-0000-0000-000000000001') AS version_id \gset
SELECT public.process_publish_version(:'version_id', '00000000-0000-0000-0000-000000000001')->>'status' AS published;

-- start
SELECT (public.process_start('T','lead','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','{"customer_name":"Kumar"}'))->>'id' AS inst \gset
SELECT current_stage_instance_id AS si FROM public.process_instances WHERE id=:'inst' \gset
SELECT title, assigned_user_id, activity_type, source_module FROM public.work_items WHERE source_module='process_os';
-- lead trigger yields
UPDATE public.leads SET pipeline_stage='qualified_lead' WHERE id='10000000-0000-0000-0000-000000000001';
SELECT count(*) AS lead_stage_items_should_be_0 FROM public.work_items WHERE source_module='lead_stage_progression';
-- other lead still gets trigger
INSERT INTO public.leads (id,name,assigned_staff) VALUES ('10000000-0000-0000-0000-000000000002','Other','00000000-0000-0000-0000-000000000002');
UPDATE public.leads SET pipeline_stage='qualified_lead' WHERE id='10000000-0000-0000-0000-000000000002';
SELECT count(*) AS lead_stage_items_should_be_1 FROM public.work_items WHERE source_module='lead_stage_progression';

-- advance blocked by tasks
SELECT public.expect_fail('SELECT public.process_advance(' || quote_literal(:'inst') || '::uuid,' || quote_literal(:'si') || '::uuid, ''00000000-0000-0000-0000-000000000002'')');
-- factory cannot complete sales task
SELECT id AS t1 FROM public.process_tasks WHERE stage_instance_id=:'si'::uuid AND item_key='A1' \gset
SELECT public.expect_fail('SELECT public.process_complete_task(' || quote_literal(:'t1') || '::uuid, ''00000000-0000-0000-0000-000000000003'')');
SELECT (public.process_complete_task(:'t1'::uuid,'00000000-0000-0000-0000-000000000002','done','ok'))->>'status' AS task_status;
SELECT (public.process_advance(:'inst'::uuid, :'si'::uuid, '00000000-0000-0000-0000-000000000002'))->>'next_stage_instance_id' AS si2 \gset
SELECT status FROM public.work_items WHERE source_record_id=:'si';
-- stale
SELECT public.expect_fail('SELECT public.process_advance(:''inst''::uuid, :''si''::uuid, ''00000000-0000-0000-0000-000000000002'')');
-- decision needs outcome; NO needs reason
SELECT public.expect_fail('SELECT public.process_advance(:''inst''::uuid, :''si2''::uuid, ''00000000-0000-0000-0000-000000000002'', NULL, ''{}'', ''NO'')');
SELECT (public.process_advance(:'inst'::uuid, :'si2'::uuid, '00000000-0000-0000-0000-000000000002', NULL, '{}', 'GO'))->>'next_stage_instance_id' AS si3 \gset
SELECT assigned_user_id = '00000000-0000-0000-0000-000000000004' AS finance_assigned FROM public.process_stage_instances WHERE id=:'si3';
-- sales cannot advance finance stage even with fake gate result (Scenario D)
SELECT public.expect_fail('SELECT public.process_advance(:''inst''::uuid, :''si3''::uuid, ''00000000-0000-0000-0000-000000000002'', NULL, ''{"ADV":"ok"}'')');
-- finance without gate ok fails (Scenario C)
SELECT public.expect_fail('SELECT public.process_advance(:''inst''::uuid, :''si3''::uuid, ''00000000-0000-0000-0000-000000000004'', NULL, ''{"ADV":"fail"}'', NULL, NULL, ''{"payload":{"quantity":100}}'')');
-- override not allowed on non-overridable gate even for founder
SELECT public.expect_fail('SELECT public.process_override_gate(:''inst''::uuid, :''si3''::uuid, ''ADV'', ''00000000-0000-0000-0000-000000000001'', ''because'')');
-- handover payload required
SELECT public.expect_fail('SELECT public.process_advance(:''inst''::uuid, :''si3''::uuid, ''00000000-0000-0000-0000-000000000004'', NULL, ''{"ADV":"ok"}'')');
SELECT public.process_advance(:'inst'::uuid, :'si3'::uuid, '00000000-0000-0000-0000-000000000004', NULL, '{"ADV":"ok"}', NULL, NULL, '{"payload":{"quantity":100,"requested_delivery_date":"2026-09-14"}}') AS r \gset
SELECT (:'r'::jsonb)->>'next_stage_instance_id' AS si4 \gset
SELECT id AS ho, to_user_id='00000000-0000-0000-0000-000000000003' AS to_rajesh, status FROM public.process_handovers WHERE stage_instance_id=:'si4' \gset
SELECT :'to_rajesh' AS to_rajesh, :'status' AS ho_status;
-- sales cannot reject
SELECT public.expect_fail('SELECT public.process_handover_reject(:''ho''::uuid, ''00000000-0000-0000-0000-000000000002'',''DATE_INFEASIBLE'',''no'')');
-- factory rejects (Scenario B) -> back to PAY assigned to accountant (from_user)
SELECT (public.process_handover_reject(:'ho'::uuid, '00000000-0000-0000-0000-000000000003','INSUFFICIENT_CURING_STOCK','cannot support 14 Sep','2026-09-17'))->>'next_stage_instance_id' AS si5 \gset
SELECT s.stage_key, si.assigned_user_id, si.blocked_reason->>'code' AS reason FROM public.process_stage_instances si JOIN public.process_stages s ON s.id=si.process_stage_id WHERE si.id=:'si5';
SELECT status FROM public.process_stage_instances WHERE id=:'si4';
-- go again to handover, accept, complete checklist, advance
SELECT (public.process_advance(:'inst'::uuid, :'si5'::uuid, '00000000-0000-0000-0000-000000000004', NULL, '{"ADV":"ok"}', NULL, NULL, '{"payload":{"quantity":100,"requested_delivery_date":"2026-09-17"}}'))->>'next_stage_instance_id' AS si6 \gset
SELECT id AS ho2 FROM public.process_handovers WHERE stage_instance_id=:'si6' AND status='PENDING' \gset
-- advance before accept fails (gate)
SELECT public.expect_fail('SELECT public.process_advance(:''inst''::uuid, :''si6''::uuid, ''00000000-0000-0000-0000-000000000003'')');
SELECT (public.process_handover_accept(:'ho2'::uuid, '00000000-0000-0000-0000-000000000003', 'ok'))->>'status' AS accepted;
SELECT (public.process_complete_task((SELECT id FROM public.process_tasks WHERE stage_instance_id=:'si6'::uuid),'00000000-0000-0000-0000-000000000003'))->>'status' AS h1_status;
SELECT (public.process_advance(:'inst'::uuid, :'si6'::uuid, '00000000-0000-0000-0000-000000000003'))->>'next_stage_instance_id' AS si7 \gset
-- QC gate fails without evidence (Scenario E)
SELECT public.expect_fail('SELECT public.process_advance(:''inst''::uuid, :''si7''::uuid, ''00000000-0000-0000-0000-000000000003'')');
-- sales evidence does not count
SELECT public.process_add_evidence(:'inst'::uuid, :'si7'::uuid, NULL, '00000000-0000-0000-0000-000000000002','qc_release','text',NULL,NULL,'{}')->>'id' AS ev1;
SELECT public.expect_fail('SELECT public.process_advance(:''inst''::uuid, :''si7''::uuid, ''00000000-0000-0000-0000-000000000003'')');
SELECT public.process_add_evidence(:'inst'::uuid, :'si7'::uuid, NULL, '00000000-0000-0000-0000-000000000003','qc_release','text',NULL,NULL,'{}')->>'evidence_type' AS ev2;
SELECT (public.process_advance(:'inst'::uuid, :'si7'::uuid, '00000000-0000-0000-0000-000000000003'))->'instance'->>'status' AS final_status;
SELECT event_type FROM public.process_events WHERE process_instance_id=:'inst' ORDER BY created_at;
SELECT status, count(*) FROM public.work_items WHERE source_module='process_os' GROUP BY 1;
-- SLA sweep on a fresh instance with tiny SLA
UPDATE public.process_stages SET sla_minutes=1 WHERE stage_key='A';
SELECT (public.process_start('T','lead','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002'))->>'id' AS inst2 \gset
SELECT kind FROM public.process_sla_sweep(clock_timestamp() + interval '50 seconds');
SELECT kind FROM public.process_sla_sweep(clock_timestamp() + interval '2 minutes');
SELECT count(*) AS second_sweep_noop FROM public.process_sla_sweep(clock_timestamp() + interval '2 minutes');
-- cancel by non-creator non-partner fails, founder ok
SELECT public.expect_fail('SELECT public.process_cancel(:''inst2''::uuid, ''00000000-0000-0000-0000-000000000003'', ''x'')');
SELECT (public.process_cancel(:'inst2'::uuid, '00000000-0000-0000-0000-000000000001', 'customer lost'))->>'status' AS cancelled;
-- versioning: publish 1.1, old instance keeps 1.0
SELECT public.process_import_definition($j${"process_key":"T","name":"Test","category":"SALES","version":"1.1","entity_type":"lead","stages":[{"key":"A","name":"Only","type":"ACTION","owner_role":"SALES_ENGINEER","is_start":true,"transitions":[{"key":"NEXT","to":"END"}]},{"key":"END","name":"Done","type":"END","owner_role":"SALES_ENGINEER"}]}$j$::jsonb,'00000000-0000-0000-0000-000000000001') AS v11 \gset
SELECT public.process_publish_version(:'v11','00000000-0000-0000-0000-000000000001')->>'status';
SELECT v.version, v.status FROM public.process_versions v ORDER BY version;
SELECT v.version AS old_instance_version FROM public.process_instances i JOIN public.process_versions v ON v.id=i.process_version_id WHERE i.id=:'inst';
SELECT * FROM public.v_process_handover_outcomes;
