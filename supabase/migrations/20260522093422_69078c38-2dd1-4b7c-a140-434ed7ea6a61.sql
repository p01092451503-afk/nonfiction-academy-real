
CREATE OR REPLACE FUNCTION public.admin_dashboard_insights()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
week_sessions AS (
  SELECT
    COUNT(DISTINCT user_id) FILTER (WHERE login_at >= now() - interval '7 days') AS this_week,
    COUNT(DISTINCT user_id) FILTER (WHERE login_at >= now() - interval '14 days' AND login_at < now() - interval '7 days') AS prev_week
  FROM user_sessions
  WHERE login_at >= now() - interval '14 days'
),
session_minutes AS (
  SELECT
    COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(logout_at, login_at + interval '30 min'), login_at + interval '4 hours') - login_at))/60)
      FILTER (WHERE login_at >= now() - interval '7 days'), 0)::int AS this_week,
    COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(logout_at, login_at + interval '30 min'), login_at + interval '4 hours') - login_at))/60)
      FILTER (WHERE login_at >= now() - interval '14 days' AND login_at < now() - interval '7 days'), 0)::int AS prev_week
  FROM user_sessions
  WHERE login_at >= now() - interval '14 days'
),
completion AS (
  SELECT
    COUNT(*) FILTER (WHERE status='approved') AS total,
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS done
  FROM enrollments
),
stuck AS (
  SELECT c.id, c.title, COUNT(*) AS stuck_count
  FROM enrollments e
  JOIN courses c ON c.id=e.course_id
  WHERE e.progress < 10
    AND e.enrolled_at < now() - interval '7 days'
    AND e.completed_at IS NULL
    AND e.status='approved'
  GROUP BY c.id, c.title
  ORDER BY COUNT(*) DESC
  LIMIT 5
),
heatmap AS (
  SELECT
    EXTRACT(DOW FROM created_at)::int AS dow,
    EXTRACT(HOUR FROM created_at)::int AS hr,
    COUNT(*) AS n
  FROM traffic_logs
  WHERE created_at >= now() - interval '14 days' AND event_type='page_view'
  GROUP BY 1,2
),
dau_wau_mau AS (
  SELECT
    COUNT(DISTINCT user_id) FILTER (WHERE login_at >= now() - interval '1 day') AS dau,
    COUNT(DISTINCT user_id) FILTER (WHERE login_at >= now() - interval '7 days') AS wau,
    COUNT(DISTINCT user_id) FILTER (WHERE login_at >= now() - interval '30 days') AS mau
  FROM user_sessions
  WHERE login_at >= now() - interval '30 days'
),
new_returning AS (
  SELECT
    COUNT(DISTINCT s.user_id) FILTER (WHERE p.created_at >= now() - interval '30 days') AS new_users,
    COUNT(DISTINCT s.user_id) FILTER (WHERE p.created_at < now() - interval '30 days') AS returning_users
  FROM user_sessions s
  JOIN profiles p ON p.user_id=s.user_id
  WHERE s.login_at >= now() - interval '7 days'
),
branch_stats AS (
  SELECT d.id, d.name,
         COUNT(DISTINCT p.user_id) AS total_users,
         COUNT(DISTINCT s.user_id) AS active_users
  FROM departments d
  LEFT JOIN profiles p ON p.department_id=d.id
  LEFT JOIN user_sessions s ON s.user_id=p.user_id AND s.login_at >= now() - interval '30 days'
  WHERE d.parent_department_id IS NULL AND COALESCE(d.is_active,true)=true
  GROUP BY d.id, d.name
  HAVING COUNT(DISTINCT p.user_id) > 0
),
dormant AS (
  SELECT COUNT(*) AS n
  FROM profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM user_sessions s
    WHERE s.user_id=p.user_id AND s.login_at >= now() - interval '14 days'
  )
  AND p.created_at < now() - interval '14 days'
),
low_completion AS (
  SELECT cc.id, cc.title, c.title AS course_title,
         COUNT(cp.id) AS attempts,
         ROUND(100.0 * COUNT(cp.id) FILTER (WHERE cp.completed) / NULLIF(COUNT(cp.id),0), 1) AS rate
  FROM course_contents cc
  JOIN courses c ON c.id=cc.course_id
  LEFT JOIN content_progress cp ON cp.content_id=cc.id
  WHERE cc.is_published=true AND c.status='published'
  GROUP BY cc.id, cc.title, c.title
  HAVING COUNT(cp.id) >= 5
     AND COUNT(cp.id) FILTER (WHERE cp.completed)::numeric / NULLIF(COUNT(cp.id),0) < 0.5
  ORDER BY rate ASC NULLS LAST
  LIMIT 5
),
assessment_rate AS (
  SELECT
    COUNT(*) FILTER (WHERE passed=true) AS passed,
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS attempted
  FROM assessment_attempts
  WHERE started_at >= now() - interval '30 days'
),
low_pass_assessments AS (
  SELECT a.id, a.title,
         COUNT(att.id) AS attempts,
         ROUND(100.0 * COUNT(att.id) FILTER (WHERE att.passed) /
               NULLIF(COUNT(att.id) FILTER (WHERE att.completed_at IS NOT NULL),0), 1) AS pass_rate
  FROM assessments a
  JOIN assessment_attempts att ON att.assessment_id=a.id
  WHERE att.completed_at IS NOT NULL AND att.started_at >= now() - interval '60 days'
  GROUP BY a.id, a.title
  HAVING COUNT(att.id) >= 5
  ORDER BY pass_rate ASC NULLS LAST
  LIMIT 5
),
top_commented AS (
  SELECT c.id, c.title, COUNT(*) AS comments
  FROM course_comments cc
  JOIN courses c ON c.id=cc.course_id
  WHERE COALESCE(cc.is_deleted,false)=false AND cc.created_at >= now() - interval '30 days'
  GROUP BY c.id, c.title
  ORDER BY COUNT(*) DESC
  LIMIT 5
)
SELECT jsonb_build_object(
  'learning_health', jsonb_build_object(
    'week_minutes', (SELECT this_week FROM session_minutes),
    'prev_week_minutes', (SELECT prev_week FROM session_minutes),
    'week_active', (SELECT this_week FROM week_sessions),
    'prev_week_active', (SELECT prev_week FROM week_sessions),
    'completion_rate', (SELECT CASE WHEN total>0 THEN ROUND(100.0*done/total,1) ELSE 0 END FROM completion),
    'total_enrollments', (SELECT total FROM completion),
    'total_completions', (SELECT done FROM completion),
    'stuck_courses', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'stuck_count',stuck_count)),'[]'::jsonb) FROM stuck),
    'heatmap', (SELECT COALESCE(jsonb_agg(jsonb_build_object('dow',dow,'hr',hr,'n',n)),'[]'::jsonb) FROM heatmap)
  ),
  'user_insights', jsonb_build_object(
    'dau', (SELECT dau FROM dau_wau_mau),
    'wau', (SELECT wau FROM dau_wau_mau),
    'mau', (SELECT mau FROM dau_wau_mau),
    'new_users', (SELECT new_users FROM new_returning),
    'returning_users', (SELECT returning_users FROM new_returning),
    'dormant', (SELECT n FROM dormant),
    'branches', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',id,'name',name,'total',total_users,'active',active_users,
          'rate',ROUND(100.0*active_users/NULLIF(total_users,0),1)
        )
      ),'[]'::jsonb)
      FROM branch_stats
    )
  ),
  'content_quality', jsonb_build_object(
    'low_completion', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'course_title',course_title,'attempts',attempts,'rate',rate)),'[]'::jsonb) FROM low_completion),
    'assessment_pass_rate', (SELECT CASE WHEN attempted>0 THEN ROUND(100.0*passed/attempted,1) ELSE 0 END FROM assessment_rate),
    'assessment_attempts', (SELECT attempted FROM assessment_rate),
    'low_pass_assessments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'attempts',attempts,'pass_rate',pass_rate)),'[]'::jsonb) FROM low_pass_assessments),
    'top_commented', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'comments',comments)),'[]'::jsonb) FROM top_commented)
  )
)
$$;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_insights() TO authenticated;
