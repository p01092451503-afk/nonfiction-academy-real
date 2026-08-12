CREATE OR REPLACE FUNCTION public.can_view_assessment_question_i18n(_question_id uuid, _user_id uuid)
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
      FROM public.assessment_questions q
      JOIN public.assessments a ON a.id = q.assessment_id
      JOIN public.enrollments e ON e.course_id = a.course_id AND e.user_id = _user_id
      WHERE q.id = _question_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_assessment_question_i18n(uuid, uuid) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Enrolled users can view question i18n" ON public.assessment_question_i18n;

CREATE POLICY "Enrolled users can view question i18n"
ON public.assessment_question_i18n
FOR SELECT
TO authenticated
USING (public.can_view_assessment_question_i18n(question_id, auth.uid()));

GRANT SELECT ON public.assessment_question_i18n TO authenticated;
GRANT ALL ON public.assessment_question_i18n TO service_role;