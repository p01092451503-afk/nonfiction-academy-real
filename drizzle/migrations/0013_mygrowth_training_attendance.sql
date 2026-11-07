ALTER TABLE public.mygrowth_trainings ADD COLUMN attendance_version integer NOT NULL DEFAULT 0, ADD COLUMN attendance_updated_at timestamptz, ADD COLUMN attendance_updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.mygrowth_training_targets ADD COLUMN attendance_status text NOT NULL DEFAULT 'pending' CHECK(attendance_status IN ('pending','attended','absent'));
COMMENT ON COLUMN public.mygrowth_training_targets.status IS 'DEPRECATED: registration-only pending marker; attendance_status stores attendance outcome.';
CREATE TABLE public.mygrowth_training_attendance_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), training_id uuid NOT NULL REFERENCES public.mygrowth_trainings(id), version integer NOT NULL, changed_by uuid NOT NULL REFERENCES auth.users(id), changed_at timestamptz NOT NULL DEFAULT now(), before_attendees uuid[] NOT NULL, after_attendees uuid[] NOT NULL, UNIQUE(training_id,version));
GRANT SELECT ON public.mygrowth_training_attendance_audit TO authenticated;
GRANT ALL ON public.mygrowth_training_attendance_audit TO service_role;
ALTER TABLE public.mygrowth_training_attendance_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped attendance history" ON public.mygrowth_training_attendance_audit FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.mygrowth_trainings t WHERE t.id=training_id AND public.mygrowth_training_scope(t.tenant_id,t.branch_id)));
CREATE OR REPLACE FUNCTION public.mygrowth_attendance_save(_training_id uuid,_attended_ids uuid[],_expected_version integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.mygrowth_trainings%ROWTYPE; chosen uuid[]; previous uuid[];
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '검수 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.mygrowth_trainings WHERE id=_training_id FOR UPDATE;
 IF NOT FOUND OR NOT public.mygrowth_training_scope(t.tenant_id,t.branch_id) THEN RAISE EXCEPTION '교육 담당 범위가 아닙니다.' USING ERRCODE='42501'; END IF;
 IF _expected_version IS NULL OR _attended_ids IS NULL OR array_position(_attended_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION '참석 입력을 확인해 주십시오.' USING ERRCODE='22023'; END IF;
 IF t.attendance_version<>_expected_version THEN RAISE EXCEPTION '참석 내역이 변경되었습니다. 최신 내역을 다시 확인해 주십시오.' USING ERRCODE='40001'; END IF;
 SELECT coalesce(array_agg(DISTINCT u ORDER BY u),ARRAY[]::uuid[]) INTO chosen FROM unnest(_attended_ids) u;
 PERFORM 1 FROM public.mygrowth_training_targets WHERE training_id=t.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM unnest(chosen) u WHERE NOT EXISTS(SELECT 1 FROM public.mygrowth_training_targets x WHERE x.training_id=t.id AND x.user_id=u AND x.tenant_id=t.tenant_id AND x.branch_id=t.branch_id)) THEN RAISE EXCEPTION '등록된 참석 대상만 선택할 수 있습니다.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id WHERE s.user_id=ANY(chosen) FOR SHARE OF s,p;
 IF (SELECT count(*) FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id WHERE s.user_id=ANY(chosen) AND s.active AND s.tenant_id=t.tenant_id AND s.branch_id=t.branch_id AND p.tenant_id=s.tenant_id AND p.department_id=s.branch_id)<>cardinality(chosen) THEN RAISE EXCEPTION '현재 지점의 재직 직원만 참석 등록할 수 있습니다.' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(user_id ORDER BY user_id),ARRAY[]::uuid[]) INTO previous FROM public.mygrowth_training_targets WHERE training_id=t.id AND attendance_status='attended';
 IF t.attendance_version>0 AND previous=chosen THEN RETURN t.attendance_version; END IF;
 UPDATE public.mygrowth_training_targets SET attendance_status=CASE WHEN user_id=ANY(chosen) THEN 'attended' ELSE 'absent' END WHERE training_id=t.id;
 UPDATE public.mygrowth_trainings SET attendance_version=attendance_version+1,attendance_updated_at=now(),attendance_updated_by=auth.uid() WHERE id=t.id RETURNING attendance_version INTO t.attendance_version;
 INSERT INTO public.mygrowth_training_attendance_audit(training_id,version,changed_by,before_attendees,after_attendees) VALUES(t.id,t.attendance_version,auth.uid(),previous,chosen);
 RETURN t.attendance_version;
END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_attendance_detail(_training_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('version',t.attendance_version,'updated_at',t.attendance_updated_at,'people',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',x.user_id,'full_name',coalesce(p.full_name,'이름 미등록'),'status',x.attendance_status) ORDER BY p.full_name,x.user_id) FROM public.mygrowth_training_targets x LEFT JOIN public.profiles p ON p.user_id=x.user_id WHERE x.training_id=t.id),'[]'::jsonb),'history',coalesce((SELECT jsonb_agg(jsonb_build_object('version',a.version,'changed_at',a.changed_at,'changed_by',coalesce(p.full_name,'이름 미등록'),'attended_count',cardinality(a.after_attendees)) ORDER BY a.version DESC) FROM public.mygrowth_training_attendance_audit a LEFT JOIN public.profiles p ON p.user_id=a.changed_by WHERE a.training_id=t.id),'[]'::jsonb)) FROM public.mygrowth_trainings t WHERE t.id=_training_id AND public.mygrowth_training_scope(t.tenant_id,t.branch_id)
$$;
CREATE OR REPLACE FUNCTION public.mygrowth_training_attendees(_training_id uuid) RETURNS TABLE(user_id uuid,full_name text,status text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT x.user_id,coalesce(p.full_name,'이름 미등록'),x.attendance_status FROM public.mygrowth_training_targets x JOIN public.mygrowth_trainings t ON t.id=x.training_id LEFT JOIN public.profiles p ON p.user_id=x.user_id WHERE t.id=_training_id AND public.mygrowth_training_scope(t.tenant_id,t.branch_id) ORDER BY p.full_name
$$;
REVOKE ALL ON FUNCTION public.mygrowth_attendance_save(uuid,uuid[],integer),public.mygrowth_attendance_detail(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_attendance_save(uuid,uuid[],integer),public.mygrowth_attendance_detail(uuid) TO authenticated,service_role;