-- Add video_package content type
ALTER TYPE public.content_type ADD VALUE IF NOT EXISTS 'video_package';

-- Per-language video items inside a single course content (차시)
CREATE TABLE IF NOT EXISTS public.video_package_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.course_contents(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL DEFAULT 'ko',
  order_index INTEGER NOT NULL DEFAULT 0,
  video_asset_id UUID REFERENCES public.video_assets(id) ON DELETE SET NULL,
  video_url TEXT NOT NULL,
  video_provider TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_package_items_content_lang
  ON public.video_package_items(content_id, language_code, order_index);

ALTER TABLE public.video_package_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled users can view video package items"
ON public.video_package_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.course_contents cc
    JOIN public.enrollments e ON e.course_id = cc.course_id AND e.user_id = auth.uid()
    WHERE cc.id = video_package_items.content_id
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
);

CREATE POLICY "Teachers and admins manage video package items"
ON public.video_package_items
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
);

CREATE TRIGGER update_video_package_items_updated_at
BEFORE UPDATE ON public.video_package_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();