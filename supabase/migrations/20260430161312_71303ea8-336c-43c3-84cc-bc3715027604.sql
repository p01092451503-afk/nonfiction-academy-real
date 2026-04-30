-- Add language_code to course_contents to support per-language lessons (KO/EN/ZH-CN/JA)
ALTER TABLE public.course_contents
  ADD COLUMN IF NOT EXISTS language_code text NOT NULL DEFAULT 'ko';

-- Constrain to the 4 supported languages
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_contents_language_code_chk'
  ) THEN
    ALTER TABLE public.course_contents
      ADD CONSTRAINT course_contents_language_code_chk
      CHECK (language_code IN ('ko','en','zh-CN','ja'));
  END IF;
END $$;

-- Helpful index for per-course/per-language lookup
CREATE INDEX IF NOT EXISTS idx_course_contents_course_lang
  ON public.course_contents(course_id, language_code, order_index);

-- Uniqueness: one slot per (course, language)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_course_contents_course_lang'
  ) THEN
    CREATE UNIQUE INDEX uq_course_contents_course_lang
      ON public.course_contents(course_id, language_code);
  END IF;
END $$;