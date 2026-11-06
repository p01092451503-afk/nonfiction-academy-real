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
INSERT INTO public.mygrowth_events (user_id, event_type, title, detail, occurred_on, status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'training',  '링크 셀링 & 센트 큐레이션 집체 교육', '오프라인 집체 교육 이수', CURRENT_DATE - 3,  'done'),
  ('11111111-1111-4111-8111-111111111111', 'training',  '신제품 향수 교육',                   '신제품 라인 소개 교육 이수', CURRENT_DATE - 10, 'done'),
  ('11111111-1111-4111-8111-111111111111', 'coaching',  '고객 응대 시연 피드백',             '필드 트레이너 현장 코칭',   CURRENT_DATE - 5,  'done'),
  ('11111111-1111-4111-8111-111111111111', 'coaching',  '월간 1:1 매니저 코칭',              '매니저 정기 코칭 세션',     CURRENT_DATE - 7,  'done'),
  ('11111111-1111-4111-8111-111111111111', 'coaching',  '시향 서비스 시연 코칭',             '필드 트레이너 현장 코칭',   CURRENT_DATE - 12, 'done'),
  ('11111111-1111-4111-8111-111111111111', 'plan',      '시향 서비스 적용 계획',             '교육 후 현장 적용 실행 계획', CURRENT_DATE - 4,  'in_progress'),
  ('11111111-1111-4111-8111-111111111111', 'followup',  '실행 계획 1주차 후속 확인',         '매니저 후속 확인 예정',     CURRENT_DATE + 4,  'scheduled');
