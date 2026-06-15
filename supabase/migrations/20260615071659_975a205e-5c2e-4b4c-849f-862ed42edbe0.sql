
CREATE OR REPLACE FUNCTION public.update_streak(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_last_date DATE;
BEGIN
  INSERT INTO public.user_gamification (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_activity_date INTO v_last_date
  FROM public.user_gamification WHERE user_id = p_user_id;

  IF v_last_date IS NULL THEN
    UPDATE public.user_gamification
       SET streak_days = GREATEST(COALESCE(streak_days, 0), 1),
           last_activity_date = CURRENT_DATE
     WHERE user_id = p_user_id;
  ELSIF v_last_date = CURRENT_DATE THEN
    NULL;
  ELSE
    UPDATE public.user_gamification
       SET streak_days = COALESCE(streak_days, 0) + 1,
           last_activity_date = CURRENT_DATE
     WHERE user_id = p_user_id;
  END IF;
END;
$$;

WITH activity AS (
  SELECT user_id, (completed_at)::date AS d
  FROM public.content_progress
  WHERE completed = true AND completed_at IS NOT NULL
  UNION
  SELECT user_id, (last_accessed_at)::date AS d
  FROM public.content_progress
  WHERE last_accessed_at IS NOT NULL
  UNION
  SELECT student_id AS user_id, (submitted_at)::date AS d
  FROM public.assignment_submissions
  WHERE submitted_at IS NOT NULL
  UNION
  SELECT student_id AS user_id, (graded_at)::date AS d
  FROM public.assignment_submissions
  WHERE graded_at IS NOT NULL
),
agg AS (
  SELECT user_id, COUNT(DISTINCT d) AS days, MAX(d) AS last_d
  FROM activity
  WHERE user_id IS NOT NULL
  GROUP BY user_id
)
INSERT INTO public.user_gamification (user_id, streak_days, last_activity_date)
SELECT user_id, days, last_d FROM agg
ON CONFLICT (user_id) DO UPDATE
SET streak_days = EXCLUDED.streak_days,
    last_activity_date = EXCLUDED.last_activity_date;
