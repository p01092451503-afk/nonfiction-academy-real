
CREATE OR REPLACE FUNCTION public.admin_course_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT jsonb_build_object(
    'total_courses',     (SELECT COUNT(*) FROM public.courses),
    'published',         (SELECT COUNT(*) FROM public.courses WHERE status='published'),
    'draft',             (SELECT COUNT(*) FROM public.courses WHERE status='draft'),
    'mandatory',         (SELECT COUNT(*) FROM public.courses WHERE is_mandatory),
    'total_enrollments', (SELECT COUNT(*) FROM public.enrollments),
    'completed',         (SELECT COUNT(*) FROM public.enrollments WHERE completed_at IS NOT NULL),
    'avg_progress',      (SELECT COALESCE(ROUND(AVG(progress)), 0) FROM public.enrollments),
    'top_courses', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.count DESC), '[]'::jsonb) FROM (
        SELECT c.id, c.title,
               COUNT(e.id) AS count,
               COUNT(e.id) FILTER (WHERE e.completed_at IS NOT NULL) AS completions
        FROM public.courses c
        LEFT JOIN public.enrollments e ON e.course_id = c.id
        GROUP BY c.id, c.title
        ORDER BY COUNT(e.id) DESC
        LIMIT 5
      ) t
    )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.admin_site_summary_today()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT jsonb_build_object(
    'today_visitors',     (SELECT COUNT(DISTINCT user_id) FROM public.user_sessions WHERE login_at >= date_trunc('day', now())),
    'today_pageviews',    (SELECT COUNT(*) FROM public.traffic_logs WHERE event_type='page_view' AND created_at >= date_trunc('day', now())),
    'month_new_members',  (SELECT COUNT(*) FROM public.profiles WHERE created_at >= date_trunc('month', now())),
    'total_members',      (SELECT COUNT(*) FROM public.profiles),
    'online_now',         (SELECT COUNT(DISTINCT user_id) FROM public.user_sessions WHERE logout_at IS NULL AND login_at >= now() - interval '15 min')
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_course_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_site_summary_today() TO authenticated;
