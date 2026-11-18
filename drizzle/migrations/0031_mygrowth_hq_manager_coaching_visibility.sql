CREATE TABLE public.mygrowth_hq_visibility (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 enabled boolean NOT NULL DEFAULT false,
 updated_by uuid REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mygrowth_hq_visibility TO service_role;
ALTER TABLE public.mygrowth_hq_visibility ENABLE ROW LEVEL SECURITY;
INSERT INTO public.mygrowth_hq_visibility(id,enabled) VALUES (true,false);
CREATE TABLE public.mygrowth_hq_visibility_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 enabled boolean NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mygrowth_hq_visibility_audit TO service_role;
ALTER TABLE public.mygrowth_hq_visibility_audit ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.mygrowth_hq_open() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.mygrowth_can_appoint() AND coalesce((SELECT enabled FROM public.mygrowth_hq_visibility WHERE id),false) $$;
CREATE FUNCTION public.mygrowth_hq_visibility_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.mygrowth_can_appoint() THEN RAISE EXCEPTION '설정 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('enabled',v.enabled,'updated_at',v.updated_at,'updated_by',coalesce(p.full_name,'이름 미등록')) FROM public.mygrowth_hq_visibility v LEFT JOIN public.profiles p ON p.user_id=v.updated_by WHERE v.id);
END $$;
CREATE FUNCTION public.mygrowth_set_hq_visibility(_enabled boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.mygrowth_can_appoint() THEN RAISE EXCEPTION '설정 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 UPDATE public.mygrowth_hq_visibility SET enabled=_enabled,updated_by=auth.uid(),updated_at=now() WHERE id;
 INSERT INTO public.mygrowth_hq_visibility_audit(actor_id,enabled) VALUES (auth.uid(),_enabled);
 RETURN _enabled;
END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_staff_record_scope(_employee uuid,_training uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT public.is_mygrowth_reviewer() AND (EXISTS (
 SELECT 1 FROM public.mygrowth_training_targets x JOIN public.mygrowth_trainings t ON t.id=x.training_id
 JOIN public.mygrowth_staff_registry s ON s.user_id=x.user_id JOIN public.profiles p ON p.user_id=s.user_id
 JOIN public.mygrowth_staff_registry me ON me.user_id=auth.uid() JOIN public.profiles mp ON mp.user_id=me.user_id
 WHERE x.user_id=_employee AND t.id=_training AND s.active AND me.active
 AND s.tenant_id=t.tenant_id AND s.branch_id=t.branch_id AND x.tenant_id=t.tenant_id AND x.branch_id=t.branch_id
 AND p.tenant_id=s.tenant_id AND p.department_id=s.branch_id AND me.tenant_id=s.tenant_id AND me.branch_id=s.branch_id
 AND mp.tenant_id=me.tenant_id AND mp.department_id=me.branch_id
 AND public.mygrowth_has_branch_role(t.branch_id,CASE WHEN t.session_kind='manager_coaching' THEN 'store_manager' ELSE 'trainer' END)
 AND public.mygrowth_session_scope(t.id))
 OR (public.mygrowth_hq_open() AND EXISTS (
 SELECT 1 FROM public.mygrowth_training_targets x JOIN public.mygrowth_trainings t ON t.id=x.training_id
 JOIN public.mygrowth_staff_registry s ON s.user_id=x.user_id JOIN public.profiles p ON p.user_id=s.user_id
 JOIN public.departments d ON d.id=s.branch_id JOIN public.mygrowth_education_team e ON e.user_id=auth.uid() AND e.active
 WHERE x.user_id=_employee AND t.id=_training AND s.active AND d.is_active AND e.tenant_id=s.tenant_id
 AND s.tenant_id=t.tenant_id AND s.branch_id=t.branch_id AND x.tenant_id=t.tenant_id AND x.branch_id=t.branch_id
 AND p.tenant_id=s.tenant_id AND p.department_id=s.branch_id))) $$;
CREATE OR REPLACE FUNCTION public.mygrowth_staff_directory() RETURNS TABLE(user_id uuid,full_name text,branch_name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_mygrowth_reviewer() OR (NOT public.mygrowth_hq_open() AND NOT EXISTS(SELECT 1 FROM public.mygrowth_staff_registry s WHERE s.user_id=auth.uid() AND (public.mygrowth_has_branch_role(s.branch_id,'trainer') OR public.mygrowth_has_branch_role(s.branch_id,'store_manager')))) THEN RAISE EXCEPTION '담당 직원 조회 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT DISTINCT s.user_id,coalesce(p.full_name,'이름 미등록'),d.name FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id JOIN public.departments d ON d.id=s.branch_id WHERE EXISTS(SELECT 1 FROM public.mygrowth_training_targets x WHERE x.user_id=s.user_id AND public.mygrowth_staff_record_scope(s.user_id,x.training_id)) ORDER BY 2,1;
END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_staff_feed(_employee uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
 LEFT JOIN public.mygrowth_action_plans a ON a.training_id=t.id AND a.user_id=_employee AND x.attendance_status='attended' AND (public.mygrowth_followup_staff_scope(a.id) OR (public.mygrowth_hq_open() AND public.mygrowth_staff_record_scope(_employee,t.id)))
 LEFT JOIN LATERAL (SELECT status,plan_updated_at FROM public.mygrowth_followup_audit WHERE plan_id=a.id ORDER BY version DESC LIMIT 1) h ON true
 LEFT JOIN LATERAL (SELECT count(*) n FROM public.mygrowth_followup_audit WHERE plan_id=a.id) hc ON true
 WHERE x.user_id=_employee AND public.mygrowth_staff_record_scope(_employee,t.id)),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_followup_detail(_plan_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE a record; staff boolean; hq boolean; BEGIN
IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
SELECT * INTO a FROM public.mygrowth_action_plans WHERE id=_plan_id;
IF NOT FOUND THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
staff=public.mygrowth_followup_staff_scope(a.id); hq=public.mygrowth_hq_open() AND public.mygrowth_staff_record_scope(a.user_id,a.training_id);
IF (a.user_id=auth.uid() AND NOT public.mygrowth_current_owner_target(a.training_id)) OR (a.user_id<>auth.uid() AND NOT staff AND NOT hq) THEN RAISE EXCEPTION '현재 담당·참석 범위가 아닙니다.' USING ERRCODE='42501'; END IF;
RETURN jsonb_build_object('plan_updated_at',a.updated_at,'version',coalesce((SELECT max(h.version) FROM public.mygrowth_followup_audit h WHERE h.plan_id=a.id),0),'can_assess',staff AND EXISTS(SELECT 1 FROM public.mygrowth_training_targets x WHERE x.training_id=a.training_id AND x.user_id=a.user_id AND x.attendance_status='attended'),'history',coalesce((SELECT jsonb_agg(jsonb_build_object('version',h.version,'status',h.status,'note',h.note,'assessed_by',h.assessor_name,'assessed_at',h.assessed_at,'plan_body',h.plan_body,'plan_language',h.plan_language,'plan_updated_at',h.plan_updated_at) ORDER BY h.version DESC) FROM public.mygrowth_followup_audit h WHERE h.plan_id=a.id),'[]'::jsonb)); END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_team_summary(_branch uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, full_name text, branch_id uuid, branch_name text, is_senior boolean,
 courses integer, courses_completed integer, avg_progress integer,
 offline_targets integer, offline_attended integer, field_coaching integer, manager_coaching integer,
 plans_needed integer, plans_written integer, followup_needed integer, can_open boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE edu boolean; hq boolean;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 edu := public.mygrowth_can_appoint(); hq := public.mygrowth_hq_open();
 IF NOT edu AND NOT EXISTS(SELECT 1 FROM public.mygrowth_staff_registry r WHERE r.user_id=auth.uid() AND (public.mygrowth_has_branch_role(r.branch_id,'trainer') OR public.mygrowth_has_branch_role(r.branch_id,'store_manager'))) THEN
  RAISE EXCEPTION '팀 현황 조회 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 WITH staff AS (
  SELECT s.user_id, s.tenant_id, s.branch_id, s.is_senior, d.name AS bname, coalesce(p.full_name,'이름 미등록') AS pname
  FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id AND p.department_id=s.branch_id AND p.tenant_id=s.tenant_id
  JOIN public.departments d ON d.id=s.branch_id
  WHERE s.active AND d.is_active AND (
   (edu AND (_branch IS NULL OR s.branch_id=_branch))
   OR (NOT edu AND (public.mygrowth_has_branch_role(s.branch_id,'trainer') OR public.mygrowth_has_branch_role(s.branch_id,'store_manager'))))
 ), tg AS (
  SELECT st.user_id, t.id AS tid, t.session_kind, t.trainer_id, x.attendance_status
  FROM staff st JOIN public.mygrowth_training_targets x ON x.user_id=st.user_id AND x.tenant_id=st.tenant_id AND x.branch_id=st.branch_id
  JOIN public.mygrowth_trainings t ON t.id=x.training_id AND t.tenant_id=x.tenant_id AND t.branch_id=x.branch_id
  WHERE t.session_kind<>'manager_coaching' OR t.trainer_id=auth.uid() OR hq
 ), pl AS (
  SELECT a.user_id, a.id, a.updated_at FROM public.mygrowth_action_plans a JOIN tg ON tg.user_id=a.user_id AND tg.tid=a.training_id AND tg.attendance_status='attended' AND tg.session_kind<>'education'
  WHERE public.mygrowth_followup_staff_scope(a.id) OR (hq AND public.mygrowth_staff_record_scope(a.user_id,a.training_id))
 ), fu AS (
  SELECT pl.user_id, count(*) FILTER (WHERE h.status IS DISTINCT FROM 'completed' OR h.plan_updated_at IS DISTINCT FROM pl.updated_at) AS n
  FROM pl LEFT JOIN LATERAL (SELECT f.status, f.plan_updated_at FROM public.mygrowth_followup_audit f WHERE f.plan_id=pl.id ORDER BY f.version DESC LIMIT 1) h ON true
  GROUP BY pl.user_id
 ), en AS (
  SELECT e.user_id, count(*) AS c, count(*) FILTER (WHERE e.completed_at IS NOT NULL) AS done, avg(coalesce(e.progress,0)) AS ap
  FROM public.enrollments e JOIN staff st ON st.user_id=e.user_id WHERE e.status='approved' GROUP BY e.user_id
 )
 SELECT st.user_id, st.pname, st.branch_id, st.bname, st.is_senior,
  coalesce(en.c,0)::integer, coalesce(en.done,0)::integer, round(coalesce(en.ap,0))::integer,
  (SELECT count(*) FROM tg WHERE tg.user_id=st.user_id AND tg.session_kind='education')::integer,
  (SELECT count(*) FROM tg WHERE tg.user_id=st.user_id AND tg.session_kind='education' AND tg.attendance_status='attended')::integer,
  (SELECT count(*) FROM tg WHERE tg.user_id=st.user_id AND tg.session_kind='field_coaching' AND tg.attendance_status='attended')::integer,
  (SELECT count(*) FROM tg WHERE tg.user_id=st.user_id AND tg.session_kind='manager_coaching' AND tg.attendance_status='attended')::integer,
  (SELECT count(*) FROM tg WHERE tg.user_id=st.user_id AND tg.session_kind<>'education' AND tg.attendance_status='attended')::integer,
  (SELECT count(*) FROM pl WHERE pl.user_id=st.user_id)::integer,
  coalesce(fu.n,0)::integer,
  EXISTS(SELECT 1 FROM public.mygrowth_training_targets x WHERE x.user_id=st.user_id AND public.mygrowth_staff_record_scope(st.user_id,x.training_id))
 FROM staff st LEFT JOIN en ON en.user_id=st.user_id LEFT JOIN fu ON fu.user_id=st.user_id
 ORDER BY st.bname, st.pname;
END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_screen_capabilities() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE trainer boolean := false; manager boolean := false; appoint boolean := false;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 appoint := public.mygrowth_can_appoint();
 SELECT coalesce(bool_or(public.mygrowth_has_branch_role(s.branch_id,'trainer')),false), coalesce(bool_or(public.mygrowth_has_branch_role(s.branch_id,'store_manager')),false) INTO trainer,manager FROM public.mygrowth_staff_registry s WHERE s.user_id=auth.uid() AND s.active;
 RETURN jsonb_build_object('can_appoint',appoint,'trainer',trainer,'manager',manager,'can_educate',appoint OR trainer,'hq_staff',public.mygrowth_hq_open());
END $$;
REVOKE ALL ON FUNCTION public.mygrowth_hq_open(),public.mygrowth_hq_visibility_state(),public.mygrowth_set_hq_visibility(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_hq_open(),public.mygrowth_hq_visibility_state(),public.mygrowth_set_hq_visibility(boolean) TO authenticated,service_role;