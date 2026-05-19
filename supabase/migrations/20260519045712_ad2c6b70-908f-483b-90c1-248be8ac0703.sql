
REVOKE EXECUTE ON FUNCTION public.get_leader_scope_dept_ids(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_user_in_leader_scope(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_leader_scope_dept_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_in_leader_scope(uuid, uuid) TO authenticated;
