import {
  BookOpen, Users, ClipboardCheck, TrendingUp, ArrowRight, Clock, Plus, LayoutDashboard,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { useUser } from "@/contexts/UserContext";
import { useLeaderScope } from "@/hooks/useLeaderScope";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

const TeacherDashboard = () => {
  const { user, profile } = useUser();
  const { scopeIds, branch } = useLeaderScope();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.language?.startsWith("en") ? enUS : ko;

  const branchLabel = branch
    ? (i18n.language?.startsWith("en") && branch.name_en ? branch.name_en : branch.name) +
      (branch.code ? ` (${branch.code})` : "")
    : "";

  const { data: courses = [] } = useQuery({
    queryKey: ["teacher-dash-courses", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").eq("instructor_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Department-scoped students (members of the leader's branch with student role)
  const { data: deptStudents = [] } = useQuery({
    queryKey: ["teacher-dash-dept-students", scopeIds],
    queryFn: async () => {
      if (scopeIds.length === 0) return [];
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");
      const idSet = new Set((roleRows ?? []).map((r: any) => r.user_id));
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id")
        .in("department_id", scopeIds);
      if (error) throw error;
      return (data ?? []).filter((p: any) => idSet.has(p.user_id));
    },
    enabled: scopeIds.length > 0,
  });

  const deptStudentIds = deptStudents.map((p: any) => p.user_id);

  const courseIds = courses.map((c: any) => c.id);

  // Enrollments are scoped to department students (across ALL courses they're enrolled in)
  const { data: enrollments = [] } = useQuery({
    queryKey: ["teacher-dash-enrollments", deptStudentIds],
    queryFn: async () => {
      if (deptStudentIds.length === 0) return [];
      const { data, error } = await supabase
        .from("enrollments")
        .select("course_id, user_id, progress, completed_at")
        .in("user_id", deptStudentIds);
      if (error) throw error;
      return data;
    },
    enabled: deptStudentIds.length > 0,
  });

  // Recent submissions from students in the leader's department (across any course)
  const { data: recentSubmissions = [] } = useQuery({
    queryKey: ["teacher-dash-submissions", deptStudentIds],
    queryFn: async () => {
      if (deptStudentIds.length === 0) return [];
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*, assignments(title, course_id, courses(title))")
        .in("student_id", deptStudentIds)
        .order("submitted_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: deptStudentIds.length > 0,
  });

  const { data: submitterProfiles = [] } = useQuery({
    queryKey: ["teacher-dash-profiles", recentSubmissions.map((s: any) => s.student_id)],
    queryFn: async () => {
      const ids = [...new Set(recentSubmissions.map((s: any) => s.student_id))];
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      if (error) throw error;
      return data;
    },
    enabled: recentSubmissions.length > 0,
  });

  const profileMap = new Map(submitterProfiles.map((p: any) => [p.user_id, p.full_name]));

  const totalStudents = deptStudentIds.length;
  const publishedCourses = courses.filter((c: any) => c.status === "published").length;
  const draftCourses = courses.filter((c: any) => c.status !== "published").length;
  const pendingSubmissions = recentSubmissions.filter((s: any) => s.status === "submitted");

  const enrollmentCountMap = new Map<string, number>();
  enrollments.forEach((e: any) => {
    enrollmentCountMap.set(e.course_id, (enrollmentCountMap.get(e.course_id) || 0) + 1);
  });

  const stats = [
    { label: t("teacher.totalStudents"), value: totalStudents, sub: branchLabel || t("teacher.myStudents"), icon: Users },
    { label: t("teacher.activeCourses"), value: publishedCourses, sub: t("teacher.waitingCount", { count: draftCourses }), icon: BookOpen },
    { label: t("teacher.allCourses"), value: courses.length, sub: t("teacher.registeredCourses"), icon: LayoutDashboard },
    { label: t("teacher.recentSubmissions"), value: pendingSubmissions.length, sub: t("teacher.recentAssignmentSub"), icon: TrendingUp },
  ];

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-primary" aria-hidden="true" /> {t("teacher.teacherDashboard")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t("teacher.manageStudents")}</p>
          </div>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label={t("teacher.teacherDashboard")}>
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4" role="group" aria-label={stat.label}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-[11px] text-primary mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </section>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">{t("teacher.myCoursesList")}</h2>
              <p className="text-xs text-muted-foreground">{t("teacher.manageCourseDesc")}</p>
            </div>
            <Link to="/teacher/courses">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" aria-label={t("common.viewAll")}>
                {t("common.viewAll")} <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Button>
            </Link>
          </div>

          {courses.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{t("teacher.noCourses")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {courses.slice(0, 5).map((course: any) => {
                const studentCount = enrollmentCountMap.get(course.id) || 0;
                const courseEnrollments = enrollments.filter((e: any) => e.course_id === course.id);
                const avgProgress = courseEnrollments.length > 0
                  ? Math.round(courseEnrollments.reduce((s: number, e: any) => s + (Number(e.progress) || 0), 0) / courseEnrollments.length)
                  : 0;

                return (
                  <Link key={course.id} to={`/teacher/courses/${course.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-accent/20 transition-colors group" aria-label={course.title}>
                    {course.thumbnail_url ? (
                      <img src={course.thumbnail_url} alt={course.title} className="h-12 w-[76px] aspect-[16/10] rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="h-12 w-[76px] aspect-[16/10] rounded-lg bg-accent flex items-center justify-center shrink-0" aria-hidden="true">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{course.title}</span>
                        <Badge
                          variant="secondary"
                          className={`text-[9px] h-4 shrink-0 ${
                            course.status === "published"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {course.status === "published" ? t("teacher.published") : t("teacher.unpublished")}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-muted-foreground"><Users className="h-3 w-3 inline mr-0.5" aria-hidden="true" />{studentCount}{t("common.people")}</span>
                        <span className="text-[11px] text-muted-foreground">{t("teacher.progressPercent", { percent: avgProgress })}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">{t("teacher.recentSubmissionsTitle")}</h2>
            </div>
            {recentSubmissions.length === 0 ? (
              <div className="text-center py-10">
                <ClipboardCheck className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t("teacher.noSubmissions")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentSubmissions.slice(0, 5).map((sub: any) => (
                  <div key={sub.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                      {(profileMap.get(sub.student_id) || t("teacher.student"))[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{profileMap.get(sub.student_id) || t("teacher.student")}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{sub.assignments?.title} · {sub.assignments?.courses?.title}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge
                        variant="secondary"
                        className={`text-[9px] ${
                          sub.status === "submitted"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : sub.status === "graded"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {sub.status === "submitted" ? t("teacher.ungraded") : sub.status === "graded" ? t("teacher.graded") : t("teacher.returned")}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {sub.submitted_at ? formatDistanceToNow(new Date(sub.submitted_at), { addSuffix: true, locale: dateFnsLocale }) : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">{t("teacher.courseStats")}</h2>
              <p className="text-xs text-muted-foreground">{t("teacher.myCourseStatus")}</p>
            </div>
            <div className="px-5 py-3 space-y-0">
              {[
                { label: t("teacher.totalCoursesCount"), value: `${courses.length}${t("common.count")}` },
                { label: t("teacher.activeCoursesCount"), value: `${publishedCourses}${t("common.count")}` },
                { label: t("teacher.totalStudentsCount"), value: `${totalStudents}${t("common.people")}` },
                { label: t("teacher.waitingCoursesCount"), value: `${draftCourses}${t("common.count")}` },
              ].map((row, idx) => (
                <div key={row.label} className={`flex items-center justify-between py-3 ${idx > 0 ? "border-t border-border" : ""}`}>
                  <span className="text-sm text-muted-foreground">{row.label}</span>
                  <span className="text-sm font-semibold text-foreground">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TeacherDashboard;