-- 1) Scan history (trend)
CREATE TABLE public.scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  scanned_by uuid,
  ok_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  total_findings integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scan_results TO authenticated;
GRANT ALL ON public.scan_results TO service_role;
ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view scan history"
  ON public.scan_results FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_scan_results_scanned_at ON public.scan_results (scanned_at DESC);

-- 2) Auto-fix audit log
CREATE TABLE public.scan_fix_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by uuid,
  check_id text NOT NULL,
  fix_action text NOT NULL,
  affected_count integer NOT NULL DEFAULT 0,
  request_payload jsonb,
  result_payload jsonb,
  success boolean NOT NULL DEFAULT true,
  error_message text
);

GRANT SELECT ON public.scan_fix_audit TO authenticated;
GRANT ALL ON public.scan_fix_audit TO service_role;
ALTER TABLE public.scan_fix_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fix audit"
  ON public.scan_fix_audit FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_scan_fix_audit_applied_at ON public.scan_fix_audit (applied_at DESC);
