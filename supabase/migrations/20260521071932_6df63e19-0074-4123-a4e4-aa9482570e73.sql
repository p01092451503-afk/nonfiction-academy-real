-- Platform update push notifications
CREATE TABLE IF NOT EXISTS public.platform_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','important','critical')),
  require_reload BOOLEAN NOT NULL DEFAULT true,
  target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all','admin','student','teacher')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_platform_updates_active_created
  ON public.platform_updates (active, created_at DESC);

ALTER TABLE public.platform_updates ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read active, non-expired updates
CREATE POLICY "Anyone can view active platform updates"
ON public.platform_updates FOR SELECT
TO authenticated
USING (
  active = true
  AND (expires_at IS NULL OR expires_at > now())
);

-- Admins manage
CREATE POLICY "Admins can insert platform updates"
ON public.platform_updates FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Admins can update platform updates"
ON public.platform_updates FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Admins can delete platform updates"
ON public.platform_updates FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_updates;