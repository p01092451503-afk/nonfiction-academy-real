-- 운영 관리자용 KPI 연동: 고정 운영 조직을 두고 admin/super_admin이 같은 KPI RPC를 쓰도록 허용한다.
INSERT INTO public.tenants(id,name,is_active,notes) VALUES ('00000000-0000-4000-8000-00000000c0de','논픽션 운영 KPI',true,'운영 관리자 KPI 연동 전용')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.kpi_ops_tenant() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT '00000000-0000-4000-8000-00000000c0de'::uuid $$;

CREATE OR REPLACE FUNCTION public.kpi_is_ops_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) $$;

CREATE OR REPLACE FUNCTION public.mygrowth_kpi_edu_tenant() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t uuid;
BEGIN
 IF public.kpi_is_ops_admin() THEN RETURN public.kpi_ops_tenant(); END IF;
 IF NOT public.mygrowth_can_appoint() THEN RAISE EXCEPTION '본사 교육팀만 사용할 수 있습니다.' USING ERRCODE='42501'; END IF;
 SELECT e.tenant_id INTO t FROM public.mygrowth_education_team e WHERE e.user_id=auth.uid() AND e.active;
 RETURN t;
END $function$;

CREATE OR REPLACE FUNCTION public.kpi_admin_values(_from date, _to date)
RETURNS TABLE(user_id uuid, full_name text, email text, branch_name text, period date, metric_code text, metric_name text, value numeric, unit text, vendor text, received_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT public.kpi_is_ops_admin() THEN RAISE EXCEPTION '관리자만 사용할 수 있습니다.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT kv.user_id, coalesce(p.full_name,'이름 없음'), p.email, d.name, kv.period, kv.metric_code, m.name, kv.value, kv.unit, v.name, kv.received_at
 FROM public.mygrowth_kpi_values kv
 LEFT JOIN public.profiles p ON p.user_id=kv.user_id
 JOIN public.departments d ON d.id=kv.branch_id
 JOIN public.mygrowth_kpi_metrics m ON m.tenant_id=kv.tenant_id AND m.code=kv.metric_code
 LEFT JOIN public.mygrowth_kpi_vendors v ON v.id=kv.vendor_id
 WHERE kv.tenant_id=public.kpi_ops_tenant()
  AND kv.period BETWEEN date_trunc('month',coalesce(_from,'2000-01-01'::date))::date AND coalesce(_to,'2100-01-01'::date)
 ORDER BY kv.period DESC, d.name, p.full_name, kv.metric_code
 LIMIT 5000;
END $$;
REVOKE ALL ON FUNCTION public.kpi_admin_values(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_admin_values(date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.kpi_is_ops_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_is_ops_admin() TO authenticated;

-- 수신: 운영 조직 키는 마이그로스 등록부 없이 지점 소속 회원(사번 또는 이메일)으로 매칭한다.
CREATE OR REPLACE FUNCTION public.mygrowth_kpi_ingest(_key_hash text, _client_ip text, _records jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE k record; rec jsonb; i int := 0; ok int := 0; errs jsonb := '[]'; uid uuid; br uuid; per date; mcode text; munit text; val numeric; e text; ident text; total int; eid text; em text;
BEGIN
 SELECT ak.id, ak.vendor_id, v.tenant_id, v.allowed_ips, v.active INTO k FROM public.mygrowth_kpi_api_keys ak JOIN public.mygrowth_kpi_vendors v ON v.id=ak.vendor_id WHERE ak.key_hash=_key_hash AND ak.revoked_at IS NULL;
 IF k.id IS NULL OR NOT k.active THEN RETURN jsonb_build_object('error','INVALID_API_KEY'); END IF;
 IF cardinality(k.allowed_ips)>0 AND NOT EXISTS (SELECT 1 FROM unnest(k.allowed_ips) a WHERE _client_ip ~ '^[0-9a-fA-F:.]+$' AND _client_ip::inet <<= a::inet) THEN
  INSERT INTO public.mygrowth_kpi_ingest_logs(vendor_id,key_id,status,errors) VALUES (k.vendor_id,k.id,'rejected',jsonb_build_array(jsonb_build_object('code','IP_NOT_ALLOWED')));
  RETURN jsonb_build_object('error','IP_NOT_ALLOWED');
 END IF;
 UPDATE public.mygrowth_kpi_api_keys SET last_used_at=now() WHERE id=k.id;
 total := jsonb_array_length(_records);
 FOR rec IN SELECT * FROM jsonb_array_elements(_records) LOOP
  e := NULL; uid := NULL; br := NULL; per := NULL; mcode := NULL; munit := NULL; val := NULL; eid := NULL; em := NULL;
  IF jsonb_typeof(rec)<>'object' THEN e := 'INVALID_RECORD'; END IF;
  IF e IS NULL THEN
   eid := nullif(btrim(rec->>'employee_id'),''); em := nullif(lower(btrim(rec->>'email')),'');
   ident := coalesce(eid, em);
   IF ident IS NULL THEN e := 'EMPLOYEE_REQUIRED'; END IF;
  END IF;
  IF e IS NULL THEN
   SELECT d.id INTO br FROM public.departments d WHERE d.code=btrim(rec->>'branch_code') AND d.is_active LIMIT 1;
   IF br IS NULL THEN e := 'BRANCH_NOT_FOUND'; END IF;
  END IF;
  IF e IS NULL THEN
   IF k.tenant_id = public.kpi_ops_tenant() THEN
    SELECT p.user_id INTO uid FROM public.profiles p WHERE p.department_id=br
      AND CASE WHEN eid IS NOT NULL THEN p.employee_id=eid ELSE lower(p.email)=em END LIMIT 1;
   ELSE
    SELECT s.user_id INTO uid FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id AND p.department_id=s.branch_id AND p.tenant_id=s.tenant_id
    WHERE s.active AND s.tenant_id=k.tenant_id AND s.branch_id=br
      AND CASE WHEN eid IS NOT NULL THEN p.employee_id=eid ELSE lower(p.email)=em END LIMIT 1;
   END IF;
   IF uid IS NULL THEN e := 'EMPLOYEE_NOT_FOUND'; END IF;
  END IF;
  IF e IS NULL THEN
   IF coalesce(rec->>'period','') !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN e := 'INVALID_PERIOD'; ELSE per := (rec->>'period' || '-01')::date; END IF;
  END IF;
  IF e IS NULL THEN
   SELECT m.code, m.unit INTO mcode, munit FROM public.mygrowth_kpi_metrics m WHERE m.tenant_id=k.tenant_id AND m.code=upper(btrim(rec->>'metric_code')) AND m.active;
   IF mcode IS NULL THEN e := 'METRIC_NOT_FOUND'; END IF;
  END IF;
  IF e IS NULL THEN
   IF jsonb_typeof(rec->'value')<>'number' THEN e := 'INVALID_VALUE'; ELSE val := (rec->>'value')::numeric; END IF;
  END IF;
  IF e IS NULL AND nullif(btrim(rec->>'unit'),'') IS NOT NULL AND btrim(rec->>'unit')<>munit THEN e := 'UNIT_MISMATCH'; END IF;
  IF e IS NULL THEN
   INSERT INTO public.mygrowth_kpi_values(tenant_id,user_id,branch_id,period,metric_code,value,unit,vendor_id,received_at)
   VALUES (k.tenant_id,uid,br,per,mcode,val,munit,k.vendor_id,now())
   ON CONFLICT (user_id,period,metric_code) DO UPDATE SET value=excluded.value, branch_id=excluded.branch_id, vendor_id=excluded.vendor_id, received_at=now();
   ok := ok + 1;
  ELSE
   errs := errs || jsonb_build_object('index',i,'code',e);
  END IF;
  i := i + 1;
 END LOOP;
 INSERT INTO public.mygrowth_kpi_ingest_logs(vendor_id,key_id,total,succeeded,failed,status,errors)
 VALUES (k.vendor_id,k.id,total,ok,total-ok,CASE WHEN ok=total THEN 'success' WHEN ok=0 THEN 'failed' ELSE 'partial' END, errs);
 RETURN jsonb_build_object('total',total,'succeeded',ok,'failed',total-ok,'errors',errs);
END $function$;