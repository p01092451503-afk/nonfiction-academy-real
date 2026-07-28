WITH completed_course_progress AS (
  SELECT DISTINCT cp.user_id, cc.course_id
  FROM public.content_progress cp
  JOIN public.course_contents cc ON cc.id = cp.content_id
  WHERE cp.completed = true
    AND cc.is_published = true
)
UPDATE public.enrollments e
SET progress = 100
FROM completed_course_progress ccp
WHERE e.user_id = ccp.user_id
  AND e.course_id = ccp.course_id
  AND COALESCE(e.progress, 0) < 100;

WITH completed_course_progress AS (
  SELECT DISTINCT cp.user_id, cc.course_id
  FROM public.content_progress cp
  JOIN public.course_contents cc ON cc.id = cp.content_id
  WHERE cp.completed = true
    AND cc.is_published = true
)
UPDATE public.enrollments e
SET completed_at = now(),
    completion_count = GREATEST(COALESCE(e.completion_count, 0), 1)
FROM completed_course_progress ccp
WHERE e.user_id = ccp.user_id
  AND e.course_id = ccp.course_id
  AND e.completed_at IS NULL
  AND public.is_course_completion_eligible(e.user_id, e.course_id);