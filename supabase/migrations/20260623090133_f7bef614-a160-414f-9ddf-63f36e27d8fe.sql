CREATE OR REPLACE FUNCTION public.submit_and_grade_assessment(
  p_attempt_id uuid,
  p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt RECORD;
  v_question RECORD;
  v_answer jsonb;
  v_total_points numeric := 0;
  v_total_score numeric := 0;
  v_assessment RECORD;
  v_passed boolean;
  v_result jsonb;
  v_user_answer text;
  v_selected_index integer;
  v_correct_index integer;
  v_is_correct boolean;
  v_points_earned numeric;
BEGIN
  SELECT * INTO v_attempt
  FROM public.assessment_attempts
  WHERE id = p_attempt_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found or not owned by user';
  END IF;

  IF v_attempt.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Attempt already completed';
  END IF;

  SELECT * INTO v_assessment
  FROM public.assessments
  WHERE id = v_attempt.assessment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found';
  END IF;

  DELETE FROM public.assessment_answers
  WHERE attempt_id = p_attempt_id;

  FOR v_question IN
    SELECT *
    FROM public.assessment_questions
    WHERE assessment_id = v_attempt.assessment_id
    ORDER BY order_index, id
  LOOP
    v_total_points := v_total_points + COALESCE(v_question.points, 0);
    v_user_answer := NULL;
    v_selected_index := NULL;
    v_correct_index := NULL;
    v_is_correct := false;
    v_points_earned := 0;

    SELECT elem INTO v_answer
    FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb)) AS elem
    WHERE elem->>'question_id' = v_question.id::text
    LIMIT 1;

    IF v_answer IS NOT NULL THEN
      v_user_answer := NULLIF(v_answer->>'user_answer', '');

      IF v_answer ? 'selected_index' AND (v_answer->>'selected_index') ~ '^\d+$' THEN
        v_selected_index := (v_answer->>'selected_index')::integer;
      ELSIF v_user_answer IS NOT NULL AND v_user_answer ~ '^\d+$' THEN
        v_selected_index := v_user_answer::integer;
      END IF;
    END IF;

    IF v_question.question_type = 'essay' THEN
      v_is_correct := false;
      v_points_earned := 0;
    ELSIF v_question.question_type IN ('multiple_choice_4', 'multiple_choice_5', 'ox') THEN
      IF jsonb_typeof(v_question.options) = 'array' THEN
        SELECT ord - 1 INTO v_correct_index
        FROM jsonb_array_elements_text(v_question.options) WITH ORDINALITY AS opt(value, ord)
        WHERE lower(regexp_replace(trim(opt.value), '\s+', ' ', 'g')) = lower(regexp_replace(trim(v_question.correct_answer), '\s+', ' ', 'g'))
        LIMIT 1;
      END IF;

      IF v_selected_index IS NOT NULL AND v_correct_index IS NOT NULL THEN
        v_is_correct := v_selected_index = v_correct_index;
        IF jsonb_typeof(v_question.options) = 'array' THEN
          SELECT opt.value INTO v_user_answer
          FROM jsonb_array_elements_text(v_question.options) WITH ORDINALITY AS opt(value, ord)
          WHERE ord = v_selected_index + 1
          LIMIT 1;
        END IF;
      ELSIF v_user_answer IS NOT NULL THEN
        v_is_correct := lower(regexp_replace(trim(v_user_answer), '\s+', ' ', 'g')) = lower(regexp_replace(trim(v_question.correct_answer), '\s+', ' ', 'g'));
      END IF;

      IF v_is_correct THEN
        v_points_earned := COALESCE(v_question.points, 0);
      END IF;
    ELSIF v_user_answer IS NOT NULL THEN
      v_is_correct := lower(regexp_replace(trim(v_user_answer), '\s+', ' ', 'g')) = lower(regexp_replace(trim(v_question.correct_answer), '\s+', ' ', 'g'));
      IF v_is_correct THEN
        v_points_earned := COALESCE(v_question.points, 0);
      END IF;
    END IF;

    v_total_score := v_total_score + v_points_earned;

    INSERT INTO public.assessment_answers (attempt_id, question_id, user_answer, is_correct, points_earned)
    VALUES (p_attempt_id, v_question.id, v_user_answer, v_is_correct, v_points_earned);
  END LOOP;

  DECLARE
    v_score_pct numeric := 0;
  BEGIN
    IF v_total_points > 0 THEN
      v_score_pct := round((v_total_score / v_total_points) * 100);
    END IF;

    v_passed := v_score_pct >= v_assessment.passing_score;

    UPDATE public.assessment_attempts
    SET score = v_score_pct,
        total_points = v_total_points,
        passed = v_passed,
        completed_at = now()
    WHERE id = p_attempt_id;

    v_result := jsonb_build_object(
      'score', v_score_pct,
      'total_points', v_total_points,
      'earned_points', v_total_score,
      'passed', v_passed
    );
  END;

  RETURN v_result;
END;
$$;