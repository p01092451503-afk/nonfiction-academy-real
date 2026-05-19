import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, User, BookOpen, Clock, CheckCircle2, TrendingUp, Calendar } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useLeaderScope } from "@/hooks/useLeaderScope";
import { formatDistanceToNow, format } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

const TeacherStudentDetail = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const { user } = useUser();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.language === "ko" ? ko : enUS;
  const dateFormat = i18n.language === "ko" ? "yyyy.MM.dd" : "MMM dd, yyyy";

  const contentTypeLabel: Record<string, string> = {
    video: t("course.video"),
    document: t("course.document"),
    quiz: t("course.quiz"),
    assignment: t("course.assignment"),
    live: t("course.live"),
  };

  // Fetch student profile
  const { data: profile } = useQuery({
    queryKey: ["student-profile", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", studentId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  // Fetch teacher's courses
  const { data: myCourses = [] } = useQuery({
    queryKey: ["teacher-courses", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, estimated_duration_hours, status")
        .eq("instructor_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const courseIds = myCourses.map((c) => c.id);

  const { data: enrollments = [] } = useQuery({
    queryKey: ["student-enrollments", studentId, courseIds],
    queryFn: async () => {
      if (!courseIds.length) return [];
      const { data, error } = await supabase
        .from("enrollments")
        .select("*")
        .eq("user_id", studentId!)
        .in("course_id", courseIds);
      if (error) throw error;
      return data;
    },
    enabled: !!studentId && courseIds.length > 0,
  });

  const { data: courseContents = [] } = useQuery({
    queryKey: ["course-contents-for-student", courseIds],
    queryFn: async () => {
      if (!courseIds.length) return [];
      const { data, error } = await supabase
        .from("course_contents")
        .select("id, course_id, title, content_type, duration_minutes, is_published, order_index")
        .in("course_id", courseIds)
        .eq("is_published", true)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: courseIds.length > 0,
  });

  const contentIds = courseContents.map((c) => c.id);
  const { data: progressData = [] } = useQuery({
    queryKey: ["student-content-progress", studentId, contentIds],
    queryFn: async () => {
      if (!contentIds.length) return [];
      const { data, error } = await supabase
        .from("content_progress")
        .select("*")
        .eq("user_id", studentId!)
        .in("content_id", contentIds);
      if (error) throw error;
      return data;
    },
    enabled: !!studentId && contentIds.length > 0,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["student-assignments", courseIds],
    queryFn: async () => {
      if (!courseIds.length) return [];
      const { data, error } = await supabase
        .from("assignments")
        .select("id, title, course_id, max_score, status")
        .in("course_id", courseIds);
      if (error) throw error;
      return data;
    },
    enabled: courseIds.length > 0,
  });

  const assignmentIds = assignments.map((a) => a.id);
  const { data: submissions = [] } = useQuery({
    queryKey: ["student-submissions", studentId, assignmentIds],
    queryFn: async () => {
      if (!assignmentIds.length) return [];
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*")
        .eq("student_id", studentId!)
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      return data;
    },
    enabled: !!studentId && assignmentIds.length > 0,
  });

  const progressMap = new Map(progressData.map((p) => [p.content_id, p]));
  const courseMap = new Map(myCourses.map((c) => [c.id, c]));
  const submissionMap = new Map(submissions.map((s) => [s.assignment_id, s]));

  const enrolledCourseIds = enrollments.map((e) => e.course_id);

  const courseDetails = enrolledCourseIds.map((courseId) => {
    const course = courseMap.get(courseId);
    const enrollment = enrollments.find((e) => e.course_id === courseId);
    const contents = courseContents.filter((c) => c.course_id === courseId);
    const completedContents = contents.filter((c) => progressMap.get(c.id)?.completed);
    const courseAssignments = assignments.filter((a) => a.course_id === courseId);
    const courseSubmissions = courseAssignments
      .map((a) => submissionMap.get(a.id))
      .filter(Boolean);

    const totalDuration = contents.reduce((sum, c) => sum + (c.duration_minutes || 0), 0);
    const completedDuration = completedContents.reduce(
      (sum, c) => sum + (c.duration_minutes || 0),
      0
    );

    const contentProgresses = contents
      .map((c) => progressMap.get(c.id))
      .filter(Boolean);
    const lastActivity = contentProgresses.length
      ? contentProgresses.reduce((latest, p) => {
          const d = p!.last_accessed_at || p!.completed_at;
          return d && d > (latest || "") ? d : latest;
        }, "" as string)
      : null;

    const progressPct = contents.length > 0
      ? Math.round((completedContents.length / contents.length) * 100)
      : 0;

    return {
      courseId,
      title: course?.title || t("course.course"),
      enrollment,
      totalContents: contents.length,
      completedContents: completedContents.length,
      progressPct,
      totalDuration,
      completedDuration,
      lastActivity,
      isCompleted: !!enrollment?.completed_at,
      contents: contents.map((c) => ({
        ...c,
        progress: progressMap.get(c.id),
      })),
      assignmentCount: courseAssignments.length,
      submittedCount: courseSubmissions.length,
      avgScore: courseSubmissions.length > 0
        ? Math.round(
            courseSubmissions.reduce((sum, s) => sum + (s!.score || 0), 0) /
              courseSubmissions.length
          )
        : null,
    };
  });

  const totalCourses = courseDetails.length;
  const completedCourses = courseDetails.filter((c) => c.isCompleted).length;
  const overallProgress = totalCourses > 0
    ? Math.round(courseDetails.reduce((s, c) => s + c.progressPct, 0) / totalCourses)
    : 0;
  const totalCompletedContents = courseDetails.reduce((s, c) => s + c.completedContents, 0);
  const totalContents = courseDetails.reduce((s, c) => s + c.totalContents, 0);

  const name = profile?.full_name || t("common.user");

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/teacher/students")} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-base font-bold text-primary shrink-0">
              {name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">{name}</h1>
              <p className="text-xs text-muted-foreground truncate">
                {profile?.department || "-"}{profile?.position ? ` · ${profile.position}` : ""}
                {profile?.employee_id ? ` · ${profile.employee_id}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: t("studentDetail.enrolledCourses"), value: totalCourses, sub: `${completedCourses} ${t("studentDetail.completed")}`, icon: BookOpen },
            { label: t("studentDetail.overallProgress"), value: `${overallProgress}%`, sub: t("studentDetail.contentsProgress", { completed: totalCompletedContents, total: totalContents }), icon: TrendingUp },
            { label: t("studentDetail.completedCourses"), value: completedCourses, sub: totalCourses > 0 ? t("studentDetail.completionRate", { percent: Math.round((completedCourses / totalCourses) * 100) }) : "0%", icon: CheckCircle2 },
            { label: t("studentDetail.learningContents"), value: totalCompletedContents, sub: t("studentDetail.totalContents", { count: totalContents }), icon: Clock },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Per-course detail */}
        {courseDetails.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t("studentDetail.noEnrolledCourses")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {courseDetails.map((course) => (
              <div key={course.courseId} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Course header */}
                <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground truncate">{course.title}</h3>
                      <Badge variant="secondary" className={`text-[10px] font-semibold shrink-0 ${
                        course.isCompleted
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-primary/10 text-primary"
                      }`}>
                        {course.isCompleted ? t("common.complete") : t("studentDetail.inProgress")}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t("studentDetail.enrollDate")}: {course.enrollment?.enrolled_at ? format(new Date(course.enrollment.enrolled_at), dateFormat, { locale: dateFnsLocale }) : "-"}
                      {course.lastActivity && ` · ${t("studentDetail.recentActivityLabel")}: ${formatDistanceToNow(new Date(course.lastActivity), { addSuffix: true, locale: dateFnsLocale })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">{course.progressPct}%</p>
                      <p className="text-[10px] text-muted-foreground">{course.completedContents}/{course.totalContents} {t("common.complete")}</p>
                    </div>
                    <div className="w-20">
                      <Progress value={course.progressPct} className="h-2" />
                    </div>
                  </div>
                </div>

                {/* Content list */}
                <div className="divide-y divide-border">
                  {course.contents.map((content, idx) => {
                    const done = content.progress?.completed;
                    const pct = content.progress?.progress_percentage || 0;
                    return (
                      <div key={content.id} className={`px-3 sm:px-5 py-2 sm:py-2.5 flex items-center gap-2 sm:gap-3 text-sm ${done ? "bg-green-50/50 dark:bg-green-950/10" : ""}`}>
                        <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0">{idx + 1}</span>
                        <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                          done ? "bg-green-500 text-white" : "border border-border text-muted-foreground"
                        }`}>
                          {done ? <CheckCircle2 className="h-3 w-3" /> : <span className="text-[9px]">{Math.round(Number(pct))}%</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs truncate ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{content.title}</p>
                        </div>
                        <Badge variant="outline" className="text-[9px] shrink-0">{t("course.flip")}</Badge>
                        {content.duration_minutes && (
                          <span className="text-[10px] text-muted-foreground shrink-0">{content.duration_minutes}{t("common.minutes")}</span>
                        )}
                        {content.progress?.last_accessed_at && (
                          <span className="text-[10px] text-muted-foreground shrink-0 hidden lg:inline">
                            {formatDistanceToNow(new Date(content.progress.last_accessed_at), { addSuffix: true, locale: dateFnsLocale })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Assignment summary */}
                {course.assignmentCount > 0 && (
                  <div className="px-5 py-3 border-t border-border bg-secondary/20 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{t("studentDetail.assignmentsSub", { submitted: course.submittedCount, total: course.assignmentCount })}</span>
                    {course.avgScore !== null && <span>{t("studentDetail.avgScore", { score: course.avgScore })}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TeacherStudentDetail;