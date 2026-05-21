import { CalendarCheck, Download, Clock, BookOpen, LogIn, LogOut, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { useUser } from "@/contexts/UserContext";
import { useLeaderScope } from "@/hooks/useLeaderScope";
import StatCard from "@/components/ui/stat-card";
import { useDashboardSparklines, computeDelta } from "@/hooks/useDashboardSparklines";

interface AdminAttendanceProps {
  role?: "admin" | "teacher";
}

const AdminAttendance = ({ role = "admin" }: AdminAttendanceProps) => {
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [searchName, setSearchName] = useState("");

  const isTeacher = role === "teacher";
  const isKo = !i18n.language?.startsWith("en");

  // Learning Leader (teacher) scope: only their branch + child teams
  const { scopeIds: leaderScopeIds, isLoading: scopeLoading } = useLeaderScope();

  // Fetch profiles (scoped to leader's branch when teacher)
  const { data: profiles = [] } = useQuery({
    queryKey: ["att-profiles", isTeacher ? leaderScopeIds : "all"],
    enabled: !isTeacher || (!scopeLoading && leaderScopeIds.length > 0),
    queryFn: async () => {
      let q = supabase.from("profiles").select("user_id, full_name, department, position, department_id");
      if (isTeacher && leaderScopeIds.length > 0) {
        q = q.in("department_id", leaderScopeIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Set of user_ids visible to current teacher (used to filter sessions/progress)
  const scopedUserIds = useMemo(
    () => (isTeacher ? new Set(profiles.map((p: any) => p.user_id)) : null),
    [isTeacher, profiles]
  );

  // Fetch sessions for the selected date
  const { data: sessions = [] } = useQuery({
    queryKey: ["user-sessions", dateFilter],
    queryFn: async () => {
      const startOfDay = `${dateFilter}T00:00:00.000Z`;
      const endOfDay = `${dateFilter}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from("user_sessions")
        .select("*")
        .gte("login_at", startOfDay)
        .lte("login_at", endOfDay)
        .order("login_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch content_progress completed on this date for learning stats
  const { data: dailyProgress = [] } = useQuery({
    queryKey: ["daily-progress", dateFilter],
    queryFn: async () => {
      const startOfDay = `${dateFilter}T00:00:00.000Z`;
      const endOfDay = `${dateFilter}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from("content_progress")
        .select("user_id, completed, completed_at, last_accessed_at, progress_percentage, content_id")
        .or(`completed_at.gte.${startOfDay},last_accessed_at.gte.${startOfDay}`)
        .or(`completed_at.lte.${endOfDay},last_accessed_at.lte.${endOfDay}`);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch content durations for learning time calculation
  const contentIds = useMemo(() => [...new Set(dailyProgress.map((p: any) => p.content_id))], [dailyProgress]);
  const { data: contentDurations = [] } = useQuery({
    queryKey: ["content-durations", contentIds],
    queryFn: async () => {
      if (contentIds.length === 0) return [];
      const { data, error } = await supabase
        .from("course_contents")
        .select("id, duration_minutes, course_id")
        .in("id", contentIds);
      if (error) throw error;
      return data;
    },
    enabled: contentIds.length > 0,
  });

  // If teacher, get their course ids for filtering
  const { data: teacherCourseIds = [] } = useQuery({
    queryKey: ["teacher-course-ids", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("courses").select("id").eq("instructor_id", user.id);
      if (error) throw error;
      return data.map((c: any) => c.id);
    },
    enabled: isTeacher && !!user?.id,
  });

  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));
  const contentMap = new Map(contentDurations.map((c: any) => [c.id, c]));

  // Aggregate data per user
  const userStats = useMemo(() => {
    const map = new Map<string, {
      userId: string;
      loginAt: string | null;
      logoutAt: string | null;
      learningMinutes: number;
      completions: number;
    }>();

    // Sessions: first login, last logout (scoped to leader's people when teacher)
    sessions.forEach((s: any) => {
      if (scopedUserIds && !scopedUserIds.has(s.user_id)) return;
      const existing = map.get(s.user_id);
      if (!existing) {
        map.set(s.user_id, {
          userId: s.user_id,
          loginAt: s.login_at,
          logoutAt: s.logout_at,
          learningMinutes: 0,
          completions: 0,
        });
      } else {
        if (!existing.loginAt || s.login_at < existing.loginAt) existing.loginAt = s.login_at;
        if (s.logout_at && (!existing.logoutAt || s.logout_at > existing.logoutAt)) existing.logoutAt = s.logout_at;
      }
    });

    // Progress: completions and learning time
    dailyProgress.forEach((p: any) => {
      if (scopedUserIds && !scopedUserIds.has(p.user_id)) return;
      const content = contentMap.get(p.content_id);

      // If teacher, only count their courses
      if (isTeacher && content && !teacherCourseIds.includes(content.course_id)) return;

      let entry = map.get(p.user_id);
      if (!entry) {
        entry = { userId: p.user_id, loginAt: null, logoutAt: null, learningMinutes: 0, completions: 0 };
        map.set(p.user_id, entry);
      }

      if (p.completed) entry.completions += 1;

      // Estimate learning time from content duration * progress
      if (content?.duration_minutes) {
        const pct = (p.progress_percentage || 0) / 100;
        entry.learningMinutes += Math.round(content.duration_minutes * pct);
      }
    });

    return Array.from(map.values());
  }, [sessions, dailyProgress, contentMap, isTeacher, teacherCourseIds, scopedUserIds]);

  // Filter by name search
  const filteredStats = useMemo(() => {
    if (!searchName.trim()) return userStats;
    const q = searchName.toLowerCase();
    return userStats.filter((s) => {
      const p = profileMap.get(s.userId);
      return p?.full_name?.toLowerCase().includes(q);
    });
  }, [userStats, searchName, profileMap]);

  const formatTime = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleTimeString(isKo ? "ko-KR" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const formatMinutes = (m: number) => {
    if (m === 0) return "-";
    const h = Math.floor(m / 60);
    const min = m % 60;
    const hLabel = t("admin.attHour");
    const mLabel = t("admin.attMinute");
    return h > 0 ? `${h}${hLabel} ${min}${mLabel}` : `${min}${mLabel}`;
  };

  // Summary stats
  const totalUsers = filteredStats.length;
  const totalOnline = filteredStats.filter(s => s.loginAt && !s.logoutAt).length;
  const totalCompletions = filteredStats.reduce((a, b) => a + b.completions, 0);
  const totalMinutes = filteredStats.reduce((a, b) => a + b.learningMinutes, 0);

  const { data: spark } = useDashboardSparklines(14);
  const attSparkline = {
    sessions7: (spark?.sessions ?? []).slice(-7),
    completions7: (spark?.completions ?? []).slice(-7),
    sessionsDelta: computeDelta(spark?.sessions),
    completionsDelta: computeDelta(spark?.completions),
  };

  const exportCsv = () => {
    const header = [
      t("admin.attName"),
      t("admin.attDepartment"),
      t("admin.attLogin"),
      t("admin.attLogout"),
      t("admin.attLearningTime"),
      t("admin.attCompletionsCount"),
    ];
    const rows = filteredStats.map((s) => {
      const p = profileMap.get(s.userId);
      return [
        p?.full_name || "-",
        p?.department || "-",
        formatTime(s.loginAt),
        formatTime(s.logoutAt),
        formatMinutes(s.learningMinutes),
        String(s.completions),
      ];
    });
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${dateFilter}.csv`;
    a.click();
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              {t("admin.attendanceManagement")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t("admin.attendanceDesc")}
            </p>
          </div>
          <Button onClick={exportCsv} variant="outline" className="rounded-xl gap-2 text-sm">
            <Download className="h-4 w-4" /> {t("admin.excelDownload")}
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t("admin.totalUsers")} value={totalUsers} icon={Users} tone="primary" trend={attSparkline.sessions7} delta={attSparkline.sessionsDelta} />
          <StatCard label={t("admin.currentOnline")} value={totalOnline} icon={LogIn} tone="success" />
          <StatCard label={t("admin.totalLearningTime")} value={formatMinutes(totalMinutes)} icon={Clock} tone="info" />
          <StatCard label={t("admin.learningCompletions")} value={totalCompletions} icon={BookOpen} tone="warning" trend={attSparkline.completions7} delta={attSparkline.completionsDelta} />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full sm:w-44 h-10 rounded-xl"
          />
          <Input
            placeholder={t("admin.searchNamePlaceholder")}
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="w-full sm:w-56 h-10 rounded-xl"
          />
        </div>

        {/* Table */}
        <div className="stat-card !p-0 overflow-hidden">
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-border">
            {filteredStats.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                {isKo ? "해당 날짜에 기록이 없습니다." : "No records for this date."}
              </div>
            ) : (
              filteredStats.map((s) => {
                const p = profileMap.get(s.userId);
                return (
                  <div key={s.userId} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{p?.full_name || "-"}</p>
                        <p className="text-[11px] text-muted-foreground">{p?.department || ""} {p?.position || ""}</p>
                      </div>
                      {s.loginAt && !s.logoutAt && (
                        <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                          {isKo ? "온라인" : "Online"}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">{isKo ? "로그인" : "Login"}: </span>
                        <span className="text-foreground">{formatTime(s.loginAt)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{isKo ? "로그아웃" : "Logout"}: </span>
                        <span className="text-foreground">{formatTime(s.logoutAt)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{isKo ? "학습시간" : "Study"}: </span>
                        <span className="text-foreground">{formatMinutes(s.learningMinutes)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{isKo ? "완료" : "Done"}: </span>
                        <span className="text-foreground">{s.completions}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/30">
                  <TableHead className="text-xs">{isKo ? "이름" : "Name"}</TableHead>
                  <TableHead className="text-xs">{isKo ? "부서" : "Department"}</TableHead>
                  <TableHead className="text-xs text-center">{isKo ? "로그인" : "Login"}</TableHead>
                  <TableHead className="text-xs text-center">{isKo ? "로그아웃" : "Logout"}</TableHead>
                  <TableHead className="text-xs text-center">{isKo ? "상태" : "Status"}</TableHead>
                  <TableHead className="text-xs text-center">{isKo ? "학습시간" : "Learning Time"}</TableHead>
                  <TableHead className="text-xs text-center">{isKo ? "학습 완료 수" : "Completions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      {isKo ? "해당 날짜에 기록이 없습니다." : "No records for this date."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStats.map((s) => {
                    const p = profileMap.get(s.userId);
                    const isOnline = !!s.loginAt && !s.logoutAt;
                    return (
                      <TableRow key={s.userId}>
                        <TableCell className="text-sm font-medium">{p?.full_name || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p?.department || "-"}</TableCell>
                        <TableCell className="text-xs text-center">
                          <div className="flex items-center justify-center gap-1">
                            <LogIn className="h-3 w-3 text-muted-foreground" />
                            {formatTime(s.loginAt)}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-center">
                          <div className="flex items-center justify-center gap-1">
                            <LogOut className="h-3 w-3 text-muted-foreground" />
                            {formatTime(s.logoutAt)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {isOnline ? (
                            <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2.5 py-1 rounded-lg">
                              {isKo ? "온라인" : "Online"}
                            </span>
                          ) : s.loginAt ? (
                            <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2.5 py-1 rounded-lg">
                              {isKo ? "오프라인" : "Offline"}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {formatMinutes(s.learningMinutes)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-center">
                          <div className="flex items-center justify-center gap-1">
                            <BookOpen className="h-3 w-3 text-muted-foreground" />
                            {s.completions}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminAttendance;
