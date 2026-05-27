-- 다국어 차시 정책: 1개 차시라도 완료되면 강의 100% / completed
UPDATE public.enrollments e
SET progress = 100,
    completed_at = COALESCE(e.completed_at, now())
WHERE EXISTS (
  SELECT 1
  FROM public.content_progress cp
  JOIN public.course_contents cc ON cc.id = cp.content_id
  WHERE cp.user_id = e.user_id
    AND cc.course_id = e.course_id
    AND cp.completed = true
)
AND (e.progress IS DISTINCT FROM 100 OR e.completed_at IS NULL);

-- 완료 차시가 하나도 없는데 progress가 0이 아닌 경우 0으로 정규화
UPDATE public.enrollments e
SET progress = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM public.content_progress cp
  JOIN public.course_contents cc ON cc.id = cp.content_id
  WHERE cp.user_id = e.user_id
    AND cc.course_id = e.course_id
    AND cp.completed = true
)
AND e.completed_at IS NULL
AND e.progress IS DISTINCT FROM 0;