DROP POLICY IF EXISTS "Admins read all growth events" ON public.mygrowth_events;
DROP POLICY IF EXISTS "Users read own growth events" ON public.mygrowth_events;
CREATE POLICY "Reviewers read own growth events" ON public.mygrowth_events FOR SELECT TO authenticated USING (public.is_mygrowth_reviewer() AND user_id = auth.uid());
REVOKE ALL ON public.mygrowth_reviewers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mygrowth_reviewers TO service_role;
COMMENT ON TABLE public.mygrowth_events IS 'Reviewer-only isolated My Growth records; existing admin roles never grant access.';