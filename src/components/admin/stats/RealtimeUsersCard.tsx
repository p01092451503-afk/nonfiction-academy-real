import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wifi, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import StatCard from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardSparklines, computeDelta } from "@/hooks/useDashboardSparklines";

const RealtimeUsersCard = () => {
  const { t } = useTranslation();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: onlineCount, isLoading, refetch } = useQuery({
    queryKey: ["realtime-online-users"],
    queryFn: async () => {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("user_sessions")
        .select("*", { count: "exact", head: true })
        .is("logout_at", null)
        .gte("login_at", fifteenMinAgo);
      if (error) throw error;
      return count || 0;
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("online-users-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_sessions" },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => refetch(), 3000);
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  // Pull 7-day distinct-active-users series for the sparkline + delta.
  const { data: spark } = useDashboardSparklines(14);
  const sessions = spark?.sessions ?? [];
  const last7 = sessions.slice(-7);
  const delta = computeDelta(sessions);

  if (isLoading) {
    return (
      <div className="stat-card !p-4 sm:!p-5 flex flex-col gap-3 min-w-0" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{t("common.loadingStats", "통계 데이터를 불러오는 중입니다...")}</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <StatCard
      label={t("stats.realtimeUsers", "현재 동시접속자")}
      value={(onlineCount ?? 0).toLocaleString()}
      unit={t("common.people")}
      icon={Wifi}
      tone="primary"
      trend={last7}
      delta={delta}
      hint={t("stats.autoRefresh", "실시간 자동 갱신")}
      badge={
        <span className="relative flex h-2.5 w-2.5 mt-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-chart-2" />
        </span>
      }
    />
  );
};

export default RealtimeUsersCard;
