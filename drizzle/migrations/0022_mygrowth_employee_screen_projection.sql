CREATE OR REPLACE FUNCTION public.mygrowth_screen_capabilities() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE trainer boolean := false; manager boolean := false; appoint boolean := false;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 appoint := public.mygrowth_can_appoint();
 SELECT coalesce(bool_or(public.mygrowth_has_branch_role(s.branch_id,'trainer')),false), coalesce(bool_or(public.mygrowth_has_branch_role(s.branch_id,'store_manager')),false) INTO trainer,manager FROM public.mygrowth_staff_registry s WHERE s.user_id=auth.uid() AND s.active;
 RETURN jsonb_build_object('can_appoint',appoint,'trainer',trainer,'manager',manager,'can_educate',appoint OR trainer);
END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_employee_feed() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('training_id',t.id,'course_id',e.course_id,'trainer_name',p.full_name,'location',t.location,'observation',coalesce(f.observation,m.observation),'feedback',coalesce(f.feedback,m.feedback),'next_action',coalesce(f.next_action,m.next_action),'plan_id',a.id,'plan_body',a.body,'plan_language',a.original_language,'plan_updated_at',a.updated_at,'followup_status',CASE WHEN h.plan_updated_at=a.updated_at THEN h.status ELSE NULL END,'followup_count',coalesce(hc.n,0)) ORDER BY r.occurred_on DESC,r.feed_key)
 FROM public.mygrowth_learning_list() r
 LEFT JOIN public.mygrowth_trainings t ON r.feed_key='attendance:'||t.id::text AND EXISTS(SELECT 1 FROM public.mygrowth_training_targets x WHERE x.training_id=t.id AND x.user_id=auth.uid() AND x.attendance_status='attended' AND x.tenant_id=t.tenant_id AND x.branch_id=t.branch_id)
 LEFT JOIN public.profiles p ON p.user_id=t.trainer_id
 LEFT JOIN public.mygrowth_field_coaching f ON f.training_id=t.id AND t.session_kind='field_coaching'
 LEFT JOIN public.mygrowth_manager_coaching m ON m.training_id=t.id AND t.session_kind='manager_coaching'
 LEFT JOIN public.mygrowth_action_plans a ON a.training_id=t.id AND a.user_id=auth.uid()
 LEFT JOIN LATERAL (SELECT status,plan_updated_at FROM public.mygrowth_followup_audit WHERE plan_id=a.id ORDER BY version DESC LIMIT 1) h ON true
 LEFT JOIN LATERAL (SELECT count(*) AS n FROM public.mygrowth_followup_audit WHERE plan_id=a.id) hc ON true
 LEFT JOIN public.enrollments e ON r.feed_key='elearning:'||e.id::text AND e.user_id=auth.uid()),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.mygrowth_screen_capabilities(),public.mygrowth_employee_feed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_screen_capabilities(),public.mygrowth_employee_feed() TO authenticated,service_role;
COMMENT ON FUNCTION public.mygrowth_employee_feed() IS 'Owned reviewer-only canonical screen projection; cancelled attendance and stale plan assessments never become current completion; no writes to learning sources.';