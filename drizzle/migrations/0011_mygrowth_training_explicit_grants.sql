REVOKE ALL ON public.mygrowth_trainings,public.mygrowth_training_targets FROM anon,authenticated;
GRANT SELECT ON public.mygrowth_trainings,public.mygrowth_training_targets TO authenticated;
GRANT ALL ON public.mygrowth_trainings,public.mygrowth_training_targets TO service_role;