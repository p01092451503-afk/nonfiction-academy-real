ALTER TABLE public.course_i18n DROP CONSTRAINT IF EXISTS course_i18n_language_code_check;
ALTER TABLE public.course_i18n ADD CONSTRAINT course_i18n_language_code_check
  CHECK (language_code = ANY (ARRAY['ko'::text, 'en'::text, 'ja'::text, 'zh-CN'::text, 'yue'::text]));

ALTER TABLE public.course_content_i18n DROP CONSTRAINT IF EXISTS course_content_i18n_language_code_check;
ALTER TABLE public.course_content_i18n ADD CONSTRAINT course_content_i18n_language_code_check
  CHECK (language_code = ANY (ARRAY['ko'::text, 'en'::text, 'ja'::text, 'zh-CN'::text, 'yue'::text]));

ALTER TABLE public.course_contents DROP CONSTRAINT IF EXISTS course_contents_language_code_chk;
ALTER TABLE public.course_contents ADD CONSTRAINT course_contents_language_code_chk
  CHECK (language_code = ANY (ARRAY['ko'::text, 'en'::text, 'zh-CN'::text, 'ja'::text, 'yue'::text]));