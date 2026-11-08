-- My Growth 격리 개발 초안 전용 예시 데이터입니다.
-- 운영 데이터가 아니며, 초안이 만들어질 때마다 자동으로 다시 적용됩니다.

-- 1) 검수 시험 계정 (로그인: mygrowth-reviewer@example.com / Reviewer!2026draft)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'mygrowth-reviewer@example.com',
  extensions.crypt('Reviewer!2026draft', extensions.gen_salt('bf')),
  now(), now(), now(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"마이그로스 검수"}'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider, provider_id, identity_data, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111',
  'email',
  '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"mygrowth-reviewer@example.com"}',
  now(), now()
) ON CONFLICT DO NOTHING;

-- 2) 학습자 권한과 검수자 명단 등록
INSERT INTO public.user_roles (user_id, role)
VALUES ('11111111-1111-4111-8111-111111111111', 'student')
ON CONFLICT DO NOTHING;

INSERT INTO public.mygrowth_reviewers (user_id, note)
VALUES ('11111111-1111-4111-8111-111111111111', '초안 검수 시험 계정')
ON CONFLICT DO NOTHING;

-- 3) 성장 홈 예시 활동 데이터
INSERT INTO public.mygrowth_events (id, user_id, event_type, title, detail, occurred_on, status) VALUES
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'training',  '링크 셀링 & 센트 큐레이션 집체 교육', '오프라인 집체 교육 이수', CURRENT_DATE - 3,  'done'),
  ('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'training',  '신제품 향수 교육', '신제품 라인 소개 교육 이수', CURRENT_DATE - 10, 'done'),
  ('a0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'coaching', '고객 응대 시연 피드백', '필드 트레이너 현장 코칭', CURRENT_DATE - 5, 'done'),
  ('a0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'coaching', '월간 1:1 매니저 코칭', '매니저 정기 코칭 세션', CURRENT_DATE - 7, 'done'),
  ('a0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'coaching', '시향 서비스 시연 코칭', '필드 트레이너 현장 코칭', CURRENT_DATE - 12, 'done'),
  ('a0000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'plan', '시향 서비스 적용 계획', '교육 후 현장 적용 실행 계획', CURRENT_DATE - 4, 'in_progress'),
  ('a0000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'followup', '실행 계획 1주차 후속 확인', '매니저 후속 확인 예정', CURRENT_DATE + 4, 'scheduled')
ON CONFLICT (id) DO NOTHING;


-- 네 역할의 미지정 검수 계정입니다. 비밀번호는 기존 검수 계정과 동일합니다.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  raw_app_meta_data, raw_user_meta_data
)
SELECT id::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', email,
  (SELECT encrypted_password FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111'),
  now(), now(), now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', full_name)
FROM (VALUES
  ('22222222-2222-4222-8222-222222222222', 'growth-student@draft.invalid', '검수 학습자'),
  ('33333333-3333-4333-8333-333333333333', 'growth-admin@draft.invalid', '검수 관리자'),
  ('44444444-4444-4444-8444-444444444444', 'growth-super@draft.invalid', '검수 최고관리자'),
  ('55555555-5555-4555-8555-555555555555', 'growth-manager@draft.invalid', '검수 러닝매니저')
) AS accounts(id, email, full_name)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
SELECT gen_random_uuid(), id, 'email', id::text,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now()
FROM auth.users WHERE id IN (
  '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'
) ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('33333333-3333-4333-8333-333333333333', 'admin'),
  ('44444444-4444-4444-8444-444444444444', 'super_admin'),
  ('55555555-5555-4555-8555-555555555555', 'teacher')
ON CONFLICT DO NOTHING;

-- 러닝매니저는 기존 teacher 권한의 직책 구분을 그대로 사용합니다.
INSERT INTO public.profiles (user_id, position) VALUES
  ('55555555-5555-4555-8555-555555555555', '러닝매니저')
ON CONFLICT (user_id) DO UPDATE SET position = EXCLUDED.position;

INSERT INTO public.courses (id, title, description, status, min_learning_minutes) VALUES
  ('66666666-6666-4666-8666-666666666666', '검수용 이미지 학습', '운영 자료가 아닌 가상 학습 자료입니다.', 'published', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.course_contents (id, course_id, title, content_type, is_published, language_code) VALUES
  ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', '검수용 이미지 차시', 'media_package', true, 'ko')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.media_package_items (id, content_id, item_type, media_url, caption, order_index) VALUES
  ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 'image', '/icon-512.png', '검수용 논픽션 이미지', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.enrollments (user_id, course_id, status) VALUES
  ('22222222-2222-4222-8222-222222222222', '66666666-6666-4666-8666-666666666666', 'approved')
ON CONFLICT DO NOTHING;

-- 2번 기능의 본사 교육팀·지점 선임매니저 예시 데이터입니다.
INSERT INTO public.tenants(id,name) VALUES ('b0000000-0000-4000-8000-000000000001','검수용 논픽션') ON CONFLICT DO NOTHING;
INSERT INTO public.departments(id,name,code,country,is_active) VALUES
 ('b0000000-0000-4000-8000-000000000011','검수 성수 지점','GROWTH_TEST_A','KR',true),
 ('b0000000-0000-4000-8000-000000000012','검수 한남 지점','GROWTH_TEST_B','KR',true)
ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,raw_app_meta_data,raw_user_meta_data)
SELECT id::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',email,
 (SELECT encrypted_password FROM auth.users WHERE id='11111111-1111-4111-8111-111111111111'),now(),now(),now(),'','','','',
 '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name',full_name)
FROM (VALUES
 ('b0000000-0000-4000-8000-000000000021','growth-senior-a@draft.invalid','검수 성수 선임매니저'),
 ('b0000000-0000-4000-8000-000000000022','growth-senior-b@draft.invalid','검수 한남 선임매니저'),
 ('b0000000-0000-4000-8000-000000000023','growth-regular@draft.invalid','검수 일반 직원')
) AS accounts(id,email,full_name) ON CONFLICT DO NOTHING;
INSERT INTO auth.identities(id,user_id,provider,provider_id,identity_data,created_at,updated_at)
SELECT gen_random_uuid(),id,'email',id::text,jsonb_build_object('sub',id::text,'email',email,'email_verified',true),now(),now()
FROM auth.users WHERE id IN ('b0000000-0000-4000-8000-000000000021','b0000000-0000-4000-8000-000000000022','b0000000-0000-4000-8000-000000000023') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles(user_id,full_name,tenant_id,department_id)
VALUES
 ('b0000000-0000-4000-8000-000000000021','검수 성수 선임매니저','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011'),
 ('b0000000-0000-4000-8000-000000000022','검수 한남 선임매니저','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000012'),
 ('b0000000-0000-4000-8000-000000000023','검수 일반 직원','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011')
ON CONFLICT(user_id) DO UPDATE SET full_name=EXCLUDED.full_name,tenant_id=EXCLUDED.tenant_id,department_id=EXCLUDED.department_id;
INSERT INTO public.mygrowth_staff_registry(user_id,tenant_id,branch_id,is_senior)
VALUES
 ('b0000000-0000-4000-8000-000000000021','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011',true),
 ('b0000000-0000-4000-8000-000000000022','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000012',true),
 ('b0000000-0000-4000-8000-000000000023','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011',false)
ON CONFLICT DO NOTHING;
INSERT INTO public.mygrowth_reviewers(user_id,note) VALUES
 ('b0000000-0000-4000-8000-000000000021','2번 기능 선임매니저 예시'),
 ('b0000000-0000-4000-8000-000000000022','2번 기능 선임매니저 예시'),
 ('b0000000-0000-4000-8000-000000000023','2번 기능 일반 직원 차단 예시') ON CONFLICT DO NOTHING;
INSERT INTO public.mygrowth_education_team(user_id,tenant_id)
VALUES ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;

-- 3번 기능의 공통 성장 기록·이러닝 참고 예시 데이터입니다.
-- 검수 계정의 이러닝 수강 원본입니다. 공통 기록은 이 원본을 읽기만 하고 다시 쓰지 않습니다.
INSERT INTO public.courses (id, title, description, status, min_learning_minutes, estimated_duration_hours) VALUES
  ('c0000000-0000-4000-8000-000000000001', '검수용 브랜드 소개 강의', '운영 자료가 아닌 가상 학습 자료입니다.', 'published', 0, 1),
  ('c0000000-0000-4000-8000-000000000002', '검수용 고객 응대 강의', '운영 자료가 아닌 가상 학습 자료입니다.', 'published', 0, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.enrollments (id, user_id, course_id, status, progress, completed_at, completion_count) VALUES
  ('c0000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000001', 'approved', 100, now() - interval '6 days', 1),
  ('c0000000-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000002', 'approved', 40, NULL, 0)
ON CONFLICT (id) DO NOTHING;

-- 공통 성장 기록 예시입니다. 같은 원본은 같은 식별자로만 연결됩니다.
INSERT INTO public.mygrowth_records (id, user_id, record_type, source_table, source_id, title, detail, occurred_on, status, planned_minutes, actual_minutes, tenant_id, branch_id) VALUES
  ('c0000000-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111', 'offline_training', 'mygrowth_events', 'a0000000-0000-4000-8000-000000000001', '링크 셀링 & 센트 큐레이션 집체 교육', '오프라인 집체 교육 이수', CURRENT_DATE - 3, 'done', 120, 110, 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000011'),
  ('c0000000-0000-4000-8000-000000000022', '11111111-1111-4111-8111-111111111111', 'field_coaching', 'mygrowth_events', 'a0000000-0000-4000-8000-000000000003', '고객 응대 시연 피드백', '필드 트레이너 현장 코칭', CURRENT_DATE - 5, 'done', 30, 25, 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000011'),
  ('c0000000-0000-4000-8000-000000000023', '11111111-1111-4111-8111-111111111111', 'manager_coaching', 'mygrowth_events', 'a0000000-0000-4000-8000-000000000004', '월간 1:1 매니저 코칭', '매니저 정기 코칭 세션', CURRENT_DATE - 7, 'done', 30, 30, 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000011')
ON CONFLICT (id) DO NOTHING;

-- 4번 기능: 검수용 트레이너 지정과 참석 확인 전 교육입니다.
INSERT INTO public.mygrowth_assignments(user_id,tenant_id,branch_id,role,assigned_by) VALUES
('b0000000-0000-4000-8000-000000000021','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','trainer','11111111-1111-4111-8111-111111111111'),
('b0000000-0000-4000-8000-000000000022','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000012','trainer','11111111-1111-4111-8111-111111111111') ON CONFLICT(user_id,role) DO NOTHING;
INSERT INTO public.mygrowth_trainings(id,tenant_id,branch_id,title,training_type,training_date,location,trainer_id,planned_minutes,created_by,request_id,request_payload) VALUES
('d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','검수용 향수 서비스 교육','서비스 교육',CURRENT_DATE,'성수 교육 공간','b0000000-0000-4000-8000-000000000021',60,'11111111-1111-4111-8111-111111111111','d0000000-0000-4000-8000-000000000002','{}') ON CONFLICT DO NOTHING;
INSERT INTO public.mygrowth_training_targets(training_id,user_id,tenant_id,branch_id) VALUES
('d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000021','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011'),
('d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000023','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011') ON CONFLICT DO NOTHING;

-- 8번 기능: 소속 지점의 스토어매니저 예시 지정입니다.
INSERT INTO public.mygrowth_assignments(user_id,tenant_id,branch_id,role,assigned_by) VALUES
('b0000000-0000-4000-8000-000000000021','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','store_manager','11111111-1111-4111-8111-111111111111'),
('b0000000-0000-4000-8000-000000000022','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000012','store_manager','11111111-1111-4111-8111-111111111111') ON CONFLICT(user_id,role) DO NOTHING;

-- 10번 기능: 후속 확인용 참석 교육과 직원 실행 계획 예시입니다.
INSERT INTO public.mygrowth_trainings(id,tenant_id,branch_id,title,training_type,training_date,location,trainer_id,planned_minutes,created_by,request_id,request_payload,attendance_version) VALUES
('f0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','후속 확인 검수용 고객 응대 교육','서비스 교육',CURRENT_DATE,'성수 교육 공간','b0000000-0000-4000-8000-000000000021',60,'11111111-1111-4111-8111-111111111111','f0000000-0000-4000-8000-000000000002','{}',1) ON CONFLICT DO NOTHING;
INSERT INTO public.mygrowth_training_targets(training_id,user_id,tenant_id,branch_id,attendance_status) VALUES
('f0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000023','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','attended') ON CONFLICT DO NOTHING;
INSERT INTO public.mygrowth_action_plans(id,training_id,user_id,body,original_language) VALUES
('f0000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000023','고객의 선호 향을 먼저 확인하고 시향 순서를 매일 실천합니다.','ko') ON CONFLICT DO NOTHING;

-- 중간 회의 사용자 목록·상세 연결용 예시입니다.
INSERT INTO public.mygrowth_trainings(id,tenant_id,branch_id,title,training_type,session_kind,training_date,location,trainer_id,planned_minutes,actual_minutes,summary,created_by,request_id,request_payload,attendance_version) VALUES
('f1000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','향 취향 상담과 시향 안내','필드 코칭','field_coaching','2026-10-15','성수 매장','b0000000-0000-4000-8000-000000000021',30,25,'고객 질문과 응대 순서를 확인합니다.','b0000000-0000-4000-8000-000000000021','f1000000-0000-4000-8000-000000000011','{}',1),
('f1000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','팀 협업과 고객 인계','매니저 코칭','manager_coaching','2026-11-05','성수 매장','b0000000-0000-4000-8000-000000000021',30,NULL,'고객 인계 내용을 함께 확인합니다.','b0000000-0000-4000-8000-000000000021','f1000000-0000-4000-8000-000000000012','{}',1),
('f1000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','신제품 향과 고객 응대 교육','제품 교육','education','2026-09-18','성수 교육 공간','b0000000-0000-4000-8000-000000000021',60,55,'향의 특징을 구분합니다.
시향 순서를 정리합니다.
고객의 선호를 확인합니다.','11111111-1111-4111-8111-111111111111','f1000000-0000-4000-8000-000000000013','{}',1) ON CONFLICT DO NOTHING;
INSERT INTO public.mygrowth_training_targets(training_id,user_id,tenant_id,branch_id,attendance_status) VALUES
('f1000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000023','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','attended'),
('f1000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000023','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','attended'),
('f1000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000023','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','attended') ON CONFLICT DO NOTHING;
INSERT INTO public.mygrowth_field_coaching(training_id,observation,feedback,next_action) VALUES
('f1000000-0000-4000-8000-000000000001','고객에게 향을 설명하기 전에 선호를 묻는 질문이 필요합니다.','좋아하는 향과 사용 상황을 먼저 확인한 뒤 시향을 안내합니다.','매일 두 가지 질문을 먼저 시도합니다.') ON CONFLICT DO NOTHING;
INSERT INTO public.mygrowth_manager_coaching(training_id,observation,feedback,next_action,original_language) VALUES
('f1000000-0000-4000-8000-000000000002','고객 인계 때 상담 내용을 빠뜨리지 않도록 확인합니다.','다음 담당자에게 고객의 선호와 시향한 향을 함께 전달합니다.','인계할 내용을 짧게 정리합니다.','ko') ON CONFLICT DO NOTHING;

INSERT INTO public.enrollments(id,user_id,course_id,status,progress,completion_count) VALUES
('f1000000-0000-4000-8000-000000000021','b0000000-0000-4000-8000-000000000023','c0000000-0000-4000-8000-000000000001','approved',35,0) ON CONFLICT DO NOTHING;
