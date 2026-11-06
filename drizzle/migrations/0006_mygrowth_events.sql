CREATE TABLE public.mygrowth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('training','coaching','plan','followup')),
  title text NOT NULL,
  detail text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'done' CHECK (status IN ('done','in_progress','scheduled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mygrowth_events_user_idx ON public.mygrowth_events (user_id, occurred_on DESC);
GRANT SELECT ON public.mygrowth_events TO authenticated;
GRANT ALL ON public.mygrowth_events TO service_role;
ALTER TABLE public.mygrowth_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own growth events" ON public.mygrowth_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read all growth events" ON public.mygrowth_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));