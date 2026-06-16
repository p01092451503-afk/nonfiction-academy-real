
CREATE OR REPLACE FUNCTION public.trigger_award_points_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := COALESCE(NEW.author_id, NEW.user_id);
  IF v_user_id IS NOT NULL THEN
    PERFORM public.award_points(v_user_id, 20, 'comment_added', '댓글 작성');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_points_on_board_comment ON public.board_comments;
CREATE TRIGGER trg_award_points_on_board_comment
AFTER INSERT ON public.board_comments
FOR EACH ROW EXECUTE FUNCTION public.trigger_award_points_on_comment();

DROP TRIGGER IF EXISTS trg_award_points_on_course_comment ON public.course_comments;
CREATE TRIGGER trg_award_points_on_course_comment
AFTER INSERT ON public.course_comments
FOR EACH ROW EXECUTE FUNCTION public.trigger_award_points_on_comment();
