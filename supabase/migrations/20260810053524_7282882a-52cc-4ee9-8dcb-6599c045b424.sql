-- 1) 퀴즈 없는 강의: 차시 재완료 시 자동으로 복습 카운트 +1
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
  v_prev_completed_at timestamptz;
  v_has_assessment boolean := false;
  v_has_new_learning boolean := false;
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

  SELECT e.completed_at INTO v_prev_completed_at
  FROM public.enrollments e
  WHERE e.user_id = NEW.user_id AND e.course_id = v_course_id;

  IF v_any_completed AND v_eligible THEN
    IF v_prev_completed_at IS NULL THEN
      UPDATE public.enrollments
      SET progress = 100,
          completed_at = now(),
          completion_count = GREATEST(COALESCE(completion_count, 0), 1)
      WHERE user_id = NEW.user_id
        AND course_id = v_course_id;
    ELSE
      -- 재이수(복습): 퀴즈가 없는 강의에서만 자동 누적 (퀴즈 강의는 합격 트리거에서 처리)
      SELECT EXISTS (
        SELECT 1 FROM public.assessments a
        WHERE a.course_id = v_course_id AND a.is_published = true
      ) INTO v_has_assessment;

      IF NOT v_has_assessment
         AND NEW.completed = true
         AND (TG_OP = 'INSERT' OR COALESCE(OLD.completed, false) = false)
         AND COALESCE(NEW.completed_at, now()) > v_prev_completed_at THEN
        SELECT EXISTS (
          SELECT 1 FROM public.course_learning_sessions s
          WHERE s.user_id = NEW.user_id
            AND s.course_id = v_course_id
            AND s.started_at > v_prev_completed_at
        ) INTO v_has_new_learning;

        IF v_has_new_learning THEN
          UPDATE public.enrollments
          SET progress = 100,
              completion_count = COALESCE(completion_count, 1) + 1,
              completed_at = now()
          WHERE user_id = NEW.user_id
            AND course_id = v_course_id;
        END IF;
      END IF;
    END IF;
  ELSIF v_any_completed THEN
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

-- 2) 수동 복습 완료: 직전 이수 이후 실제 학습 기록이 있을 때만 1회 인정
CREATE OR REPLACE FUNCTION public.record_course_review_completion(p_course_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_prev_completed_at timestamptz;
  v_new_count integer;
  v_has_new_learning boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT e.completed_at INTO v_prev_completed_at
  FROM public.enrollments e
  WHERE e.user_id = v_user_id AND e.course_id = p_course_id;

  IF v_prev_completed_at IS NULL THEN
    RAISE EXCEPTION 'Course not yet completed for the first time';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.course_learning_sessions s
    WHERE s.user_id = v_user_id
      AND s.course_id = p_course_id
      AND s.started_at > v_prev_completed_at
  ) OR EXISTS (
    SELECT 1 FROM public.content_progress cp
    JOIN public.course_contents cc ON cc.id = cp.content_id
    WHERE cp.user_id = v_user_id
      AND cc.course_id = p_course_id
      AND cp.last_accessed_at > v_prev_completed_at
  ) INTO v_has_new_learning;

  IF NOT v_has_new_learning THEN
    SELECT COALESCE(completion_count, 1) INTO v_new_count
    FROM public.enrollments
    WHERE user_id = v_user_id AND course_id = p_course_id;
    RETURN v_new_count;
  END IF;

  UPDATE public.enrollments
    SET completion_count = COALESCE(completion_count, 0) + 1,
        completed_at = now(),
        progress = 100
    WHERE user_id = v_user_id
      AND course_id = p_course_id
      AND completed_at IS NOT NULL
    RETURNING completion_count INTO v_new_count;

  RETURN v_new_count;
END;
$function$;

-- 3) 대시보드: 기간 내 학습 이력이 없어도 모든 학습자를 명단/인원 기준에 포함
CREATE OR REPLACE FUNCTION public.dashboard_filtered_user_ids(p_filters jsonb DEFAULT '{}'::jsonb, p_leader_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  scope_depts AS (
    SELECT d.id AS dept_id
    FROM public.departments d
    WHERE CASE
      WHEN p_leader_id IS NOT NULL THEN d.id IN (SELECT public.get_leader_scope_dept_ids(p_leader_id))
      ELSE true
    END
  )
  SELECT p.user_id
  FROM public.profiles p
  JOIN public.departments d ON d.id = p.department_id
  JOIN scope_depts sd ON sd.dept_id = d.id
  WHERE (array_length(public._dashboard_filter_texts(p_filters, 'countries'), 1) IS NULL OR d.country = ANY(public._dashboard_filter_texts(p_filters, 'countries')))
    AND (array_length(public._dashboard_filter_uuids(p_filters, 'branch_ids'), 1) IS NULL OR
         d.id = ANY(public._dashboard_filter_uuids(p_filters, 'branch_ids')) OR
         d.parent_department_id = ANY(public._dashboard_filter_uuids(p_filters, 'branch_ids')));
$function$;