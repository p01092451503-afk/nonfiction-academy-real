CREATE OR REPLACE FUNCTION public.update_enrollment_progress_on_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id UUID;
  v_progress NUMERIC := 0;
  v_completed BOOLEAN := false;
BEGIN
  SELECT cc.course_id
    INTO v_course_id
  FROM public.course_contents cc
  WHERE cc.id = NEW.content_id;

  IF v_course_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(MAX(CASE WHEN cp.completed = true THEN 100 ELSE COALESCE(cp.progress_percentage, 0) END), 0),
    COALESCE(BOOL_OR(cp.completed = true), false)
    INTO v_progress, v_completed
  FROM public.content_progress cp
  JOIN public.course_contents cc ON cc.id = cp.content_id
  WHERE cp.user_id = NEW.user_id
    AND cc.course_id = v_course_id
    AND cc.is_published = true;

  IF v_completed THEN
    UPDATE public.enrollments
    SET progress = 100,
        completed_at = COALESCE(completed_at, now())
    WHERE user_id = NEW.user_id
      AND course_id = v_course_id;
  ELSE
    UPDATE public.enrollments
    SET progress = GREATEST(COALESCE(progress, 0), LEAST(99, ROUND(v_progress)))
    WHERE user_id = NEW.user_id
      AND course_id = v_course_id
      AND completed_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

WITH course_progress AS (
  SELECT
    e.id AS enrollment_id,
    COALESCE(MAX(CASE WHEN cp.completed = true THEN 100 ELSE COALESCE(cp.progress_percentage, 0) END), 0) AS progress,
    COALESCE(BOOL_OR(cp.completed = true), false) AS completed
  FROM public.enrollments e
  JOIN public.course_contents cc ON cc.course_id = e.course_id AND cc.is_published = true
  LEFT JOIN public.content_progress cp ON cp.content_id = cc.id AND cp.user_id = e.user_id
  GROUP BY e.id
)
UPDATE public.enrollments e
SET progress = CASE
      WHEN cp.completed THEN 100
      ELSE GREATEST(COALESCE(e.progress, 0), LEAST(99, ROUND(cp.progress)))
    END,
    completed_at = CASE
      WHEN cp.completed THEN COALESCE(e.completed_at, now())
      ELSE e.completed_at
    END
FROM course_progress cp
WHERE e.id = cp.enrollment_id
  AND (
    (cp.completed AND (e.progress IS DISTINCT FROM 100 OR e.completed_at IS NULL))
    OR (NOT cp.completed AND e.completed_at IS NULL AND COALESCE(e.progress, 0) < LEAST(99, ROUND(cp.progress)))
  );