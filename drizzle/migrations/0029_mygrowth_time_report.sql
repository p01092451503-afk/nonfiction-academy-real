CREATE FUNCTION public.mygrowth_time_report(_from date, _to date, _level text)
RETURNS TABLE(scope_key text, scope_label text, people integer, online_minutes integer, offline_minutes integer, field_minutes integer, manager_minutes integer, manager_hidden boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE edu boolean;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 731 THEN RAISE EXCEPTION '기간을 다시 선택해 주십시오.' USING ERRCODE='22023'; END IF;
 IF _level NOT IN ('person','branch','region','global') THEN RAISE EXCEPTION '보고 단위가 올바르지 않습니다.' USING ERRCODE='22023'; END IF;
 edu := public.mygrowth_can_appoint();
 RETURN QUERY
 WITH staff AS (
  SELECT s.user_id, s.tenant_id, s.branch_id, d.name AS branch_name, coalesce(nullif(d.country,''),'미지정') AS region, coalesce(p.full_name,'이름 없음') AS person_name
  FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id AND p.department_id=s.branch_id AND p.tenant_id=s.tenant_id
  JOIN public.departments d ON d.id=s.branch_id
  WHERE s.active AND (s.user_id=auth.uid() OR edu OR public.mygrowth_has_branch_role(s.branch_id,'trainer') OR public.mygrowth_has_branch_role(s.branch_id,'store_manager'))
 ), online AS (
  SELECT st.user_id, floor(sum(least(30::numeric,greatest(0::numeric,extract(epoch FROM (c.last_heartbeat_at-c.started_at))/60)))+0.5)::integer AS m
  FROM staff st JOIN public.course_learning_sessions c ON c.user_id=st.user_id
  WHERE (c.started_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN _from AND _to GROUP BY st.user_id
 ), att AS (
  SELECT st.user_id, t.session_kind, t.created_by, coalesce(t.actual_minutes,t.planned_minutes,0) AS m
  FROM staff st JOIN public.mygrowth_training_targets x ON x.user_id=st.user_id AND x.attendance_status='attended'
  JOIN public.mygrowth_trainings t ON t.id=x.training_id AND t.attendance_version>0 AND t.tenant_id=x.tenant_id AND t.branch_id=x.branch_id
  WHERE t.tenant_id=st.tenant_id AND t.branch_id=st.branch_id AND t.training_date BETWEEN _from AND _to
 ), per AS (
  SELECT st.*, coalesce(o.m,0) AS online_m,
   coalesce((SELECT sum(a.m) FROM att a WHERE a.user_id=st.user_id AND a.session_kind='education'),0)::integer AS offline_m,
   coalesce((SELECT sum(a.m) FROM att a WHERE a.user_id=st.user_id AND a.session_kind='field_coaching'),0)::integer AS field_m,
   coalesce((SELECT sum(a.m) FROM att a WHERE a.user_id=st.user_id AND a.session_kind='manager_coaching' AND (st.user_id=auth.uid() OR a.created_by=auth.uid())),0)::integer AS manager_m,
   (st.user_id<>auth.uid() AND NOT public.mygrowth_has_branch_role(st.branch_id,'store_manager')) AS mgr_hidden
  FROM staff st LEFT JOIN online o ON o.user_id=st.user_id
 )
 SELECT CASE _level WHEN 'person' THEN per.user_id::text WHEN 'branch' THEN per.branch_id::text WHEN 'region' THEN per.region ELSE 'global' END,
  min(CASE _level WHEN 'person' THEN per.person_name||' · '||per.branch_name WHEN 'branch' THEN per.branch_name WHEN 'region' THEN per.region ELSE '전체' END),
  count(*)::integer, sum(per.online_m)::integer, sum(per.offline_m)::integer, sum(per.field_m)::integer, sum(per.manager_m)::integer, bool_or(per.mgr_hidden)
 FROM per GROUP BY 1 ORDER BY 2;
END $$;
REVOKE ALL ON FUNCTION public.mygrowth_time_report(date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_time_report(date,date,text) TO authenticated, service_role;