DROP POLICY IF EXISTS "Anyone can view for leaderboard" ON public.user_gamification;
DROP POLICY IF EXISTS "Anyone can view badges for leaderboard" ON public.user_badges;

CREATE POLICY "Admins and leaders can view gamification" ON public.user_gamification
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
  OR public.is_user_in_leader_scope(auth.uid(), user_id)
);
CREATE POLICY "Admins and leaders can view badges" ON public.user_badges
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
  OR public.is_user_in_leader_scope(auth.uid(), user_id)
);

CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, total_points int, level int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.user_id, g.total_points::int, g.level::int
  FROM public.user_gamification g
  WHERE auth.uid() IS NOT NULL
  ORDER BY g.total_points DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit,10),1),50)
$$;
REVOKE ALL ON FUNCTION public.get_leaderboard(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(int) TO authenticated;

DROP POLICY IF EXISTS "My Growth materials are service transported only" ON storage.objects;