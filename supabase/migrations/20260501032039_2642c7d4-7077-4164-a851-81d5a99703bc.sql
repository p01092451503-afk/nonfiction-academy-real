-- learning_tracks_i18n
CREATE TABLE IF NOT EXISTS public.learning_tracks_i18n (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.learning_tracks(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (track_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_learning_tracks_i18n_track ON public.learning_tracks_i18n(track_id);

ALTER TABLE public.learning_tracks_i18n ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracks_i18n: authenticated view"
  ON public.learning_tracks_i18n FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tracks_i18n: staff manage"
  ON public.learning_tracks_i18n FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE TRIGGER trg_learning_tracks_i18n_updated_at
  BEFORE UPDATE ON public.learning_tracks_i18n
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- track_stages_i18n
CREATE TABLE IF NOT EXISTS public.track_stages_i18n (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.track_stages(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_track_stages_i18n_stage ON public.track_stages_i18n(stage_id);

ALTER TABLE public.track_stages_i18n ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stages_i18n: authenticated view"
  ON public.track_stages_i18n FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stages_i18n: staff manage"
  ON public.track_stages_i18n FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE TRIGGER trg_track_stages_i18n_updated_at
  BEFORE UPDATE ON public.track_stages_i18n
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill EN data from existing _en columns
INSERT INTO public.learning_tracks_i18n (track_id, language_code, title, description)
SELECT id, 'en', title_en, description_en
FROM public.learning_tracks
WHERE title_en IS NOT NULL AND title_en <> ''
ON CONFLICT (track_id, language_code) DO NOTHING;

INSERT INTO public.track_stages_i18n (stage_id, language_code, name)
SELECT id, 'en', name_en
FROM public.track_stages
WHERE name_en IS NOT NULL AND name_en <> ''
ON CONFLICT (stage_id, language_code) DO NOTHING;