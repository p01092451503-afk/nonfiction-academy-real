import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Clock, MessageCircle, Trophy, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import StatCard from "@/components/ui/stat-card";
import type { DashboardFilters } from "./DashboardFilterBar";

interface DashboardMetricCardsProps {
  filters: DashboardFilters;
  leaderId?: string;
}

export const DashboardMetricCards = ({ filters, leaderId }: DashboardMetricCardsProps) => {
  const { t } = useTranslation();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ["dashboard-metrics", filters, leaderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_metrics", {
        p_filters: filters as any,
        p_leader_id: leaderId || null,
      });
      if (error) throw error;
      return data as {
        user_count: number;
        avg_completed_courses: number;
        avg_completion_rate: number;
        avg_learning_minutes: number;
        avg_comment_count: number;
        avg_points_earned: number;
        avg_learning_days: number;
      };
    },
    staleTime: 60_000,
  });

  const items = [
    {
      key: "completedCourses",
      label: t("dashboard.metric.completedCourses", { defaultValue: "평균 수강 완료 강의 수" }),
      value: Number(metrics?.avg_completed_courses ?? 0).toFixed(1),
      unit: t("common.count"),
      icon: CheckCircle2,
      tone: "success" as const,
    },
    {
      key: "completionRate",
      label: t("dashboard.metric.completionRate", { defaultValue: "평균 이수율" }),
      value: Number(metrics?.avg_completion_rate ?? 0).toFixed(1),
      unit: t("common.percent"),
      icon: BookOpen,
      tone: "primary" as const,
    },
    {
      key: "learningMinutes",
      label: t("dashboard.metric.learningMinutes", { defaultValue: "평균 학습 시간" }),
      value: Number(metrics?.avg_learning_minutes ?? 0).toFixed(0),
      unit: t("common.minutes"),
      icon: Clock,
      tone: "info" as const,
    },
    {
      key: "commentCount",
      label: t("dashboard.metric.commentCount", { defaultValue: "평균 댓글 수" }),
      value: Number(metrics?.avg_comment_count ?? 0).toFixed(1),
      unit: t("common.count"),
      icon: MessageCircle,
      tone: "warning" as const,
    },
    {
      key: "pointsEarned",
      label: t("dashboard.metric.pointsEarned", { defaultValue: "평균 포인트" }),
      value: Number(metrics?.avg_points_earned ?? 0).toFixed(0),
      unit: t("common.points"),
      icon: Trophy,
      tone: "neutral" as const,
    },
    {
      key: "learningDays",
      label: t("dashboard.metric.learningDays", { defaultValue: "평균 누적 학습일" }),
      value: Number(metrics?.avg_learning_days ?? 0).toFixed(1),
      unit: t("common.days"),
      icon: CalendarDays,
      tone: "success" as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((item) => (
        <StatCard
          key={item.key}
          label={item.label}
          value={isLoading ? "-" : item.value}
          unit={item.unit}
          icon={item.icon}
          tone={item.tone}
          hint={
            isLoading
              ? undefined
              : t("dashboard.metric.userCountHint", {
                  defaultValue: "{{count}}명 기준",
                  count: metrics?.user_count ?? 0,
                })
          }
        />
      ))}
    </div>
  );
};

export default DashboardMetricCards;
