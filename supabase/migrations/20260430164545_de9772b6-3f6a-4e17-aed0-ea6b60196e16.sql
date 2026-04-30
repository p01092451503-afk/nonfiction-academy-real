CREATE TABLE public.course_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  parent_id uuid REFERENCES public.course_comments(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  language_code text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_comments_course ON public.course_comments(course_id, created_at DESC);
CREATE INDEX idx_course_comments_parent ON public.course_comments(parent_id);
CREATE INDEX idx_course_comments_user ON public.course_comments(user_id);

CREATE TRIGGER trg_course_comments_updated
BEFORE UPDATE ON public.course_comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.course_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view comments: enrolled or staff"
ON public.course_comments FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'teacher')
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.user_id = auth.uid()
      AND e.course_id = course_comments.course_id
      AND e.status = 'approved'
  )
);

CREATE POLICY "insert comments: enrolled or staff"
ON public.course_comments FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'teacher')
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = auth.uid()
        AND e.course_id = course_comments.course_id
        AND e.status = 'approved'
    )
  )
);

CREATE POLICY "update comments: owner"
ON public.course_comments FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "delete comments: owner or admin"
ON public.course_comments FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'super_admin')
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.course_comments;
ALTER TABLE public.course_comments REPLICA IDENTITY FULL;