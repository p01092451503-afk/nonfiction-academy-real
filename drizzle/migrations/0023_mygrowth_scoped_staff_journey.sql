CREATE FUNCTION public.mygrowth_staff_record_scope(_employee uuid,_training uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT public.is_mygrowth_reviewer() AND EXISTS (
 SELECT 1 FROM public.mygrowth_training_targets x JOIN public.mygrowth_trainings t ON t.id=x.training_id
 JOIN public.mygrowth_staff_registry s ON s.user_id=x.user_id JOIN public.profiles p ON p.user_id=s.user_id
 JOIN public.mygrowth_staff_registry me ON me.user_id=auth.uid() JOIN public.profiles mp ON mp.user_id=me.user_id
 WHERE x.user_id=_employee AND t.id=_training AND s.active AND me.active
 AND s.tenant_id=t.tenant_id AND s.branch_id=t.branch_id AND x.tenant_id=t.tenant_id AND x.branch_id=t.branch_id
 AND p.tenant_id=s.tenant_id AND p.department_id=s.branch_id AND me.tenant_id=s.tenant_id AND me.branch_id=s.branch_id
 AND mp.tenant_id=me.tenant_id AND mp.department_id=me.branch_id
 AND public.mygrowth_has_branch_role(t.branch_id,CASE WHEN t.session_kind='manager_coaching' THEN 'store_manager' ELSE 'trainer' END)
 AND public.mygrowth_session_scope(t.id)) $$;
CREATE FUNCTION public.mygrowth_staff_directory() RETURNS TABLE(user_id uuid,full_name text,branch_name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_mygrowth_reviewer() OR NOT EXISTS(SELECT 1 FROM public.mygrowth_staff_registry s WHERE s.user_id=auth.uid() AND (public.mygrowth_has_branch_role(s.branch_id,'trainer') OR public.mygrowth_has_branch_role(s.branch_id,'store_manager'))) THEN RAISE EXCEPTION '담당 직원 조회 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT DISTINCT s.user_id,coalesce(p.full_name,'이름 미등록'),d.name FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id JOIN public.departments d ON d.id=s.branch_id WHERE EXISTS(SELECT 1 FROM public.mygrowth_training_targets x WHERE x.user_id=s.user_id AND public.mygrowth_staff_record_scope(s.user_id,x.training_id)) ORDER BY 2,1;
END $$;
CREATE FUNCTION public.mygrowth_staff_feed(_employee uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_mygrowth_reviewer() OR NOT EXISTS(SELECT 1 FROM public.mygrowth_training_targets x WHERE x.user_id=_employee AND public.mygrowth_staff_record_scope(_employee,x.training_id)) THEN RAISE EXCEPTION '담당 범위가 아닙니다.' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
 'feed_key','attendance:'||t.id::text,'record_type',CASE t.session_kind WHEN 'field_coaching' THEN 'field_coaching' WHEN 'manager_coaching' THEN 'manager_coaching' ELSE 'offline_training' END,
 'title',t.title,'detail',t.summary,'occurred_on',t.training_date,'status',x.attendance_status,'planned_minutes',t.planned_minutes,'actual_minutes',t.actual_minutes,
 'branch_name',d.name,'progress',NULL,'completion_count',NULL,'training_id',t.id,'course_id',NULL,'trainer_name',p.full_name,'location',t.location,
 'observation',coalesce(f.observation,m.observation),'feedback',coalesce(f.feedback,m.feedback),'next_action',coalesce(f.next_action,m.next_action),
 'plan_id',a.id,'plan_body',a.body,'plan_language',a.original_language,'plan_updated_at',a.updated_at,
 'followup_status',CASE WHEN h.plan_updated_at=a.updated_at THEN h.status ELSE NULL END,'followup_count',coalesce(hc.n,0)) ORDER BY t.training_date DESC,t.id)
 FROM public.mygrowth_training_targets x JOIN public.mygrowth_trainings t ON t.id=x.training_id JOIN public.departments d ON d.id=t.branch_id LEFT JOIN public.profiles p ON p.user_id=t.trainer_id
 LEFT JOIN public.mygrowth_field_coaching f ON f.training_id=t.id AND t.session_kind='field_coaching'
 LEFT JOIN public.mygrowth_manager_coaching m ON m.training_id=t.id AND t.session_kind='manager_coaching'
 LEFT JOIN public.mygrowth_action_plans a ON a.training_id=t.id AND a.user_id=_employee AND x.attendance_status='attended' AND public.mygrowth_followup_staff_scope(a.id)
 LEFT JOIN LATERAL (SELECT status,plan_updated_at FROM public.mygrowth_followup_audit WHERE plan_id=a.id ORDER BY version DESC LIMIT 1) h ON true
 LEFT JOIN LATERAL (SELECT count(*) n FROM public.mygrowth_followup_audit WHERE plan_id=a.id) hc ON true
 WHERE x.user_id=_employee AND public.mygrowth_staff_record_scope(_employee,t.id)),'[]'::jsonb);
END $$;
CREATE FUNCTION public.mygrowth_staff_detail(_employee uuid,_training uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.mygrowth_staff_record_scope(_employee,_training) THEN RAISE EXCEPTION '담당 범위가 아닙니다.' USING ERRCODE='42501'; END IF;
 SELECT r INTO result FROM jsonb_array_elements(public.mygrowth_staff_feed(_employee)) r WHERE r->>'training_id'=_training::text;
 IF result IS NULL THEN RAISE EXCEPTION '담당 범위가 아닙니다.' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mygrowth_staff_record_scope(uuid,uuid),public.mygrowth_staff_directory(),public.mygrowth_staff_feed(uuid),public.mygrowth_staff_detail(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_staff_record_scope(uuid,uuid),public.mygrowth_staff_directory(),public.mygrowth_staff_feed(uuid),public.mygrowth_staff_detail(uuid,uuid) TO authenticated,service_role;