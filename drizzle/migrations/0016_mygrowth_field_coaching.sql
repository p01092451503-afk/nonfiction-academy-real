ALTER TABLE public.mygrowth_trainings ADD COLUMN session_kind text NOT NULL DEFAULT 'education' CHECK(session_kind IN ('education','field_coaching'));
CREATE TABLE public.mygrowth_field_coaching (training_id uuid PRIMARY KEY REFERENCES public.mygrowth_trainings(id), observation text, feedback text, next_action text, CHECK(length(coalesce(observation,''))<=5000 AND length(coalesce(feedback,''))<=5000 AND length(coalesce(next_action,''))<=5000));
REVOKE ALL ON public.mygrowth_field_coaching FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mygrowth_field_coaching TO authenticated;
GRANT ALL ON public.mygrowth_field_coaching TO service_role;
ALTER TABLE public.mygrowth_field_coaching ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped coaching read" ON public.mygrowth_field_coaching FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.mygrowth_trainings t WHERE t.id=training_id AND public.mygrowth_training_scope(t.tenant_id,t.branch_id)));
CREATE OR REPLACE FUNCTION public.mygrowth_create_field_coaching(_request_id uuid,_branch_id uuid,_trainer_id uuid,_title text,_training_date date,_location text,_planned_minutes integer,_actual_minutes integer,_observation text,_feedback text,_next_action text,_target_ids uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid; existing public.mygrowth_trainings%ROWTYPE; notes text;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '검수 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF length(coalesce(_title,''))>200 OR length(coalesce(_location,''))>300 OR length(coalesce(_observation,''))>5000 OR length(coalesce(_feedback,''))>5000 OR length(coalesce(_next_action,''))>5000 THEN RAISE EXCEPTION '입력 길이를 확인해 주십시오.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||_request_id::text,0));
 SELECT * INTO existing FROM public.mygrowth_trainings WHERE created_by=auth.uid() AND request_id=_request_id;
 IF FOUND AND existing.session_kind<>'field_coaching' THEN RAISE EXCEPTION '교육 요청을 코칭으로 변경할 수 없습니다.' USING ERRCODE='22023'; END IF;
 notes=concat_ws(E'\n\n',CASE WHEN nullif(btrim(_observation),'') IS NOT NULL THEN '현장 관찰: '||btrim(_observation) END,CASE WHEN nullif(btrim(_feedback),'') IS NOT NULL THEN '피드백: '||btrim(_feedback) END,CASE WHEN nullif(btrim(_next_action),'') IS NOT NULL THEN '다음 실행: '||btrim(_next_action) END);
 result=public.mygrowth_create_training(_request_id,_branch_id,_trainer_id,_title,'필드 코칭',_training_date,_location,_planned_minutes,_actual_minutes,notes,_target_ids);
 IF existing.id IS NOT NULL THEN
 IF NOT EXISTS(SELECT 1 FROM public.mygrowth_field_coaching c WHERE c.training_id=result AND c.observation IS NOT DISTINCT FROM nullif(btrim(_observation),'') AND c.feedback IS NOT DISTINCT FROM nullif(btrim(_feedback),'') AND c.next_action IS NOT DISTINCT FROM nullif(btrim(_next_action),'')) THEN RAISE EXCEPTION '같은 요청으로 다른 코칭을 저장할 수 없습니다.' USING ERRCODE='22023'; END IF;
 RETURN result;
 END IF;
 UPDATE public.mygrowth_trainings SET session_kind='field_coaching' WHERE id=result;
 INSERT INTO public.mygrowth_field_coaching(training_id,observation,feedback,next_action) VALUES(result,nullif(btrim(_observation),''),nullif(btrim(_feedback),''),nullif(btrim(_next_action),''));
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_training_list() RETURNS TABLE(id uuid,title text,training_type text,training_date date,location text,trainer_name text,branch_name text,planned_minutes integer,actual_minutes integer,summary text,target_count bigint,created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT t.id,t.title,t.training_type,t.training_date,t.location,coalesce(p.full_name,'이름 미등록'),d.name,t.planned_minutes,t.actual_minutes,t.summary,(SELECT count(*) FROM public.mygrowth_training_targets x WHERE x.training_id=t.id),t.created_at FROM public.mygrowth_trainings t JOIN public.departments d ON d.id=t.branch_id LEFT JOIN public.profiles p ON p.user_id=t.trainer_id WHERE t.session_kind='education' AND public.mygrowth_training_scope(t.tenant_id,t.branch_id) ORDER BY t.training_date DESC,t.created_at DESC
$$;
CREATE OR REPLACE FUNCTION public.mygrowth_field_coaching_list() RETURNS TABLE(id uuid,title text,training_type text,training_date date,location text,trainer_name text,branch_name text,planned_minutes integer,actual_minutes integer,summary text,target_count bigint,created_at timestamptz,observation text,feedback text,next_action text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT t.id,t.title,t.training_type,t.training_date,t.location,coalesce(p.full_name,'이름 미등록'),d.name,t.planned_minutes,t.actual_minutes,t.summary,(SELECT count(*) FROM public.mygrowth_training_targets x WHERE x.training_id=t.id),t.created_at,c.observation,c.feedback,c.next_action FROM public.mygrowth_trainings t JOIN public.mygrowth_field_coaching c ON c.training_id=t.id JOIN public.departments d ON d.id=t.branch_id LEFT JOIN public.profiles p ON p.user_id=t.trainer_id WHERE t.session_kind='field_coaching' AND public.mygrowth_training_scope(t.tenant_id,t.branch_id) ORDER BY t.training_date DESC,t.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.mygrowth_create_field_coaching(uuid,uuid,uuid,text,date,text,integer,integer,text,text,text,uuid[]),public.mygrowth_field_coaching_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_create_field_coaching(uuid,uuid,uuid,text,date,text,integer,integer,text,text,text,uuid[]),public.mygrowth_field_coaching_list() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.mygrowth_learning_list() RETURNS TABLE(feed_key text,record_type text,title text,detail text,occurred_on date,status text,planned_minutes integer,actual_minutes integer,branch_name text,progress numeric,completion_count integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH own_rows AS (
 SELECT 'record:'||r.id::text AS feed_key,r.record_type,r.title,r.detail,r.occurred_on,r.status,r.planned_minutes,r.actual_minutes,d.name AS branch_name,NULL::numeric AS progress,NULL::integer AS completion_count FROM public.mygrowth_records r LEFT JOIN public.departments d ON d.id=r.branch_id WHERE public.is_mygrowth_reviewer() AND r.user_id=auth.uid() AND r.source_table NOT IN ('mygrowth_trainings','mygrowth_field_coaching','enrollments')
 UNION ALL
 SELECT 'elearning:'||e.id::text,'elearning',c.title,NULL,coalesce((e.completed_at AT TIME ZONE 'Asia/Seoul')::date,(e.enrolled_at AT TIME ZONE 'Asia/Seoul')::date),CASE WHEN e.completed_at IS NOT NULL THEN 'done' WHEN e.status::text='approved' THEN 'in_progress' ELSE 'scheduled' END,(c.estimated_duration_hours*60)::integer,NULL,NULL,e.progress,e.completion_count FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE public.is_mygrowth_reviewer() AND e.user_id=auth.uid()
 UNION ALL
 SELECT 'attendance:'||t.id::text,CASE WHEN t.session_kind='field_coaching' THEN 'field_coaching' ELSE 'offline_training' END,t.title,t.summary,t.training_date,'attended',t.planned_minutes,t.actual_minutes,d.name,NULL,NULL FROM public.mygrowth_training_targets x JOIN public.mygrowth_trainings t ON t.id=x.training_id JOIN public.departments d ON d.id=t.branch_id WHERE public.is_mygrowth_reviewer() AND x.user_id=auth.uid() AND x.attendance_status='attended' AND t.attendance_version>0 AND x.tenant_id=t.tenant_id AND x.branch_id=t.branch_id
 UNION ALL
 SELECT 'event:'||v.id::text,CASE v.event_type WHEN 'training' THEN 'offline_training' WHEN 'coaching' THEN 'coaching' ELSE v.event_type END,v.title,v.detail,v.occurred_on,v.status,NULL,NULL,NULL,NULL,NULL FROM public.mygrowth_events v WHERE public.is_mygrowth_reviewer() AND v.user_id=auth.uid() AND NOT EXISTS(SELECT 1 FROM public.mygrowth_records r WHERE r.user_id=auth.uid() AND r.source_table='mygrowth_events' AND r.source_id=v.id)
) SELECT * FROM own_rows ORDER BY occurred_on DESC,feed_key;
$$;