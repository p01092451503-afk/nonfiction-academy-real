-- 차시 100% 완료해도 평가 미응시면 progress=100, completed_at은 NULL 유지
CREATE OR REPLACE FUNCTION public.update_enrollment_progress_on_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_course_id UUID;
  v_progress NUMERIC := 0;
  v_any_completed BOOLEAN := false;
  v_eligible BOOLEAN := false;
BEGIN
  SELECT cc.course_id INTO v_course_id
  FROM public.course_contents cc
  WHERE cc.id = NEW.content_id;

  IF v_course_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(MAX(CASE WHEN cp.completed = true THEN 100 ELSE COALESCE(cp.progress_percentage, 0) END), 0),
    COALESCE(BOOL_OR(cp.completed = true), false)
    INTO v_progress, v_any_completed
  FROM public.content_progress cp
  JOIN public.course_contents cc ON cc.id = cp.content_id
  WHERE cp.user_id = NEW.user_id
    AND cc.course_id = v_course_id
    AND cc.is_published = true;

  v_eligible := public.is_course_completion_eligible(NEW.user_id, v_course_id);

  IF v_any_completed AND v_eligible THEN
    -- 차시+평가 모두 완료 → 수료
    UPDATE public.enrollments
    SET progress = 100,
        completed_at = COALESCE(completed_at, now())
    WHERE user_id = NEW.user_id
      AND course_id = v_course_id;
  ELSIF v_any_completed THEN
    -- 차시는 완료했지만 평가 미통과 → progress=100, 수료 보류
    UPDATE public.enrollments
    SET progress = 100
    WHERE user_id = NEW.user_id
      AND course_id = v_course_id
      AND completed_at IS NULL;
  ELSE
    UPDATE public.enrollments
    SET progress = GREATEST(COALESCE(progress, 0), LEAST(99, ROUND(v_progress)))
    WHERE user_id = NEW.user_id
      AND course_id = v_course_id
      AND completed_at IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- 기존에 progress=99 로 보류되어 있던(차시 완료/평가 미통과) enrollment 정정
UPDATE public.enrollments e
SET progress = 100
WHERE e.completed_at IS NULL
  AND e.progress = 99
  AND EXISTS (
    SELECT 1
    FROM public.content_progress cp
    JOIN public.course_contents cc ON cc.id = cp.content_id
    WHERE cp.user_id = e.user_id
      AND cc.course_id = e.course_id
      AND cc.is_published = true
      AND cp.completed = true
  );
