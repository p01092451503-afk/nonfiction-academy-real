-- 기능 03: 공통 성장 기록과 이러닝 참고 조회
-- 1) 공통 성장 기록 표: 교육·코칭·계획 기록을 한 형식으로 연결합니다.
CREATE TABLE public.mygrowth_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN ('offline_training','elearning','field_coaching','manager_coaching')),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  title text NOT NULL,
  detail text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'done' CHECK (status IN ('done','in_progress','scheduled')),
  planned_minutes integer CHECK (planned_minutes IS NULL OR planned_minutes >= 0),
  actual_minutes integer CHECK (actual_minutes IS NULL OR actual_minutes >= 0),
  tenant_id uuid REFERENCES public.tenants(id),
  branch_id uuid REFERENCES public.departments(id),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id, user_id)
);
CREATE INDEX mygrowth_records_user_idx ON public.mygrowth_records (user_id, occurred_on DESC);
CREATE INDEX mygrowth_records_source_idx ON public.mygrowth_records (source_table, source_id);
GRANT SELECT ON public.mygrowth_records TO authenticated;
GRANT ALL ON public.mygrowth_records TO service_role;
ALTER TABLE public.mygrowth_records ENABLE ROW LEVEL SECURITY;
-- 지정 검수자이면서 본인 기록만 읽을 수 있습니다. 쓰기는 서버 전용입니다.
CREATE POLICY "Reviewers read own growth records" ON public.mygrowth_records
  FOR SELECT TO authenticated
  USING (public.is_mygrowth_reviewer() AND user_id = auth.uid());

-- 2) 통합 성장 기록 조회: 공통 기록 + 이러닝 참고(읽기 전용)를 한 번에 반환합니다.
--    이러닝 행은 enrollments 원본을 읽기만 하며 어떤 표도 쓰지 않습니다.
CREATE OR REPLACE FUNCTION public.mygrowth_record_feed(_from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS TABLE(
  feed_key text,
  record_type text,
  title text,
  detail text,
  occurred_on date,
  status text,
  planned_minutes integer,
  actual_minutes integer,
  branch_name text,
  progress numeric,
  completion_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    'record:' || r.id::text,
    r.record_type,
    r.title,
    r.detail,
    r.occurred_on,
    r.status,
    r.planned_minutes,
    r.actual_minutes,
    d.name,
    NULL::numeric,
    NULL::integer
  FROM public.mygrowth_records r
  LEFT JOIN public.departments d ON d.id = r.branch_id
  WHERE public.is_mygrowth_reviewer()
    AND r.user_id = auth.uid()
    AND (_from IS NULL OR r.occurred_on >= _from)
    AND (_to IS NULL OR r.occurred_on <= _to)
  UNION ALL
  SELECT
    'elearning:' || e.id::text,
    'elearning',
    c.title,
    NULL,
    COALESCE(e.completed_at::date, e.enrolled_at::date),
    CASE WHEN e.completed_at IS NOT NULL THEN 'done'
         WHEN e.status::text = 'approved' THEN 'in_progress'
         ELSE 'scheduled' END,
    (c.estimated_duration_hours * 60)::integer,
    NULL,
    NULL,
    e.progress,
    e.completion_count
  FROM public.enrollments e
  JOIN public.courses c ON c.id = e.course_id
  WHERE public.is_mygrowth_reviewer()
    AND e.user_id = auth.uid()
    AND (_from IS NULL OR COALESCE(e.completed_at::date, e.enrolled_at::date) >= _from)
    AND (_to IS NULL OR COALESCE(e.completed_at::date, e.enrolled_at::date) <= _to)
  ORDER BY occurred_on DESC
$$;

-- 3) 이러닝 참고 조회 전용: 수강 원본을 읽기만 합니다.
CREATE OR REPLACE FUNCTION public.mygrowth_elearning_reference()
RETURNS TABLE(
  enrollment_id uuid,
  course_title text,
  enrolled_at timestamptz,
  completed_at timestamptz,
  progress numeric,
  completion_count integer,
  status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, c.title, e.enrolled_at, e.completed_at, e.progress, e.completion_count, e.status::text
  FROM public.enrollments e
  JOIN public.courses c ON c.id = e.course_id
  WHERE public.is_mygrowth_reviewer() AND e.user_id = auth.uid()
  ORDER BY e.enrolled_at DESC
$$;