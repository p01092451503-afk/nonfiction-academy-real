import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankBar } from "@/components/ui/rank-bar";
import { BookOpen, CheckCircle2, AlertCircle, FileEdit, Users, GraduationCap, TrendingUp, Award, LayoutGrid, LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import StatsLoading from "./StatsLoading";

type CourseStats = {
  total_courses: number;
  published: number;
  draft: number;
  mandatory: number;
  total_enrollments: number;
  unique_students: number;
  completed: number;
  completed_students: number;
  avg_progress: number;
  top_courses: Array<{ id: string; title: string; count: number; completions: number }>;
};

type Tone = "primary" | "success" | "warning" | "info" | "neutral";
const TONE: Record<Tone, { text: string; bg: string; ring: string }> = {
  primary: { text: "text-primary", bg: "bg-primary/10", ring: "ring-primary/20" },
  success: { text: "text-chart-2", bg: "bg-chart-2/10", ring: "ring-chart-2/20" },
  warning: { text: "text-chart-4", bg: "bg-chart-4/10", ring: "ring-chart-4/20" },
  info:    { text: "text-chart-3", bg: "bg-chart-3/10", ring: "ring-chart-3/20" },
  neutral: { text: "text-muted-foreground", bg: "bg-muted", ring: "ring-border" },
};

interface RichTileProps {
  label: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  tone: Tone;
  progress?: number;        // 0-100
  hint?: string;
}

const RichTile = ({ label, value, unit, icon: Icon, tone, progress, hint }: RichTileProps) => {
  const t = TONE[tone];
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm">
      
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className={cn("rounded-lg p-1.5 ring-1", t.bg, t.ring)}>
          <Icon className={cn("h-4 w-4", t.text)} />
        </span>
        {typeof progress === "number" && (
          <span className={cn("text-[10px] font-semibold tabular-nums", t.text)}>
            {Math.round(progress)}%
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-1 truncate">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-foreground tabular-nums leading-none">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {typeof progress === "number" ? (
        <div className="mt-3 space-y-1.5">
          <RankBar value={progress} className="h-1" />
          {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
        </div>
      ) : (
        <div className="mt-3">
          <div className="h-1 rounded-full bg-muted/60" />
          {hint && <p className="text-[10px] text-muted-foreground truncate mt-1.5">{hint}</p>}
        </div>
      )}
    </div>
  );
};

const CourseStatsCard = () => {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
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
    total_enrollments: 0, unique_students: 0,
    completed: 0, completed_students: 0,
    avg_progress: 0, top_courses: [],
  };

  const completionRate = stats.total_enrollments > 0
    ? Math.round((stats.completed / stats.total_enrollments) * 100)
    : 0;

  const studentCompletionRate = stats.unique_students > 0
    ? Math.round((stats.completed_students / stats.unique_students) * 100)
    : 0;

  const publishRatio = stats.total_courses > 0
    ? Math.round((stats.published / stats.total_courses) * 100)
    : 0;

  const mandatoryRatio = stats.total_courses > 0
    ? Math.round((stats.mandatory / stats.total_courses) * 100)
    : 0;

  const draftRatio = stats.total_courses > 0
    ? Math.round((stats.draft / stats.total_courses) * 100)
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
      <CardHeader className="pb-3 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="rounded-md p-1.5 bg-primary/10">
            <LayoutGrid className="h-4 w-4 text-primary" />
          </span>
          <CardTitle className="text-sm font-semibold">{t("stats.courseStats")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-4 space-y-3">
        {isLoading ? (
          <StatsLoading label={t("common.loading", "데이터를 불러오는 중입니다...")} height={260} />
        ) : (
        <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <RichTile
            label={t("stats.totalCoursesCount")}
            value={stats.total_courses.toLocaleString()}
            unit={itemUnit}
            icon={BookOpen}
            tone="primary"
            hint={t("common.total") + " " + stats.total_courses + itemUnit}
          />
          <RichTile
            label={t("stats.publishedCoursesCount")}
            value={stats.published.toLocaleString()}
            unit={itemUnit}
            icon={CheckCircle2}
            tone="success"
            progress={publishRatio}
            hint={`${stats.published} / ${stats.total_courses}${itemUnit}`}
          />
          <RichTile
            label={t("stats.mandatoryCoursesCount")}
            value={stats.mandatory.toLocaleString()}
            unit={itemUnit}
            icon={AlertCircle}
            tone="warning"
            progress={mandatoryRatio}
            hint={`${stats.mandatory} / ${stats.total_courses}${itemUnit}`}
          />
          <RichTile
            label={t("stats.draftCoursesCount")}
            value={stats.draft.toLocaleString()}
            unit={itemUnit}
            icon={FileEdit}
            tone="neutral"
            progress={draftRatio}
            hint={`${stats.draft} / ${stats.total_courses}${itemUnit}`}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <RichTile
            label={t("stats.totalStudentsCount")}
            value={stats.unique_students.toLocaleString()}
            unit={peopleUnit}
            icon={Users}
            tone="info"
          />
          <RichTile
            label={t("stats.completedStudents")}
            value={stats.completed_students.toLocaleString()}
            unit={peopleUnit}
            icon={GraduationCap}
            tone="success"
            progress={studentCompletionRate}
            hint={`${stats.completed_students} / ${stats.unique_students}${peopleUnit}`}
          />
          <RichTile
            label={t("stats.avgProgressRate")}
            value={`${stats.avg_progress}%`}
            icon={TrendingUp}
            tone="primary"
            progress={Number(stats.avg_progress) || 0}
          />
          <RichTile
            label={t("stats.completionRateValue")}
            value={`${completionRate}%`}
            icon={Award}
            tone="success"
            progress={completionRate}
            hint={`${stats.completed} / ${stats.total_enrollments}`}
          />
        </div>

        {topCourses.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Award className="h-3.5 w-3.5 text-primary" />
              TOP 5
            </p>
            <div className="space-y-2.5">
              {topCourses.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={cn(
                    "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0",
                    i === 0 ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  )}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate mb-1">{c.title}</p>
                    <RankBar value={topCourses[0]?.count > 0 ? (c.count / topCourses[0].count) * 100 : 0} className="h-1.5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground shrink-0 tabular-nums">
                    {c.count}{t("common.people")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        </>
        )}
      </CardContent>
    </Card>
  );
};

export default CourseStatsCard;
