import { useQuery } from "@tanstack/react-query";
import { Clock, Users, GraduationCap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardFilters } from "./DashboardFilterBar";

interface DashboardWeeklySummaryProps {
  filters: DashboardFilters;
  leaderId?: string;
}

export const DashboardWeeklySummary = ({ filters, leaderId }: DashboardWeeklySummaryProps) => {
  const { t } = useTranslation();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard-weekly-summary", filters, leaderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_weekly_summary", {
        p_filters: filters as any,
        p_leader_id: leaderId || null,
      });
      if (error) throw error;
      return data as {
        this_week_learning_minutes: number;
        this_week_active_learners: number;
        prev_week_learning_minutes: number;
        prev_week_active_learners: number;
        this_week_completion_rate: number;
        prev_week_completion_rate: number;
        total_enrollments: number;
      };
    },
    staleTime: 60_000,
  });

  const deltaPct = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const items = [
    {
      key: "learningMinutes",
      label: t("dashboard.weekly.learningMinutes", { defaultValue: "이번 주 학습 시간" }),
      value: summary?.this_week_learning_minutes ?? 0,
      prev: summary?.prev_week_learning_minutes ?? 0,
      icon: Clock,
      unit: t("common.minutes"),
    },
    {
      key: "activeLearners",
      label: t("dashboard.weekly.activeLearners", { defaultValue: "이번 주 활동 학습자" }),
      value: summary?.this_week_active_learners ?? 0,
      prev: summary?.prev_week_active_learners ?? 0,
      icon: Users,
      unit: t("common.people"),
    },
    {
      key: "completionRate",
      label: t("dashboard.weekly.completionRate", { defaultValue: "이번 주 이수율" }),
      value: summary?.this_week_completion_rate ?? 0,
      prev: summary?.prev_week_completion_rate ?? 0,
      icon: GraduationCap,
      unit: t("common.percent"),
      isPercent: true,
    },
  ];

  return (
    <div className="stat-card !p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">
        {t("dashboard.weekly.title", { defaultValue: "주간 요약" })}
      </h3>
      <div className="space-y-4">
        {items.map((item) => {
          const delta = deltaPct(item.value, item.prev);
          const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
          const color =
            delta > 0 ? "text-chart-2" : delta < 0 ? "text-destructive" : "text-muted-foreground";
          return (
            <div key={item.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-foreground tabular-nums">
                  {isLoading ? "-" : item.value}
                  {item.unit}
                </span>
                {!isLoading && (
                  <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
                    <Icon className="h-3 w-3" />
                    {delta > 0 ? "+" : ""}{delta}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("dashboard.weekly.totalEnrollments", { defaultValue: "전체 수강 등록" })}</span>
          <span className="font-medium text-foreground">{isLoading ? "-" : summary?.total_enrollments ?? 0}{t("common.cases")}</span>
        </div>
      </div>
    </div>
  );
};

export default DashboardWeeklySummary;
