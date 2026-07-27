CREATE POLICY "Admins can delete enrollments"
ON public.enrollments
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));