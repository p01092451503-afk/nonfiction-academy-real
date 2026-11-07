CREATE OR REPLACE FUNCTION public.mygrowth_learning_list() RETURNS TABLE(feed_key text,record_type text,title text,detail text,occurred_on date,status text,planned_minutes integer,actual_minutes integer,branch_name text,progress numeric,completion_count integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH own_rows AS (
 SELECT 'record:'||r.id::text AS feed_key,r.record_type,r.title,r.detail,r.occurred_on,r.status,r.planned_minutes,r.actual_minutes,d.name AS branch_name,NULL::numeric AS progress,NULL::integer AS completion_count
 FROM public.mygrowth_records r LEFT JOIN public.departments d ON d.id=r.branch_id
 WHERE public.is_mygrowth_reviewer() AND r.user_id=auth.uid() AND r.source_table NOT IN ('mygrowth_trainings','enrollments')
 UNION ALL
 SELECT 'elearning:'||e.id::text,'elearning',c.title,NULL,coalesce((e.completed_at AT TIME ZONE 'Asia/Seoul')::date,(e.enrolled_at AT TIME ZONE 'Asia/Seoul')::date),CASE WHEN e.completed_at IS NOT NULL THEN 'done' WHEN e.status::text='approved' THEN 'in_progress' ELSE 'scheduled' END,(c.estimated_duration_hours*60)::integer,NULL,NULL,e.progress,e.completion_count
 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE public.is_mygrowth_reviewer() AND e.user_id=auth.uid()
 UNION ALL
 SELECT 'attendance:'||t.id::text,'offline_training',t.title,t.summary,t.training_date,'attended',t.planned_minutes,t.actual_minutes,d.name,NULL,NULL
 FROM public.mygrowth_training_targets x JOIN public.mygrowth_trainings t ON t.id=x.training_id JOIN public.departments d ON d.id=t.branch_id
 WHERE public.is_mygrowth_reviewer() AND x.user_id=auth.uid() AND x.attendance_status='attended' AND t.attendance_version>0 AND x.tenant_id=t.tenant_id AND x.branch_id=t.branch_id
 UNION ALL
 SELECT 'event:'||v.id::text,CASE v.event_type WHEN 'training' THEN 'offline_training' WHEN 'coaching' THEN 'coaching' ELSE v.event_type END,v.title,v.detail,v.occurred_on,v.status,NULL,NULL,NULL,NULL,NULL
 FROM public.mygrowth_events v WHERE public.is_mygrowth_reviewer() AND v.user_id=auth.uid() AND NOT EXISTS(SELECT 1 FROM public.mygrowth_records r WHERE r.user_id=auth.uid() AND r.source_table='mygrowth_events' AND r.source_id=v.id)
)
SELECT * FROM own_rows ORDER BY occurred_on DESC,feed_key;
$$;
REVOKE ALL ON FUNCTION public.mygrowth_learning_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_learning_list() TO authenticated,service_role;
COMMENT ON FUNCTION public.mygrowth_learning_list() IS 'Reviewer-only own learning overview, read-only source projection; attendance outcomes never write LMS or growth totals.';