# AGENTS.md

## Architecture rules

- Dashboard layout is route-level and persistent: `RoleLayoutRoute` (src/components/layouts/RoleLayoutRoute.tsx) wraps each role section in App.tsx and renders `DashboardLayout` + `<Outlet />`. Pages must NOT wrap themselves in `DashboardLayout` — return page content only. Why: per-page layouts remount the sidebar on every navigation.
- Pages needing a custom `<main>` class use `useContentClassName()` from DashboardLayout instead of the removed `contentClassName` prop. Why: pages no longer own the layout.
- `AppErrorBoundary` must not be keyed by `location.pathname` — a keyed boundary remounts the whole tree per navigation and defeats layout persistence.
- `RoleLayoutRoute` wraps its `<Outlet />` in its own `<Suspense fallback={<ContentSkeleton />}>`. Why: lazy page chunks otherwise suspend up to the app-wide Suspense and replace the sidebar with a full-screen skeleton.
- Route guards (`ProtectedRoute`/`AdminRoute`/`TeacherRoute`) only show the full skeleton while no authorized user is known. Why: background auth refreshes must not unmount the persistent layout.
- My Growth development and QA must run in a separate draft with verified isolated dependencies; fail closed if live database, storage, functions, jobs, or integrations remain reachable. Never alter production routes, roles, settings, backups, or learning data during development. Why: all existing roles must retain their current service until an explicitly approved integration release.
- Before any My Growth work in a draft, run `bash scripts/mygrowth-draft-isolation.sh apply` then `verify`; stop if verify reports any FAIL. Blocks are runtime-only and vanish on sandbox restart; edge function code must not use raw sockets (`Deno.connect*`). Why: kernel firewalls are unavailable, so draft isolation relies on proxy/hosts blocks, removed integration secrets, disabled auth mail hook and revoked pg_net/pg_cron grants.
- `/my-growth` access is decided only by the server function `is_mygrowth_reviewer()` over `mygrowth_reviewers` (service-role writes only, no client grants); errors fail closed and admin roles or browser settings never grant access. Why: the reviewer gate must not become an authorization bypass.
