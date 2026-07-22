
-- Helper functions to safely extract filter arrays
CREATE OR REPLACE FUNCTION public._dashboard_filter_ints(p_filters jsonb, p_key text)
RETURNS int[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT array_agg(x::int) FROM jsonb_array_elements_text(COALESCE(p_filters->p_key, '[]'::jsonb)) AS x),
    ARRAY[]::int[]
  );
$$;

CREATE OR REPLACE FUNCTION public._dashboard_filter_texts(p_filters jsonb, p_key text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(p_filters->p_key, '[]'::jsonb)) AS x),
    ARRAY[]::text[]
  );
$$;

CREATE OR REPLACE FUNCTION public._dashboard_filter_uuids(p_filters jsonb, p_key text)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(COALESCE(p_filters->p_key, '[]'::jsonb)) AS x),
    ARRAY[]::uuid[]
  );
$$;

-- Filtered user IDs matching branch/country/leader scope and having activity in the period
CREATE OR REPLACE FUNCTION public.dashboard_filtered_user_ids(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_leader_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  scope_depts AS (
    SELECT d.id AS dept_id
    FROM public.departments d
    WHERE CASE
      WHEN p_leader_id IS NOT NULL THEN d.id IN (SELECT public.get_leader_scope_dept_ids(p_leader_id))
      ELSE true
    END
  ),
  candidate_users AS (
    SELECT p.user_id
    FROM public.profiles p
    JOIN public.departments d ON d.id = p.department_id
    JOIN scope_depts sd ON sd.dept_id = d.id
    WHERE (array_length(public._dashboard_filter_texts(p_filters, 'countries'), 1) IS NULL OR d.country = ANY(public._dashboard_filter_texts(p_filters, 'countries')))
      AND (array_length(public._dashboard_filter_uuids(p_filters, 'branch_ids'), 1) IS NULL OR
           d.id = ANY(public._dashboard_filter_uuids(p_filters, 'branch_ids')) OR
           d.parent_department_id = ANY(public._dashboard_filter_uuids(p_filters, 'branch_ids')))
  ),
  active_in_period AS (
    SELECT DISTINCT u.user_id
    FROM candidate_users u
    WHERE
      EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.user_id = u.user_id
          AND (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
          AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
      )
      OR EXISTS (
        SELECT 1 FROM public.course_learning_sessions s
        WHERE s.user_id = u.user_id
          AND (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM s.started_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
          AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM s.started_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
      )
      OR EXISTS (
        SELECT 1 FROM public.course_comments c
        WHERE c.user_id = u.user_id AND COALESCE(c.is_deleted, false) = false
          AND (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM c.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
          AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM c.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
      )
      OR EXISTS (
        SELECT 1 FROM public.point_history ph
        WHERE ph.user_id = u.user_id
          AND (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM ph.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
          AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM ph.created_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
      )
  )
  SELECT a.user_id FROM active_in_period a;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_filtered_user_ids(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_filtered_user_ids(jsonb, uuid) TO service_role;

-- Main metrics function
CREATE OR REPLACE FUNCTION public.dashboard_metrics(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_leader_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  users AS (
    SELECT user_id FROM public.dashboard_filtered_user_ids(p_filters, p_leader_id)
  ),
  user_enrollments AS (
    SELECT e.user_id,
           COUNT(*) FILTER (WHERE e.status = 'approved') AS total_enrollments,
           COUNT(*) FILTER (WHERE e.completed_at IS NOT NULL) AS completed_courses,
           COALESCE(AVG(e.progress), 0) AS avg_progress
    FROM public.enrollments e
    JOIN users u ON u.user_id = e.user_id
    WHERE (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY e.user_id
  ),
  user_learning AS (
    SELECT s.user_id,
           COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at))/60, 30)), 0) AS learning_minutes,
           COUNT(DISTINCT (s.started_at AT TIME ZONE 'UTC')::date) AS learning_days
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
           COALESCE(ul.learning_days, 0) AS learning_days,
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
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_metrics(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(jsonb, uuid) TO service_role;

-- Dropoff courses: courses with most enrolled-but-not-completed students
CREATE OR REPLACE FUNCTION public.dashboard_dropoff_courses(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_leader_id uuid DEFAULT NULL,
  p_limit int DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  users AS (
    SELECT user_id FROM public.dashboard_filtered_user_ids(p_filters, p_leader_id)
  ),
  course_stats AS (
    SELECT c.id, c.title,
           COUNT(e.id) FILTER (WHERE e.status = 'approved') AS enrolled,
           COUNT(e.id) FILTER (WHERE e.completed_at IS NOT NULL) AS completed,
           COUNT(e.id) FILTER (WHERE e.completed_at IS NULL AND e.status = 'approved') AS in_progress,
           COALESCE(ROUND(AVG(e.progress) FILTER (WHERE e.status = 'approved')), 0) AS avg_progress
    FROM public.courses c
    JOIN public.enrollments e ON e.course_id = c.id
    JOIN users u ON u.user_id = e.user_id
    WHERE c.status = 'published'
      AND (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY c.id, c.title
    HAVING COUNT(e.id) FILTER (WHERE e.status = 'approved') > 0
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'enrolled', enrolled,
        'completed', completed,
        'in_progress', in_progress,
        'dropoff_count', in_progress,
        'avg_progress', avg_progress
      )
      ORDER BY in_progress DESC, avg_progress ASC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT * FROM course_stats
    ORDER BY in_progress DESC, avg_progress ASC
    LIMIT p_limit
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_dropoff_courses(jsonb, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_dropoff_courses(jsonb, uuid, int) TO service_role;

-- Access heatmap by day-of-week and hour
CREATE OR REPLACE FUNCTION public.dashboard_access_heatmap(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_leader_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  users AS (
    SELECT user_id FROM public.dashboard_filtered_user_ids(p_filters, p_leader_id)
  ),
  heatmap AS (
    SELECT EXTRACT(DOW FROM s.login_at)::int AS dow,
           EXTRACT(HOUR FROM s.login_at)::int AS hr,
           COUNT(*) AS n
    FROM public.user_sessions s
    JOIN users u ON u.user_id = s.user_id
    WHERE (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM s.login_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM s.login_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY 1, 2
  )
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('dow', dow, 'hr', hr, 'n', n) ORDER BY dow, hr),
    '[]'::jsonb
  ) FROM heatmap;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_access_heatmap(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_access_heatmap(jsonb, uuid) TO service_role;

-- Learner details for drill-down
CREATE OR REPLACE FUNCTION public.dashboard_learner_details(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_leader_id uuid DEFAULT NULL,
  p_sort_by text DEFAULT 'completed_courses',
  p_limit int DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
           COALESCE(AVG(e.progress) FILTER (WHERE e.status = 'approved'), 0) AS avg_progress
    FROM public.enrollments e
    JOIN users u ON u.user_id = e.user_id
    WHERE (array_length(public._dashboard_filter_ints(p_filters, 'years'), 1) IS NULL OR EXTRACT(YEAR FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'years')))
      AND (array_length(public._dashboard_filter_ints(p_filters, 'months'), 1) IS NULL OR EXTRACT(MONTH FROM e.enrolled_at)::int = ANY(public._dashboard_filter_ints(p_filters, 'months')))
    GROUP BY e.user_id
  ),
  user_learning AS (
    SELECT s.user_id,
           COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at))/60, 30)), 0) AS learning_minutes,
           COUNT(DISTINCT (s.started_at AT TIME ZONE 'UTC')::date) AS learning_days
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
           COALESCE(ul.learning_days, 0) AS learning_days,
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
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_learner_details(jsonb, uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_learner_details(jsonb, uuid, text, int) TO service_role;

-- Weekly summary: this week vs last week learning minutes, active learners, completion rate
CREATE OR REPLACE FUNCTION public.dashboard_weekly_summary(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_leader_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  scope_depts AS (
    SELECT d.id AS dept_id
    FROM public.departments d
    WHERE CASE
      WHEN p_leader_id IS NOT NULL THEN d.id IN (SELECT public.get_leader_scope_dept_ids(p_leader_id))
      ELSE true
    END
  ),
  candidate_users AS (
    SELECT p.user_id
    FROM public.profiles p
    JOIN public.departments d ON d.id = p.department_id
    JOIN scope_depts sd ON sd.dept_id = d.id
    WHERE (array_length(public._dashboard_filter_texts(p_filters, 'countries'), 1) IS NULL OR d.country = ANY(public._dashboard_filter_texts(p_filters, 'countries')))
      AND (array_length(public._dashboard_filter_uuids(p_filters, 'branch_ids'), 1) IS NULL OR
           d.id = ANY(public._dashboard_filter_uuids(p_filters, 'branch_ids')) OR
           d.parent_department_id = ANY(public._dashboard_filter_uuids(p_filters, 'branch_ids')))
  ),
  this_week AS (
    SELECT
      COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at))/60, 30)), 0)::int AS learning_minutes,
      COUNT(DISTINCT s.user_id) AS active_learners
    FROM public.course_learning_sessions s
    JOIN candidate_users u ON u.user_id = s.user_id
    WHERE s.started_at >= now() - interval '7 days'
  ),
  prev_week AS (
    SELECT
      COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (s.last_heartbeat_at - s.started_at))/60, 30)), 0)::int AS learning_minutes,
      COUNT(DISTINCT s.user_id) AS active_learners
    FROM public.course_learning_sessions s
    JOIN candidate_users u ON u.user_id = s.user_id
    WHERE s.started_at >= now() - interval '14 days'
      AND s.started_at < now() - interval '7 days'
  ),
  completion AS (
    SELECT
      COUNT(*) FILTER (WHERE e.status = 'approved') AS total,
      COUNT(*) FILTER (WHERE e.completed_at IS NOT NULL AND e.completed_at >= now() - interval '7 days') AS this_week_done,
      COUNT(*) FILTER (WHERE e.status = 'approved' AND e.enrolled_at >= now() - interval '7 days') AS this_week_total,
      COUNT(*) FILTER (WHERE e.completed_at IS NOT NULL AND e.completed_at >= now() - interval '14 days' AND e.completed_at < now() - interval '7 days') AS prev_week_done,
      COUNT(*) FILTER (WHERE e.status = 'approved' AND e.enrolled_at >= now() - interval '14 days' AND e.enrolled_at < now() - interval '7 days') AS prev_week_total
    FROM public.enrollments e
    JOIN candidate_users u ON u.user_id = e.user_id
  )
  SELECT jsonb_build_object(
    'this_week_learning_minutes', (SELECT learning_minutes FROM this_week),
    'this_week_active_learners', (SELECT active_learners FROM this_week),
    'prev_week_learning_minutes', (SELECT learning_minutes FROM prev_week),
    'prev_week_active_learners', (SELECT active_learners FROM prev_week),
    'this_week_completion_rate', (SELECT CASE WHEN this_week_total > 0 THEN ROUND(100.0 * this_week_done / this_week_total, 1) ELSE 0 END FROM completion),
    'prev_week_completion_rate', (SELECT CASE WHEN prev_week_total > 0 THEN ROUND(100.0 * prev_week_done / prev_week_total, 1) ELSE 0 END FROM completion),
    'total_enrollments', (SELECT total FROM completion)
  );
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_weekly_summary(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_weekly_summary(jsonb, uuid) TO service_role;

-- Indexes for dashboard performance
CREATE INDEX IF NOT EXISTS idx_course_learning_sessions_started_user ON public.course_learning_sessions(started_at, user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login_user ON public.user_sessions(login_at, user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_enrolled_user_course ON public.enrollments(enrolled_at, user_id, course_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_course_comments_created_user ON public.course_comments(created_at, user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_department_user ON public.profiles(department_id, user_id);
CREATE INDEX IF NOT EXISTS idx_point_history_created_user ON public.point_history(created_at, user_id);
