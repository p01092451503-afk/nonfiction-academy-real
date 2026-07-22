-- Redefine "avg_learning_days" as distinct dates a user completed at least one course.
CREATE OR REPLACE FUNCTION public.dashboard_metrics(p_filters jsonb DEFAULT '{}'::jsonb, p_leader_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  users AS (
    SELECT user_id FROM public.dashboard_filtered_user_ids(p_filters, p_leader_id)
  ),
  user_enrollments AS (
    SELECT e.user_id,
           COUNT(*) FILTER (WHERE e.status = 'approved') AS total_enrollments,
           COUNT(*) FILTER (WHERE e.completed_at IS NOT NULL) AS completed_courses,
           COALESCE(AVG(e.progress), 0) AS avg_progress,
           COUNT(DISTINCT (e.completed_at AT TIME ZONE 'UTC')::date) FILTER (WHERE e.completed_at IS NOT NULL) AS completion_days
    FROM public.enrollments e
    JOIN users u ON u.user_id = e.user_id
    WHERE (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY e.user_id
  ),
  user_learning AS (
    SELECT s.user_id,
           COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at))/60, 30)), 0) AS learning_minutes
    FROM public.course_learning_sessions s
    JOIN users u ON u.user_id = s.user_id
    WHERE (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM s.started_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM s.started_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY s.user_id
  ),
  user_comments AS (
    SELECT c.user_id, COUNT(*) AS comment_count
    FROM public.course_comments c
    JOIN users u ON u.user_id = c.user_id
    WHERE COALESCE(c.is_deleted, false) = false
      AND (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM c.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM c.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY c.user_id
  ),
  user_points AS (
    SELECT ph.user_id, COALESCE(SUM(ph.points), 0) AS points_earned
    FROM public.point_history ph
    JOIN users u ON u.user_id = ph.user_id
    WHERE (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM ph.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM ph.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY ph.user_id
  ),
  user_metrics AS (
    SELECT u.user_id,
           COALESCE(ue.completed_courses, 0) AS completed_courses,
           COALESCE(ue.avg_progress, 0) AS avg_progress,
           COALESCE(ul.learning_minutes, 0) AS learning_minutes,
           COALESCE(ue.completion_days, 0) AS learning_days,
           COALESCE(uc.comment_count, 0) AS comment_count,
           COALESCE(up.points_earned, 0) AS points_earned
    FROM users u
    LEFT JOIN user_enrollments ue ON ue.user_id = u.user_id
    LEFT JOIN user_learning ul ON ul.user_id = u.user_id
    LEFT JOIN user_comments uc ON uc.user_id = u.user_id
    LEFT JOIN user_points up ON up.user_id = u.user_id
  )
  SELECT jsonb_build_object(
    'user_count', (SELECT COUNT(*) FROM users),
    'avg_completed_courses', (SELECT COALESCE(AVG(completed_courses), 0) FROM user_metrics),
    'avg_completion_rate', (SELECT COALESCE(AVG(avg_progress), 0) FROM user_metrics),
    'avg_learning_minutes', (SELECT COALESCE(AVG(learning_minutes), 0) FROM user_metrics),
    'avg_comment_count', (SELECT COALESCE(AVG(comment_count), 0) FROM user_metrics),
    'avg_points_earned', (SELECT COALESCE(AVG(points_earned), 0) FROM user_metrics),
    'avg_learning_days', (SELECT COALESCE(AVG(learning_days), 0) FROM user_metrics)
  );
$function$;

-- Same redefinition for learner detail table
CREATE OR REPLACE FUNCTION public.dashboard_learner_details(p_filters jsonb DEFAULT '{}'::jsonb, p_leader_id uuid DEFAULT NULL::uuid, p_sort_by text DEFAULT 'completed_courses'::text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  users AS (
    SELECT user_id FROM public.dashboard_filtered_user_ids(p_filters, p_leader_id)
  ),
  user_base AS (
    SELECT p.user_id, p.full_name, p.email, d.name AS department_name, d.country
    FROM public.profiles p
    JOIN public.departments d ON d.id = p.department_id
    JOIN users u ON u.user_id = p.user_id
  ),
  user_enrollments AS (
    SELECT e.user_id,
           COUNT(*) FILTER (WHERE e.status = 'approved') AS total_enrollments,
           COUNT(*) FILTER (WHERE e.completed_at IS NOT NULL) AS completed_courses,
           COALESCE(AVG(e.progress) FILTER (WHERE e.status = 'approved'), 0) AS avg_progress,
           COUNT(DISTINCT (e.completed_at AT TIME ZONE 'UTC')::date) FILTER (WHERE e.completed_at IS NOT NULL) AS completion_days
    FROM public.enrollments e
    JOIN users u ON u.user_id = e.user_id
    WHERE (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY e.user_id
  ),
  user_learning AS (
    SELECT s.user_id,
           COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at))/60, 30)), 0) AS learning_minutes
    FROM public.course_learning_sessions s
    JOIN users u ON u.user_id = s.user_id
    WHERE (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM s.started_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM s.started_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY s.user_id
  ),
  user_comments AS (
    SELECT c.user_id, COUNT(*) AS comment_count
    FROM public.course_comments c
    JOIN users u ON u.user_id = c.user_id
    WHERE COALESCE(c.is_deleted, false) = false
      AND (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM c.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM c.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY c.user_id
  ),
  user_points AS (
    SELECT ph.user_id, COALESCE(SUM(ph.points), 0) AS points_earned
    FROM public.point_history ph
    JOIN users u ON u.user_id = ph.user_id
    WHERE (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM ph.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM ph.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY ph.user_id
  ),
  user_gamification AS (
    SELECT g.user_id, g.total_points, g.level, g.streak_days
    FROM public.user_gamification g
    JOIN users u ON u.user_id = g.user_id
  ),
  combined AS (
    SELECT ub.user_id, ub.full_name, ub.email, ub.department_name, ub.country,
           COALESCE(ue.total_enrollments, 0) AS total_enrollments,
           COALESCE(ue.completed_courses, 0) AS completed_courses,
           COALESCE(ue.avg_progress, 0) AS avg_progress,
           COALESCE(ul.learning_minutes, 0) AS learning_minutes,
           COALESCE(ue.completion_days, 0) AS learning_days,
           COALESCE(uc.comment_count, 0) AS comment_count,
           COALESCE(up.points_earned, 0) AS points_earned,
           COALESCE(ug.total_points, 0) AS total_points,
           COALESCE(ug.level, 1) AS level,
           COALESCE(ug.streak_days, 0) AS streak_days
    FROM user_base ub
    LEFT JOIN user_enrollments ue ON ue.user_id = ub.user_id
    LEFT JOIN user_learning ul ON ul.user_id = ub.user_id
    LEFT JOIN user_comments uc ON uc.user_id = ub.user_id
    LEFT JOIN user_points up ON up.user_id = ub.user_id
    LEFT JOIN user_gamification ug ON ug.user_id = ub.user_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', user_id,
        'full_name', full_name,
        'email', email,
        'department_name', department_name,
        'country', country,
        'total_enrollments', total_enrollments,
        'completed_courses', completed_courses,
        'avg_progress', ROUND(avg_progress, 1),
        'learning_minutes', ROUND(learning_minutes, 1),
        'learning_days', learning_days,
        'comment_count', comment_count,
        'points_earned', points_earned,
        'total_points', total_points,
        'level', level,
        'streak_days', streak_days
      )
      ORDER BY
        CASE WHEN p_sort_by = 'completed_courses' THEN completed_courses END DESC,
        CASE WHEN p_sort_by = 'avg_progress' THEN avg_progress END DESC,
        CASE WHEN p_sort_by = 'learning_minutes' THEN learning_minutes END DESC,
        CASE WHEN p_sort_by = 'comment_count' THEN comment_count END DESC,
        CASE WHEN p_sort_by = 'points_earned' THEN points_earned END DESC,
        CASE WHEN p_sort_by = 'learning_days' THEN learning_days END DESC,
        full_name
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT * FROM combined
    ORDER BY
      CASE WHEN p_sort_by = 'completed_courses' THEN completed_courses END DESC,
      CASE WHEN p_sort_by = 'avg_progress' THEN avg_progress END DESC,
      CASE WHEN p_sort_by = 'learning_minutes' THEN learning_minutes END DESC,
      CASE WHEN p_sort_by = 'comment_count' THEN comment_count END DESC,
      CASE WHEN p_sort_by = 'points_earned' THEN points_earned END DESC,
      CASE WHEN p_sort_by = 'learning_days' THEN learning_days END DESC,
      full_name
    LIMIT p_limit
  ) t;
$function$;