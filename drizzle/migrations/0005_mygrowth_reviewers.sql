CREATE TABLE public.mygrowth_reviewers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mygrowth_reviewers TO service_role;
ALTER TABLE public.mygrowth_reviewers ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.is_mygrowth_reviewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.mygrowth_reviewers WHERE user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.is_mygrowth_reviewer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_mygrowth_reviewer() TO authenticated;