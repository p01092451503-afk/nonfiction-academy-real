CREATE OR REPLACE FUNCTION public.admin_course_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'total_courses',     (SELECT COUNT(*) FROM public.courses),
    'published',         (SELECT COUNT(*) FROM public.courses WHERE status='published'),
    'draft',             (SELECT COUNT(*) FROM public.courses WHERE status='draft'),
    'mandatory',         (SELECT COUNT(*) FROM public.courses WHERE is_mandatory),
    'total_enrollments', (SELECT COUNT(*) FROM public.enrollments),
    'unique_students',   (SELECT COUNT(DISTINCT user_id) FROM public.enrollments),
    'completed',         (SELECT COUNT(*) FROM public.enrollments WHERE completed_at IS NOT NULL),
    'completed_students',(SELECT COUNT(DISTINCT user_id) FROM public.enrollments WHERE completed_at IS NOT NULL),
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
$function$;