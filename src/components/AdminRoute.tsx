import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { useUserRole } from "@/hooks/useUserRole";
import RouteSkeleton from "@/components/RouteSkeleton";

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, isLoading } = useUser();
  const { isAdmin, roles } = useUserRole();
  const isSuperAdmin = roles.includes("super_admin");

  // Keep the already-mounted layout during background auth refreshes.
  if (isLoading && !(user && (isAdmin || isSuperAdmin))) {
    return <RouteSkeleton />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!isAdmin && !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
