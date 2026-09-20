CREATE OR REPLACE FUNCTION public.run_daily_data_backup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  DELETE FROM public.daily_data_backups WHERE backup_date = d;

  INSERT INTO public.daily_data_backups (backup_date, source_table, row_id, row_data)
  SELECT d, 'profiles', p.user_id::text, to_jsonb(p) FROM public.profiles p;

  INSERT INTO public.daily_data_backups (backup_date, source_table, row_id, row_data)
  SELECT d, 'enrollments', e.id::text, to_jsonb(e) FROM public.enrollments e;

  INSERT INTO public.daily_data_backups (backup_date, source_table, row_id, row_data)
  SELECT d, 'content_progress', c.id::text, to_jsonb(c) FROM public.content_progress c;

  DELETE FROM public.daily_data_backups WHERE backup_date < d - 7;
END;
$$;