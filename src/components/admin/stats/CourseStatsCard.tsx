import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankBar } from "@/components/ui/rank-bar";
import StatCard from "@/components/ui/stat-card";
import { BookOpen, CheckCircle2, AlertCircle, FileEdit, Users, GraduationCap, TrendingUp, Award } from "lucide-react";
import { useTranslation } from "react-i18next";

type CourseStats = {
  total_courses: number;
  published: number;
  draft: number;
  mandatory: number;
  total_enrollments: number;
  completed: number;
  avg_progress: number;
  top_courses: Array<{ id: string; title: string; count: number; completions: number }>;
};

const CourseStatsCard = () => {
  const { t } = useTranslation();

  const { data } = useQuery({
    queryKey: ["stat-course-stats-rpc"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_course_stats");
      if (error) throw error;
      return data as unknown as CourseStats;
    },
    staleTime: 60_000,
  });

  const stats: CourseStats = data || {
    total_courses: 0, published: 0, draft: 0, mandatory: 0,
    total_enrollments: 0, completed: 0, avg_progress: 0, top_courses: [],
  };

  const completionRate = stats.total_enrollments > 0
    ? Math.round((stats.completed / stats.total_enrollments) * 100)
    : 0;

  const topCourses = (stats.top_courses || []).map((c) => ({
    title: c.title,
    count: Number(c.count) || 0,
    completions: Number(c.completions) || 0,
  }));

  const itemUnit = t("common.itemsUnit", "개");
  const peopleUnit = t("common.people");

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="text-sm font-medium">{t("stats.courseStats")}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t("stats.totalCoursesCount")} value={stats.total_courses.toLocaleString()} unit={itemUnit} icon={BookOpen} tone="primary" />
          <StatCard label={t("stats.publishedCoursesCount")} value={stats.published.toLocaleString()} unit={itemUnit} icon={CheckCircle2} tone="success" />
          <StatCard label={t("stats.mandatoryCoursesCount")} value={stats.mandatory.toLocaleString()} unit={itemUnit} icon={AlertCircle} tone="warning" />
          <StatCard label={t("stats.draftCoursesCount")} value={stats.draft.toLocaleString()} unit={itemUnit} icon={FileEdit} tone="neutral" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t("stats.totalStudentsCount")} value={stats.total_enrollments.toLocaleString()} unit={peopleUnit} icon={Users} tone="info" />
          <StatCard label={t("stats.completedStudents")} value={stats.completed.toLocaleString()} unit={peopleUnit} icon={GraduationCap} tone="success" />
          <StatCard label={t("stats.avgProgressRate")} value={`${stats.avg_progress}%`} icon={TrendingUp} tone="primary" />
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
