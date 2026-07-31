CREATE OR REPLACE FUNCTION public.finalize_course_completion_if_eligible(
  _user_id uuid,
  _course_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  IF _user_id IS NULL OR _course_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_course_completion_eligible(_user_id, _course_id) THEN
    UPDATE public.enrollments
    SET progress = 100,
        completed_at = COALESCE(completed_at, now()),
        completion_count = GREATEST(COALESCE(completion_count, 0), 1)
    WHERE user_id = _user_id
      AND course_id = _course_id
      AND status = 'approved'
      AND completed_at IS NULL;

    v_updated := FOUND;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_course_completion_if_eligible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_course_completion_if_eligible(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_course_completion_if_eligible(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.recheck_course_completion_on_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.finalize_course_completion_if_eligible(NEW.user_id, NEW.course_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recheck_completion_on_learning_session ON public.course_learning_sessions;
CREATE TRIGGER recheck_completion_on_learning_session
AFTER INSERT OR UPDATE OF last_heartbeat_at ON public.course_learning_sessions
FOR EACH ROW
EXECUTE FUNCTION public.recheck_course_completion_on_session();

CREATE OR REPLACE FUNCTION public.recheck_course_completions_on_minimum_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_enrollment record;
BEGIN
  IF NEW.min_learning_minutes IS NOT DISTINCT FROM OLD.min_learning_minutes THEN
    RETURN NEW;
  END IF;

  FOR v_enrollment IN
    SELECT e.user_id
    FROM public.enrollments e
    WHERE e.course_id = NEW.id
      AND e.status = 'approved'
      AND e.completed_at IS NULL
  LOOP
    PERFORM public.finalize_course_completion_if_eligible(v_enrollment.user_id, NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recheck_completions_on_course_minimum_change ON public.courses;
CREATE TRIGGER recheck_completions_on_course_minimum_change
AFTER UPDATE OF min_learning_minutes ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.recheck_course_completions_on_minimum_change();

CREATE OR REPLACE FUNCTION public.sync_enrollment_progress_on_content_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    PERFORM public.finalize_course_completion_if_eligible(v_user_id, v_course_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;