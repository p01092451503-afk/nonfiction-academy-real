REVOKE ALL ON FUNCTION public.submit_and_grade_assessment(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_and_grade_assessment(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_and_grade_assessment(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_and_grade_assessment(uuid, jsonb) TO service_role;