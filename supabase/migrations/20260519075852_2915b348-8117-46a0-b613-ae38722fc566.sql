CREATE POLICY "Teachers can view roles in their group scope"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND public.is_user_in_leader_scope(auth.uid(), user_id)
);