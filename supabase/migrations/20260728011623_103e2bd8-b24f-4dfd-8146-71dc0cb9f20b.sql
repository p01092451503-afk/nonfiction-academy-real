CREATE OR REPLACE FUNCTION public.sync_course_enrollment_progress(_user_id uuid, _course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_any_completed boolean := false;
  v_progress numeric := 0;
  v_eligible boolean := false;
BEGIN
  SELECT
    COALESCE(BOOL_OR(cp.completed = true), false),
    COALESCE(MAX(CASE WHEN cp.completed = true THEN 100 ELSE COALESCE(cp.progress_percentage, 0) END), 0)
    INTO v_any_completed, v_progress
  FROM public.content_progress cp
  JOIN public.course_contents cc ON cc.id = cp.content_id
  WHERE cp.user_id = _user_id
    AND cc.course_id = _course_id
    AND cc.is_published = true;

  IF v_any_completed THEN
    v_eligible := public.is_course_completion_eligible(_user_id, _course_id);

    IF v_eligible THEN
      UPDATE public.enrollments
      SET progress = 100,
          completed_at = COALESCE(completed_at, now()),
          completion_count = GREATEST(COALESCE(completion_count, 0), 1)
      WHERE user_id = _user_id
        AND course_id = _course_id;
    ELSE
      UPDATE public.enrollments
      SET progress = 100
      WHERE user_id = _user_id
        AND course_id = _course_id;
    END IF;
  ELSE
    UPDATE public.enrollments
    SET progress = GREATEST(COALESCE(progress, 0), LEAST(99, ROUND(v_progress)))
    WHERE user_id = _user_id
      AND course_id = _course_id
      AND completed_at IS NULL;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.sync_course_enrollment_progress(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_course_enrollment_progress(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.sync_course_enrollment_progress(uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.sync_enrollment_progress_on_content_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_course_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT cc.course_id INTO v_course_id
  FROM public.course_contents cc
  WHERE cc.id = COALESCE(NEW.content_id, OLD.content_id);

  IF v_user_id IS NOT NULL AND v_course_id IS NOT NULL THEN
    PERFORM public.sync_course_enrollment_progress(v_user_id, v_course_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS sync_enrollment_progress_on_content_progress ON public.content_progress;
CREATE TRIGGER sync_enrollment_progress_on_content_progress
AFTER INSERT OR UPDATE OF completed, progress_percentage ON public.content_progress
FOR EACH ROW
EXECUTE FUNCTION public.sync_enrollment_progress_on_content_change();