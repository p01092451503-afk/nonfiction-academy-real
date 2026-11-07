CREATE TABLE public.mygrowth_action_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 training_id uuid NOT NULL REFERENCES public.mygrowth_trainings(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 5000),
 original_language text NOT NULL CHECK(original_language IN ('ko','en','ja','zh','yue')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(training_id,user_id));
REVOKE ALL ON public.mygrowth_action_plans FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.mygrowth_action_plans TO service_role;
ALTER TABLE public.mygrowth_action_plans ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.mygrowth_save_action_plan(_training_id uuid,_body text,_original_language text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mygrowth_training_targets x WHERE x.training_id=_training_id AND x.user_id=auth.uid() AND x.attendance_status='attended') THEN RAISE EXCEPTION '본인이 참석한 교육·코칭에만 계획을 작성할 수 있습니다.' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(_body),'') IS NULL OR length(_body)>5000 OR _original_language IS NULL OR _original_language NOT IN ('ko','en','ja','zh','yue') THEN RAISE EXCEPTION '필수 입력을 확인해 주십시오.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.mygrowth_action_plans(training_id,user_id,body,original_language) VALUES(_training_id,auth.uid(),btrim(_body),_original_language)
 ON CONFLICT(training_id,user_id) DO UPDATE SET body=EXCLUDED.body,original_language=EXCLUDED.original_language,updated_at=now()
 RETURNING id INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.mygrowth_my_action_plans() RETURNS TABLE(training_id uuid,session_kind text,title text,training_date date,branch_name text,plan_id uuid,body text,original_language text,updated_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT t.id,t.session_kind,t.title,t.training_date,d.name,a.id,a.body,a.original_language,a.updated_at
 FROM public.mygrowth_training_targets x JOIN public.mygrowth_trainings t ON t.id=x.training_id
 LEFT JOIN public.departments d ON d.id=t.branch_id
 LEFT JOIN public.mygrowth_action_plans a ON a.training_id=t.id AND a.user_id=x.user_id
 WHERE public.is_mygrowth_reviewer() AND x.user_id=auth.uid() AND x.attendance_status='attended'
 ORDER BY t.training_date DESC,t.created_at DESC $$;

CREATE OR REPLACE FUNCTION public.mygrowth_scoped_action_plans() RETURNS TABLE(plan_id uuid,training_id uuid,session_kind text,title text,training_date date,branch_name text,employee_name text,body text,original_language text,updated_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT a.id,t.id,t.session_kind,t.title,t.training_date,d.name,coalesce(p.full_name,'이름 미등록'),a.body,a.original_language,a.updated_at
 FROM public.mygrowth_action_plans a JOIN public.mygrowth_trainings t ON t.id=a.training_id
 LEFT JOIN public.departments d ON d.id=t.branch_id LEFT JOIN public.profiles p ON p.user_id=a.user_id
 WHERE public.is_mygrowth_reviewer() AND a.user_id<>auth.uid() AND public.mygrowth_session_scope(t.id)
 ORDER BY a.updated_at DESC $$;

REVOKE ALL ON FUNCTION public.mygrowth_save_action_plan(uuid,text,text),public.mygrowth_my_action_plans(),public.mygrowth_scoped_action_plans() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_save_action_plan(uuid,text,text),public.mygrowth_my_action_plans(),public.mygrowth_scoped_action_plans() TO authenticated,service_role;