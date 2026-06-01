INSERT INTO public.badges (name, description, icon, badge_type, requirement_type, requirement_value) VALUES
  ('첫 걸음', '첫 번째 강의를 완료했습니다', 'target', 'milestone', 'lessons_completed', 1),
  ('학습왕', '10개 강의를 완료했습니다', 'book-open', 'milestone', 'lessons_completed', 10),
  ('마스터', '50개 강의를 완료했습니다', 'trophy', 'milestone', 'lessons_completed', 50),
  ('꾸준함', '7일 연속 학습했습니다', 'flame', 'streak', 'streak', 7),
  ('습관 형성', '30일 연속 학습했습니다', 'gem', 'streak', 'streak', 30),
  ('포인트 수집가', '100 포인트를 달성했습니다', 'star', 'points', 'points', 100),
  ('포인트 부자', '1000 포인트를 달성했습니다', 'sparkles', 'points', 'points', 1000),
  ('과제 마스터', '10개 과제를 완료했습니다', 'pen-tool', 'milestone', 'assignments_completed', 10),
  ('코스 정복자', '3개 코스를 수료했습니다', 'graduation-cap', 'milestone', 'courses_completed', 3)
ON CONFLICT DO NOTHING;