CREATE TABLE public.mygrowth_followup_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL REFERENCES public.mygrowth_action_plans(id),
 version integer NOT NULL CHECK(version > 0),
 status text NOT NULL CHECK(status IN ('completed','in_progress','not_completed')),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 5000),
 assessed_by uuid NOT NULL REFERENCES auth.users(id),
 assessor_name text NOT NULL,
 assessed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 request_id uuid NOT NULL,
 plan_body text NOT NULL,
 plan_language text NOT NULL,
 plan_updated_at timestamptz NOT NULL,
 UNIQUE(plan_id,version), UNIQUE(assessed_by,request_id)
);
GRANT SELECT, INSERT ON public.mygrowth_followup_audit TO service_role;
REVOKE ALL ON public.mygrowth_followup_audit FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mygrowth_followup_audit ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.mygrowth_followup_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION '판정 이력은 수정하거나 삭제할 수 없습니다.' USING ERRCODE='42501'; END $$;
CREATE TRIGGER mygrowth_followup_immutable BEFORE UPDATE OR DELETE ON public.mygrowth_followup_audit FOR EACH ROW EXECUTE FUNCTION public.mygrowth_followup_immutable();
CREATE OR REPLACE FUNCTION public.mygrowth_followup_staff_scope(_plan_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_mygrowth_reviewer() AND EXISTS(
 SELECT 1 FROM public.mygrowth_action_plans a JOIN public.mygrowth_trainings t ON t.id=a.training_id
 JOIN public.mygrowth_staff_registry s ON s.user_id=a.user_id JOIN public.profiles p ON p.user_id=s.user_id
 WHERE a.id=_plan_id AND a.user_id<>auth.uid() AND s.active AND s.tenant_id=t.tenant_id AND s.branch_id=t.branch_id
 AND p.tenant_id=s.tenant_id AND p.department_id=s.branch_id AND public.mygrowth_session_scope(t.id)
 AND public.mygrowth_has_branch_role(t.branch_id,CASE WHEN t.session_kind='manager_coaching' THEN 'store_manager' ELSE 'trainer' END)) $$;
CREATE OR REPLACE FUNCTION public.mygrowth_followup_detail(_plan_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.mygrowth_action_plans%ROWTYPE; staff boolean;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.mygrowth_action_plans WHERE id=_plan_id;
 IF NOT FOUND THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 staff=public.mygrowth_followup_staff_scope(a.id);
 IF a.user_id<>auth.uid() AND NOT staff THEN RAISE EXCEPTION '담당 범위가 아닙니다.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('plan_updated_at',a.updated_at,'version',coalesce((SELECT max(h.version) FROM public.mygrowth_followup_audit h WHERE h.plan_id=a.id),0),
 'can_assess',staff AND EXISTS(SELECT 1 FROM public.mygrowth_training_targets x WHERE x.training_id=a.training_id AND x.user_id=a.user_id AND x.attendance_status='attended'),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('version',h.version,'status',h.status,'note',h.note,'assessed_by',h.assessor_name,'assessed_at',h.assessed_at,'plan_body',h.plan_body,'plan_language',h.plan_language,'plan_updated_at',h.plan_updated_at) ORDER BY h.version DESC) FROM public.mygrowth_followup_audit h WHERE h.plan_id=a.id),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_save_followup(_plan_id uuid,_status text,_note text,_expected_version integer,_expected_plan_updated_at timestamptz,_request_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.mygrowth_action_plans%ROWTYPE; h public.mygrowth_followup_audit%ROWTYPE; current_version integer; name text;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.mygrowth_reviewers WHERE user_id=auth.uid() FOR SHARE;
 PERFORM 1 FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id JOIN public.mygrowth_assignments x ON x.user_id=s.user_id WHERE s.user_id=auth.uid() FOR SHARE OF s,p,x;
 SELECT * INTO a FROM public.mygrowth_action_plans WHERE id=_plan_id FOR UPDATE;
 IF NOT FOUND OR NOT public.mygrowth_followup_staff_scope(_plan_id) THEN RAISE EXCEPTION '担当範囲ではありません。' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id WHERE s.user_id=a.user_id FOR SHARE OF s,p;
 PERFORM 1 FROM public.mygrowth_training_targets x WHERE x.training_id=a.training_id AND x.user_id=a.user_id AND x.attendance_status='attended' FOR SHARE;
 IF NOT FOUND OR NOT public.mygrowth_followup_staff_scope(_plan_id) THEN RAISE EXCEPTION '현재 참석과 담당 범위를 확인해 주십시오.' USING ERRCODE='42501'; END IF;
 IF _status IS NULL OR _status NOT IN ('completed','in_progress','not_completed') OR nullif(btrim(_note),'') IS NULL OR length(_note)>5000 OR _expected_version IS NULL OR _expected_version<0 OR _expected_plan_updated_at IS NULL OR _request_id IS NULL THEN RAISE EXCEPTION '판정 상태와 의견을 확인해 주십시오.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||_request_id::text,0));
 SELECT * INTO h FROM public.mygrowth_followup_audit WHERE assessed_by=auth.uid() AND request_id=_request_id;
 IF FOUND THEN
 IF h.plan_id IS DISTINCT FROM _plan_id OR h.status IS DISTINCT FROM _status OR h.note IS DISTINCT FROM btrim(_note) OR h.version-1 IS DISTINCT FROM _expected_version OR h.plan_updated_at IS DISTINCT FROM _expected_plan_updated_at THEN RAISE EXCEPTION '같은 요청으로 다른 판정을 저장할 수 없습니다.' USING ERRCODE='22023'; END IF;
 RETURN h.version;
 END IF;
 SELECT coalesce(max(version),0) INTO current_version FROM public.mygrowth_followup_audit WHERE plan_id=a.id;
 IF current_version<>_expected_version OR a.updated_at IS DISTINCT FROM _expected_plan_updated_at THEN RAISE EXCEPTION '계획 또는 판정이 변경되었습니다. 최신 내용을 다시 확인해 주십시오.' USING ERRCODE='40001'; END IF;
 SELECT coalesce(full_name,'이름 미등록') INTO name FROM public.profiles WHERE user_id=auth.uid();
 INSERT INTO public.mygrowth_followup_audit(plan_id,version,status,note,assessed_by,assessor_name,request_id,plan_body,plan_language,plan_updated_at) VALUES(a.id,current_version+1,_status,btrim(_note),auth.uid(),coalesce(name,'이름 미등록'),_request_id,a.body,a.original_language,a.updated_at);
 RETURN current_version+1;
END $$;
REVOKE ALL ON FUNCTION public.mygrowth_followup_immutable(),public.mygrowth_followup_staff_scope(uuid),public.mygrowth_followup_detail(uuid),public.mygrowth_save_followup(uuid,text,text,integer,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_followup_staff_scope(uuid),public.mygrowth_followup_detail(uuid),public.mygrowth_save_followup(uuid,text,text,integer,timestamptz,uuid) TO authenticated,service_role;
COMMENT ON TABLE public.mygrowth_followup_audit IS 'Append-only followup assessments with immutable plan and assessor snapshots; clients access only through reviewer and session scoped RPCs.';