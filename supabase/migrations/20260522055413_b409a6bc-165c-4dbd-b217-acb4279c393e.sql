
-- PWA 브랜드 설정 (단일 행)
CREATE TABLE public.pwa_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name text NOT NULL DEFAULT 'NONFICTION Academy',
  short_name text NOT NULL DEFAULT 'NONFICTION Academy',
  description text NOT NULL DEFAULT '논픽션 사내 교육 시스템입니다.',
  theme_color text NOT NULL DEFAULT '#1a1a2e',
  background_color text NOT NULL DEFAULT '#ffffff',
  install_prompt_enabled boolean NOT NULL DEFAULT true,
  install_prompt_interval_days integer NOT NULL DEFAULT 7,
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pwa_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pwa_settings public read" ON public.pwa_settings
  FOR SELECT USING (true);

CREATE POLICY "pwa_settings admin insert" ON public.pwa_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "pwa_settings admin update" ON public.pwa_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER pwa_settings_updated_at
  BEFORE UPDATE ON public.pwa_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pwa_settings (singleton) VALUES (true);

-- platform_updates: PWA 전용 알림 플래그
ALTER TABLE public.platform_updates
  ADD COLUMN IF NOT EXISTS pwa_only boolean NOT NULL DEFAULT false;
