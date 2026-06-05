ALTER TABLE public.learning_tracks_i18n
  ADD COLUMN IF NOT EXISTS source_title text,
  ADD COLUMN IF NOT EXISTS source_description text;

ALTER TABLE public.track_stages_i18n
  ADD COLUMN IF NOT EXISTS source_name text;