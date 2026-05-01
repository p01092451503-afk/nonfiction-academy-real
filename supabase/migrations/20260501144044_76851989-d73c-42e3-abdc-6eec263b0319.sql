CREATE TABLE public.legacy_learning_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_title text NOT NULL,
  course_title_en text,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at date,
  source_lms text,
  source_course_id text,
  notes text,
  uploaded_by uuid,
  upload_batch_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_legacy_learning_records_user_id ON public.legacy_learning_records(user_id);
CREATE INDEX idx_legacy_learning_records_batch ON public.legacy_learning_records(upload_batch_id);

ALTER TABLE public.legacy_learning_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own legacy records"
ON public.legacy_learning_records FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
);

CREATE POLICY "Admins manage legacy records"
ON public.legacy_learning_records FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE TRIGGER set_updated_at_legacy_learning_records
BEFORE UPDATE ON public.legacy_learning_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();