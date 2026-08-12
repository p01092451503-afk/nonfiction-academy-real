REVOKE EXECUTE ON FUNCTION public.can_view_assessment_question_i18n(uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.can_view_assessment_i18n(_assessment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'super_admin'::app_role)
    OR public.has_role(_user_id, 'teacher'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.assessments a
      JOIN public.enrollments e ON e.course_id = a.course_id AND e.user_id = _user_id
      WHERE a.id = _assessment_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_assessment_i18n(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_view_assessment_i18n(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Enrolled users can view assessment i18n" ON public.assessment_i18n;

CREATE POLICY "Enrolled users can view assessment i18n"
ON public.assessment_i18n
FOR SELECT
TO authenticated
USING (public.can_view_assessment_i18n(assessment_id, auth.uid()));

GRANT SELECT ON public.assessment_i18n TO authenticated;
GRANT ALL ON public.assessment_i18n TO service_role;