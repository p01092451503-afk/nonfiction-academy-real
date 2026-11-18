CREATE TABLE public.mygrowth_kpi_vendors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 allowed_ips text[] NOT NULL DEFAULT '{}',
 active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id, name)
);
CREATE TABLE public.mygrowth_kpi_api_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 vendor_id uuid NOT NULL REFERENCES public.mygrowth_kpi_vendors(id) ON DELETE CASCADE,
 label text NOT NULL DEFAULT '',
 key_prefix text NOT NULL,
 key_hash text NOT NULL UNIQUE,
 is_test boolean NOT NULL DEFAULT false,
 created_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz,
 revoked_at timestamptz
);
CREATE TABLE public.mygrowth_kpi_metrics (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 unit text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 20),
 description text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id, code)
);
CREATE TABLE public.mygrowth_kpi_values (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL REFERENCES public.departments(id),
 period date NOT NULL CHECK (extract(day FROM period)=1),
 metric_code text NOT NULL,
 value numeric NOT NULL,
 unit text NOT NULL,
 vendor_id uuid NOT NULL REFERENCES public.mygrowth_kpi_vendors(id),
 received_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id, metric_code) REFERENCES public.mygrowth_kpi_metrics(tenant_id, code),
 UNIQUE (user_id, period, metric_code)
);
CREATE TABLE public.mygrowth_kpi_ingest_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 vendor_id uuid REFERENCES public.mygrowth_kpi_vendors(id) ON DELETE SET NULL,
 key_id uuid REFERENCES public.mygrowth_kpi_api_keys(id) ON DELETE SET NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 total integer NOT NULL DEFAULT 0,
 succeeded integer NOT NULL DEFAULT 0,
 failed integer NOT NULL DEFAULT 0,
 status text NOT NULL CHECK (status IN ('success','partial','failed','rejected')),
 errors jsonb NOT NULL DEFAULT '[]'
);
GRANT ALL ON public.mygrowth_kpi_vendors, public.mygrowth_kpi_api_keys, public.mygrowth_kpi_metrics, public.mygrowth_kpi_values, public.mygrowth_kpi_ingest_logs TO service_role;
ALTER TABLE public.mygrowth_kpi_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mygrowth_kpi_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mygrowth_kpi_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mygrowth_kpi_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mygrowth_kpi_ingest_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.mygrowth_kpi_values (branch_id, period);
CREATE INDEX ON public.mygrowth_kpi_ingest_logs (vendor_id, received_at DESC);

CREATE FUNCTION public.mygrowth_kpi_edu_tenant() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid;
BEGIN
 IF NOT public.mygrowth_can_appoint() THEN RAISE EXCEPTION '본사 교육팀만 사용할 수 있습니다.' USING ERRCODE='42501'; END IF;
 SELECT e.tenant_id INTO t FROM public.mygrowth_education_team e WHERE e.user_id=auth.uid() AND e.active;
 RETURN t;
END $$;

CREATE FUNCTION public.mygrowth_kpi_admin_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid := public.mygrowth_kpi_edu_tenant();
BEGIN
 RETURN jsonb_build_object(
  'vendors', coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'active',v.active,'allowed_ips',v.allowed_ips,'created_at',v.created_at,
     'keys', coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'label',k.label,'key_prefix',k.key_prefix,'is_test',k.is_test,'created_at',k.created_at,'last_used_at',k.last_used_at,'revoked_at',k.revoked_at) ORDER BY k.created_at DESC) FROM public.mygrowth_kpi_api_keys k WHERE k.vendor_id=v.id),'[]'::jsonb)) ORDER BY v.created_at) FROM public.mygrowth_kpi_vendors v WHERE v.tenant_id=t),'[]'::jsonb),
  'metrics', coalesce((SELECT jsonb_agg(jsonb_build_object('code',m.code,'name',m.name,'unit',m.unit,'description',m.description,'active',m.active) ORDER BY m.code) FROM public.mygrowth_kpi_metrics m WHERE m.tenant_id=t),'[]'::jsonb),
  'logs', coalesce((SELECT jsonb_agg(x ORDER BY x->>'received_at' DESC) FROM (SELECT jsonb_build_object('id',l.id,'vendor',v.name,'received_at',l.received_at,'total',l.total,'succeeded',l.succeeded,'failed',l.failed,'status',l.status,'errors',l.errors) x FROM public.mygrowth_kpi_ingest_logs l JOIN public.mygrowth_kpi_vendors v ON v.id=l.vendor_id WHERE v.tenant_id=t ORDER BY l.received_at DESC LIMIT 30) s),'[]'::jsonb));
END $$;

CREATE FUNCTION public.mygrowth_kpi_save_vendor(_id uuid, _name text, _allowed_ips text[], _active boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid := public.mygrowth_kpi_edu_tenant(); r uuid; ip text;
BEGIN
 IF _name IS NULL OR length(btrim(_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '업체 이름을 확인하십시오.' USING ERRCODE='22023'; END IF;
 FOREACH ip IN ARRAY coalesce(_allowed_ips,'{}') LOOP PERFORM ip::inet; END LOOP;
 IF _id IS NULL THEN
  INSERT INTO public.mygrowth_kpi_vendors(tenant_id,name,allowed_ips,active,created_by) VALUES (t,btrim(_name),coalesce(_allowed_ips,'{}'),coalesce(_active,true),auth.uid()) RETURNING id INTO r;
 ELSE
  UPDATE public.mygrowth_kpi_vendors SET name=btrim(_name), allowed_ips=coalesce(_allowed_ips,'{}'), active=coalesce(_active,active) WHERE id=_id AND tenant_id=t RETURNING id INTO r;
  IF r IS NULL THEN RAISE EXCEPTION '업체를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN r;
END $$;

CREATE FUNCTION public.mygrowth_kpi_issue_key(_vendor uuid, _label text, _is_test boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid := public.mygrowth_kpi_edu_tenant(); raw text; kid uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.mygrowth_kpi_vendors v WHERE v.id=_vendor AND v.tenant_id=t) THEN RAISE EXCEPTION '업체를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
 raw := CASE WHEN coalesce(_is_test,false) THEN 'nfk_test_' ELSE 'nfk_live_' END || replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 INSERT INTO public.mygrowth_kpi_api_keys(vendor_id,label,key_prefix,key_hash,is_test,created_by)
 VALUES (_vendor, left(coalesce(_label,''),60), left(raw,13), encode(sha256(convert_to(raw,'UTF8')),'hex'), coalesce(_is_test,false), auth.uid()) RETURNING id INTO kid;
 RETURN jsonb_build_object('id',kid,'key',raw);
END $$;

CREATE FUNCTION public.mygrowth_kpi_revoke_key(_key uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid := public.mygrowth_kpi_edu_tenant();
BEGIN
 UPDATE public.mygrowth_kpi_api_keys k SET revoked_at=now() FROM public.mygrowth_kpi_vendors v WHERE k.id=_key AND v.id=k.vendor_id AND v.tenant_id=t AND k.revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION '폐기할 키를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION public.mygrowth_kpi_save_metric(_code text, _name text, _unit text, _description text, _active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid := public.mygrowth_kpi_edu_tenant();
BEGIN
 INSERT INTO public.mygrowth_kpi_metrics(tenant_id,code,name,unit,description,active) VALUES (t,upper(btrim(_code)),btrim(_name),btrim(_unit),coalesce(_description,''),coalesce(_active,true))
 ON CONFLICT (tenant_id,code) DO UPDATE SET name=excluded.name, unit=excluded.unit, description=excluded.description, active=excluded.active;
END $$;

CREATE FUNCTION public.mygrowth_kpi_values_list(_from date, _to date)
RETURNS TABLE(user_id uuid, full_name text, branch_name text, period date, metric_code text, metric_name text, value numeric, unit text, vendor text, received_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE edu boolean;
BEGIN
 IF NOT public.is_mygrowth_reviewer() THEN RAISE EXCEPTION '접근 권한이 없습니다.' USING ERRCODE='42501'; END IF;
 edu := public.mygrowth_can_appoint();
 RETURN QUERY SELECT kv.user_id, coalesce(p.full_name,'이름 없음'), d.name, kv.period, kv.metric_code, m.name, kv.value, kv.unit, v.name, kv.received_at
 FROM public.mygrowth_kpi_values kv
 JOIN public.mygrowth_staff_registry s ON s.user_id=kv.user_id AND s.active AND s.branch_id=kv.branch_id AND s.tenant_id=kv.tenant_id
 JOIN public.profiles p ON p.user_id=s.user_id AND p.department_id=s.branch_id
 JOIN public.departments d ON d.id=kv.branch_id
 JOIN public.mygrowth_kpi_metrics m ON m.tenant_id=kv.tenant_id AND m.code=kv.metric_code
 JOIN public.mygrowth_kpi_vendors v ON v.id=kv.vendor_id
 WHERE kv.period BETWEEN date_trunc('month',coalesce(_from,'2000-01-01'::date))::date AND coalesce(_to,'2100-01-01'::date)
  AND (kv.user_id=auth.uid() OR (edu AND kv.tenant_id IN (SELECT e.tenant_id FROM public.mygrowth_education_team e WHERE e.user_id=auth.uid() AND e.active))
       OR public.mygrowth_has_branch_role(kv.branch_id,'trainer') OR public.mygrowth_has_branch_role(kv.branch_id,'store_manager'))
 ORDER BY kv.period DESC, d.name, p.full_name, kv.metric_code;
END $$;

CREATE FUNCTION public.mygrowth_kpi_ingest(_key_hash text, _client_ip text, _records jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k record; rec jsonb; i int := 0; ok int := 0; errs jsonb := '[]'; uid uuid; br uuid; per date; met record; val numeric; e text; ident text; total int;
BEGIN
 SELECT ak.id, ak.vendor_id, v.tenant_id, v.allowed_ips, v.active INTO k FROM public.mygrowth_kpi_api_keys ak JOIN public.mygrowth_kpi_vendors v ON v.id=ak.vendor_id WHERE ak.key_hash=_key_hash AND ak.revoked_at IS NULL;
 IF k.id IS NULL OR NOT k.active THEN RETURN jsonb_build_object('error','INVALID_API_KEY'); END IF;
 IF cardinality(k.allowed_ips)>0 AND NOT EXISTS (SELECT 1 FROM unnest(k.allowed_ips) a WHERE _client_ip IS NOT NULL AND _client_ip::inet <<= a::inet) THEN
  INSERT INTO public.mygrowth_kpi_ingest_logs(vendor_id,key_id,status,errors) VALUES (k.vendor_id,k.id,'rejected',jsonb_build_array(jsonb_build_object('code','IP_NOT_ALLOWED')));
  RETURN jsonb_build_object('error','IP_NOT_ALLOWED');
 END IF;
 UPDATE public.mygrowth_kpi_api_keys SET last_used_at=now() WHERE id=k.id;
 total := jsonb_array_length(_records);
 FOR rec IN SELECT * FROM jsonb_array_elements(_records) LOOP
  e := NULL; uid := NULL; br := NULL; per := NULL; met := NULL; val := NULL;
  ident := coalesce(nullif(btrim(rec->>'employee_id'),''), nullif(lower(btrim(rec->>'email')),''));
  IF ident IS NULL THEN e := 'EMPLOYEE_REQUIRED';
  ELSE
   SELECT d.id INTO br FROM public.departments d WHERE d.code=btrim(rec->>'branch_code') AND d.tenant_id=k.tenant_id AND d.is_active;
   IF br IS NULL THEN e := 'BRANCH_NOT_FOUND'; END IF;
  END IF;
  IF e IS NULL THEN
   SELECT s.user_id INTO uid FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id AND p.department_id=s.branch_id AND p.tenant_id=s.tenant_id
   WHERE s.active AND s.tenant_id=k.tenant_id AND s.branch_id=br
     AND ((rec ? 'employee_id' AND nullif(btrim(rec->>'employee_id'),'') IS NOT NULL AND p.employee_id=btrim(rec->>'employee_id')) OR (nullif(btrim(rec->>'employee_id'),'') IS NULL AND lower(p.email)=lower(btrim(rec->>'email'))));
   IF uid IS NULL THEN e := 'EMPLOYEE_NOT_FOUND'; END IF;
  END IF;
  IF e IS NULL THEN
   IF coalesce(rec->>'period','') !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN e := 'INVALID_PERIOD'; ELSE per := (rec->>'period' || '-01')::date; END IF;
  END IF;
  IF e IS NULL THEN
   SELECT * INTO met FROM public.mygrowth_kpi_metrics m WHERE m.tenant_id=k.tenant_id AND m.code=upper(btrim(rec->>'metric_code')) AND m.active;
   IF met.code IS NULL THEN e := 'METRIC_NOT_FOUND'; END IF;
  END IF;
  IF e IS NULL THEN
   IF jsonb_typeof(rec->'value')<>'number' THEN e := 'INVALID_VALUE'; ELSE val := (rec->>'value')::numeric; END IF;
  END IF;
  IF e IS NULL AND nullif(btrim(rec->>'unit'),'') IS NOT NULL AND btrim(rec->>'unit')<>met.unit THEN e := 'UNIT_MISMATCH'; END IF;
  IF e IS NULL THEN
   INSERT INTO public.mygrowth_kpi_values(tenant_id,user_id,branch_id,period,metric_code,value,unit,vendor_id,received_at)
   VALUES (k.tenant_id,uid,br,per,met.code,val,met.unit,k.vendor_id,now())
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
END $$;

REVOKE ALL ON FUNCTION public.mygrowth_kpi_edu_tenant(), public.mygrowth_kpi_admin_overview(), public.mygrowth_kpi_save_vendor(uuid,text,text[],boolean), public.mygrowth_kpi_issue_key(uuid,text,boolean), public.mygrowth_kpi_revoke_key(uuid), public.mygrowth_kpi_save_metric(text,text,text,text,boolean), public.mygrowth_kpi_values_list(date,date), public.mygrowth_kpi_ingest(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mygrowth_kpi_admin_overview(), public.mygrowth_kpi_save_vendor(uuid,text,text[],boolean), public.mygrowth_kpi_issue_key(uuid,text,boolean), public.mygrowth_kpi_revoke_key(uuid), public.mygrowth_kpi_save_metric(text,text,text,text,boolean), public.mygrowth_kpi_values_list(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mygrowth_kpi_ingest(text,text,jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.mygrowth_kpi_ingest(text,text,jsonb) FROM authenticated;