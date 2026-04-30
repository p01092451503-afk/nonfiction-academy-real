REVOKE EXECUTE ON FUNCTION public.assign_track_to_user(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assign_track_to_department(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.assign_track_to_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_track_to_department(uuid, uuid) TO authenticated;