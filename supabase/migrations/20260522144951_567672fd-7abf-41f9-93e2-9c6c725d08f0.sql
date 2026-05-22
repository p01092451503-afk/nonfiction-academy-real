-- Fix the "Perfume" course's stale i18n rows (wrong description, KO title leaking into other languages)
UPDATE public.course_i18n
SET title = '[Product] Perfume', description = NULL, updated_at = now()
WHERE course_id = 'eafecea4-6751-45c4-a144-12cd1da71121' AND language_code = 'en';

UPDATE public.course_i18n
SET title = '[产品] 香水', description = NULL, updated_at = now()
WHERE course_id = 'eafecea4-6751-45c4-a144-12cd1da71121' AND language_code = 'zh-CN';

UPDATE public.course_i18n
SET title = '[製品] 香水', description = NULL, updated_at = now()
WHERE course_id = 'eafecea4-6751-45c4-a144-12cd1da71121' AND language_code = 'ja';

-- Repair: delete any course_i18n row whose title is identical to the KO course title.
-- These rows are corrupted (auto-translation never succeeded and KO leaked into the slot),
-- and the new app logic will safely re-generate them on next edit.
DELETE FROM public.course_i18n ci
USING public.courses c
WHERE ci.course_id = c.id
  AND ci.language_code <> 'ko'
  AND TRIM(ci.title) = TRIM(c.title);