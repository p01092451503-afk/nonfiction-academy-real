ALTER TABLE public.media_package_items
  ADD COLUMN IF NOT EXISTS overlay_video_url TEXT,
  ADD COLUMN IF NOT EXISTS overlay_video_provider TEXT,
  ADD COLUMN IF NOT EXISTS overlay_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS overlay_x NUMERIC,
  ADD COLUMN IF NOT EXISTS overlay_y NUMERIC,
  ADD COLUMN IF NOT EXISTS overlay_w NUMERIC,
  ADD COLUMN IF NOT EXISTS overlay_h NUMERIC;