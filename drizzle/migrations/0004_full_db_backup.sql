CREATE OR REPLACE FUNCTION public._backup_tables()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.relname::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname NOT IN ('daily_data_backups')
    AND EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary)
  ORDER BY c.relname;
$$;
REVOKE ALL ON FUNCTION public._backup_tables() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.run_daily_data_backup()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
  t text;
  pk text;
BEGIN
  DELETE FROM public.daily_data_backups WHERE backup_date = d;
  FOR t IN SELECT public._backup_tables() LOOP
    SELECT string_agg(format('%I::text', a.attname), ' || ''|'' || ' ORDER BY a.attnum) INTO pk
    FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = format('public.%I', t)::regclass AND i.indisprimary;
    EXECUTE format(
      'INSERT INTO public.daily_data_backups (backup_date, source_table, row_id, row_data)
       SELECT $1, %L, %s, to_jsonb(x) FROM public.%I x', t, pk, t) USING d;
  END LOOP;
  DELETE FROM public.daily_data_backups WHERE backup_date < d - 7;
END;
$$;
REVOKE ALL ON FUNCTION public.run_daily_data_backup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_daily_data_backup() TO service_role;

CREATE OR REPLACE FUNCTION public._restore_one_table(p_backup_date date, p_table text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rel regclass := format('public.%I', p_table)::regclass;
  pk_cols text; set_cols text; all_cols text; sql text;
  r record; n integer := 0;
BEGIN
  SELECT string_agg(format('%I', a.attname), ',') INTO pk_cols
  FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = rel AND i.indisprimary;

  SELECT string_agg(format('%I', a.attname), ','),
         string_agg(CASE WHEN NOT (a.attnum = ANY(i.indkey)) THEN format('%1$I = EXCLUDED.%1$I', a.attname) END, ',')
  INTO all_cols, set_cols
  FROM pg_attribute a JOIN pg_index i ON i.indrelid = a.attrelid AND i.indisprimary
  WHERE a.attrelid = rel AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';

  sql := format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT (%s) DO %s',
    p_table, all_cols, all_cols, p_table, pk_cols,
    CASE WHEN set_cols IS NULL THEN 'NOTHING' ELSE 'UPDATE SET ' || set_cols END);

  FOR r IN SELECT row_data FROM public.daily_data_backups WHERE backup_date = p_backup_date AND source_table = p_table LOOP
    BEGIN
      EXECUTE sql USING r.row_data;
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; -- 참조 대상이 사라진 행 등은 건너뜀
    END;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._restore_one_table(date, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.restore_data_backup(p_backup_date date, p_source_table text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_available integer; v_count integer := 0; t text; pass int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin role required';
  END IF;

  SELECT count(*) INTO v_available FROM public.daily_data_backups b
  WHERE b.backup_date = p_backup_date AND (p_source_table = '__all__' OR b.source_table = p_source_table);
  IF v_available = 0 THEN
    RAISE EXCEPTION 'no backup found for % on %', p_source_table, p_backup_date;
  END IF;

  IF p_source_table = '__all__' THEN
    -- 테이블 간 참조 순서 문제를 줄이기 위해 2회 반복 적용
    FOR pass IN 1..2 LOOP
      v_count := 0;
      FOR t IN SELECT DISTINCT source_table FROM public.daily_data_backups
               WHERE backup_date = p_backup_date AND source_table IN (SELECT public._backup_tables()) LOOP
        v_count := v_count + public._restore_one_table(p_backup_date, t);
      END LOOP;
    END LOOP;
  ELSE
    IF p_source_table NOT IN (SELECT public._backup_tables()) THEN
      RAISE EXCEPTION 'unsupported table: %', p_source_table;
    END IF;
    v_count := public._restore_one_table(p_backup_date, p_source_table);
  END IF;

  RETURN jsonb_build_object('source_table', p_source_table, 'backup_date', p_backup_date,
    'backup_rows', v_available, 'restored_rows', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.restore_data_backup(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_data_backup(date, text) TO authenticated;