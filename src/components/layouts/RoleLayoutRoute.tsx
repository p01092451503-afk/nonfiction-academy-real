import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import ContentSkeleton from "@/components/ContentSkeleton";

/**
 * Route-level persistent layout: the sidebar/header mount once per role
 * section and only the matched page (Outlet) swaps on navigation.
 * The inner Suspense keeps lazy page loading inside the content area so the
 * sidebar never falls back to the app-wide skeleton.
 */
const RoleLayoutRoute = ({ role }: { role?: "student" | "teacher" | "admin" }) => (
  <DashboardLayout role={role}>
    <Suspense fallback={<ContentSkeleton />}>
      <Outlet />
    </Suspense>
  </DashboardLayout>
);

export default RoleLayoutRoute;
