-- 백업 롤백(복원) 함수: 지정한 날짜의 백업 스냅샷을 현재 테이블에 다시 적용한다.
-- 백업 이후 생성된 행은 삭제하지 않고, 백업에 있던 행만 되돌린다(upsert).
CREATE OR REPLACE FUNCTION public.restore_data_backup(
  p_backup_date date,
  p_source_table text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_available integer := 0;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  ) THEN
    RAISE EXCEPTION 'permission denied: admin role required';
  END IF;

  IF p_source_table NOT IN ('profiles', 'enrollments', 'content_progress') THEN
    RAISE EXCEPTION 'unsupported table: %', p_source_table;
  END IF;

  SELECT count(*) INTO v_available
  FROM public.daily_data_backups b
  WHERE b.backup_date = p_backup_date AND b.source_table = p_source_table;

  IF v_available = 0 THEN
    RAISE EXCEPTION 'no backup found for % on %', p_source_table, p_backup_date;
  END IF;

  IF p_source_table = 'profiles' THEN
    WITH src AS (
      SELECT (jsonb_populate_record(NULL::public.profiles, b.row_data)).*
      FROM public.daily_data_backups b
      WHERE b.backup_date = p_backup_date AND b.source_table = 'profiles'
    ), ins AS (
      INSERT INTO public.profiles AS p (
        user_id, full_name, avatar_url, phone_number, department, position,
        employee_id, created_at, updated_at, department_id, team_name, tenant_id, email
      )
      SELECT s.user_id, s.full_name, s.avatar_url, s.phone_number, s.department, s.position,
             s.employee_id, s.created_at, s.updated_at, s.department_id, s.team_name, s.tenant_id, s.email
      FROM src s
      WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id)
      ON CONFLICT (user_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        phone_number = EXCLUDED.phone_number,
        department = EXCLUDED.department,
        position = EXCLUDED.position,
        employee_id = EXCLUDED.employee_id,
        updated_at = EXCLUDED.updated_at,
        department_id = EXCLUDED.department_id,
        team_name = EXCLUDED.team_name,
        tenant_id = EXCLUDED.tenant_id,
        email = EXCLUDED.email
      RETURNING 1
    )
    SELECT count(*) INTO v_count FROM ins;

  ELSIF p_source_table = 'enrollments' THEN
    WITH src AS (
      SELECT (jsonb_populate_record(NULL::public.enrollments, b.row_data)).*
      FROM public.daily_data_backups b
      WHERE b.backup_date = p_backup_date AND b.source_table = 'enrollments'
    ), ins AS (
      INSERT INTO public.enrollments AS e (
        id, user_id, course_id, progress, enrolled_at, completed_at,
        status, reviewed_by, reviewed_at, completion_count
      )
      SELECT s.id, s.user_id, s.course_id, s.progress, s.enrolled_at, s.completed_at,
             s.status, s.reviewed_by, s.reviewed_at, s.completion_count
      FROM src s
      WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id)
        AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = s.course_id)
      ON CONFLICT (id) DO UPDATE SET
        progress = EXCLUDED.progress,
        enrolled_at = EXCLUDED.enrolled_at,
        completed_at = EXCLUDED.completed_at,
        status = EXCLUDED.status,
        reviewed_by = EXCLUDED.reviewed_by,
        reviewed_at = EXCLUDED.reviewed_at,
        completion_count = EXCLUDED.completion_count
      RETURNING 1
    )
    SELECT count(*) INTO v_count FROM ins;

  ELSE
    WITH src AS (
      SELECT (jsonb_populate_record(NULL::public.content_progress, b.row_data)).*
      FROM public.daily_data_backups b
      WHERE b.backup_date = p_backup_date AND b.source_table = 'content_progress'
    ), ins AS (
      INSERT INTO public.content_progress AS cp (
        id, user_id, content_id, progress_percentage, last_position_seconds,
        completed, completed_at, last_accessed_at
      )
      SELECT s.id, s.user_id, s.content_id, s.progress_percentage, s.last_position_seconds,
             s.completed, s.completed_at, s.last_accessed_at
      FROM src s
      WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id)
        AND EXISTS (SELECT 1 FROM public.course_contents c WHERE c.id = s.content_id)
      ON CONFLICT (id) DO UPDATE SET
        progress_percentage = EXCLUDED.progress_percentage,
        last_position_seconds = EXCLUDED.last_position_seconds,
        completed = EXCLUDED.completed,
        completed_at = EXCLUDED.completed_at,
        last_accessed_at = EXCLUDED.last_accessed_at
      RETURNING 1
    )
    SELECT count(*) INTO v_count FROM ins;
  END IF;

  RETURN jsonb_build_object(
    'source_table', p_source_table,
    'backup_date', p_backup_date,
    'backup_rows', v_available,
    'restored_rows', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_data_backup(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_data_backup(date, text) TO authenticated;
