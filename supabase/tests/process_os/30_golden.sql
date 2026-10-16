-- Golden end-to-end scenarios A–E (PRD §34) on the REAL Lead-to-Delivery
-- definition. Run with:  psql ... -v def="$(bun apps/web/scripts/dump-process-definition.ts)" -f 30_golden.sql
-- Requires 00_scaffold + migrations. External gates (entity fields, Odoo,
-- stock) are evaluated by the TypeScript layer in production; here their
-- results are passed in as p_gate_results exactly as the engine does.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION public.expect_fail(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'UNEXPECTED SUCCESS'; EXCEPTION WHEN others THEN RETURN 'expected: ' || SQLERRM; END $$;
CREATE OR REPLACE FUNCTION public.assert_true(p_ok boolean, p_msg text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN IF NOT COALESCE(p_ok, false) THEN RAISE EXCEPTION 'ASSERTION FAILED: %', p_msg; END IF; RETURN 'ok: ' || p_msg; END $$;

\set ram   '00000000-0000-0000-0000-00000000a001'
\set srini '00000000-0000-0000-0000-00000000a002'
\set rajesh '00000000-0000-0000-0000-00000000a003'
\set acc   '00000000-0000-0000-0000-00000000a004'
INSERT INTO public.users (id,email,name,role) VALUES
 (:'ram','ram@g','Ram','founder'), (:'srini','srini@g','Srinivasan','sales'),
 (:'rajesh','rajesh@g','Rajesh','production_supervisor'), (:'acc','acc@g','Accounts','accountant')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.process_role_defaults (role_key,user_id) VALUES
 ('SALES_ENGINEER',:'srini'), ('FACTORY_MANAGER',:'rajesh'), ('FINANCE',:'acc')
ON CONFLICT (role_key) DO UPDATE SET user_id = EXCLUDED.user_id;

SELECT public.process_import_definition(:'def'::jsonb, :'ram') AS l2d \gset
SELECT public.process_publish_version(:'l2d', :'ram')->>'status' AS published;
SELECT public.assert_true((SELECT count(*) FROM public.process_stages WHERE process_version_id=:'l2d') = 17, '17 stages imported');

-- helper: complete every open task on a stage instance as a user
CREATE OR REPLACE FUNCTION public.g_complete_tasks(p_si uuid, p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t record; BEGIN
  FOR t IN SELECT id, evidence_required, stage_instance_id FROM public.process_tasks WHERE stage_instance_id=p_si AND status='open' ORDER BY sequence LOOP
    IF t.evidence_required THEN
      PERFORM public.process_add_evidence((SELECT process_instance_id FROM public.process_stage_instances WHERE id=p_si), p_si, t.id, p_actor, 'note', 'text', NULL, NULL, '{}');
    END IF;
    PERFORM public.process_complete_task(t.id, p_actor, 'done', NULL);
  END LOOP; END $$;
-- helper: current stage instance + key
CREATE OR REPLACE FUNCTION public.g_current(p_inst uuid) RETURNS TABLE(si uuid, key text, assignee uuid) LANGUAGE sql AS $$
  SELECT i.current_stage_instance_id, s.stage_key, si.assigned_user_id FROM public.process_instances i
  JOIN public.process_stage_instances si ON si.id=i.current_stage_instance_id JOIN public.process_stages s ON s.id=si.process_stage_id WHERE i.id=p_inst $$;

-- ============================================================ Scenario A ===
INSERT INTO public.leads (id,name,assigned_staff,phone) VALUES ('20000000-0000-0000-0000-000000000001','Kumar',:'srini','9000000001');
SELECT (public.process_start('LEAD_TO_DELIVERY','lead','20000000-0000-0000-0000-000000000001',:'srini','{"customer_name":"Kumar","product_name":"8-inch Earth Interlock","quantity":18500,"requested_delivery_date":"2026-09-14"}'))->>'id' AS a \gset
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'NEW_LEAD', 'A starts at NEW_LEAD');
SELECT public.assert_true((SELECT assignee FROM public.g_current(:'a')) = :'srini', 'A assigned to sales default');
-- NEW_LEAD
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'srini');
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'srini', NULL, '{"CRM_LEAD_EXISTS":"ok","FIRST_RESPONSE_RECORDED":"ok"}') \gset r
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'QUALIFICATION', 'A → QUALIFICATION');
-- QUALIFICATION (decision)
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'srini');
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{}'',''DISQUALIFIED'')', :'a', (SELECT si FROM public.g_current(:'a')), :'srini')) AS disqualify_needs_reason;
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'srini', NULL, '{}', 'QUALIFIED') \gset r
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'TECHNICAL_FIT', 'A → TECHNICAL_FIT');
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'srini');
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'srini') \gset r
-- QUOTATION: quote gate is external; fail closed without it
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'srini');
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid)', :'a', (SELECT si FROM public.g_current(:'a')), :'srini')) AS quote_gate_blocks;
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'srini', NULL, '{"QUOTE_EXISTS":"ok"}') \gset r
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'FOLLOW_UP', 'A → FOLLOW_UP');
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'srini');
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'srini', 'NEXT') \gset r
-- CUSTOMER_ACCEPTANCE: evidence-required task + manual confirmation by sales + order linked
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'CUSTOMER_ACCEPTANCE', 'A → CUSTOMER_ACCEPTANCE');
SELECT (SELECT si FROM public.g_current(:'a')) AS ca_si \gset
SELECT public.expect_fail(format('SELECT public.process_complete_task(%L::uuid,%L::uuid)', (SELECT id FROM public.process_tasks WHERE stage_instance_id=:'ca_si' AND item_key='RECORD_CONFIRMATION'), :'srini')) AS evidence_required_task;
SELECT public.process_add_evidence(:'a', :'ca_si', (SELECT id FROM public.process_tasks WHERE stage_instance_id=:'ca_si' AND item_key='RECORD_CONFIRMATION'), :'srini', 'customer_confirmation', 'text', NULL, NULL, '{"text":"WhatsApp: go ahead"}')->>'evidence_type' AS ev;
SELECT public.g_complete_tasks(:'ca_si', :'srini');
SELECT public.process_advance(:'a', :'ca_si', :'srini', NULL, '{"ORDER_CONFIRMED":"ok"}') \gset r
-- ADVANCE_VERIFICATION: owned by finance; sales cannot (Scenario D lives below)
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'ADVANCE_VERIFICATION', 'A → ADVANCE_VERIFICATION');
SELECT public.assert_true((SELECT assignee FROM public.g_current(:'a')) = :'acc', 'advance stage assigned to finance default');
SELECT (SELECT si FROM public.g_current(:'a')) AS adv_si \gset
SELECT public.process_add_evidence(:'a', :'adv_si', (SELECT id FROM public.process_tasks WHERE stage_instance_id=:'adv_si' AND item_key='VERIFY_ADVANCE'), :'acc', 'payment_reference', 'text', 'UTR123', NULL, '{"amount":150000}')->>'id' AS pay_ev;
SELECT public.g_complete_tasks(:'adv_si', :'acc');
SELECT public.process_advance(:'a', :'adv_si', :'acc', NULL, '{"ADVANCE_VERIFIED":"ok"}') \gset r
-- HANDOVER_PACKAGE (sales) → FACTORY_HANDOVER (payload required)
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'HANDOVER_PACKAGE', 'A → HANDOVER_PACKAGE');
SELECT public.assert_true((SELECT assignee FROM public.g_current(:'a')) = :'srini', 'package stage back with sales');
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'srini');
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid)', :'a', (SELECT si FROM public.g_current(:'a')), :'srini')) AS handover_payload_required;
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'srini', NULL, '{}', NULL, NULL,
  '{"payload":{"customer_name":"Kumar","order_ref":"SO1042","product_name":"8-inch Earth Interlock","quantity":18500,"payment_status":"advance verified","requested_delivery_date":"2026-09-14","site_location":"Karur","contact_person":"Kumar"}}') \gset r
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'FACTORY_HANDOVER', 'A → FACTORY_HANDOVER');
SELECT public.assert_true((SELECT assignee FROM public.g_current(:'a')) = :'rajesh', 'handover assigned to factory default');
SELECT id AS ho_a FROM public.process_handovers WHERE stage_instance_id=(SELECT si FROM public.g_current(:'a')) AND status='PENDING' \gset
SELECT public.assert_true((SELECT from_user_id FROM public.process_handovers WHERE id=:'ho_a') = :'srini', 'handover sent by sales');
-- factory accepts, completes checklist, advances (stock sufficient)
SELECT (public.process_handover_accept(:'ho_a', :'rajesh', 'Feasible'))->>'status' AS accepted;
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'rajesh');
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'rajesh') \gset r
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'PRODUCTION_ALLOCATION', 'A → PRODUCTION_ALLOCATION');
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'rajesh');
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'rajesh', NULL, '{}', NULL, NULL, NULL, '{"type":"allocation","id":"alloc-1"}') \gset r
-- QUALITY_RELEASE (Scenario E lives below): factory records QC release
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'QUALITY_RELEASE', 'A → QUALITY_RELEASE');
SELECT (SELECT si FROM public.g_current(:'a')) AS qc_si \gset
-- v1.1: a real QC record (process_record_qc_release) is the evidence; it also completes QC_CHECK
SELECT public.process_record_qc_release(:'a', :'qc_si', :'rajesh', 'Solid block 8in', 5000, 'released', (SELECT id FROM public.process_tasks WHERE stage_instance_id=:'qc_si' AND item_key='QC_CHECK'), 'B-17', 'All good')->>'id' AS qc_id \gset
SELECT public.assert_true((SELECT status FROM public.process_tasks WHERE stage_instance_id=:'qc_si' AND item_key='QC_CHECK') = 'done', 'A: QC record completed the QC_CHECK item');
SELECT public.assert_true((SELECT count(*) FROM public.process_evidence WHERE stage_instance_id=:'qc_si' AND evidence_type='qc_release' AND source_id=:'qc_id') = 1, 'A: QC record wrote its evidence');
SELECT public.assert_true((SELECT evidence_id IS NOT NULL FROM public.process_qc_releases WHERE id=:'qc_id'), 'A: QC record links its evidence');
SELECT public.g_complete_tasks(:'qc_si', :'rajesh');
SELECT public.process_advance(:'a', :'qc_si', :'rajesh') \gset r
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'DELIVERY_PLANNING', 'A → DELIVERY_PLANNING');
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'rajesh');
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'rajesh', NULL, '{"STOCK_READY":"ok"}') \gset r
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'rajesh');
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'rajesh') \gset r
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'DELIVERED', 'A → DELIVERED');
SELECT (SELECT si FROM public.g_current(:'a')) AS del_si \gset
SELECT public.process_add_evidence(:'a', :'del_si', (SELECT id FROM public.process_tasks WHERE stage_instance_id=:'del_si' AND item_key='CUSTOMER_ACK'), :'rajesh', 'delivery_ack', 'text', NULL, NULL, '{}')->>'id' AS ack_ev;
SELECT public.g_complete_tasks(:'del_si', :'rajesh');
SELECT public.process_advance(:'a', :'del_si', :'rajesh', NULL, '{"DELIVERY_COMPLETED":"ok"}') \gset r
SELECT public.assert_true((SELECT key FROM public.g_current(:'a')) = 'POST_DELIVERY', 'A → POST_DELIVERY');
SELECT public.assert_true((SELECT assignee FROM public.g_current(:'a')) = :'srini', 'post-delivery back with the same sales person');
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'a')), :'srini');
SELECT public.process_advance(:'a', (SELECT si FROM public.g_current(:'a')), :'srini') \gset r
SELECT public.assert_true((SELECT status FROM public.process_instances WHERE id=:'a') = 'completed', 'Scenario A: process completed');
SELECT public.assert_true((SELECT count(*) FROM public.work_items wi JOIN public.process_stage_instances si ON si.work_item_id=wi.id WHERE si.process_instance_id=:'a' AND wi.status <> 'completed') = 0, 'Scenario A: every mirrored work item completed');
SELECT public.assert_true((SELECT count(*) FROM public.process_events WHERE process_instance_id=:'a' AND event_type='process.stage_completed') = 15, 'Scenario A: 15 stage completions audited');
SELECT public.assert_true((SELECT count(*) FROM public.process_events WHERE process_instance_id=:'a' AND event_type='process.completed') = 1, 'Scenario A: completion event');

-- ============================================================ Scenario B ===
-- Advance verified → handover → stock insufficient → factory rejects → sales gets it back → re-sends with new date → factory accepts
INSERT INTO public.leads (id,name,assigned_staff) VALUES ('20000000-0000-0000-0000-000000000002','Meena',:'srini');
SELECT (public.process_start('LEAD_TO_DELIVERY','lead','20000000-0000-0000-0000-000000000002',:'ram','{"customer_name":"Meena"}', 'HANDOVER_PACKAGE', true, 'golden-b'))->>'id' AS b \gset
SELECT public.assert_true((SELECT imported_existing_case FROM public.process_instances WHERE id=:'b'), 'B imported mid-process');
SELECT public.g_complete_tasks((SELECT si FROM public.g_current(:'b')), :'srini');
SELECT public.process_advance(:'b', (SELECT si FROM public.g_current(:'b')), :'srini', NULL, '{}', NULL, NULL, '{"payload":{"quantity":18500,"requested_delivery_date":"2026-09-14"}}') \gset r
SELECT id AS ho_b FROM public.process_handovers WHERE process_instance_id=:'b' AND status='PENDING' \gset
SELECT (public.process_handover_reject(:'ho_b', :'rajesh', 'INSUFFICIENT_CURING_STOCK', 'Current 8-inch available + curing stock cannot support 14 Sep quantity.', '2026-09-17'))->>'next_stage_instance_id' AS b_back \gset
SELECT public.assert_true((SELECT key FROM public.g_current(:'b')) = 'HANDOVER_PACKAGE', 'B: returned to the sales package stage');
SELECT public.assert_true((SELECT assignee FROM public.g_current(:'b')) = :'srini', 'B: exception lands with the sales sender');
SELECT public.assert_true((SELECT blocked_reason->>'code' FROM public.process_stage_instances WHERE id=:'b_back') = 'INSUFFICIENT_CURING_STOCK', 'B: structured reason carried back');
SELECT public.assert_true((SELECT blocked_reason->>'proposed_date' FROM public.process_stage_instances WHERE id=:'b_back') = '2026-09-17', 'B: proposed date carried back');
SELECT public.assert_true((SELECT status FROM public.work_items WHERE id=(SELECT work_item_id FROM public.process_stage_instances WHERE id=:'b_back')) = 'pending', 'B: sales has a fresh My Work item');
-- customer approves new date; sales re-sends
SELECT public.g_complete_tasks(:'b_back', :'srini');
SELECT public.process_advance(:'b', :'b_back', :'srini', NULL, '{}', NULL, NULL, '{"payload":{"quantity":18500,"requested_delivery_date":"2026-09-17"}}') \gset r
SELECT id AS ho_b2 FROM public.process_handovers WHERE process_instance_id=:'b' AND status='PENDING' \gset
SELECT (public.process_handover_accept(:'ho_b2', :'rajesh', NULL))->>'status' AS b_accepted;
SELECT public.assert_true((SELECT count(*) FROM public.process_handovers WHERE process_instance_id=:'b' AND status='REJECTED') = 1, 'B: one rejected + one accepted handover');
SELECT public.assert_true((SELECT count(*) FROM public.v_process_handover_outcomes WHERE process_instance_id=:'b') = 2, 'B: analytics view sees both handovers');

-- ============================================================ Scenario C ===
-- Customer never pays: the case cannot reach FACTORY_HANDOVER
INSERT INTO public.leads (id,name,assigned_staff) VALUES ('20000000-0000-0000-0000-000000000003','Nopay',:'srini');
SELECT (public.process_start('LEAD_TO_DELIVERY','lead','20000000-0000-0000-0000-000000000003',:'ram','{"customer_name":"Nopay"}', 'ADVANCE_VERIFICATION', true, 'golden-c'))->>'id' AS c \gset
SELECT (SELECT si FROM public.g_current(:'c')) AS c_si \gset
-- finance completes the checklist but the gate result is fail / unknown / absent
SELECT public.process_add_evidence(:'c', :'c_si', (SELECT id FROM public.process_tasks WHERE stage_instance_id=:'c_si' AND item_key='VERIFY_ADVANCE'), :'acc', 'note', 'text', NULL, NULL, '{}')->>'id';
SELECT public.g_complete_tasks(:'c_si', :'acc');
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{"ADVANCE_VERIFIED":"fail"}'')', :'c', :'c_si', :'acc')) AS c_fail;
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{"ADVANCE_VERIFIED":"unknown"}'')', :'c', :'c_si', :'acc')) AS c_unknown;
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{}'')', :'c', :'c_si', :'acc')) AS c_absent;
SELECT public.assert_true(NOT EXISTS (SELECT 1 FROM public.process_stage_instances si JOIN public.process_stages s ON s.id=si.process_stage_id WHERE si.process_instance_id=:'c' AND s.stage_key IN ('HANDOVER_PACKAGE','FACTORY_HANDOVER')), 'Scenario C: never reached factory handover');
-- payment pending is an explicit exception path, back to FOLLOW_UP
SELECT public.process_advance(:'c', :'c_si', :'acc', 'PAYMENT_PENDING') \gset r
SELECT public.assert_true((SELECT key FROM public.g_current(:'c')) = 'FOLLOW_UP', 'Scenario C: payment pending returns to follow-up');

-- ============================================================ Scenario D ===
-- Sales attempts to bypass the payment gate: forbidden, and founder cannot override a non-overridable gate either
INSERT INTO public.leads (id,name,assigned_staff) VALUES ('20000000-0000-0000-0000-000000000004','Bypass',:'srini');
SELECT (public.process_start('LEAD_TO_DELIVERY','lead','20000000-0000-0000-0000-000000000004',:'ram','{"customer_name":"Bypass"}', 'ADVANCE_VERIFICATION', true, 'golden-d'))->>'id' AS d \gset
SELECT (SELECT si FROM public.g_current(:'d')) AS d_si \gset
SELECT public.expect_fail(format('SELECT public.process_complete_task(%L::uuid,%L::uuid)', (SELECT id FROM public.process_tasks WHERE stage_instance_id=:'d_si' LIMIT 1), :'srini')) AS d_task_forbidden;
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid,NULL,''{"ADVANCE_VERIFIED":"ok"}'')', :'d', :'d_si', :'srini')) AS d_advance_forbidden;
SELECT public.expect_fail(format('SELECT public.process_override_gate(%L::uuid,%L::uuid,''ADVANCE_VERIFIED'',%L::uuid,''trust me'')', :'d', :'d_si', :'ram')) AS d_override_refused;
SELECT public.expect_fail(format('SELECT public.process_override_gate(%L::uuid,%L::uuid,''CHECKLIST'',%L::uuid,''trust me'')', :'d', :'d_si', :'srini')) AS d_sales_cannot_override;
SELECT public.assert_true((SELECT key FROM public.g_current(:'d')) = 'ADVANCE_VERIFICATION', 'Scenario D: still at advance verification');
SELECT public.assert_true((SELECT count(*) FROM public.process_events WHERE process_instance_id=:'d' AND event_type='process.gate_overridden') = 0, 'Scenario D: nothing overridden');

-- ============================================================ Scenario E ===
-- Quality release fails → delivery planning cannot start; QC hold returns to allocation
INSERT INTO public.leads (id,name,assigned_staff) VALUES ('20000000-0000-0000-0000-000000000005','QCfail',:'srini');
SELECT (public.process_start('LEAD_TO_DELIVERY','lead','20000000-0000-0000-0000-000000000005',:'ram','{"customer_name":"QCfail"}', 'QUALITY_RELEASE', true, 'golden-e'))->>'id' AS e \gset
SELECT (SELECT si FROM public.g_current(:'e')) AS e_si \gset
-- task cannot even complete without evidence
SELECT public.expect_fail(format('SELECT public.process_complete_task(%L::uuid,%L::uuid)', (SELECT id FROM public.process_tasks WHERE stage_instance_id=:'e_si' AND item_key='QC_CHECK'), :'rajesh')) AS e_needs_evidence;
-- a sales "qc_release" note is not a QC record: the gate ignores it
SELECT public.process_add_evidence(:'e', :'e_si', (SELECT id FROM public.process_tasks WHERE stage_instance_id=:'e_si' AND item_key='QC_CHECK'), :'srini', 'qc_release', 'text', NULL, NULL, '{}')->>'id' AS e_sales_ev;
SELECT public.g_complete_tasks(:'e_si', :'rajesh');
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid)', :'e', :'e_si', :'rajesh')) AS e_qc_gate_blocks_without_record;
-- sales cannot record a QC release at all
SELECT public.expect_fail(format('SELECT public.process_record_qc_release(%L::uuid,%L::uuid,%L::uuid,%L,%s,%L)', :'e', :'e_si', :'srini', 'Solid block', 100, 'released')) AS e_sales_cannot_record_qc;
-- bad inputs are refused
SELECT public.expect_fail(format('SELECT public.process_record_qc_release(%L::uuid,%L::uuid,%L::uuid,%L,%s,%L)', :'e', :'e_si', :'rajesh', 'Solid block', 0, 'released')) AS e_zero_qty;
SELECT public.expect_fail(format('SELECT public.process_record_qc_release(%L::uuid,%L::uuid,%L::uuid,%L,%s,%L)', :'e', :'e_si', :'rajesh', 'Solid block', 100, 'maybe')) AS e_bad_result;
-- a factory HOLD is a record, but the gate stays closed
SELECT public.process_record_qc_release(:'e', :'e_si', :'rajesh', 'Solid block 8in', 5000, 'hold', NULL, 'B-18', 'Cracks on 3% of sample')->>'result' AS e_hold;
SELECT public.assert_true((SELECT count(*) FROM public.process_events WHERE process_instance_id=:'e' AND event_type='process.qc_hold') = 1, 'Scenario E: hold logged');
SELECT public.expect_fail(format('SELECT public.process_advance(%L::uuid,%L::uuid,%L::uuid)', :'e', :'e_si', :'rajesh')) AS e_qc_gate_blocks_on_hold;
SELECT public.assert_true(NOT EXISTS (SELECT 1 FROM public.process_stage_instances si JOIN public.process_stages s ON s.id=si.process_stage_id WHERE si.process_instance_id=:'e' AND s.stage_key='DELIVERY_PLANNING'), 'Scenario E: delivery planning never started');
SELECT public.process_advance(:'e', :'e_si', :'rajesh', 'QC_HOLD') \gset r
SELECT public.assert_true((SELECT key FROM public.g_current(:'e')) = 'PRODUCTION_ALLOCATION', 'Scenario E: QC hold returns to allocation');
SELECT public.assert_true((SELECT status FROM public.process_stage_instances WHERE id=:'e_si') = 'completed', 'Scenario E: QC stage closed via exception path');

-- ============================================================ Versioning ===
SELECT public.process_import_definition((:'def'::jsonb || '{"version":"1.2"}'::jsonb), :'ram') AS l2d11 \gset
SELECT public.process_publish_version(:'l2d11', :'ram')->>'status' AS v11;
SELECT public.assert_true((SELECT v.version FROM public.process_instances i JOIN public.process_versions v ON v.id=i.process_version_id WHERE i.id=:'b') = '1.1', 'Versioning: running case stays on 1.1');
INSERT INTO public.leads (id,name,assigned_staff) VALUES ('20000000-0000-0000-0000-000000000006','Newcase',:'srini');
SELECT (public.process_start('LEAD_TO_DELIVERY','lead','20000000-0000-0000-0000-000000000006',:'srini'))->>'id' AS f \gset
SELECT public.assert_true((SELECT v.version FROM public.process_instances i JOIN public.process_versions v ON v.id=i.process_version_id WHERE i.id=:'f') = '1.2', 'Versioning: new case starts on 1.2');
SELECT 'GOLDEN OK' AS result;
