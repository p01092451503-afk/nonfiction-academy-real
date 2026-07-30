CREATE OR REPLACE FUNCTION public.trigger_award_points_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row jsonb;
  v_user_id uuid;
BEGIN
  v_row := to_jsonb(NEW);
  v_user_id := COALESCE(
    NULLIF(v_row->>'author_id', '')::uuid,
    NULLIF(v_row->>'user_id', '')::uuid
  );
  IF v_user_id IS NOT NULL THEN
    PERFORM public.award_points(v_user_id, 20, 'comment_added', '댓글 작성');
  END IF;
  RETURN NEW;
END;
$function$;