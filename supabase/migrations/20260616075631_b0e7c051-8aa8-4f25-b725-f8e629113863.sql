
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS completion_count integer NOT NULL DEFAULT 0;

UPDATE public.enrollments
  SET completion_count = 1
  WHERE completed_at IS NOT NULL AND completion_count = 0;

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
        completed_at = COALESCE(completed_at, now()),
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

GRANT EXECUTE ON FUNCTION public.record_course_review_completion(uuid) TO authenticated;
