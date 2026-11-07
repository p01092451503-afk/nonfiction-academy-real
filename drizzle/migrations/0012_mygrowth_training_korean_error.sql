CREATE OR REPLACE FUNCTION public.mygrowth_create_training(_request_id uuid,_branch_id uuid,_trainer_id uuid,_title text,_training_type text,_training_date date,_location text,_planned_minutes integer,_actual_minutes integer,_summary text,_target_ids uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE s public.mygrowth_staff_registry%ROWTYPE; existing public.mygrowth_trainings%ROWTYPE; payload jsonb; targets uuid[]; result uuid;
 BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '검수 권한이 없습니다.' USING ERRCODE='42501'; END IF;
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