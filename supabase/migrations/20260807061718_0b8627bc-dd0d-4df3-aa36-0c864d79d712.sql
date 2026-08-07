CREATE OR REPLACE FUNCTION public.sync_enrollment_on_assessment_pass()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_course_id UUID;
  v_prev_completed_at timestamptz;
  v_has_new_learning boolean := false;
BEGIN
  IF NEW.passed IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.completed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT course_id INTO v_course_id
  FROM public.assessments WHERE id = NEW.assessment_id;

  IF v_course_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_course_completion_eligible(NEW.user_id, v_course_id) THEN
    RETURN NEW;
  END IF;

  SELECT e.completed_at INTO v_prev_completed_at
  FROM public.enrollments e
  WHERE e.user_id = NEW.user_id AND e.course_id = v_course_id;

  IF v_prev_completed_at IS NULL THEN
    -- 최초 이수
    UPDATE public.enrollments
    SET progress = 100,
        completed_at = COALESCE(completed_at, NEW.completed_at),
        completion_count = GREATEST(COALESCE(completion_count, 0), 1)
    WHERE user_id = NEW.user_id
      AND course_id = v_course_id;
    RETURN NEW;
  END IF;

  -- 복습(재이수): 직전 이수 이후 실제 학습 기록이 있고, 새로 합격한 경우에만 1회 누적
  IF NEW.completed_at > v_prev_completed_at THEN
    SELECT EXISTS (
      SELECT 1 FROM public.course_learning_sessions s
      WHERE s.user_id = NEW.user_id
        AND s.course_id = v_course_id
        AND s.started_at > v_prev_completed_at
    ) OR EXISTS (
      SELECT 1 FROM public.content_progress cp
      JOIN public.course_contents cc ON cc.id = cp.content_id
      WHERE cp.user_id = NEW.user_id
        AND cc.course_id = v_course_id
        AND cp.last_accessed_at > v_prev_completed_at
    ) INTO v_has_new_learning;

    IF v_has_new_learning THEN
      UPDATE public.enrollments
      SET progress = 100,
          completion_count = COALESCE(completion_count, 1) + 1,
          completed_at = NEW.completed_at
      WHERE user_id = NEW.user_id
        AND course_id = v_course_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_course_review_completion(p_course_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.enrollments
    SET completion_count = COALESCE(completion_count, 0) + 1,
        completed_at = now(),
        progress = 100
    WHERE user_id = v_user_id
      AND course_id = p_course_id
      AND completed_at IS NOT NULL
    RETURNING completion_count INTO v_new_count;

  IF v_new_count IS NULL THEN
    RAISE EXCEPTION 'Course not yet completed for the first time';
  END IF;

  RETURN v_new_count;
END;
$$;