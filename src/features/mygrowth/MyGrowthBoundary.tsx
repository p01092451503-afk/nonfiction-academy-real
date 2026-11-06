import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { canAccessMyGrowth, existingHome, MY_GROWTH_ENABLED } from './access';
import MyGrowthScaffold from './pages/MyGrowthScaffold';

/** Fails closed: any error or missing answer from the server means no access. */
export default function MyGrowthBoundary() {
  const { user, roles, isLoading } = useUser();
  const userId = user?.id ?? null;
  const { data: confirmed, isLoading: checking } = useQuery({
    queryKey: ['mygrowth-reviewer', userId],
    enabled: MY_GROWTH_ENABLED && !!userId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_mygrowth_reviewer');
      if (error) return false;
      return data === true;
    },
  });
  if (isLoading || (userId && checking)) return null;
  if (!canAccessMyGrowth({ enabled: MY_GROWTH_ENABLED, verifiedUserId: userId, serverConfirmedReviewer: confirmed === true })) {
    return <Navigate to={user ? existingHome(roles) : '/'} replace />;
  }
  return <MyGrowthScaffold />;
}
