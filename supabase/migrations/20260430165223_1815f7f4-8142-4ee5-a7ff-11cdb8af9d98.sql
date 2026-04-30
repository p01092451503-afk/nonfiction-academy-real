-- 1) 트랙 본체
CREATE TABLE public.learning_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  title_en text,
  description text,
  description_en text,
  is_sequential boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  target_branch_ids uuid[] DEFAULT '{}'::uuid[],
  target_team_ids uuid[] DEFAULT '{}'::uuid[],
  thumbnail_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_learning_tracks_status ON public.learning_tracks(status);

CREATE TRIGGER trg_learning_tracks_updated
BEFORE UPDATE ON public.learning_tracks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) 단계 (자유 정의)
CREATE TABLE public.track_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.learning_tracks(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_en text,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_track_stages_track ON public.track_stages(track_id, order_index);

CREATE TRIGGER trg_track_stages_updated
BEFORE UPDATE ON public.track_stages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) 단계-강의 매칭 (다대다)
CREATE TABLE public.track_stage_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.track_stages(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, course_id)
);

CREATE INDEX idx_track_stage_courses_stage ON public.track_stage_courses(stage_id, order_index);
CREATE INDEX idx_track_stage_courses_course ON public.track_stage_courses(course_id);

-- 4) 트랙 배정
CREATE TABLE public.track_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.learning_tracks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (track_id, user_id)
);

CREATE INDEX idx_track_enrollments_user ON public.track_enrollments(user_id);
CREATE INDEX idx_track_enrollments_track ON public.track_enrollments(track_id);

-- 5) RLS
ALTER TABLE public.learning_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_stage_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_enrollments ENABLE ROW LEVEL SECURITY;

-- learning_tracks
CREATE POLICY "tracks: staff manage"
ON public.learning_tracks FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
);

CREATE POLICY "tracks: assigned users view"
ON public.learning_tracks FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
  OR (status = 'published' AND EXISTS (
    SELECT 1 FROM public.track_enrollments te
    WHERE te.track_id = learning_tracks.id AND te.user_id = auth.uid()
  ))
);

-- track_stages
CREATE POLICY "stages: staff manage"
ON public.track_stages FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
);

CREATE POLICY "stages: assigned users view"
ON public.track_stages FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
  OR EXISTS (
    SELECT 1 FROM public.track_enrollments te
    WHERE te.track_id = track_stages.track_id AND te.user_id = auth.uid()
  )
);

-- track_stage_courses
CREATE POLICY "stage_courses: staff manage"
ON public.track_stage_courses FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
);

CREATE POLICY "stage_courses: assigned users view"
ON public.track_stage_courses FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
  OR EXISTS (
    SELECT 1 FROM public.track_stages s
    JOIN public.track_enrollments te ON te.track_id = s.track_id
    WHERE s.id = track_stage_courses.stage_id AND te.user_id = auth.uid()
  )
);

-- track_enrollments
CREATE POLICY "track_enroll: staff manage"
ON public.track_enrollments FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'teacher')
);

CREATE POLICY "track_enroll: user view own"
ON public.track_enrollments FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 6) 트랙 배정 RPC: 트랙 내 모든 강의에 자동 enrollment(approved) 생성
CREATE OR REPLACE FUNCTION public.assign_track_to_user(p_track_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_courses_added integer := 0;
  v_track_assigned boolean := false;
BEGIN
  IF NOT (has_role(v_caller, 'admin') OR has_role(v_caller, 'super_admin') OR has_role(v_caller, 'teacher')) THEN
    RAISE EXCEPTION 'Only admins/teachers can assign tracks';
  END IF;

  INSERT INTO public.track_enrollments (track_id, user_id, assigned_by)
  VALUES (p_track_id, p_user_id, v_caller)
  ON CONFLICT (track_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_track_assigned = ROW_COUNT;

  -- 트랙 내 모든 강의에 enrollment 생성 (이미 있으면 skip, pending이면 approved로 승격)
  WITH course_ids AS (
    SELECT DISTINCT tsc.course_id
    FROM public.track_stages s
    JOIN public.track_stage_courses tsc ON tsc.stage_id = s.id
    WHERE s.track_id = p_track_id
  ),
  upserted AS (
    INSERT INTO public.enrollments (user_id, course_id, status, reviewed_by, reviewed_at, enrolled_at)
    SELECT p_user_id, c.course_id, 'approved'::enrollment_status, v_caller, now(), now()
    FROM course_ids c
    ON CONFLICT (user_id, course_id) DO UPDATE
      SET status = CASE WHEN enrollments.status = 'pending' THEN 'approved'::enrollment_status ELSE enrollments.status END,
          reviewed_by = COALESCE(enrollments.reviewed_by, EXCLUDED.reviewed_by),
          reviewed_at = COALESCE(enrollments.reviewed_at, EXCLUDED.reviewed_at)
    RETURNING 1
  )
  SELECT count(*) INTO v_courses_added FROM upserted;

  RETURN jsonb_build_object(
    'track_assigned', v_track_assigned,
    'courses_enrolled', v_courses_added
  );
END;
$$;

-- 7) 지점/팀 일괄 배정
CREATE OR REPLACE FUNCTION public.assign_track_to_department(p_track_id uuid, p_department_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_users_count integer := 0;
  v_user_id uuid;
BEGIN
  IF NOT (has_role(v_caller, 'admin') OR has_role(v_caller, 'super_admin') OR has_role(v_caller, 'teacher')) THEN
    RAISE EXCEPTION 'Only admins/teachers can assign tracks';
  END IF;

  FOR v_user_id IN
    SELECT user_id FROM public.profiles
    WHERE department_id = p_department_id
  LOOP
    PERFORM public.assign_track_to_user(p_track_id, v_user_id);
    v_users_count := v_users_count + 1;
  END LOOP;

  RETURN jsonb_build_object('users_assigned', v_users_count);
END;
$$;

-- 강의의 unique 제약 보장 (없을 시 enrollments 인덱스가 ON CONFLICT 작동에 필요)
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollments_user_course
ON public.enrollments(user_id, course_id);