CREATE OR REPLACE FUNCTION public.mygrowth_kpi_ingest(_key_hash text, _client_ip text, _records jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k record; rec jsonb; i int := 0; ok int := 0; errs jsonb := '[]'; uid uuid; br uuid; per date; mcode text; munit text; val numeric; e text; ident text; total int;
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
  e := NULL; uid := NULL; br := NULL; per := NULL; mcode := NULL; munit := NULL; val := NULL;
  IF jsonb_typeof(rec)<>'object' THEN e := 'INVALID_RECORD'; END IF;
  IF e IS NULL THEN
   ident := coalesce(nullif(btrim(rec->>'employee_id'),''), nullif(lower(btrim(rec->>'email')),''));
   IF ident IS NULL THEN e := 'EMPLOYEE_REQUIRED'; END IF;
  END IF;
  IF e IS NULL THEN
   SELECT d.id INTO br FROM public.departments d WHERE d.code=btrim(rec->>'branch_code') AND d.is_active LIMIT 1;
   IF br IS NULL THEN e := 'BRANCH_NOT_FOUND'; END IF;
  END IF;
  IF e IS NULL THEN
   SELECT s.user_id INTO uid FROM public.mygrowth_staff_registry s JOIN public.profiles p ON p.user_id=s.user_id AND p.department_id=s.branch_id AND p.tenant_id=s.tenant_id
   WHERE s.active AND s.tenant_id=k.tenant_id AND s.branch_id=br
     AND CASE WHEN nullif(btrim(rec->>'employee_id'),'') IS NOT NULL THEN p.employee_id=btrim(rec->>'employee_id') ELSE lower(p.email)=lower(btrim(rec->>'email')) END
   LIMIT 1;
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
END $$;
REVOKE ALL ON FUNCTION public.mygrowth_kpi_ingest(text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mygrowth_kpi_ingest(text,text,jsonb) TO service_role;