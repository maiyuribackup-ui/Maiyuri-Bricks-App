\set ON_ERROR_STOP on
\set u1 '00000000-0000-0000-0000-000000000001'
\set u2 '00000000-0000-0000-0000-000000000002'
\set u3 '00000000-0000-0000-0000-000000000003'
\set u4 '00000000-0000-0000-0000-000000000004'
INSERT INTO public.leads (id,name,assigned_staff) VALUES ('10000000-0000-0000-0000-000000000009','Neg',:'u2');
-- version 1.1 is active (2 stages); import a fresh full definition as T2 for negative checks
SELECT public.process_import_definition((SELECT definition || '{"process_key":"T2","version":"1.0"}'::jsonb FROM public.process_versions WHERE version='1.0'), :'u1') AS v \gset
SELECT public.process_publish_version(:'v', :'u1')->>'status' AS pub;
SELECT (public.process_start('T2','lead','10000000-0000-0000-0000-000000000009',:'u2'))->>'id' AS inst \gset
SELECT current_stage_instance_id AS si FROM public.process_instances WHERE id=:'inst' \gset
SELECT public.expect_fail(format('SELECT public.process_start(%L,%L,%L,%L)','T2','lead','10000000-0000-0000-0000-000000000009',:'u2')) AS dup_instance;
SELECT (public.process_complete_task((SELECT id FROM public.process_tasks WHERE stage_instance_id=:'si'::uuid AND item_key='A1'),:'u2'))->>'status';
SELECT (public.process_advance(:'inst'::uuid, :'si'::uuid, :'u2'))->>'next_stage_instance_id' AS si2 \gset
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid)', :'inst', :'si', :'u2')) AS stale;
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid)', :'inst', :'si2', :'u2')) AS outcome_required;
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{}'',''NO'')', :'inst', :'si2', :'u2')) AS reason_required;
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{}'',''MAYBE'')', :'inst', :'si2', :'u2')) AS outcome_invalid;
SELECT (public.process_advance(:'inst'::uuid, :'si2'::uuid, :'u2', NULL, '{}', 'GO'))->>'next_stage_instance_id' AS si3 \gset
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{"ADV":"ok"}'')', :'inst', :'si3', :'u2')) AS sales_bypass_D;
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{"ADV":"fail"}'',NULL,NULL,''{"payload":{}}'')', :'inst', :'si3', :'u4')) AS unpaid_C;
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{}'',NULL,NULL,''{"payload":{}}'')', :'inst', :'si3', :'u4')) AS unknown_gate_fails_closed;
SELECT public.expect_fail(format('SELECT public.process_override_gate(%L::uuid,%L::uuid,''ADV'',%L::uuid,''because'')', :'inst', :'si3', :'u1')) AS not_overridable;
SELECT public.expect_fail(format('SELECT public.process_override_gate(%L::uuid,%L::uuid,''ADV'',%L::uuid,''because'')', :'inst', :'si3', :'u3')) AS override_forbidden;
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{"ADV":"ok"}'')', :'inst', :'si3', :'u4')) AS payload_required;
SELECT (public.process_advance(:'inst'::uuid, :'si3'::uuid, :'u4', NULL, '{"ADV":"ok"}', NULL, NULL, '{"payload":{"quantity":1}}'))->>'next_stage_instance_id' AS si4 \gset
SELECT id AS ho FROM public.process_handovers WHERE stage_instance_id=:'si4' \gset
SELECT public.expect_fail(format('SELECT public.process_handover_reject(%L::uuid,%L::uuid,''DATE_INFEASIBLE'',''no'')', :'ho', :'u2')) AS sales_reject_forbidden;
SELECT public.expect_fail(format('SELECT public.process_handover_reject(%L::uuid,%L::uuid,''DATE_INFEASIBLE'','''')', :'ho', :'u3')) AS reject_needs_comment;
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid)', :'inst', :'si4', :'u3')) AS handover_gate_blocks;
SELECT public.expect_fail(format('SELECT public.process_handover_create(%L::uuid,%L::uuid,NULL,''{}'')', :'inst', :'u4')) AS second_pending_blocked;
SELECT public.expect_fail(format('SELECT public.process_block(%L::uuid,%L::uuid,%L::uuid,''{"message":"no code"}'')', :'inst', :'si4', :'u3')) AS block_needs_code;
SELECT (public.process_block(:'inst'::uuid, :'si4'::uuid, :'u3', '{"code":"RAW_MATERIAL","message":"no cement"}'))->>'status' AS blocked;
SELECT public.expect_fail(format('SELECT public.process_handover_accept(%L::uuid,%L::uuid,NULL)', :'ho', :'u2')) AS sales_accept_forbidden;
SELECT (public.process_unblock(:'inst'::uuid, :'si4'::uuid, :'u3', 'cement arrived'))->>'status' AS unblocked;
SELECT (public.process_handover_accept(:'ho'::uuid, :'u3', NULL))->>'status' AS accepted;
SELECT public.expect_fail(format('SELECT public.process_handover_accept(%L::uuid,%L::uuid,NULL)', :'ho', :'u3')) AS double_accept;
SELECT public.expect_fail(format('SELECT public.process_cancel(%L::uuid,%L::uuid,''x'')', :'inst', :'u3')) AS cancel_forbidden;
SELECT public.expect_fail(format('SELECT public.process_publish_version(%L::uuid,%L::uuid)', :'v', :'u2')) AS publish_forbidden;
SELECT public.expect_fail('SELECT public.process_import_definition(''{"process_key":"X","version":"1.0","name":"x","category":"SALES","stages":[{"key":"A","name":"a","owner_role":"FINANCE","transitions":[{"key":"N","to":"ZZ"}]}]}''::jsonb, NULL)') AS missing_target;
