-- UI string translations (overrides for static i18n JSON)
CREATE TABLE IF NOT EXISTS public.ui_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  language_code text NOT NULL,
  value text NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, language_code)
);

CREATE INDEX IF NOT EXISTS idx_ui_translations_lang ON public.ui_translations(language_code);

ALTER TABLE public.ui_translations ENABLE ROW LEVEL SECURITY;

-- Everyone can read (UI strings are public)
CREATE POLICY "ui_translations_read_all"
  ON public.ui_translations FOR SELECT
  USING (true);

-- Only admins/super_admins can write
CREATE POLICY "ui_translations_insert_admin"
  ON public.ui_translations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "ui_translations_update_admin"
  ON public.ui_translations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "ui_translations_delete_admin"
  ON public.ui_translations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- updated_at trigger
CREATE TRIGGER set_ui_translations_updated_at
  BEFORE UPDATE ON public.ui_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
