
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS min_learning_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.courses.min_learning_minutes IS
  '강의 최소 학습시간(분). 0이면 미사용. 차시/카드에 균등 배분되어 카드 이동 및 이수 완료 게이팅에 사용됨.';

-- 최소 학습시간을 충족하지 않으면 completed_at 을 채우지 않도록 판정 함수 확장
CREATE OR REPLACE FUNCTION public.is_course_completion_eligible(_user_id uuid, _course_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_assessment boolean;
  v_has_passed boolean;
  v_has_completed_content boolean;
  v_min_min integer;
  v_watched_min numeric;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.assessments
    WHERE course_id = _course_id AND is_published = true
  ) INTO v_has_assessment;

  SELECT EXISTS (
    SELECT 1
    FROM public.assessment_attempts att
    JOIN public.assessments a ON a.id = att.assessment_id
    WHERE a.course_id = _course_id
      AND a.is_published = true
      AND att.user_id = _user_id
      AND att.passed = true
  ) INTO v_has_passed;

  SELECT EXISTS (
    SELECT 1
    FROM public.content_progress cp
    JOIN public.course_contents cc ON cc.id = cp.content_id
    WHERE cc.course_id = _course_id
      AND cp.user_id = _user_id
      AND cp.completed = true
  ) INTO v_has_completed_content;

  IF NOT v_has_completed_content THEN
    RETURN false;
  END IF;

  IF v_has_assessment AND NOT v_has_passed THEN
    RETURN false;
  END IF;

  SELECT COALESCE(min_learning_minutes, 0) INTO v_min_min
  FROM public.courses WHERE id = _course_id;

  IF v_min_min > 0 THEN
    SELECT COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (last_heartbeat_at - started_at))/60, 30)), 0)
      INTO v_watched_min
    FROM public.course_learning_sessions
    WHERE user_id = _user_id AND course_id = _course_id;

    IF COALESCE(v_watched_min, 0) < v_min_min THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$function$;
