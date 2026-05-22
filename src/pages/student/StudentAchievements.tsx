import { Award, Flame, Star, Target, TrendingUp, Zap, Crown, Medal, BookOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { ChartTooltipContent, chartTooltipDefaults, chartLineCursor } from "@/components/ui/chart-tooltip";
import { format, startOfWeek, subWeeks } from "date-fns";
import { getCourseTitleByLangWithContentFallback, stripLessonPrefix } from "@/lib/courseContentI18n";
import { normalizeLang } from "@/lib/i18nLang";

const badgeIcons: Record<string, React.ElementType> = {
  star: Star, flame: Flame, target: Target, award: Award, zap: Zap,
};

const StudentAchievements = () => {
  const { user } = useUser();
  const { t, i18n } = useTranslation();

  const { data: gamification } = useQuery({
    queryKey: ["my-gamification", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_gamification").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: myBadges = [] } = useQuery({
    queryKey: ["my-badges", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_badges").select("*, badges(*)").eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: allBadges = [] } = useQuery({
    queryKey: ["all-badges"],
    queryFn: async () => {
      const { data, error } = await supabase.from("badges").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_gamification").select("user_id, total_points, level").order("total_points", { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: leaderProfiles = [] } = useQuery({
    queryKey: ["leader-profiles", leaderboard.map((l: any) => l.user_id)],
    queryFn: async () => {
      const ids = leaderboard.map((l: any) => l.user_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      if (error) throw error;
      return data;
    },
    enabled: leaderboard.length > 0,
  });

  const { data: pointHistory = [] } = useQuery({
    queryKey: ["point-history", user?.id],
    queryFn: async () => {
      const eightWeeksAgo = subWeeks(new Date(), 8).toISOString();
      const { data, error } = await supabase
        .from("point_history")
        .select("points, created_at")
        .eq("user_id", user!.id)
        .gte("created_at", eightWeeksAgo)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: courseProgress = [] } = useQuery({
    queryKey: ["my-course-progress", user?.id, i18n.language],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("course_id, progress, courses(id, title, course_i18n(language_code, title))")
        .eq("user_id", user!.id)
        .eq("status", "approved")
        .order("progress", { ascending: false })
        .limit(7);
      if (error) throw error;
      const courseIds = (data || []).map((e: any) => e.course_id).filter(Boolean);
      if (courseIds.length === 0) return data || [];

      const { data: contents, error: contentsError } = await supabase
        .from("course_contents")
        .select("id, course_id, title, language_code, order_index, is_published")
        .in("course_id", courseIds)
        .eq("is_published", true)
        .order("order_index", { ascending: true });
      if (contentsError) throw contentsError;

      const contentMap = new Map<string, any[]>();
      (contents || []).forEach((content: any) => {
        const list = contentMap.get(content.course_id) || [];
        list.push(content);
        contentMap.set(content.course_id, list);
      });

      return (data || []).map((enrollment: any) => ({
        ...enrollment,
        localizedTitle: getCourseTitleByLangWithContentFallback(
          enrollment.courses,
          enrollment.courses?.course_i18n || [],
          contentMap.get(enrollment.course_id) || [],
          [],
          normalizeLang(i18n.language),
        ),
      }));
    },
    enabled: !!user?.id,
  });

  const earnedBadgeIds = new Set(myBadges.map((b: any) => b.badge_id));
  const profileMap = new Map(leaderProfiles.map((p: any) => [p.user_id, p.full_name]));

  const level = gamification?.level || 1;
  const totalPoints = gamification?.total_points || 0;
  const xp = gamification?.experience_points || 0;
  const streak = gamification?.streak_days || 0;
  const nextLevelXp = level * 200;
  const xpProgress = nextLevelXp > 0 ? Math.min(Math.round((xp / nextLevelXp) * 100), 100) : 0;
  const xpRemaining = Math.max(nextLevelXp - xp, 0);

  // Badge rate
  const badgePercent = allBadges.length > 0 ? Math.round((myBadges.length / allBadges.length) * 100) : 0;

  // Build 8-week point trend (cumulative)
  const weekBuckets = Array.from({ length: 8 }, (_, i) => {
    const weekStart = startOfWeek(subWeeks(new Date(), 7 - i), { weekStartsOn: 1 });
    return { weekStart, key: format(weekStart, "yyyy-MM-dd"), label: i === 7 ? t("achievements.thisWeek") : t("achievements.weeksAgo", { count: 7 - i }), points: 0 };
  });
  pointHistory.forEach((p: any) => {
    const created = new Date(p.created_at);
    const ws = startOfWeek(created, { weekStartsOn: 1 });
    const key = format(ws, "yyyy-MM-dd");
    const bucket = weekBuckets.find((b) => b.key === key);
    if (bucket) bucket.points += p.points || 0;
  });
  // cumulative
  const baseline = Math.max(totalPoints - weekBuckets.reduce((s, b) => s + b.points, 0), 0);
  let running = baseline;
  const trendData = weekBuckets.map((b) => {
    running += b.points;
    return { week: b.label, points: running };
  });

  // Donut data
  const levelDonut = [{ name: "level", value: xpProgress, fill: "hsl(var(--foreground))" }];
  const badgeDonut = [{ name: "badges", value: badgePercent, fill: "hsl(var(--warning))" }];

  // Course progress chart with color by progress
  const courseChartData = courseProgress.map((c: any) => {
    const localized = stripLessonPrefix(c.localizedTitle || c.courses?.title || "-");
    return {
      name: localized,
      progress: c.progress || 0,
    };
  });
  const formatAxisCourseName = (name: string) => name.length > 16 ? `${name.slice(0, 16)}…` : name;
  const getBarColor = (p: number, idx: number) => {
    // 100%인 항목들이 모두 같은 색으로 단조롭게 보이는 것을 방지하기 위해 교차 색상 적용
    if (p >= 80) return idx % 2 === 0 ? "hsl(var(--success))" : "hsl(var(--primary))";
    if (p >= 50) return idx % 2 === 0 ? "hsl(var(--warning))" : "hsl(var(--chart-2))";
    return idx % 2 === 0 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
  };

  return (
    <DashboardLayout role="student">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Award className="h-6 w-6" aria-hidden="true" />{t("achievements.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("achievements.subtitle")}</p>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3" aria-label={t("achievements.title")}>
          <div className="stat-card flex items-center gap-3 !p-3 sm:!p-4" role="group" aria-label={t("achievements.currentLevel")}>
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-bold text-foreground leading-tight">Lv.{level}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{t("achievements.currentLevel")}</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-3 !p-3 sm:!p-4" role="group" aria-label={t("achievements.totalPoints")}>
            <div className="h-8 w-8 rounded-md bg-warning/10 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-warning" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-bold text-foreground leading-tight">{totalPoints}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{t("achievements.totalPoints")}</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-3 !p-3 sm:!p-4" role="group" aria-label={t("achievements.consecutiveDays")}>
            <div className="h-8 w-8 rounded-md bg-destructive/10 flex items-center justify-center shrink-0">
              <Flame className="h-4 w-4 text-destructive" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-bold text-foreground leading-tight">{streak}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{t("achievements.consecutiveDays")}</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-3 !p-3 sm:!p-4" role="group" aria-label={t("achievements.earnedBadges")}>
            <div className="h-8 w-8 rounded-md bg-success/10 flex items-center justify-center shrink-0">
              <Award className="h-4 w-4 text-success" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-bold text-foreground leading-tight">{myBadges.length}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{t("achievements.earnedBadges")}</p>
            </div>
          </div>
        </section>

        {/* Donut visualization row */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6" aria-label={t("achievements.levelProgress")}>
          {/* Level Progress Donut */}
          <div className="stat-card !p-4 sm:!p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-sm font-medium text-foreground">{t("achievements.levelProgress")}</h3>
            </div>
            <div className="relative h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="75%" outerRadius="100%" data={levelDonut} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={10} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-3xl font-bold text-foreground">Lv.{level}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{t("achievements.toLevel", { percent: xpProgress, level: level + 1 })}</p>
              </div>
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
              <span>{xp} XP</span>
              <span>{nextLevelXp} XP</span>
            </div>
          </div>

          {/* Badge Rate Donut */}
          <div className="stat-card !p-4 sm:!p-6">
            <div className="flex items-center gap-2 mb-2">
              <Medal className="h-4 w-4 text-warning" aria-hidden="true" />
              <h3 className="text-sm font-medium text-foreground">{t("achievements.badgeRate")}</h3>
            </div>
            <div className="relative h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="75%" outerRadius="100%" data={badgeDonut} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={10} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-3xl font-bold text-foreground">{badgePercent}%</p>
                <p className="text-[11px] text-muted-foreground mt-1">{t("achievements.badgeCount", { count: myBadges.length, total: allBadges.length })}</p>
              </div>
            </div>
            <p className="text-center text-[11px] text-muted-foreground mt-2 flex items-center justify-center gap-1">
              <Award className="h-3 w-3 text-warning" aria-hidden="true" />
              {t("achievements.badgeAchieved", { percent: badgePercent })}
            </p>
          </div>

          {/* Streak */}
          <div className="stat-card !p-4 sm:!p-6">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-4 w-4 text-destructive" aria-hidden="true" />
              <h3 className="text-sm font-medium text-foreground">{t("achievements.learningStreak")}</h3>
            </div>
            <div className="h-[200px] flex flex-col items-center justify-center">
              <Flame className="h-16 w-16 text-destructive/30" aria-hidden="true" strokeWidth={1.5} />
              <p className="text-3xl font-bold text-foreground -mt-12">{streak}</p>
              <p className="text-[11px] text-muted-foreground mt-8">{t("achievements.consecutiveDays")}</p>
            </div>
            <div className="flex gap-1 mt-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full ${i < Math.min(streak, 7) ? "bg-destructive" : "bg-muted"}`} />
              ))}
            </div>
            <p className="text-center text-[10px] text-muted-foreground mt-2">{t("achievements.streakRecent")}</p>
          </div>
        </section>

        {/* Point Trend Area Chart */}
        <div className="stat-card !p-4 sm:!p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-warning" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-foreground">{t("achievements.pointTrend")}</h3>
            </div>
            <span className="text-xs text-muted-foreground">{t("achievements.totalPt", { count: totalPoints.toLocaleString() })}</span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pointGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} tickMargin={6} />
                <YAxis tick={{ fontSize: 10 }} width={36} />
                <Tooltip cursor={chartLineCursor} content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="points" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#pointGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Course progress + Next level */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="stat-card !p-4 sm:!p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-foreground">{t("achievements.courseProgress")}</h3>
            </div>
            {courseChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
            ) : (
              <div style={{ height: Math.max(courseChartData.length * 24, 180) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={courseChartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barCategoryGap="45%">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} ticks={[0, 25, 50, 75, 100]} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickFormatter={formatAxisCourseName} width={120} />
                    <Tooltip {...chartTooltipDefaults} content={<ChartTooltipContent unit="%" />} />
                    <Bar dataKey="progress" name={t("achievements.progressRate")} radius={[0, 4, 4, 0]} barSize={10}>
                      {courseChartData.map((entry, idx) => (
                        <Cell key={idx} fill={getBarColor(entry.progress, idx)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="stat-card !p-4 sm:!p-6">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="h-4 w-4 text-warning" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-foreground">{t("achievements.untilNextLevel")}</h3>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">{t("achievements.xpProgress")}</span>
              <span className="text-xs text-muted-foreground">{xp.toLocaleString()} / {nextLevelXp.toLocaleString()} XP</span>
            </div>
            <Progress value={xpProgress} className="h-2.5" />
            <p className="text-[11px] text-muted-foreground mt-2">{t("achievements.xpRemaining", { level: level + 1, xp: xpRemaining.toLocaleString() })}</p>

            <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-border">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{level}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{t("achievements.currentLevel")}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-warning">{xpProgress}%</p>
                <p className="text-[10px] text-muted-foreground mt-1">{t("achievements.progressRate")}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-success">{level + 1}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{t("achievements.nextLevelLabel")}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{t("achievements.badgeCollection")}</h2>
            <div className="stat-card !p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Medal className="h-4 w-4 text-warning" aria-hidden="true" />
                  <span className="text-xs font-medium text-foreground">{t("achievements.badgeStatus")}</span>
                </div>
                <span className="text-xs"><span className="font-bold text-foreground">{myBadges.length}</span> <span className="text-muted-foreground">/ {allBadges.length} {t("achievements.badgeUnit", { count: "" }).trim()}</span></span>
              </div>
              <Progress value={badgePercent} className="h-2" />
              <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                <span>{t("achievements.badgeAchieved", { percent: badgePercent })}</span>
                <span>{t("achievements.badgeRemaining", { count: Math.max(allBadges.length - myBadges.length, 0) })}</span>
              </div>
            </div>
            {allBadges.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("achievements.noBadges")}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {allBadges.map((badge: any) => {
                  const earned = earnedBadgeIds.has(badge.id);
                  const Icon = badgeIcons[badge.icon] || Star;
                  return (
                    <div key={badge.id} className={`stat-card text-center !p-4 ${!earned ? "opacity-40 grayscale" : ""}`}>
                      <Icon className={`h-8 w-8 mx-auto mb-2 ${earned ? "text-warning" : "text-muted-foreground"}`} />
                      <h3 className="text-sm font-medium text-foreground">{badge.name}</h3>
                      <p className="text-[10px] text-muted-foreground mt-1">{badge.description}</p>
                      {earned && <p className="text-[10px] text-success font-medium mt-1.5">{t("achievements.earned")}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{t("achievements.leaderboard")}</h2>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
            ) : (
              <div className="stat-card !p-0 divide-y divide-border">
                {leaderboard.map((entry: any, idx: number) => (
                  <div key={entry.user_id} className="p-3 flex items-center gap-3">
                    <span className={`text-sm font-bold w-6 text-center ${idx < 3 ? "text-warning" : "text-muted-foreground"}`}>
                      {idx + 1}
                    </span>
                    <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-accent-foreground shrink-0">
                      {(profileMap.get(entry.user_id) || "?").slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{profileMap.get(entry.user_id) || t("common.user")}</p>
                      <p className="text-[10px] text-muted-foreground">Lv.{entry.level || 1}</p>
                    </div>
                    <span className="text-xs font-semibold text-foreground">{entry.total_points || 0}pt</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StudentAchievements;