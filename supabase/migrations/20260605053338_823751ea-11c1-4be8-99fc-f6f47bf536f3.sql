UPDATE public.media_package_items
SET
  overlay_autoplay = COALESCE(overlay_autoplay, true),
  overlay_loop = COALESCE(overlay_loop, true),
  overlay_muted = COALESCE(overlay_muted, true),
  overlay_show_controls = COALESCE(overlay_show_controls, false),
  overlay_volume = COALESCE(overlay_volume, 100),
  overlay_playback_rate = COALESCE(overlay_playback_rate, 1.0),
  overlay_delay_sec = COALESCE(overlay_delay_sec, 0),
  overlay_opacity = COALESCE(overlay_opacity, 100);

ALTER TABLE public.media_package_items
  ALTER COLUMN overlay_autoplay SET DEFAULT true,
  ALTER COLUMN overlay_loop SET DEFAULT true,
  ALTER COLUMN overlay_muted SET DEFAULT true,
  ALTER COLUMN overlay_show_controls SET DEFAULT false,
  ALTER COLUMN overlay_volume SET DEFAULT 100,
  ALTER COLUMN overlay_playback_rate SET DEFAULT 1.0,
  ALTER COLUMN overlay_delay_sec SET DEFAULT 0,
  ALTER COLUMN overlay_opacity SET DEFAULT 100;

CREATE OR REPLACE FUNCTION public.normalize_media_package_overlay_options()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.overlay_autoplay := COALESCE(NEW.overlay_autoplay, true);
  NEW.overlay_loop := COALESCE(NEW.overlay_loop, true);
  NEW.overlay_muted := COALESCE(NEW.overlay_muted, true);
  NEW.overlay_show_controls := COALESCE(NEW.overlay_show_controls, false);
  NEW.overlay_volume := COALESCE(NEW.overlay_volume, 100);
  NEW.overlay_playback_rate := COALESCE(NEW.overlay_playback_rate, 1.0);
  NEW.overlay_delay_sec := COALESCE(NEW.overlay_delay_sec, 0);
  NEW.overlay_opacity := COALESCE(NEW.overlay_opacity, 100);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_media_package_overlay_options_trigger ON public.media_package_items;
CREATE TRIGGER normalize_media_package_overlay_options_trigger
BEFORE INSERT OR UPDATE ON public.media_package_items
FOR EACH ROW
EXECUTE FUNCTION public.normalize_media_package_overlay_options();