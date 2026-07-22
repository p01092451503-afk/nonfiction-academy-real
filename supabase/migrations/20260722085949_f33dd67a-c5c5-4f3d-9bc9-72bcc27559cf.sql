
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
      COUNT(*) FILTER (WHERE e.status = 'approved' AND e.completed_at IS NOT NULL AND e.completed_at >= now() - interval '7 days') AS this_week_done,
      COUNT(*) FILTER (WHERE e.status = 'approved' AND e.enrolled_at <= now() - interval '7 days' AND (e.completed_at IS NULL OR e.completed_at >= now() - interval '7 days')) AS this_week_eligible,
      COUNT(*) FILTER (WHERE e.status = 'approved' AND e.completed_at IS NOT NULL AND e.completed_at >= now() - interval '14 days' AND e.completed_at < now() - interval '7 days') AS prev_week_done,
      COUNT(*) FILTER (WHERE e.status = 'approved' AND e.enrolled_at <= now() - interval '14 days' AND (e.completed_at IS NULL OR e.completed_at >= now() - interval '14 days')) AS prev_week_eligible
    FROM public.enrollments e
    JOIN candidate_users u ON u.user_id = e.user_id
  )
  SELECT jsonb_build_object(
    'this_week_learning_minutes', (SELECT learning_minutes FROM this_week),
    'this_week_active_learners', (SELECT active_learners FROM this_week),
    'prev_week_learning_minutes', (SELECT learning_minutes FROM prev_week),
    'prev_week_active_learners', (SELECT active_learners FROM prev_week),
    'this_week_completion_rate', (SELECT CASE WHEN this_week_eligible > 0 THEN ROUND(100.0 * this_week_done / this_week_eligible, 1) ELSE 0 END FROM completion),
    'prev_week_completion_rate', (SELECT CASE WHEN prev_week_eligible > 0 THEN ROUND(100.0 * prev_week_done / prev_week_eligible, 1) ELSE 0 END FROM completion),
    'total_enrollments', (SELECT total FROM completion)
  );
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_weekly_summary(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_weekly_summary(jsonb, uuid) TO service_role;
