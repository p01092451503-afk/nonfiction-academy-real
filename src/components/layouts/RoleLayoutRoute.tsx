import { Outlet } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";

/**
 * Route-level persistent layout: the sidebar/header mount once per role
 * section and only the matched page (Outlet) swaps on navigation.
 */
const RoleLayoutRoute = ({ role }: { role?: "student" | "teacher" | "admin" }) => (
  <DashboardLayout role={role}>
    <Outlet />
  </DashboardLayout>
);

export default RoleLayoutRoute;
