import { useMemo, useState } from "react";
import {
  Users, BookOpen, Activity, LayoutDashboard, Building2, GraduationCap,
  AlertTriangle, ClipboardCheck, Bell, Megaphone, Clock, ChevronRight,
  UserPlus, CheckCircle2, FileText, ArrowRight,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import StatCard from "@/components/ui/stat-card";
import { useDashboardSparklines, computeDelta } from "@/hooks/useDashboardSparklines";
import DashboardInsights from "@/components/admin/DashboardInsights";
import DashboardFilterBar, { DashboardFilters } from "@/components/admin/DashboardFilterBar";
import DashboardMetricCards from "@/components/admin/DashboardMetricCards";
import DashboardWeeklySummary from "@/components/admin/DashboardWeeklySummary";
import DashboardDropoffCourses from "@/components/admin/DashboardDropoffCourses";

import DashboardLearnerTable from "@/components/admin/DashboardLearnerTable";

const defaultFilters: DashboardFilters = {
  years: [],
  months: [],
  countries: [],
  branch_ids: [],
};

const AdminDashboard = () => {
  const { profile } = useUser();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isEn = i18n.language?.startsWith("en");
  const locale = isEn ? enUS : ko;
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);

  // ── Data Queries ──
  const { data: onlineUsers = 0 } = useQuery({
    queryKey: ["dash-realtime-online"],
    queryFn: async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("user_sessions")
        .select("user_id", { count: "exact", head: true })
        .gte("login_at", fiveMinAgo);
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const { data: todayStats } = useQuery({
    queryKey: ["dash-today-stats"],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      const [signupsRes, completionsRes] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", todayISO),
        supabase.from("enrollments").select("*", { count: "exact", head: true }).gte("completed_at", todayISO),
      ]);
      return {
        todaySignups: signupsRes.count || 0,
        todayCompletions: completionsRes.count || 0,
      };
    },
    staleTime: 60000,
  });

  const { data: pendingEnrollments = 0 } = useQuery({
    queryKey: ["dash-pending-enrollments"],
    queryFn: async () => {
      const { count, error } = await supabase.from("enrollments").select("*", { count: "exact", head: true }).eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: ungradedSubmissions = 0 } = useQuery({
    queryKey: ["dash-ungraded-submissions"],
    queryFn: async () => {
      const { count, error } = await supabase.from("assignment_submissions").select("*", { count: "exact", head: true }).eq("status", "submitted");
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["dash-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, status, is_mandatory, deadline")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: recentAnnouncements = [] } = useQuery({
    queryKey: ["dash-recent-announcements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("announcements").select("id, title, created_at, is_published").eq("is_published", true).order("created_at", { ascending: false }).limit(3);
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: summary } = useQuery({
    queryKey: ["dash-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_summary");
      if (error) throw error;
      return data as {
        total_enrollments: number;
        total_completions: number;
        active_courses: number;
        top_courses: Array<{ id: string; title: string; enrolled: number; avg_progress: number }>;
      };
    },
    staleTime: 60_000,
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ["dash-recent-activity"],
    queryFn: async () => {
      const [recentEnrollRes, recentCompleteRes, recentSignupRes] = await Promise.all([
        supabase.from("enrollments").select("user_id, course_id, enrolled_at").order("enrolled_at", { ascending: false }).limit(5),
        supabase.from("enrollments").select("user_id, course_id, completed_at").not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(5),
        supabase.from("profiles").select("user_id, full_name, created_at").order("created_at", { ascending: false }).limit(5),
      ]);

      const activities: { type: string; userId: string; name?: string; courseId?: string; time: string }[] = [];

      recentSignupRes.data?.forEach((p: any) => {
        activities.push({ type: "signup", userId: p.user_id, name: p.full_name, time: p.created_at });
      });
      recentCompleteRes.data?.forEach((e: any) => {
        activities.push({ type: "complete", userId: e.user_id, courseId: e.course_id, time: e.completed_at });
      });
      recentEnrollRes.data?.forEach((e: any) => {
        activities.push({ type: "enroll", userId: e.user_id, courseId: e.course_id, time: e.enrolled_at });
      });

      return activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10);
    },
    staleTime: 60_000,
  });

  const activityUserIds = useMemo(() => {
    const ids = new Set<string>();
    recentActivity.forEach((a: any) => { if (a.userId) ids.add(a.userId); });
    return Array.from(ids);
  }, [recentActivity]);

  const { data: profileMap = {} } = useQuery({
    queryKey: ["dash-profile-map", activityUserIds.join(",")],
    enabled: activityUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", activityUserIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach((p: any) => { map[p.user_id] = p.full_name || ""; });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Derived ──
  const mandatoryCourses = courses.filter((c: any) => c.is_mandatory && c.status === "published");
  const urgentMandatory = mandatoryCourses.filter((c: any) => {
    if (!c.deadline) return false;
    const daysLeft = Math.ceil((new Date(c.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 3;
  });

  const { data: spark } = useDashboardSparklines(14);
  const sessions7   = (spark?.sessions ?? []).slice(-7);
  const signups7    = (spark?.signups ?? []).slice(-7);
  const completions7 = (spark?.completions ?? []).slice(-7);
  const enrollDelta  = computeDelta(spark?.enrollments);
  const sessionsDelta = computeDelta(spark?.sessions);
  const signupsDelta = computeDelta(spark?.signups);
  const completionsDelta = computeDelta(spark?.completions);

  const topCourses = useMemo(
    () =>
      (summary?.top_courses ?? []).map((c) => ({
        title: c.title,
        enrolled: Number(c.enrolled) || 0,
        avgProgress: Number(c.avg_progress) || 0,
      })),
    [summary]
  );

  const courseMap = useMemo(() => {
    const m: Record<string, string> = {};
    courses.forEach((c: any) => { m[c.id] = c.title; });
    return m;
  }, [courses]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "signup": return <UserPlus className="h-4 w-4 text-chart-2" />;
      case "complete": return <CheckCircle2 className="h-4 w-4 text-chart-3" />;
      case "enroll": return <BookOpen className="h-4 w-4 text-primary" />;
      default: return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityText = (item: any) => {
    const name = item.name || profileMap[item.userId] || t("common.user");
    const course = item.courseId ? courseMap[item.courseId] : "";
    switch (item.type) {
      case "signup": return isEn ? `${name} joined the platform` : `${name}님이 가입했습니다`;
      case "complete": return isEn ? `${name} completed "${course}"` : `${name}님이 "${course}" 수료`;
      case "enroll": return isEn ? `${name} enrolled in "${course}"` : `${name}님이 "${course}" 수강 신청`;
      default: return "";
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 sm:h-6 sm:w-6" />
            {t("admin.adminDashboard")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("admin.platformOverview")}</p>
        </div>


        {/* ③ Filter Bar */}
        <DashboardFilterBar
          filters={filters}
          onChange={setFilters}
          role="admin"
        />

        {/* ④ 6 Average Metric Cards */}
        <DashboardMetricCards filters={filters} />

        {/* ⑤ Weekly Summary + Dropoff Courses */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashboardWeeklySummary filters={filters} />
          <DashboardDropoffCourses filters={filters} limit={5} />
        </div>


        {/* ⑦ Learner Details Table */}
        <DashboardLearnerTable filters={filters} limit={100} />

        {/* ⑧ Insights: Learning Health · User · Content Quality */}
        <DashboardInsights />

        {/* ⑨ Bottom Row: Activity Feed + Quick Summary */}
        <div className="grid lg:grid-cols-5 gap-4">
          {/* Recent Activity Feed */}
          <div className="stat-card !p-5 lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {isEn ? "Recent Activity" : "최근 활동"}
              </h3>
            </div>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("common.noData")}</p>
            ) : (
              <div className="space-y-1">
                {recentActivity.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
                    <div className="mt-0.5 shrink-0">
                      {getActivityIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">
                        {getActivityText(item)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(item.time), { addSuffix: true, locale })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Summary */}
          <div className="lg:col-span-2 space-y-4">
            {/* Quick Summary */}
            <div className="stat-card !p-5">
              <h3 className="text-base font-semibold text-foreground mb-3">
                {isEn ? "Quick Summary" : "빠른 요약"}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {isEn ? "Total Enrollments" : "전체 수강"}
                  </span>
                    <span className="text-sm font-bold text-foreground">{summary?.total_enrollments ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" />
                    {isEn ? "Completions" : "수료 완료"}
                  </span>
                    <span className="text-sm font-bold text-foreground">{summary?.total_completions ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    {isEn ? "Active Courses" : "활성 강의"}
                  </span>
                    <span className="text-sm font-bold text-foreground">{summary?.active_courses ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Top Courses */}
            <div className="stat-card !p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-foreground">
                  {isEn ? "Popular Courses" : "인기 강의 TOP 3"}
                </h3>
                <Link to="/admin/courses">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                    {t("common.viewAll")} <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
              {topCourses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("common.noData")}</p>
              ) : (
                <div className="space-y-3">
                  {topCourses.map((course, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground font-medium truncate flex-1">
                          <span className="text-xs text-muted-foreground mr-1.5">{idx + 1}.</span>
                          {course.title}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">{course.enrolled}{t("common.people")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${course.avgProgress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-10 text-right">{course.avgProgress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
