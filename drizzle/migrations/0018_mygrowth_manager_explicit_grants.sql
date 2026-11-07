REVOKE ALL ON public.mygrowth_manager_coaching FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mygrowth_manager_coaching TO authenticated;
GRANT ALL ON public.mygrowth_manager_coaching TO service_role;