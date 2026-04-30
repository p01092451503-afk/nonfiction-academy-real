-- ============================================================
-- 기존 강의를 1강의 = 4차시(KO/EN/ZH-CN/JA) 구조로 마이그레이션
-- ============================================================
-- 사용법: Supabase SQL Editor에서 실행하거나, psql로 실행.
-- 안전: idempotent — 여러 번 실행해도 중복 생성되지 않습니다.
-- ============================================================

-- 1) 기존 차시는 모두 한국어(ko)로 표시
UPDATE public.course_contents
SET language_code = 'ko'
WHERE language_code IS NULL OR language_code NOT IN ('ko','en','zh-CN','ja');

-- 2) 강의별로 부족한 언어 슬롯을 빈 차시로 채움
--    각 강의에 KO/EN/ZH-CN/JA 4개 차시가 모두 있도록 보장.
WITH langs(code, ord) AS (
  VALUES ('ko', 0), ('en', 1), ('zh-CN', 2), ('ja', 3)
),
missing AS (
  SELECT c.id AS course_id, c.title AS course_title, l.code AS lang, l.ord
  FROM public.courses c
  CROSS JOIN langs l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.course_contents cc
    WHERE cc.course_id = c.id AND cc.language_code = l.code
  )
)
INSERT INTO public.course_contents (
  course_id, title, content_type, video_provider, video_url,
  order_index, is_published, is_preview, language_code
)
SELECT
  m.course_id,
  m.course_title || ' (' || m.lang || ')',
  'document'::content_type,
  'custom'::video_provider,
  NULL,
  m.ord,
  false,           -- 빈 슬롯이므로 미공개로 시작
  false,
  m.lang
FROM missing m;

-- 3) order_index 정규화: 강의별로 KO=0, EN=1, ZH-CN=2, JA=3
UPDATE public.course_contents cc
SET order_index = CASE cc.language_code
  WHEN 'ko'    THEN 0
  WHEN 'en'    THEN 1
  WHEN 'zh-CN' THEN 2
  WHEN 'ja'    THEN 3
  ELSE cc.order_index
END
WHERE cc.language_code IN ('ko','en','zh-CN','ja');

-- 4) 결과 확인
SELECT
  c.id AS course_id,
  c.title,
  COUNT(cc.id) AS lesson_count,
  array_agg(cc.language_code ORDER BY cc.order_index) AS languages
FROM public.courses c
LEFT JOIN public.course_contents cc ON cc.course_id = c.id
GROUP BY c.id, c.title
ORDER BY c.created_at DESC
LIMIT 20;
