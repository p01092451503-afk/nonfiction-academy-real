# AGENTS.md

## Architecture rules

- Dashboard layout is route-level and persistent: `RoleLayoutRoute` (src/components/layouts/RoleLayoutRoute.tsx) wraps each role section in App.tsx and renders `DashboardLayout` + `<Outlet />`. Pages must NOT wrap themselves in `DashboardLayout` — return page content only. Why: per-page layouts remount the sidebar on every navigation.
- Pages needing a custom `<main>` class use `useContentClassName()` from DashboardLayout instead of the removed `contentClassName` prop. Why: pages no longer own the layout.
- `AppErrorBoundary` must not be keyed by `location.pathname` — a keyed boundary remounts the whole tree per navigation and defeats layout persistence.
