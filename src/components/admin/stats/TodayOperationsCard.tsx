import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay } from "date-fns";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import Sparkline from "@/components/ui/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardSparklines } from "@/hooks/useDashboardSparklines";

const TodayOperationsCard = () => {
  const { t } = useTranslation();
  const today = startOfDay(new Date()).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["stat-today-operations", today],
    queryFn: async () => {
      const [enrollSelfRes, enrollBulkRes, complRes, subRes, assessRes, pendingRes, unreadRes] = await Promise.all([
        // 자발 신청: 관리자 검토 기록 없음 (reviewed_by IS NULL)
        supabase.from("enrollments").select("user_id", { count: "exact", head: true })
          .gte("enrolled_at", today).is("reviewed_by", null),
        // 관리자 일괄 등록: reviewed_by 가 기록됨 (트랙 배정/일괄 등록)
        supabase.from("enrollments").select("user_id", { count: "exact", head: true })
          .gte("enrolled_at", today).not("reviewed_by", "is", null),
        supabase.from("enrollments").select("*", { count: "exact", head: true }).gte("completed_at", today),
        supabase.from("assignment_submissions").select("*", { count: "exact", head: true }).gte("submitted_at", today),
        supabase.from("assessment_attempts").select("*", { count: "exact", head: true }).gte("started_at", today),
        supabase.from("assignment_submissions").select("*", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("notifications").select("*", { count: "exact", head: true }).eq("is_read", false),
      ]);
      return {
        todayEnrollmentsSelf: enrollSelfRes.count || 0,
        todayEnrollmentsBulk: enrollBulkRes.count || 0,
        todayCompletions: complRes.count || 0,
        todaySubmissions: subRes.count || 0,
        todayAssessments: assessRes.count || 0,
        pendingSubmissions: pendingRes.count || 0,
        unreadNotifications: unreadRes.count || 0,
      };
    },
    staleTime: 3 * 60 * 1000,
  });

  const stats = data || {
    todayEnrollmentsSelf: 0, todayEnrollmentsBulk: 0, todayCompletions: 0, todaySubmissions: 0,
    todayAssessments: 0, pendingSubmissions: 0, unreadNotifications: 0,
  };

  const { data: spark } = useDashboardSparklines(7);
  const enroll7 = spark?.enrollments ?? [];
  const compl7 = spark?.completions ?? [];
  const subm7 = spark?.submissions ?? [];
  const assess7 = spark?.assessments ?? [];

  const items = [
    { label: t("stats.newEnrollSelf", "자발 신청"), value: stats.todayEnrollmentsSelf, color: "text-primary", chart: "hsl(var(--primary))", trend: enroll7, hint: "사용자 직접 신청" },
    { label: t("stats.newEnrollBulk", "관리자 등록"), value: stats.todayEnrollmentsBulk, color: "text-muted-foreground", chart: "hsl(var(--muted-foreground))", trend: [] as number[], hint: "트랙/일괄 배정" },
    { label: t("stats.completionToday"), value: stats.todayCompletions, color: "text-chart-2", chart: "hsl(var(--chart-2))", trend: compl7, hint: "" },
    { label: t("stats.submissionToday"), value: stats.todaySubmissions, color: "text-chart-3", chart: "hsl(var(--chart-3))", trend: subm7, hint: "" },
    { label: t("stats.assessmentToday"), value: stats.todayAssessments, color: "text-chart-4", chart: "hsl(var(--chart-4))", trend: assess7, hint: "" },
    { label: t("stats.pendingGrade"), value: stats.pendingSubmissions, color: "text-destructive", chart: "hsl(var(--destructive))", trend: [] as number[], hint: "" },
    { label: t("stats.unreadNotif"), value: stats.unreadNotifications, color: "text-chart-5", chart: "hsl(var(--chart-5))", trend: [] as number[], hint: "" },
  ];

  if (isLoading) {
    return (
      <div className="stat-card !p-4 sm:!p-5 space-y-3" aria-busy="true" aria-live="polite">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{t("stats.todayOps")}</h3>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("common.loadingStats", "통계 데이터를 불러오는 중입니다...")}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="p-2.5 rounded-lg border border-border space-y-2">
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-6 w-10" />
              <Skeleton className="h-2 w-14" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card !p-4 sm:!p-5 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{t("stats.todayOps")}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        {items.map((item) => (
          <div key={item.label} className="p-2.5 rounded-lg border border-border min-w-0">
            <p className="text-[10px] text-muted-foreground truncate" title={item.hint || item.label}>{item.label}</p>
            <p className={`text-xl font-bold mt-0.5 tabular-nums ${item.color}`}>{item.value}</p>
            {item.hint && (
              <p className="text-[9px] text-muted-foreground/70 truncate mt-0.5">{item.hint}</p>
            )}
            {item.trend.length > 1 && (
              <div className="mt-1 h-5">
                <Sparkline data={item.trend} color={item.chart} height={20} showLastDot={false} strokeWidth={1.25} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TodayOperationsCard;
