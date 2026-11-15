import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import RouteSkeleton from "@/components/RouteSkeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canAccessMyGrowth, MY_GROWTH_ENABLED } from "@/features/mygrowth/access";

const RoleBasedRedirect = () => {
  const { user, isLoading } = useUser();
  const { primaryRole } = useUserRole();
  const { teacherRoleEnabled, isLoading: settingsLoading } = useSystemSettings();
  const userId = user?.id ?? null;
  const reviewer = useQuery({
    queryKey: ["mygrowth-reviewer", userId],
    enabled: MY_GROWTH_ENABLED && !!userId && !isLoading,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_mygrowth_reviewer");
      return !error && data === true;
    },
  });

  if (isLoading || settingsLoading || (MY_GROWTH_ENABLED && userId && reviewer.isFetching)) {
    return <RouteSkeleton />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!reviewer.isError && canAccessMyGrowth({
    enabled: MY_GROWTH_ENABLED,
    verifiedUserId: userId,
    serverConfirmedReviewer: reviewer.data === true,
  })) {
    return <Navigate to="/my-growth" replace />;
  }

  switch (primaryRole) {
    case "admin":
      return <Navigate to="/admin" replace />;
    case "teacher":
      return <Navigate to={teacherRoleEnabled ? "/teacher" : "/student"} replace />;
    default:
      return <Navigate to="/student" replace />;
  }
};

export default RoleBasedRedirect;
