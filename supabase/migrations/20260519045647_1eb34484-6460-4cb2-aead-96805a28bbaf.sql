
-- 1) Helper functions
CREATE OR REPLACE FUNCTION public.get_leader_scope_dept_ids(_leader_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_dept AS (
    SELECT d.id, d.parent_department_id
    FROM public.profiles p
    JOIN public.departments d ON d.id = p.department_id
    WHERE p.user_id = _leader_id
  ),
  branch AS (
    SELECT COALESCE(parent_department_id, id) AS branch_id FROM my_dept
  )
  SELECT branch_id FROM branch
  UNION
  SELECT d.id FROM public.departments d
  JOIN branch b ON d.parent_department_id = b.branch_id;
$$;

CREATE OR REPLACE FUNCTION public.is_user_in_leader_scope(_leader_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _target_user_id
      AND p.department_id IN (SELECT public.get_leader_scope_dept_ids(_leader_id))
  );
$$;

-- 2) enrollments: SELECT (replace teacher-wide access with scoped access)
DROP POLICY IF EXISTS "Users can view own enrollments" ON public.enrollments;
CREATE POLICY "Users own, admins all, teachers scoped view enrollments"
ON public.enrollments
FOR SELECT
TO public
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'teacher'::app_role)
      AND public.is_user_in_leader_scope(auth.uid(), user_id))
);

-- 2b) enrollments: UPDATE scoped
DROP POLICY IF EXISTS "Admins and teachers can update enrollments" ON public.enrollments;
CREATE POLICY "Admins all, teachers scoped update enrollments"
ON public.enrollments
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'teacher'::app_role)
      AND public.is_user_in_leader_scope(auth.uid(), user_id))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'teacher'::app_role)
      AND public.is_user_in_leader_scope(auth.uid(), user_id))
);

-- 3) content_progress: SELECT scoped for teachers
DROP POLICY IF EXISTS "Admins/teachers can view progress" ON public.content_progress;
CREATE POLICY "Admins all, teachers scoped view content_progress"
ON public.content_progress
FOR SELECT
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'teacher'::app_role)
      AND public.is_user_in_leader_scope(auth.uid(), user_id))
);

-- 4) assignment_submissions: scope teacher access to in-group students
DROP POLICY IF EXISTS "Teachers/admins can view/grade" ON public.assignment_submissions;
CREATE POLICY "Admins all, teachers scoped manage assignment_submissions"
ON public.assignment_submissions
FOR ALL
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'teacher'::app_role)
      AND public.is_user_in_leader_scope(auth.uid(), student_id))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'teacher'::app_role)
      AND public.is_user_in_leader_scope(auth.uid(), student_id))
);

-- 5) profiles: replace "teachers can view their own students" with scope-based
DROP POLICY IF EXISTS "Teachers can view profiles of their students" ON public.profiles;
CREATE POLICY "Teachers can view profiles in their group scope"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND public.is_user_in_leader_scope(auth.uid(), user_id)
);
