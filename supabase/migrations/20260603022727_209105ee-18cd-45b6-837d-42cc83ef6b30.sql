
-- Fix: badge auto-award triggers only fired on UPDATE, so badges were never
-- granted when content_progress / assignment_submissions rows were inserted
-- with completed=true (or status='graded') in a single INSERT.
-- Also backfill badges for all users based on their current activity.

-- 1) Recreate triggers to fire on INSERT OR UPDATE
DROP TRIGGER IF EXISTS on_content_completed ON public.content_progress;
CREATE TRIGGER on_content_completed
AFTER INSERT OR UPDATE ON public.content_progress
FOR EACH ROW EXECUTE FUNCTION public.trigger_award_points_on_content();

-- Adjust the function to handle INSERT (OLD is NULL on INSERT)
CREATE OR REPLACE FUNCTION public.trigger_award_points_on_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.completed = true AND (TG_OP = 'INSERT' OR OLD.completed IS DISTINCT FROM true) THEN
    PERFORM public.award_points(NEW.user_id, 10, 'lesson_completed', '강의 완료');
    PERFORM public.update_streak(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_assignment_graded ON public.assignment_submissions;
CREATE TRIGGER on_assignment_graded
AFTER INSERT OR UPDATE ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.trigger_award_points_on_assignment();

CREATE OR REPLACE FUNCTION public.trigger_award_points_on_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'graded' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'graded') THEN
    PERFORM public.award_points(NEW.student_id, GREATEST(5, FLOOR(COALESCE(NEW.score, 0) / 10))::integer, 'assignment_completed', '과제 완료');
    PERFORM public.update_streak(NEW.student_id);
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Make check_and_award_badges resilient: ensure user_gamification row exists
CREATE OR REPLACE FUNCTION public.check_and_award_badges(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  badge_record RECORD;
  user_value INT;
BEGIN
  -- Ensure gamification row exists so points/streak lookups don't return NULL
  INSERT INTO public.user_gamification (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  FOR badge_record IN
    SELECT * FROM public.badges
    WHERE id NOT IN (SELECT badge_id FROM public.user_badges WHERE user_id = p_user_id)
  LOOP
    user_value := 0;
    CASE badge_record.requirement_type
      WHEN 'points' THEN
        SELECT COALESCE(total_points, 0) INTO user_value FROM public.user_gamification WHERE user_id = p_user_id;
      WHEN 'streak' THEN
        SELECT COALESCE(streak_days, 0) INTO user_value FROM public.user_gamification WHERE user_id = p_user_id;
      WHEN 'courses_completed' THEN
        SELECT COUNT(*) INTO user_value FROM public.enrollments WHERE user_id = p_user_id AND completed_at IS NOT NULL;
      WHEN 'lessons_completed' THEN
        SELECT COUNT(*) INTO user_value FROM public.content_progress WHERE user_id = p_user_id AND completed = true;
      WHEN 'assignments_completed' THEN
        SELECT COUNT(*) INTO user_value FROM public.assignment_submissions WHERE student_id = p_user_id AND status = 'graded';
    END CASE;
    IF COALESCE(user_value, 0) >= badge_record.requirement_value THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (p_user_id, badge_record.id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- 3) Backfill: run badge check for every user who has any qualifying activity
DO $$
DECLARE
  uid UUID;
BEGIN
  FOR uid IN
    SELECT DISTINCT user_id FROM public.content_progress WHERE completed = true
    UNION
    SELECT DISTINCT student_id FROM public.assignment_submissions WHERE status = 'graded'
    UNION
    SELECT DISTINCT user_id FROM public.enrollments WHERE completed_at IS NOT NULL
    UNION
    SELECT DISTINCT user_id FROM public.user_gamification WHERE total_points > 0 OR streak_days > 0
  LOOP
    PERFORM public.check_and_award_badges(uid);
  END LOOP;
END $$;
