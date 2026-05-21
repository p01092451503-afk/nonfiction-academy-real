import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { useUserRole } from "@/hooks/useUserRole";
import RouteSkeleton from "@/components/RouteSkeleton";

interface TeacherRouteProps {
  children: React.ReactNode;
}

/**
 * Allow teacher, admin, or super_admin only.
 * Students hitting /teacher/* are redirected back to /dashboard.
 */
const TeacherRoute = ({ children }: TeacherRouteProps) => {
  const { user, isLoading } = useUser();
  const { isTeacher, isAdmin } = useUserRole();

  if (isLoading) return <RouteSkeleton />;
  if (!user) return <Navigate to="/" replace />;
  if (!isTeacher && !isAdmin) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

export default TeacherRoute;
