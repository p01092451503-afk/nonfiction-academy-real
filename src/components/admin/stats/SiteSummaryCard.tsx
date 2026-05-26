import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserPlus, Globe, Monitor, Loader2 } from "lucide-react";
import { startOfMonth, startOfDay } from "date-fns";
import { useTranslation } from "react-i18next";
import StatCard from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardSparklines, computeDelta } from "@/hooks/useDashboardSparklines";

const SummarySkeletonCard = () => (
  <div className="stat-card !p-4 sm:!p-5 flex flex-col gap-3 min-w-0" aria-busy="true">
    <div className="flex items-center gap-2 min-w-0">
      <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
      <Skeleton className="h-3.5 w-24" />
    </div>
    <div className="flex items-end justify-between gap-3 min-w-0">
      <div className="space-y-2">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-8 w-20 sm:w-24 shrink-0" />
    </div>
  </div>
);

const SiteSummaryCard = () => {
  const { t } = useTranslation();
  const today = startOfDay(new Date()).toISOString();
  const monthStart = startOfMonth(new Date()).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["stat-site-summary-rpc", today, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_site_summary_today");
      if (error) throw error;
      const row = (data || {}) as Record<string, number>;
      return {
        todayVisitors: Number(row.today_visitors) || 0,
        monthNewMembers: Number(row.month_new_members) || 0,
        totalMembers: Number(row.total_members) || 0,
        todayPageViews: Number(row.today_pageviews) || 0,
      };
    },
    staleTime: 3 * 60 * 1000,
  });

  const stats = data || { todayVisitors: 0, monthNewMembers: 0, totalMembers: 0, todayPageViews: 0 };

  const { data: spark, isLoading: sparkLoading } = useDashboardSparklines(14);
  const sessions7 = (spark?.sessions ?? []).slice(-7);
  const signups7 = (spark?.signups ?? []).slice(-7);
  const pageviews7 = (spark?.pageviews ?? []).slice(-7);

  const visitorsDelta = computeDelta(spark?.sessions);
  const signupsDelta  = computeDelta(spark?.signups);
  const pageviewsDelta = computeDelta(spark?.pageviews);

  // Show skeleton while the primary stats query is loading.
  // (Sparklines are secondary — they fade in when ready.)
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{t("common.loadingStats", "통계 데이터를 불러오는 중입니다...")}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" role="status" aria-live="polite">
          <SummarySkeletonCard />
          <SummarySkeletonCard />
          <SummarySkeletonCard />
          <SummarySkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">

      <StatCard
        label={t("stats.todayVisitors")}
        value={stats.todayVisitors.toLocaleString()}
        unit={t("common.people")}
        icon={Globe}
        tone="primary"
        trend={sessions7}
        delta={visitorsDelta}
      />
      <StatCard
        label={t("stats.monthNewSignups")}
        value={stats.monthNewMembers.toLocaleString()}
        unit={t("common.people")}
        icon={UserPlus}
        tone="success"
        trend={signups7}
        delta={signupsDelta}
      />
      <StatCard
        label={t("stats.totalMembers")}
        value={stats.totalMembers.toLocaleString()}
        unit={t("common.people")}
        icon={Users}
        tone="info"
      />
      <StatCard
        label={t("stats.todayPageViews")}
        value={stats.todayPageViews.toLocaleString()}
        unit={t("common.cases")}
        icon={Monitor}
        tone="warning"
        trend={pageviews7}
        delta={pageviewsDelta}
      />
    </div>
  );
};

export default SiteSummaryCard;
