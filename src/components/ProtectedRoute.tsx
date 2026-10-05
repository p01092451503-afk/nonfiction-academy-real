import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import RouteSkeleton from "@/components/RouteSkeleton";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, isLoading } = useUser();

  if (isLoading && !user) {
    return <RouteSkeleton />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
