
DROP POLICY IF EXISTS "Users can view own migration employee" ON public.migration_employees;
DROP POLICY IF EXISTS "Users can view own migration completions" ON public.migration_completions;

CREATE POLICY "Users can view own migration employee"
ON public.migration_employees FOR SELECT
TO authenticated
USING (lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '')));

CREATE POLICY "Users can view own migration completions"
ON public.migration_completions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.migration_employees me
    WHERE me.employee_id = migration_completions.employee_id
      AND lower(me.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
);
