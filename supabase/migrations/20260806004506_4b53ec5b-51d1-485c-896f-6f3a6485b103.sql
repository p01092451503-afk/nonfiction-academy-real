ALTER TABLE public.course_learning_sessions
  ADD COLUMN IF NOT EXISTS is_estimated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimation_method text;