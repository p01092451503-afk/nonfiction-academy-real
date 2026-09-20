-- 관리자용 백업 요약 조회 함수 (admin/super_admin만 결과 반환)
CREATE OR REPLACE FUNCTION public.get_backup_summary()
RETURNS TABLE (backup_date date, source_table text, row_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.backup_date, b.source_table, count(*)::bigint AS row_count
  FROM public.daily_data_backups b
  WHERE public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'super_admin')
  GROUP BY b.backup_date, b.source_table
  ORDER BY b.backup_date DESC, b.source_table;
$$;

REVOKE ALL ON FUNCTION public.get_backup_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_backup_summary() TO authenticated;

-- 관리자가 수동으로 백업을 즉시 실행할 수 있는 래퍼 (권한 검사 포함)
CREATE OR REPLACE FUNCTION public.trigger_daily_data_backup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  ) THEN
    RAISE EXCEPTION 'permission denied: admin role required';
  END IF;
  PERFORM public.run_daily_data_backup();
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_daily_data_backup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_daily_data_backup() TO authenticated;
