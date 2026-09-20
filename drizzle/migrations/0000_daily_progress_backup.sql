CREATE TABLE IF NOT EXISTS public.daily_data_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  source_table TEXT NOT NULL,
  row_id TEXT,
  row_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_data_backups_date ON public.daily_data_backups (backup_date);
CREATE INDEX IF NOT EXISTS idx_daily_data_backups_table ON public.daily_data_backups (source_table);

GRANT SELECT ON public.daily_data_backups TO authenticated;
GRANT ALL ON public.daily_data_backups TO service_role;

ALTER TABLE public.daily_data_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view backups"
ON public.daily_data_backups
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

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
  SELECT d, 'profiles', p.id::text, to_jsonb(p) FROM public.profiles p;

  INSERT INTO public.daily_data_backups (backup_date, source_table, row_id, row_data)
  SELECT d, 'enrollments', e.id::text, to_jsonb(e) FROM public.enrollments e;

  INSERT INTO public.daily_data_backups (backup_date, source_table, row_id, row_data)
  SELECT d, 'content_progress', c.id::text, to_jsonb(c) FROM public.content_progress c;

  DELETE FROM public.daily_data_backups WHERE backup_date < d - 7;
END;
$$;

REVOKE ALL ON FUNCTION public.run_daily_data_backup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_daily_data_backup() TO service_role;