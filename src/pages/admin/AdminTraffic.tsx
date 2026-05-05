import { lazy, Suspense, useState } from "react";
import { Activity, HardDrive, Globe, Play, TrendingUp, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { RankBar } from "@/components/ui/rank-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { ChartTooltipContent, chartTooltipDefaults, chartLineCursor } from "@/components/ui/chart-tooltip";
import { format, subDays } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

// Eager: lightweight summary cards shown above tabs
import SiteSummaryCard from "@/components/admin/stats/SiteSummaryCard";
import TodayOperationsCard from "@/components/admin/stats/TodayOperationsCard";
import RealtimeUsersCard from "@/components/admin/stats/RealtimeUsersCard";

// Lazy: chart-heavy components — load only when their tab is opened
const BranchLearningStats = lazy(() => import("@/components/admin/stats/BranchLearningStats"));
const MemberStatsCard = lazy(() => import("@/components/admin/stats/MemberStatsCard"));
const CourseStatsCard = lazy(() => import("@/components/admin/stats/CourseStatsCard"));
const LearningActivityCard = lazy(() => import("@/components/admin/stats/LearningActivityCard"));
const HourlyAccessChart = lazy(() => import("@/components/admin/stats/HourlyAccessChart"));
const SignupTrendChart = lazy(() => import("@/components/admin/stats/SignupTrendChart"));

const ChartFallback = ({ height = 250 }: { height?: number }) => (
  <div
    className="rounded-lg border border-border bg-card p-4"
    style={{ height }}
  >
    <Skeleton className="h-full w-full rounded-md" />
  </div>
);

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const AdminTraffic = () => {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const [period, setPeriod] = useState("30");

  const fromDate = subDays(new Date(), parseInt(period)).toISOString();

  const { data: trafficLogs = [] } = useQuery({
    queryKey: ["traffic-logs", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("traffic_logs")
        .select("*")
        .gte("created_at", fromDate)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const { data: storageData } = useQuery({
    queryKey: ["storage-usage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_contents")
        .select("id, video_url, video_provider, content_type");
      if (error) throw error;
      return data;
    },
  });

  const { data: infra } = useQuery({
    queryKey: ["infra-stats", period],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("infra-stats", {
        body: undefined,
        method: "GET" as any,
      });
      // functions.invoke doesn't take query, so call via fetch:
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/infra-stats?days=${period}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      return await res.json();
    },
    staleTime: 60_000,
  });

  const totalPageViews = trafficLogs.filter((l) => l.event_type === "page_view").length;
  const totalContentAccess = trafficLogs.filter((l) => l.event_type === "content_access").length;
  const uniqueUsers = new Set(trafficLogs.map((l) => l.user_id)).size;

  const contentLogs = trafficLogs.filter((l) => l.event_type === "content_access");
  const externalAccess = contentLogs.filter((l) => (l.metadata as any)?.is_external).length;
  const selfHostedAccess = contentLogs.length - externalAccess;

  // ---- REAL infrastructure usage ----
  const bunnyStorageBytes = Number(infra?.bunnyStorage?.bytes || 0);
  const bunnyStorageCount = Number(infra?.bunnyStorage?.count || 0);
  const bunnyStreamBytes = Number(infra?.bunnyStream?.storageBytes || 0);
  const bunnyStreamCount = Number(infra?.bunnyStream?.videoCount || 0);
  const bunnyStreamTrafficBytes = Number(infra?.bunnyStreamRange?.trafficBytes || 0);
  const supabaseStorageBytes = Number(infra?.supabaseStorage?.totalBytes || 0);
  const supabaseStorageCount = Number(infra?.supabaseStorage?.totalObjects || 0);

  const cdnStorageBytes = bunnyStorageBytes + bunnyStreamBytes;
  const cdnAssetCount = bunnyStorageCount + bunnyStreamCount;

  const totalContents = storageData?.length || 0;
  const videoContents = storageData?.filter((c) => c.content_type === "video").length || 0;
  const docContents = storageData?.filter((c) => c.content_type === "document").length || 0;

  const dailyMap = new Map<string, { views: number; access: number; bytes: number }>();
  for (let i = parseInt(period) - 1; i >= 0; i--) {
    const day = format(subDays(new Date(), i), "MM/dd");
    dailyMap.set(day, { views: 0, access: 0, bytes: 0 });
  }
  trafficLogs.forEach((l) => {
    const day = format(new Date(l.created_at!), "MM/dd");
    const entry = dailyMap.get(day);
    if (entry) {
      if (l.event_type === "page_view") entry.views++;
      if (l.event_type === "content_access") entry.access++;
      entry.bytes += Number(l.estimated_bytes) || 0;
    }
  });
  const dailyChartData = Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    ...data,
    bytesGB: parseFloat((data.bytes / (1024 * 1024 * 1024)).toFixed(3)),
  }));

  const pageMap = new Map<string, number>();
  trafficLogs
    .filter((l) => l.event_type === "page_view")
    .forEach((l) => {
      pageMap.set(l.page_path!, (pageMap.get(l.page_path!) || 0) + 1);
    });
  const topPages = Array.from(pageMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const trafficStats = [
    { label: "Bunny CDN 저장량 (실제)", value: formatBytes(bunnyStorageBytes), icon: HardDrive, hint: `${bunnyStorageCount}개 파일 · zone: ${infra?.bunnyStorage?.zone || "-"}` },
    { label: "Bunny Stream 저장량 (실제)", value: formatBytes(bunnyStreamBytes), icon: Play, hint: `${bunnyStreamCount}개 영상${infra?.bunnyStreamError ? " · 미설정" : ""}` },
    { label: `Bunny Stream 전송량 (${period}일)`, value: formatBytes(bunnyStreamTrafficBytes), icon: TrendingUp, hint: infra?.bunnyStreamError ? "Library ID 미설정" : "Bunny API" },
    { label: "Supabase Storage (실제)", value: formatBytes(supabaseStorageBytes), icon: Globe, hint: `${supabaseStorageCount}개 객체` },
  ];

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              {t("stats.statsTitle")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t("stats.statsDesc")}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <RealtimeUsersCard />
            <div className="xl:col-span-4">
              <SiteSummaryCard />
            </div>
          </div>
          <TodayOperationsCard />
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="text-xs">{t("stats.tabOverview")}</TabsTrigger>
            <TabsTrigger value="branch" className="text-xs">{t("stats.tabBranch")}</TabsTrigger>
            <TabsTrigger value="traffic" className="text-xs">{t("stats.tabTraffic")}</TabsTrigger>
            <TabsTrigger value="learning" className="text-xs">{t("stats.tabLearning")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Suspense fallback={<ChartFallback height={300} />}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SignupTrendChart period={parseInt(period)} />
                <HourlyAccessChart />
              </div>
              <MemberStatsCard />
              <CourseStatsCard />
            </Suspense>
          </TabsContent>

          <TabsContent value="branch" className="space-y-4">
            <Suspense fallback={<ChartFallback height={400} />}>
              <BranchLearningStats />
            </Suspense>
          </TabsContent>

          <TabsContent value="traffic" className="space-y-4">
            <div className="flex w-full sm:w-auto items-center gap-2 self-start">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t("stats.last7days")}</SelectItem>
                  <SelectItem value="30">{t("stats.last30days")}</SelectItem>
                  <SelectItem value="90">{t("stats.last90days")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
              {trafficStats.map((stat) => (
                <div key={stat.label} className="stat-card !p-3 sm:!p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.label}</p>
                      <p className="text-lg sm:text-xl font-bold text-foreground mt-1 break-words">{stat.value}</p>
                      {(stat as any).hint && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{(stat as any).hint}</p>
                      )}
                    </div>
                    <stat.icon className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground opacity-60 shrink-0" />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground -mt-2">
              ※ 위 4개 카드는 Bunny CDN/Stream 및 Supabase Storage API 실측치입니다. 아래 페이지뷰·차시재생·일별 추세는 앱 내부 로그(추정 byte) 기준입니다.
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
              <div className="stat-card !p-3 sm:!p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{t("stats.pageViews")}</p>
                <p className="text-lg font-semibold text-foreground">{totalPageViews.toLocaleString()}</p>
              </div>
              <div className="stat-card !p-3 sm:!p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{t("stats.lessonPlays")}</p>
                <p className="text-lg font-semibold text-foreground">{totalContentAccess.toLocaleString()}</p>
              </div>
              <div className="stat-card !p-3 sm:!p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{t("stats.activeUsers")}</p>
                <p className="text-lg font-semibold text-foreground">{uniqueUsers}</p>
              </div>
              <div className="stat-card !p-3 sm:!p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{t("stats.extVsSelf")}</p>
                <p className="text-lg font-semibold text-foreground">{externalAccess} / {selfHostedAccess}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t("stats.extFreeNote")}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm font-medium">{t("stats.dailyTraffic")}</CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <div className="h-[200px] sm:h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyChartData} margin={isMobile ? { top: 8, right: 4, left: 0, bottom: 0 } : { top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickMargin={8} minTickGap={isMobile ? 24 : 12} />
                        <YAxis tick={{ fontSize: 10 }} width={35} hide={isMobile} />
                        <Tooltip cursor={chartLineCursor} content={<ChartTooltipContent />} />
                        <Line type="monotone" dataKey="views" name={t("stats.pageViewLabel")} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="access" name={t("stats.lessonAccess")} stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm font-medium">{t("stats.dailyTransfer")}</CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <div className="h-[200px] sm:h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyChartData} margin={isMobile ? { top: 8, right: 4, left: 0, bottom: 0 } : { top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickMargin={8} minTickGap={isMobile ? 24 : 12} />
                        <YAxis tick={{ fontSize: 10 }} width={35} hide={isMobile} />
                        <Tooltip {...chartTooltipDefaults} content={<ChartTooltipContent unit=" GB" />} />
                        <Bar dataKey="bytesGB" name={t("stats.transferLabel")} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2 px-3 sm:px-6">
                <CardTitle className="text-sm font-medium">{t("stats.storageStatus")}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: t("stats.videoLessons"), count: videoContents },
                    { label: t("stats.docFlip"), count: docContents },
                    { label: t("stats.other"), count: totalContents - videoContents - docContents },
                  ].map((item) => (
                    <div key={item.label} className="space-y-2">
                      <div className="flex justify-between text-sm gap-3">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium shrink-0">{t("stats.itemCount", { count: item.count })}</span>
                      </div>
                      <RankBar value={totalContents > 0 ? (item.count / totalContents) * 100 : 0} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          <TabsContent value="learning" className="space-y-4">
            <Suspense fallback={<ChartFallback height={300} />}>
              <LearningActivityCard />
              <CourseStatsCard />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AdminTraffic;
