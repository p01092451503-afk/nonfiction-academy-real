import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserPlus, Globe, Monitor } from "lucide-react";
import { startOfMonth, startOfDay } from "date-fns";
import { useTranslation } from "react-i18next";
import StatCard from "@/components/ui/stat-card";
import { useDashboardSparklines, computeDelta } from "@/hooks/useDashboardSparklines";

const SiteSummaryCard = () => {
  const { t } = useTranslation();
  const today = startOfDay(new Date()).toISOString();
  const monthStart = startOfMonth(new Date()).toISOString();

  const { data } = useQuery({
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

  const { data: spark } = useDashboardSparklines(14);
  const sessions7 = (spark?.sessions ?? []).slice(-7);
  const signups7 = (spark?.signups ?? []).slice(-7);
  const pageviews7 = (spark?.pageviews ?? []).slice(-7);

  const visitorsDelta = computeDelta(spark?.sessions);
  const signupsDelta  = computeDelta(spark?.signups);
  const pageviewsDelta = computeDelta(spark?.pageviews);

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
