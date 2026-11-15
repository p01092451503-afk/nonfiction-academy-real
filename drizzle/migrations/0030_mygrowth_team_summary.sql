CREATE FUNCTION public.mygrowth_team_branches()
RETURNS TABLE(branch_id uuid, branch_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE edu boolean;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 edu := public.mygrowth_can_appoint();
 RETURN QUERY SELECT DISTINCT d.id, d.name FROM public.mygrowth_staff_registry s JOIN public.departments d ON d.id=s.branch_id
  WHERE s.active AND d.is_active AND (edu OR public.mygrowth_has_branch_role(s.branch_id,'trainer') OR public.mygrowth_has_branch_role(s.branch_id,'store_manager'))
  ORDER BY 2;
END $$;
REVOKE ALL ON FUNCTION public.mygrowth_team_branches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_team_branches() TO authenticated, service_role;

CREATE FUNCTION public.mygrowth_team_summary(_branch uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, full_name text, branch_id uuid, branch_name text, is_senior boolean,
 courses integer, courses_completed integer, avg_progress integer,
 offline_targets integer, offline_attended integer, field_coaching integer, manager_coaching integer,
 plans_needed integer, plans_written integer, followup_needed integer, can_open boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE edu boolean;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 edu := public.mygrowth_can_appoint();
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
  WHERE t.session_kind<>'manager_coaching' OR t.trainer_id=auth.uid()
 ), pl AS (
  SELECT a.user_id, a.id, a.updated_at FROM public.mygrowth_action_plans a JOIN tg ON tg.user_id=a.user_id AND tg.tid=a.training_id AND tg.attendance_status='attended' AND tg.session_kind<>'education'
  WHERE public.mygrowth_followup_staff_scope(a.id)
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
REVOKE ALL ON FUNCTION public.mygrowth_team_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_team_summary(uuid) TO authenticated, service_role;