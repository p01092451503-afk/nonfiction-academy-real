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
  const { data: confirmed, isLoading: checking, isFetching, isError } = useQuery({
    queryKey: ['mygrowth-reviewer', userId],
    enabled: MY_GROWTH_ENABLED && !!userId,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 15_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_mygrowth_reviewer');
      if (error) return false;
      return data === true;
    },
  });
  if (isLoading || (userId && (checking || isFetching))) return null;
  if (isError) return <Navigate to={user ? existingHome(roles) : '/'} replace />;
  if (!canAccessMyGrowth({ enabled: MY_GROWTH_ENABLED, verifiedUserId: userId, serverConfirmedReviewer: confirmed === true })) {
    return <Navigate to={user ? existingHome(roles) : '/'} replace />;
  }
  return <MyGrowthScaffold />;
}
