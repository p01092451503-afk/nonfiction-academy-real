import { Navigate } from 'react-router-dom';
import { useUser } from '@/contexts/UserContext';
import { existingHome, isMyGrowthReviewer } from './access';

/** Closed scaffold only: no business data, reviewer list or settings are fetched. */
export default function MyGrowthBoundary() {
  const { user, roles, isLoading } = useUser();
  if (isLoading) return null;
  // Isolation is unverified and the server-backed reviewer registry is not enabled.
  // Do not trust a browser session or existing administrator role as an exception.
  if (!isMyGrowthReviewer(user?.id ?? null)) {
    return <Navigate to={user ? existingHome(roles) : '/'} replace />;
  }
  return null;
}