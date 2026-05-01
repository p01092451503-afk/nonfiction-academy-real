CREATE TABLE IF NOT EXISTS public.comment_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.course_comments(id) ON DELETE CASCADE,
  target_lang text NOT NULL,
  translated_text text NOT NULL,
  source_lang text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_comment_translations_lookup
  ON public.comment_translations(comment_id, target_lang);

ALTER TABLE public.comment_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view translations"
  ON public.comment_translations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert translations"
  ON public.comment_translations FOR INSERT
  TO authenticated
  WITH CHECK (true);
