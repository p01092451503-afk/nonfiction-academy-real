
ALTER TABLE public.error_alert_log
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS ai_explanation text,
  ADD COLUMN IF NOT EXISTS ai_lovable_prompt text,
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

ALTER TABLE public.error_alert_log
  DROP CONSTRAINT IF EXISTS error_alert_log_status_check;
ALTER TABLE public.error_alert_log
  ADD CONSTRAINT error_alert_log_status_check
    CHECK (status IN ('open','in_progress','resolved','ignored'));

CREATE INDEX IF NOT EXISTS error_alert_log_status_idx ON public.error_alert_log(status, last_alerted_at DESC);

GRANT UPDATE ON public.error_alert_log TO authenticated;

DROP POLICY IF EXISTS "Admins can update error logs" ON public.error_alert_log;
CREATE POLICY "Admins can update error logs"
  ON public.error_alert_log
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
