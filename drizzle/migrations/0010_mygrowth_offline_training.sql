CREATE TABLE public.mygrowth_trainings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), branch_id uuid NOT NULL REFERENCES public.departments(id),
 title text NOT NULL CHECK(length(btrim(title))>0), training_type text NOT NULL CHECK(length(btrim(training_type))>0), training_date date NOT NULL, location text NOT NULL CHECK(length(btrim(location))>0), trainer_id uuid NOT NULL REFERENCES auth.users(id), planned_minutes integer NOT NULL CHECK(planned_minutes>0), actual_minutes integer CHECK(actual_minutes>=0), summary text,
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), request_id uuid NOT NULL, request_payload jsonb NOT NULL, UNIQUE(created_by,request_id)
);
GRANT SELECT ON public.mygrowth_trainings TO authenticated;
GRANT ALL ON public.mygrowth_trainings TO service_role;
ALTER TABLE public.mygrowth_trainings ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.mygrowth_training_targets (
 training_id uuid NOT NULL REFERENCES public.mygrowth_trainings(id), user_id uuid NOT NULL REFERENCES auth.users(id), tenant_id uuid NOT NULL REFERENCES public.tenants(id), branch_id uuid NOT NULL REFERENCES public.departments(id), status text NOT NULL DEFAULT 'pending' CHECK(status='pending'), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(training_id,user_id)
);
GRANT SELECT ON public.mygrowth_training_targets TO authenticated;
GRANT ALL ON public.mygrowth_training_targets TO service_role;
ALTER TABLE public.mygrowth_training_targets ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.mygrowth_training_scope(_tenant uuid,_branch uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_mygrowth_reviewer() AND EXISTS(SELECT 1 FROM public.tenants t,public.departments d WHERE t.id=_tenant AND t.is_active AND d.id=_branch AND d.is_active) AND (
 EXISTS(SELECT 1 FROM public.mygrowth_education_team e WHERE e.user_id=auth.uid() AND e.active AND e.country='KR' AND e.tenant_id=_tenant)
 OR (public.mygrowth_has_branch_role(_branch,'trainer') AND EXISTS(SELECT 1 FROM public.mygrowth_staff_registry s WHERE s.user_id=auth.uid() AND s.tenant_id=_tenant AND s.branch_id=_branch))
 )
$$;
CREATE POLICY "Authorized training managers read" ON public.mygrowth_trainings FOR SELECT TO authenticated USING(public.mygrowth_training_scope(tenant_id,branch_id));
CREATE POLICY "Authorized training managers read targets" ON public.mygrowth_training_targets FOR SELECT TO authenticated USING(public.mygrowth_training_scope(tenant_id,branch_id) AND EXISTS(SELECT 1 FROM public.mygrowth_trainings t WHERE t.id=training_id AND t.tenant_id=mygrowth_training_targets.tenant_id AND t.branch_id=mygrowth_training_targets.branch_id));
CREATE OR REPLACE FUNCTION public.mygrowth_training_directory() RETURNS TABLE(user_id uuid,full_name text,tenant_id uuid,branch_id uuid,branch_name text,is_trainer boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT s.user_id,coalesce(p.full_name,'이름 미등록'),s.tenant_id,s.branch_id,d.name,
 (s.is_senior AND EXISTS(SELECT 1 FROM public.mygrowth_assignments a WHERE a.user_id=s.user_id AND a.active AND a.role='trainer' AND a.tenant_id=s.tenant_id AND a.branch_id=s.branch_id) AND EXISTS(SELECT 1 FROM public.mygrowth_reviewers r WHERE r.user_id=s.user_id))
 FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id JOIN public.departments d ON d.id=s.branch_id
 WHERE s.active AND p.department_id=s.branch_id AND p.tenant_id=s.tenant_id AND public.mygrowth_training_scope(s.tenant_id,s.branch_id)
 ORDER BY d.name,p.full_name
$$;
CREATE OR REPLACE FUNCTION public.mygrowth_create_training(_request_id uuid,_branch_id uuid,_trainer_id uuid,_title text,_training_type text,_training_date date,_location text,_planned_minutes integer,_actual_minutes integer,_summary text,_target_ids uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE s public.mygrowth_staff_registry%ROWTYPE; existing public.mygrowth_trainings%ROWTYPE; payload jsonb; targets uuid[]; result uuid;
 BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '検수 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.mygrowth_staff_registry WHERE user_id=_trainer_id FOR SHARE;
 IF NOT FOUND OR NOT s.active OR NOT s.is_senior OR s.branch_id IS DISTINCT FROM _branch_id OR NOT public.mygrowth_training_scope(s.tenant_id,s.branch_id) THEN RAISE EXCEPTION '교육 담당 범위가 아닙니다.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles p JOIN public.mygrowth_assignments a ON a.user_id=p.user_id JOIN public.mygrowth_reviewers r ON r.user_id=p.user_id WHERE p.user_id=s.user_id AND p.tenant_id=s.tenant_id AND p.department_id=s.branch_id AND a.active AND a.role='trainer' AND a.tenant_id=s.tenant_id AND a.branch_id=s.branch_id FOR SHARE OF p,a,r;
 IF NOT FOUND THEN RAISE EXCEPTION '유효한 트레이너가 아닙니다.' USING ERRCODE='42501'; END IF;
 IF _request_id IS NULL OR nullif(btrim(_title),'') IS NULL OR nullif(btrim(_training_type),'') IS NULL OR _training_date IS NULL OR nullif(btrim(_location),'') IS NULL OR _planned_minutes IS NULL OR _planned_minutes<=0 OR _actual_minutes<0 OR coalesce(cardinality(_target_ids),0)=0 OR array_position(_target_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION '필수 입력을 확인해 주십시오.' USING ERRCODE='22023'; END IF;
 SELECT array_agg(DISTINCT u ORDER BY u) INTO targets FROM unnest(_target_ids) u;
 PERFORM 1 FROM public.mygrowth_staff_registry x JOIN public.profiles p ON p.user_id=x.user_id WHERE x.user_id=ANY(targets) FOR SHARE OF x,p;
 IF (SELECT count(*) FROM public.mygrowth_staff_registry x JOIN public.profiles p ON p.user_id=x.user_id WHERE x.user_id=ANY(targets) AND x.active AND x.tenant_id=s.tenant_id AND x.branch_id=s.branch_id AND p.tenant_id=x.tenant_id AND p.department_id=x.branch_id)<>cardinality(targets) THEN RAISE EXCEPTION '현재 지점의 재직 직원만 선택할 수 있습니다.' USING ERRCODE='42501'; END IF;
 payload=jsonb_build_object('branch',_branch_id,'trainer',_trainer_id,'title',btrim(_title),'type',btrim(_training_type),'date',_training_date,'location',btrim(_location),'planned',_planned_minutes,'actual',_actual_minutes,'summary',nullif(btrim(_summary),''),'targets',targets);
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||_request_id::text,0));
 SELECT * INTO existing FROM public.mygrowth_trainings WHERE created_by=auth.uid() AND request_id=_request_id;
 IF FOUND THEN
  IF existing.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION '같은 요청으로 다른 교육을 저장할 수 없습니다.' USING ERRCODE='22023'; END IF;
  RETURN existing.id;
 END IF;
 INSERT INTO public.mygrowth_trainings(tenant_id,branch_id,title,training_type,training_date,location,trainer_id,planned_minutes,actual_minutes,summary,created_by,request_id,request_payload) VALUES(s.tenant_id,s.branch_id,btrim(_title),btrim(_training_type),_training_date,btrim(_location),_trainer_id,_planned_minutes,_actual_minutes,nullif(btrim(_summary),''),auth.uid(),_request_id,payload) RETURNING id INTO result;
 INSERT INTO public.mygrowth_training_targets(training_id,user_id,tenant_id,branch_id) SELECT result,u,s.tenant_id,s.branch_id FROM unnest(targets) u;
 RETURN result;
 END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_training_list() RETURNS TABLE(id uuid,title text,training_type text,training_date date,location text,trainer_name text,branch_name text,planned_minutes integer,actual_minutes integer,summary text,target_count bigint,created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT t.id,t.title,t.training_type,t.training_date,t.location,coalesce(p.full_name,'이름 미등록'),d.name,t.planned_minutes,t.actual_minutes,t.summary,(SELECT count(*) FROM public.mygrowth_training_targets x WHERE x.training_id=t.id),t.created_at FROM public.mygrowth_trainings t JOIN public.departments d ON d.id=t.branch_id LEFT JOIN public.profiles p ON p.user_id=t.trainer_id WHERE public.mygrowth_training_scope(t.tenant_id,t.branch_id) ORDER BY t.training_date DESC,t.created_at DESC
$$;
CREATE OR REPLACE FUNCTION public.mygrowth_training_attendees(_training_id uuid) RETURNS TABLE(user_id uuid,full_name text,status text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT x.user_id,coalesce(p.full_name,'이름 미등록'),x.status FROM public.mygrowth_training_targets x JOIN public.mygrowth_trainings t ON t.id=x.training_id LEFT JOIN public.profiles p ON p.user_id=x.user_id WHERE t.id=_training_id AND public.mygrowth_training_scope(t.tenant_id,t.branch_id) ORDER BY p.full_name
$$;
REVOKE ALL ON FUNCTION public.mygrowth_training_scope(uuid,uuid),public.mygrowth_training_directory(),public.mygrowth_create_training(uuid,uuid,uuid,text,text,date,text,integer,integer,text,uuid[]),public.mygrowth_training_list(),public.mygrowth_training_attendees(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_training_scope(uuid,uuid),public.mygrowth_training_directory(),public.mygrowth_create_training(uuid,uuid,uuid,text,text,date,text,integer,integer,text,uuid[]),public.mygrowth_training_list(),public.mygrowth_training_attendees(uuid) TO authenticated;
COMMENT ON TABLE public.mygrowth_trainings IS 'Offline training registration; no LMS writes or attendance completion. Atomic targets and idempotent request.';