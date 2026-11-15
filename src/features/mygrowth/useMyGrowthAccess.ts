import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { MY_GROWTH_ENABLED } from './access';

/** Display integration is never an authorization grant. All record RPCs keep their scope. */
export function useMyGrowthAccess() {
  const { user, isLoading } = useUser();
  const query = useQuery({
    queryKey: ['mygrowth-reviewer', user?.id ?? null],
    enabled: MY_GROWTH_ENABLED && Boolean(user?.id) && !isLoading,
    staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_mygrowth_reviewer');
      return !error && data === true;
    },
  });
  return { ...query, allowed: MY_GROWTH_ENABLED && Boolean(user?.id) && !isLoading && !query.isError && !query.isFetching && query.data === true };
}