import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankBar } from "@/components/ui/rank-bar";
import StatCard from "@/components/ui/stat-card";
import { BookOpen, CheckCircle2, AlertCircle, FileEdit, Users, GraduationCap, TrendingUp, Award } from "lucide-react";
import { useTranslation } from "react-i18next";

const CourseStatsCard = () => {
  const { t } = useTranslation();

  const { data: courses = [] } = useQuery({
    queryKey: ["stat-courses-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, title, status, is_mandatory, deadline");
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["stat-enrollments-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.from("enrollments").select("course_id, progress, completed_at, status");
      if (error) throw error;
      return data;
    },
  });

  const totalCourses = courses.length;
  const published = courses.filter((c: any) => c.status === "published").length;
  const draft = courses.filter((c: any) => c.status === "draft").length;
  const mandatory = courses.filter((c: any) => c.is_mandatory).length;

  const totalEnrollments = enrollments.length;
  const completed = enrollments.filter((e: any) => e.completed_at).length;
  const completionRate = totalEnrollments > 0 ? Math.round((completed / totalEnrollments) * 100) : 0;
  const avgProgress = totalEnrollments > 0
    ? Math.round(enrollments.reduce((s: number, e: any) => s + (Number(e.progress) || 0), 0) / totalEnrollments)
    : 0;

  const pendingEnrollments = enrollments.filter((e: any) => e.status === "pending").length;
  const approvedEnrollments = enrollments.filter((e: any) => e.status === "approved").length;

  const courseEnrollMap = new Map<string, { count: number; completions: number }>();
  enrollments.forEach((e: any) => {
    const entry = courseEnrollMap.get(e.course_id) || { count: 0, completions: 0 };
    entry.count++;
    if (e.completed_at) entry.completions++;
    courseEnrollMap.set(e.course_id, entry);
  });

  const topCourses = courses
    .map((c: any) => ({
      title: c.title,
      ...courseEnrollMap.get(c.id) || { count: 0, completions: 0 },
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const itemUnit = t("common.itemsUnit", "개");
  const peopleUnit = t("common.people");

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="text-sm font-medium">{t("stats.courseStats")}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t("stats.totalCoursesCount")} value={totalCourses.toLocaleString()} unit={itemUnit} icon={BookOpen} tone="primary" />
          <StatCard label={t("stats.publishedCoursesCount")} value={published.toLocaleString()} unit={itemUnit} icon={CheckCircle2} tone="success" />
          <StatCard label={t("stats.mandatoryCoursesCount")} value={mandatory.toLocaleString()} unit={itemUnit} icon={AlertCircle} tone="warning" />
          <StatCard label={t("stats.draftCoursesCount")} value={draft.toLocaleString()} unit={itemUnit} icon={FileEdit} tone="neutral" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t("stats.totalStudentsCount")} value={totalEnrollments.toLocaleString()} unit={peopleUnit} icon={Users} tone="info" />
          <StatCard label={t("stats.completedStudents")} value={completed.toLocaleString()} unit={peopleUnit} icon={GraduationCap} tone="success" />
          <StatCard label={t("stats.avgProgressRate")} value={`${avgProgress}%`} icon={TrendingUp} tone="primary" />
          <StatCard label={t("stats.completionRateValue")} value={`${completionRate}%`} icon={Award} tone="success" />
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">TOP 5</p>
          <div className="space-y-2">
            {topCourses.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{c.title}</p>
                  <RankBar value={topCourses[0]?.count > 0 ? (c.count / topCourses[0].count) * 100 : 0} className="h-1.5 mt-1" />
                </div>
                <span className="text-xs font-semibold text-foreground shrink-0">{c.count}{t("common.people")}</span>
              </div>
            ))}
          </div>
        </div>

      </CardContent>
    </Card>
  );
};

export default CourseStatsCard;
