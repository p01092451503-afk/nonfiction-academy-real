-- ===== courses =====
DROP POLICY IF EXISTS "Teachers can create courses" ON public.courses;
DROP POLICY IF EXISTS "Owners/admins can update courses" ON public.courses;

CREATE POLICY "Only admins can create courses"
ON public.courses FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only admins can update courses"
ON public.courses FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ===== course_contents =====
DROP POLICY IF EXISTS "Instructors/admins can delete contents" ON public.course_contents;
DROP POLICY IF EXISTS "Instructors/admins can manage contents" ON public.course_contents;

CREATE POLICY "Only admins manage course contents"
ON public.course_contents FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ===== course_i18n =====
DROP POLICY IF EXISTS "Admins and teachers can manage course i18n" ON public.course_i18n;
CREATE POLICY "Only admins manage course i18n"
ON public.course_i18n FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ===== course_content_i18n =====
DROP POLICY IF EXISTS "Admins and teachers can manage content i18n" ON public.course_content_i18n;
CREATE POLICY "Only admins manage content i18n"
ON public.course_content_i18n FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ===== assessments =====
DROP POLICY IF EXISTS "Teachers/admins can manage assessments" ON public.assessments;
CREATE POLICY "Only admins manage assessments"
ON public.assessments FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ===== assessment_questions =====
DROP POLICY IF EXISTS "Teachers/admins can manage questions" ON public.assessment_questions;
CREATE POLICY "Only admins manage assessment questions"
ON public.assessment_questions FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ===== assessment_i18n =====
DROP POLICY IF EXISTS "Teachers/admins can manage assessment i18n" ON public.assessment_i18n;
CREATE POLICY "Only admins manage assessment i18n"
ON public.assessment_i18n FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ===== assessment_question_i18n =====
DROP POLICY IF EXISTS "Teachers/admins can manage question i18n" ON public.assessment_question_i18n;
CREATE POLICY "Only admins manage question i18n"
ON public.assessment_question_i18n FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ===== completion_criteria =====
DROP POLICY IF EXISTS "Admins/teachers can manage criteria" ON public.completion_criteria;
CREATE POLICY "Only admins manage completion criteria"
ON public.completion_criteria FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ===== certificate_templates =====
DROP POLICY IF EXISTS "Admins/teachers can manage templates" ON public.certificate_templates;
CREATE POLICY "Only admins manage certificate templates"
ON public.certificate_templates FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));