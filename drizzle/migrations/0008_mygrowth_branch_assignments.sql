CREATE TABLE public.mygrowth_staff_registry (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 branch_id uuid NOT NULL REFERENCES public.departments(id),
 is_senior boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true
);
GRANT ALL ON public.mygrowth_staff_registry TO service_role;
ALTER TABLE public.mygrowth_staff_registry ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.mygrowth_education_team (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 country text NOT NULL DEFAULT 'KR' CHECK (country = 'KR'),
 active boolean NOT NULL DEFAULT true
);
GRANT ALL ON public.mygrowth_education_team TO service_role;
ALTER TABLE public.mygrowth_education_team ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.mygrowth_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 branch_id uuid NOT NULL REFERENCES public.departments(id),
 role text NOT NULL CHECK (role IN ('trainer','store_manager')),
 active boolean NOT NULL DEFAULT true,
 assigned_by uuid NOT NULL REFERENCES auth.users(id),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 revoked_by uuid REFERENCES auth.users(id),
 revoked_at timestamptz,
 UNIQUE (user_id,role)
);
GRANT ALL ON public.mygrowth_assignments TO service_role;
ALTER TABLE public.mygrowth_assignments ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.mygrowth_assignment_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id uuid NOT NULL REFERENCES public.mygrowth_assignments(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 branch_id uuid NOT NULL REFERENCES public.departments(id),
 role text NOT NULL,
 action text NOT NULL CHECK (action IN ('assign','revoke')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mygrowth_assignment_audit TO service_role;
ALTER TABLE public.mygrowth_assignment_audit ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.mygrowth_can_appoint() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT public.is_mygrowth_reviewer() AND EXISTS (SELECT 1 FROM public.mygrowth_education_team e WHERE e.user_id=auth.uid() AND e.active AND e.country='KR')
$$;
CREATE OR REPLACE FUNCTION public.mygrowth_has_branch_role(_branch_id uuid, _role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT public.is_mygrowth_reviewer() AND EXISTS (
 SELECT 1 FROM public.mygrowth_assignments a JOIN public.mygrowth_staff_registry s ON s.user_id=a.user_id
 JOIN public.profiles p ON p.user_id=s.user_id JOIN public.departments d ON d.id=s.branch_id JOIN public.tenants t ON t.id=s.tenant_id
 WHERE a.user_id=auth.uid() AND a.active AND s.active AND s.is_senior
 AND a.role=_role AND a.branch_id=_branch_id AND a.branch_id=s.branch_id AND a.tenant_id=s.tenant_id
 AND p.department_id=s.branch_id AND p.tenant_id=s.tenant_id AND d.is_active AND t.is_active)
$$;
CREATE OR REPLACE FUNCTION public.mygrowth_assignment_directory()
RETURNS TABLE(user_id uuid,full_name text,branch_id uuid,branch_name text,role text,assignment_id uuid,assigned_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT s.user_id,coalesce(p.full_name,'이름 미등록'),s.branch_id,d.name,a.role,a.id,a.assigned_at
FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id
JOIN public.departments d ON d.id=s.branch_id JOIN public.tenants t ON t.id=s.tenant_id
LEFT JOIN public.mygrowth_assignments a ON a.user_id=s.user_id AND a.active AND a.branch_id=s.branch_id AND a.tenant_id=s.tenant_id
WHERE public.is_mygrowth_reviewer() AND s.active AND s.is_senior AND p.department_id=s.branch_id AND p.tenant_id=s.tenant_id AND d.is_active AND t.is_active
AND ((public.mygrowth_can_appoint() AND EXISTS(SELECT 1 FROM public.mygrowth_education_team e WHERE e.user_id=auth.uid() AND e.active AND e.tenant_id=s.tenant_id)) OR (s.user_id=auth.uid() AND a.id IS NOT NULL))
ORDER BY d.name,p.full_name,a.role
$$;
CREATE OR REPLACE FUNCTION public.mygrowth_set_assignment(_user_id uuid,_role text,_active boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.mygrowth_staff_registry%ROWTYPE; a public.mygrowth_assignments%ROWTYPE;
BEGIN
 IF NOT public.mygrowth_can_appoint() THEN RAISE EXCEPTION '담당자 지정 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 IF _role IS NULL OR _role NOT IN ('trainer','store_manager') OR _active IS NULL THEN RAISE EXCEPTION '지정 요청이 올바르지 않습니다.' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.mygrowth_staff_registry WHERE user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.mygrowth_education_team e WHERE e.user_id=auth.uid() AND e.active AND e.tenant_id=s.tenant_id) THEN RAISE EXCEPTION '지정 가능한 소속이 아닙니다.' USING ERRCODE='42501'; END IF;
 IF _active THEN
  PERFORM 1 FROM public.profiles p JOIN public.departments d ON d.id=p.department_id JOIN public.tenants t ON t.id=p.tenant_id WHERE p.user_id=s.user_id AND p.department_id=s.branch_id AND p.tenant_id=s.tenant_id AND d.is_active AND t.is_active FOR SHARE OF p;
  IF NOT FOUND OR NOT s.active OR NOT s.is_senior THEN RAISE EXCEPTION '현재 소속 지점의 선임매니저만 지정할 수 있습니다.' USING ERRCODE='42501'; END IF;
  INSERT INTO public.mygrowth_assignments(user_id,tenant_id,branch_id,role,assigned_by) VALUES(s.user_id,s.tenant_id,s.branch_id,_role,auth.uid())
  ON CONFLICT(user_id,role) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,branch_id=EXCLUDED.branch_id,active=true,assigned_by=auth.uid(),assigned_at=now(),revoked_by=NULL,revoked_at=NULL RETURNING * INTO a;
 ELSE
  UPDATE public.mygrowth_assignments SET active=false,revoked_by=auth.uid(),revoked_at=now() WHERE user_id=_user_id AND role=_role AND active AND tenant_id=s.tenant_id RETURNING * INTO a;
  IF NOT FOUND THEN RAISE EXCEPTION '해제할 지정 내역이 없습니다.' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO public.mygrowth_assignment_audit(assignment_id,actor_id,user_id,tenant_id,branch_id,role,action) VALUES(a.id,auth.uid(),a.user_id,a.tenant_id,a.branch_id,a.role,CASE WHEN _active THEN 'assign' ELSE 'revoke' END);
 RETURN a.id;
END $$;
CREATE OR REPLACE FUNCTION public.mygrowth_invalidate_assignments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_TABLE_NAME='profiles' THEN
  IF OLD.department_id IS DISTINCT FROM NEW.department_id OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN UPDATE public.mygrowth_assignments SET active=false,revoked_at=now() WHERE user_id=NEW.user_id AND active; END IF;
 ELSE
  IF OLD.branch_id IS DISTINCT FROM NEW.branch_id OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR NOT NEW.active OR NOT NEW.is_senior THEN UPDATE public.mygrowth_assignments SET active=false,revoked_at=now() WHERE user_id=NEW.user_id AND active; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mygrowth_profile_scope_changed AFTER UPDATE OF department_id,tenant_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.mygrowth_invalidate_assignments();
CREATE TRIGGER mygrowth_staff_scope_changed AFTER UPDATE ON public.mygrowth_staff_registry FOR EACH ROW EXECUTE FUNCTION public.mygrowth_invalidate_assignments();
REVOKE ALL ON FUNCTION public.mygrowth_can_appoint(),public.mygrowth_has_branch_role(uuid,text),public.mygrowth_assignment_directory(),public.mygrowth_set_assignment(uuid,text,boolean),public.mygrowth_invalidate_assignments() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_can_appoint(),public.mygrowth_has_branch_role(uuid,text),public.mygrowth_assignment_directory(),public.mygrowth_set_assignment(uuid,text,boolean) TO authenticated;
COMMENT ON TABLE public.mygrowth_staff_registry IS 'Trusted My Growth branch and senior eligibility registry; client writes prohibited.';
COMMENT ON TABLE public.mygrowth_education_team IS 'Trusted Korean HQ education appointment authority; existing LMS roles do not confer access.';