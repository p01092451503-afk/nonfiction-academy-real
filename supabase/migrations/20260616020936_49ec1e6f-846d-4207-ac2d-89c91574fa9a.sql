
-- 1) 이수 자격 확인 함수: 강의에 게시된 평가가 있으면 합격 필요
CREATE OR REPLACE FUNCTION public.is_course_completion_eligible(_user_id uuid, _course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH has_assessment AS (
    SELECT EXISTS (
      SELECT 1 FROM public.assessments
      WHERE course_id = _course_id AND is_published = true
    ) AS yes
  ),
  has_passed AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.assessment_attempts att
      JOIN public.assessments a ON a.id = att.assessment_id
      WHERE a.course_id = _course_id
        AND a.is_published = true
        AND att.user_id = _user_id
        AND att.passed = true
    ) AS yes
  ),
  has_completed_content AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.content_progress cp
      JOIN public.course_contents cc ON cc.id = cp.content_id
      WHERE cc.course_id = _course_id
        AND cp.user_id = _user_id
        AND cp.completed = true
    ) AS yes
  )
  SELECT
    (SELECT yes FROM has_completed_content)
    AND (
      NOT (SELECT yes FROM has_assessment)
      OR (SELECT yes FROM has_passed)
    );
$$;

-- 2) content_progress 트리거 함수: 평가 합격이 필요한 강의는 99%까지만 자동 완료 처리 보류
CREATE OR REPLACE FUNCTION public.update_enrollment_progress_on_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- 3) 평가 합격 시 enrollment 이수 처리 트리거 함수
CREATE OR REPLACE FUNCTION public.sync_enrollment_on_assessment_pass()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id UUID;
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

  -- 차시까지 모두 완료한 경우에만 이수 처리. (평가만 합격한 상태에서는 진행률만 표시 유지)
  IF public.is_course_completion_eligible(NEW.user_id, v_course_id) THEN
    UPDATE public.enrollments
    SET progress = 100,
        completed_at = COALESCE(completed_at, now())
    WHERE user_id = NEW.user_id
      AND course_id = v_course_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 4) 트리거 부착 (없으면 생성)
DROP TRIGGER IF EXISTS trg_update_enrollment_progress_on_content ON public.content_progress;
CREATE TRIGGER trg_update_enrollment_progress_on_content
AFTER INSERT OR UPDATE ON public.content_progress
FOR EACH ROW EXECUTE FUNCTION public.update_enrollment_progress_on_content();

DROP TRIGGER IF EXISTS trg_sync_enrollment_on_assessment_pass ON public.assessment_attempts;
CREATE TRIGGER trg_sync_enrollment_on_assessment_pass
AFTER INSERT OR UPDATE ON public.assessment_attempts
FOR EACH ROW EXECUTE FUNCTION public.sync_enrollment_on_assessment_pass();

-- 5) 기존 잘못 완료된 enrollment 정정
-- 게시된 평가가 있는 강의 + 합격 기록 없는 사용자 → completed_at 해제, 진행률 99
UPDATE public.enrollments e
SET completed_at = NULL,
    progress = 99
WHERE e.completed_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.course_id = e.course_id AND a.is_published = true
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.assessment_attempts att
    JOIN public.assessments a ON a.id = att.assessment_id
    WHERE a.course_id = e.course_id
      AND a.is_published = true
      AND att.user_id = e.user_id
      AND att.passed = true
  );
