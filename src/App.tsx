import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider } from "@/contexts/UserContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import TeacherRoute from "@/components/TeacherRoute";
import RoleBasedRedirect from "@/components/RoleBasedRedirect";
import Auth from "./pages/Auth"; // keep eager: first paint
import TrafficLogger from "./components/TrafficLogger";
import AdminWebVitalsGate from "./components/AdminWebVitalsGate";
import AppErrorBoundary from "./components/AppErrorBoundary";
import RouteSkeleton from "./components/RouteSkeleton";
import RoleLayoutRoute from "./components/layouts/RoleLayoutRoute";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import PlatformUpdateBanner from "./components/PlatformUpdateBanner";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

/**
 * Recover from "Importing a module script failed" — happens when a new deploy
 * replaces the hashed chunk files while a user still runs the old index.html
 * (or a stale service-worker cache serves outdated asset URLs).
 * Strategy: retry once → then purge SW/caches and hard-reload one time.
 */
const CHUNK_RECOVERY_KEY = "chunk_recovery_at";

const recoverFromStaleChunks = async () => {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY) || 0);
    // Only recover once per 60s to avoid reload loops
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now()));

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
  return true;
};

const lazyWithRetry = <T extends { default: React.ComponentType<any> }>(factory: () => Promise<T>) =>
  lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        return await factory();
      } catch (retryError) {
        await recoverFromStaleChunks();
        // Keep the promise pending while the page reloads
        await new Promise(() => {});
        throw retryError;
      }
    }
  });


const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const StudentDashboard = lazyWithRetry(() => import("./pages/StudentDashboard"));
const StudentCourses = lazyWithRetry(() => import("./pages/student/StudentCourses"));
const StudentAssignments = lazyWithRetry(() => import("./pages/student/StudentAssignments"));
const StudentAchievements = lazyWithRetry(() => import("./pages/student/StudentAchievements"));
const CourseCatalog = lazyWithRetry(() => import("./pages/student/CourseCatalog"));
const MyPage = lazyWithRetry(() => import("./pages/student/MyPage"));
const TeacherDashboard = lazyWithRetry(() => import("./pages/TeacherDashboard"));
const TeacherCourses = lazyWithRetry(() => import("./pages/teacher/TeacherCourses"));
const TeacherAssignments = lazyWithRetry(() => import("./pages/teacher/TeacherAssignments"));
const CreateCourse = lazyWithRetry(() => import("./pages/teacher/CreateCourse"));
const TeacherStudents = lazyWithRetry(() => import("./pages/teacher/TeacherStudents"));
const TeacherStudentDetail = lazyWithRetry(() => import("./pages/teacher/TeacherStudentDetail"));
const TeacherNotifications = lazyWithRetry(() => import("./pages/teacher/TeacherNotifications"));
const TeacherAnnouncements = lazyWithRetry(() => import("./pages/teacher/TeacherAnnouncements"));
const AdminDashboard = lazyWithRetry(() => import("./pages/AdminDashboard"));
const AdminUsers = lazyWithRetry(() => import("./pages/admin/AdminUsers"));
const AdminCourses = lazyWithRetry(() => import("./pages/admin/AdminCourses"));
const AdminSettings = lazyWithRetry(() => import("./pages/admin/AdminSettings"));
const AdminLearning = lazyWithRetry(() => import("./pages/admin/AdminLearning"));
const AdminAttendance = lazyWithRetry(() => import("./pages/admin/AdminAttendance"));
const AdminCompletion = lazyWithRetry(() => import("./pages/admin/AdminCompletion"));
const AdminTraffic = lazyWithRetry(() => import("./pages/admin/AdminTraffic"));
const AdminPlatformUpdates = lazyWithRetry(() => import("./pages/admin/AdminPlatformUpdates"));
const AdminPWASettings = lazyWithRetry(() => import("./pages/admin/AdminPWASettings"));
const AdminBranches = lazyWithRetry(() => import("./pages/admin/AdminBranches"));
const AdminNotifications = lazyWithRetry(() => import("./pages/admin/AdminNotifications"));
const AdminAnnouncements = lazyWithRetry(() => import("./pages/admin/AdminAnnouncements"));
const StudentAnnouncements = lazyWithRetry(() => import("./pages/student/StudentAnnouncements"));
const AdminBoard = lazyWithRetry(() => import("./pages/admin/AdminBoard"));
const AdminSurveys = lazyWithRetry(() => import("./pages/admin/AdminSurveys"));
const AdminVideos = lazyWithRetry(() => import("./pages/admin/AdminVideos"));
const AdminVideoHealthCheck = lazyWithRetry(() => import("./pages/admin/AdminVideoHealthCheck"));
const AdminVideoMobileCheck = lazyWithRetry(() => import("./pages/admin/AdminVideoMobileCheck"));
const AdminI18n = lazyWithRetry(() => import("./pages/admin/AdminI18n"));
const AdminSystemInfo = lazyWithRetry(() => import("./pages/admin/AdminSystemInfo"));
const AdminTracks = lazyWithRetry(() => import("./pages/admin/AdminTracks"));
const AdminGlobalDashboard = lazyWithRetry(() => import("./pages/admin/AdminGlobalDashboard"));
const AdminLegacyRecords = lazyWithRetry(() => import("./pages/admin/AdminLegacyRecords"));
const AdminMigrationRecords = lazyWithRetry(() => import("./pages/admin/AdminMigrationRecords"));
const AdminPlatformHealth = lazyWithRetry(() => import("./pages/admin/AdminPlatformHealth"));
const StudentBoard = lazyWithRetry(() => import("./pages/student/StudentBoard"));
const StudentTracks = lazyWithRetry(() => import("./pages/student/StudentTracks"));
const DeptAdminDashboard = lazyWithRetry(() => import("./pages/DeptAdminDashboard"));
const CourseDetail = lazyWithRetry(() => import("./pages/CourseDetail"));
const AdminEnrollments = lazyWithRetry(() => import("./pages/admin/AdminEnrollments"));
const ContentPlayer = lazyWithRetry(() => import("./pages/ContentPlayer"));
const AssessmentPage = lazyWithRetry(() => import("./pages/AssessmentPage"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const CourseRedirect = lazyWithRetry(() => import("./components/CourseRedirect"));
const ContentRedirect = lazyWithRetry(() => import("./components/ContentRedirect"));
const UserManual = lazyWithRetry(() => import("./pages/UserManual"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5min — data considered fresh, no refetch
      gcTime: 15 * 60 * 1000,         // 15min — keep in cache after unmount
      refetchOnWindowFocus: false,     // prevent refetch storms with 9K users
      retry: 1,                        // reduce retry pressure on DB
    },
  },
});

const AppRoutes = () => {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<RouteSkeleton />}>
        <Routes>
          <Route path="/" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={<ProtectedRoute><RoleBasedRedirect /></ProtectedRoute>} />

          {/* Student — persistent layout, only the content swaps on navigation */}
          <Route element={<ProtectedRoute><RoleLayoutRoute role="student" /></ProtectedRoute>}>
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/dashboard/courses" element={<StudentCourses />} />
            <Route path="/dashboard/assignments" element={<StudentAssignments />} />
            <Route path="/dashboard/achievements" element={<StudentAchievements />} />
            <Route path="/catalog" element={<CourseCatalog />} />
            <Route path="/mypage" element={<MyPage />} />
            <Route path="/student/announcements" element={<StudentAnnouncements />} />
            <Route path="/student/board" element={<StudentBoard />} />
            <Route path="/student/tracks" element={<StudentTracks />} />
            <Route path="/student/courses/:courseId" element={<CourseDetail />} />
            <Route path="/student/courses/:courseId/content/:contentId" element={<ContentPlayer />} />
            <Route path="/student/courses/:courseId/assessment/:assessmentId" element={<AssessmentPage />} />
          </Route>

          {/* Teacher (requires teacher/admin role) */}
          {/* 강의 관리 권한은 관리자 전용. 러닝 리더는 /teacher 대시보드로 리다이렉트 */}
          <Route path="/teacher/courses" element={<Navigate to="/teacher" replace />} />
          <Route path="/teacher/courses/new" element={<Navigate to="/teacher" replace />} />
          <Route path="/teacher/courses/:courseId/edit" element={<Navigate to="/teacher" replace />} />
          <Route element={<TeacherRoute><RoleLayoutRoute role="teacher" /></TeacherRoute>}>
            <Route path="/teacher" element={<TeacherDashboard />} />
            <Route path="/teacher/assignments" element={<TeacherAssignments />} />
            <Route path="/teacher/students" element={<TeacherStudents />} />
            <Route path="/teacher/students/:studentId" element={<TeacherStudentDetail />} />
            <Route path="/teacher/notifications" element={<TeacherNotifications />} />
            <Route path="/teacher/announcements" element={<TeacherAnnouncements />} />
            <Route path="/teacher/board" element={<AdminBoard role="teacher" />} />
            <Route path="/teacher/attendance" element={<AdminAttendance role="teacher" />} />
            <Route path="/teacher/courses/:courseId" element={<CourseDetail />} />
            <Route path="/teacher/courses/:courseId/content/:contentId" element={<ContentPlayer />} />
            <Route path="/teacher/courses/:courseId/assessment/:assessmentId" element={<AssessmentPage />} />
          </Route>

          {/* Admin */}
          <Route element={<AdminRoute><RoleLayoutRoute role="admin" /></AdminRoute>}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/courses" element={<AdminCourses />} />
            <Route path="/admin/courses/new" element={<CreateCourse />} />
            <Route path="/admin/courses/:courseId/edit" element={<CreateCourse />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/enrollments" element={<AdminEnrollments />} />
            <Route path="/admin/learning" element={<AdminLearning />} />
            <Route path="/admin/attendance" element={<AdminAttendance role="admin" />} />
            <Route path="/admin/completion" element={<AdminCompletion />} />
            <Route path="/admin/traffic" element={<AdminTraffic />} />
            <Route path="/admin/platform-updates" element={<AdminPlatformUpdates />} />
            <Route path="/admin/pwa-settings" element={<AdminPWASettings />} />
            <Route path="/admin/branches" element={<AdminBranches />} />
            <Route path="/admin/notifications" element={<AdminNotifications />} />
            <Route path="/admin/announcements" element={<AdminAnnouncements />} />
            <Route path="/admin/board" element={<AdminBoard role="admin" />} />
            <Route path="/admin/surveys" element={<AdminSurveys />} />
            <Route path="/admin/videos" element={<AdminVideos />} />
            <Route path="/admin/video-health" element={<AdminVideoHealthCheck />} />
            <Route path="/admin/video-mobile-check" element={<AdminVideoMobileCheck />} />
            <Route path="/admin/i18n" element={<AdminI18n />} />
            <Route path="/admin/system-info" element={<AdminSystemInfo />} />
            <Route path="/admin/platform-health" element={<AdminPlatformHealth />} />
            <Route path="/admin/tracks" element={<AdminTracks />} />
            <Route path="/admin/global-dashboard" element={<AdminGlobalDashboard />} />
            <Route path="/admin/legacy-records" element={<AdminLegacyRecords />} />
            <Route path="/admin/migration-records" element={<AdminMigrationRecords />} />
            <Route path="/admin/courses/:courseId" element={<CourseDetail />} />
            <Route path="/admin/courses/:courseId/content/:contentId" element={<ContentPlayer />} />
            <Route path="/admin/courses/:courseId/assessment/:assessmentId" element={<AssessmentPage />} />
          </Route>

          {/* Shared pages — layout role follows the signed-in user's role */}
          <Route element={<ProtectedRoute><RoleLayoutRoute /></ProtectedRoute>}>
            <Route path="/manual" element={<UserManual />} />
            <Route path="/dept-admin" element={<DeptAdminDashboard />} />
          </Route>

          {/* Legacy generic routes → redirect to role-based paths */}
          <Route path="/courses/:courseId" element={<ProtectedRoute><CourseRedirect /></ProtectedRoute>} />
          <Route path="/courses/:courseId/content/:contentId" element={<ProtectedRoute><ContentRedirect /></ProtectedRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <TrafficLogger />
          <AdminWebVitalsGate />
          <PWAUpdatePrompt />
          <PlatformUpdateBanner />
          <PWAInstallPrompt />
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </UserProvider>
  </QueryClientProvider>
);

export default App;
