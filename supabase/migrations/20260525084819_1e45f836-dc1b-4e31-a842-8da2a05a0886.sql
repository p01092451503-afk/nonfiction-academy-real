
-- Error alert deduplication & config
CREATE TABLE IF NOT EXISTS public.error_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  message TEXT,
  source TEXT,
  url TEXT,
  user_id UUID,
  user_email TEXT,
  user_agent TEXT,
  stack TEXT,
  severity TEXT DEFAULT 'error',
  occurrence_count INT NOT NULL DEFAULT 1,
  last_alerted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_alert_fp_time ON public.error_alert_log (fingerprint, last_alerted_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_alert_created ON public.error_alert_log (created_at DESC);

ALTER TABLE public.error_alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view error logs"
ON public.error_alert_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
