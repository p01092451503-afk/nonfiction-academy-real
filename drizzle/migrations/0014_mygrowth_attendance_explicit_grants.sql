REVOKE ALL ON public.mygrowth_training_attendance_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mygrowth_training_attendance_audit TO authenticated;
GRANT ALL ON public.mygrowth_training_attendance_audit TO service_role;