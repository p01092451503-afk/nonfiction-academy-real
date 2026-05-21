import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider } from "@/contexts/UserContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import RoleBasedRedirect from "@/components/RoleBasedRedirect";
import Auth from "./pages/Auth"; // keep eager: first paint
import TrafficLogger from "./components/TrafficLogger";
import AdminWebVitalsGate from "./components/AdminWebVitalsGate";
import AppErrorBoundary from "./components/AppErrorBoundary";
import RouteSkeleton from "./components/RouteSkeleton";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import PlatformUpdateBanner from "./components/PlatformUpdateBanner";

const lazyWithRetry = <T extends { default: React.ComponentType<any> }>(factory: () => Promise<T>) =>
  lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        return await factory();
      } catch (retryError) {
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
  const location = useLocation();

  return (
    <AppErrorBoundary key={location.pathname}>
      <Suspense fallback={<RouteSkeleton />}>
        <Routes>
          <Route path="/" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={<ProtectedRoute><RoleBasedRedirect /></ProtectedRoute>} />

          {/* Student */}
          <Route path="/student" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/courses" element={<ProtectedRoute><StudentCourses /></ProtectedRoute>} />
          <Route path="/dashboard/assignments" element={<ProtectedRoute><StudentAssignments /></ProtectedRoute>} />
          <Route path="/dashboard/achievements" element={<ProtectedRoute><StudentAchievements /></ProtectedRoute>} />
          <Route path="/catalog" element={<ProtectedRoute><CourseCatalog /></ProtectedRoute>} />
          <Route path="/mypage" element={<ProtectedRoute><MyPage /></ProtectedRoute>} />
          <Route path="/student/announcements" element={<ProtectedRoute><StudentAnnouncements /></ProtectedRoute>} />
          <Route path="/student/board" element={<ProtectedRoute><StudentBoard /></ProtectedRoute>} />
          <Route path="/student/tracks" element={<ProtectedRoute><StudentTracks /></ProtectedRoute>} />

          {/* Teacher */}
          <Route path="/teacher" element={<ProtectedRoute><TeacherDashboard /></ProtectedRoute>} />
          <Route path="/teacher/courses" element={<ProtectedRoute><TeacherCourses /></ProtectedRoute>} />
          <Route path="/teacher/assignments" element={<ProtectedRoute><TeacherAssignments /></ProtectedRoute>} />
          <Route path="/teacher/courses/new" element={<ProtectedRoute><CreateCourse /></ProtectedRoute>} />
          <Route path="/teacher/courses/:courseId/edit" element={<ProtectedRoute><CreateCourse /></ProtectedRoute>} />
          <Route path="/teacher/students" element={<ProtectedRoute><TeacherStudents /></ProtectedRoute>} />
          <Route path="/teacher/students/:studentId" element={<ProtectedRoute><TeacherStudentDetail /></ProtectedRoute>} />
          <Route path="/teacher/notifications" element={<ProtectedRoute><TeacherNotifications /></ProtectedRoute>} />
          <Route path="/teacher/announcements" element={<ProtectedRoute><TeacherAnnouncements /></ProtectedRoute>} />
          <Route path="/teacher/board" element={<ProtectedRoute><AdminBoard role="teacher" /></ProtectedRoute>} />
          <Route path="/teacher/attendance" element={<ProtectedRoute><AdminAttendance role="teacher" /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
          <Route path="/admin/courses" element={<AdminRoute><AdminCourses /></AdminRoute>} />
          <Route path="/admin/courses/new" element={<AdminRoute><CreateCourse /></AdminRoute>} />
          <Route path="/admin/courses/:courseId/edit" element={<AdminRoute><CreateCourse /></AdminRoute>} />
          <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
          <Route path="/admin/enrollments" element={<AdminRoute><AdminEnrollments /></AdminRoute>} />
          <Route path="/admin/learning" element={<AdminRoute><AdminLearning /></AdminRoute>} />
          <Route path="/admin/attendance" element={<AdminRoute><AdminAttendance role="admin" /></AdminRoute>} />
          <Route path="/admin/completion" element={<AdminRoute><AdminCompletion /></AdminRoute>} />
          <Route path="/admin/traffic" element={<AdminRoute><AdminTraffic /></AdminRoute>} />
          <Route path="/admin/platform-updates" element={<AdminRoute><AdminPlatformUpdates /></AdminRoute>} />
          <Route path="/admin/branches" element={<AdminRoute><AdminBranches /></AdminRoute>} />
          <Route path="/admin/notifications" element={<AdminRoute><AdminNotifications /></AdminRoute>} />
          <Route path="/admin/announcements" element={<AdminRoute><AdminAnnouncements /></AdminRoute>} />
          <Route path="/admin/board" element={<AdminRoute><AdminBoard role="admin" /></AdminRoute>} />
          <Route path="/admin/surveys" element={<AdminRoute><AdminSurveys /></AdminRoute>} />
          <Route path="/admin/videos" element={<AdminRoute><AdminVideos /></AdminRoute>} />
          <Route path="/admin/video-health" element={<AdminRoute><AdminVideoHealthCheck /></AdminRoute>} />
          <Route path="/admin/video-mobile-check" element={<AdminRoute><AdminVideoMobileCheck /></AdminRoute>} />
          <Route path="/admin/i18n" element={<AdminRoute><AdminI18n /></AdminRoute>} />
          <Route path="/admin/system-info" element={<AdminRoute><AdminSystemInfo /></AdminRoute>} />
          <Route path="/admin/tracks" element={<AdminRoute><AdminTracks /></AdminRoute>} />
          <Route path="/admin/global-dashboard" element={<AdminRoute><AdminGlobalDashboard /></AdminRoute>} />
          <Route path="/admin/legacy-records" element={<AdminRoute><AdminLegacyRecords /></AdminRoute>} />
          <Route path="/admin/migration-records" element={<AdminRoute><AdminMigrationRecords /></AdminRoute>} />

          {/* Dept Admin */}
          <Route path="/dept-admin" element={<ProtectedRoute><DeptAdminDashboard /></ProtectedRoute>} />

          {/* Course Detail & Content Player (role-based) */}
          <Route path="/admin/courses/:courseId" element={<AdminRoute><CourseDetail /></AdminRoute>} />
          <Route path="/teacher/courses/:courseId" element={<ProtectedRoute><CourseDetail /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId" element={<ProtectedRoute><CourseDetail /></ProtectedRoute>} />
          <Route path="/admin/courses/:courseId/content/:contentId" element={<AdminRoute><ContentPlayer /></AdminRoute>} />
          <Route path="/teacher/courses/:courseId/content/:contentId" element={<ProtectedRoute><ContentPlayer /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId/content/:contentId" element={<ProtectedRoute><ContentPlayer /></ProtectedRoute>} />
          <Route path="/admin/courses/:courseId/assessment/:assessmentId" element={<AdminRoute><AssessmentPage /></AdminRoute>} />
          <Route path="/teacher/courses/:courseId/assessment/:assessmentId" element={<ProtectedRoute><AssessmentPage /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId/assessment/:assessmentId" element={<ProtectedRoute><AssessmentPage /></ProtectedRoute>} />

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
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </UserProvider>
  </QueryClientProvider>
);

export default App;
