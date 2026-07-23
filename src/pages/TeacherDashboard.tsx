import { useState } from "react";
import {
  ClipboardCheck, LayoutDashboard, Activity,
  AlertCircle, Trophy, BookOpen, Flame, ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { useUser } from "@/contexts/UserContext";
import { useLeaderScope } from "@/hooks/useLeaderScope";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { localizeCourse } from "@/lib/i18nCourse";
import { normalizeLang } from "@/lib/i18nLang";
import DashboardFilterBar, { DashboardFilters } from "@/components/admin/DashboardFilterBar";
import DashboardMetricCards from "@/components/admin/DashboardMetricCards";
import DashboardWeeklySummary from "@/components/admin/DashboardWeeklySummary";
import DashboardDropoffCourses from "@/components/admin/DashboardDropoffCourses";

import DashboardLearnerTable from "@/components/admin/DashboardLearnerTable";

const defaultLeaderFilters: DashboardFilters = {
  years: [],
  months: [],
  countries: [],
  branch_ids: [],
};

const TeacherDashboard = () => {
  const { user } = useUser();
  const { scopeIds, branch, hasDepartment, isLoading: scopeLoading } = useLeaderScope();
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.language?.startsWith("en") ? enUS : ko;
  const lang = normalizeLang(i18n.language);
  const [leaderFilters, setLeaderFilters] = useState<DashboardFilters>(defaultLeaderFilters);

  const branchLabel = branch
    ? (i18n.language?.startsWith("en") && branch.name_en ? branch.name_en : branch.name) +
      (branch.code ? ` (${branch.code})` : "")
    : "";

  // ── 지점 소속 학생들 ──────────────────────────────────
  const { data: deptStudents = [] } = useQuery({
    queryKey: ["leader-dash-students", scopeIds],
    enabled: scopeIds.length > 0,
    queryFn: async () => {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "student");
      const studentIds = new Set((roleRows ?? []).map((r: any) => r.user_id));
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, department_id, created_at")
        .in("department_id", scopeIds);
      if (error) throw error;
      return (data ?? []).filter((p: any) => studentIds.has(p.user_id));
    },
  });

  const studentIds = deptStudents.map((p: any) => p.user_id);

  // ── 학습 세션 (활동) ──────────────────────────────────
  const { data: sessions = [] } = useQuery({
    queryKey: ["leader-dash-sessions", studentIds],
    enabled: studentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("user_id, login_at, logout_at")
        .in("user_id", studentIds)
        .gte("login_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── 지점 학생들의 모든 수강 정보 ─────────────────────
  const { data: enrollments = [] } = useQuery({
    queryKey: ["leader-dash-enrollments", studentIds, lang],
    enabled: studentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, course_id, user_id, progress, status, enrolled_at, completed_at, courses(id, title, status, is_mandatory, deadline, course_i18n(language_code, title))")
        .in("user_id", studentIds)
        .eq("status", "approved");
      if (error) throw error;
      return (data ?? []).map((e: any) => ({
        ...e,
        courses: e.courses ? localizeCourse(e.courses, lang) : e.courses,
      }));
    },
  });

  // ── 최근 과제 제출 ────────────────────────────────────
  const { data: recentSubmissions = [] } = useQuery({
    queryKey: ["leader-dash-submissions", studentIds, lang],
    enabled: studentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*, assignments(title, course_id, courses(title, course_i18n(language_code, title)))")
        .in("student_id", studentIds)
        .order("submitted_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        assignments: s.assignments
          ? { ...s.assignments, courses: s.assignments.courses ? localizeCourse(s.assignments.courses, lang) : s.assignments.courses }
          : s.assignments,
      }));
    },
  });

  // ── 게임화(포인트/스트릭) ─────────────────────────────
  const { data: gamification = [] } = useQuery({
    queryKey: ["leader-dash-gamification", studentIds],
    enabled: studentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_gamification")
        .select("user_id, total_points, level, streak_days")
        .in("user_id", studentIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── 프로필 맵 ──────────────────────────────────────────
  const profileMap = new Map(deptStudents.map((p: any) => [p.user_id, p.full_name]));

  // ── 파생 통계 ──────────────────────────────────────────
  const now = Date.now();

  // 휴면(14일+ 미접속)
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
  const recentActiveSet = new Set<string>();
  sessions.forEach((s: any) => {
    if (new Date(s.login_at).getTime() >= fourteenDaysAgo) recentActiveSet.add(s.user_id);
  });
  const dormantStudents = studentIds.filter((id: string) => !recentActiveSet.has(id));

  // ── 학생별 진도/포인트 집계 ────────────────────────────
  const studentProgressMap = new Map<string, { count: number; sum: number; completed: number }>();
  enrollments.forEach((e: any) => {
    const m = studentProgressMap.get(e.user_id) || { count: 0, sum: 0, completed: 0 };
    m.count += 1;
    m.sum += Number(e.progress) || 0;
    if (e.completed_at) m.completed += 1;
    studentProgressMap.set(e.user_id, m);
  });

  // TOP 5 우수 학습자 (평균 진도 + 완료 강의 수 가중치)
  const topLearners = [...studentIds]
    .map((id) => {
      const p = studentProgressMap.get(id);
      const g = gamification.find((x: any) => x.user_id === id);
      const avg = p && p.count ? p.sum / p.count : 0;
      const score = avg * 0.6 + (p?.completed ?? 0) * 8 + (g?.streak_days ?? 0) * 2;
      return {
        id, name: profileMap.get(id) || "—",
        avgProgress: Math.round(avg),
        completed: p?.completed ?? 0,
        points: g?.total_points ?? 0,
        streak: g?.streak_days ?? 0,
        score,
      };
    })
    .filter((s) => s.avgProgress > 0 || s.completed > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // 강의별 지점 진도 통계 (학생들이 가장 많이 수강한 강의 TOP 5)
  const courseStatsMap = new Map<string, { id: string; title: string; learners: number; sum: number; completed: number; mandatory: boolean }>();
  enrollments.forEach((e: any) => {
    if (!e.courses?.id) return;
    const k = e.courses.id;
    const m = courseStatsMap.get(k) || { id: k, title: e.courses.title, learners: 0, sum: 0, completed: 0, mandatory: !!e.courses.is_mandatory };
    m.learners += 1;
    m.sum += Number(e.progress) || 0;
    if (e.completed_at) m.completed += 1;
    courseStatsMap.set(k, m);
  });
  const topCourses = [...courseStatsMap.values()]
    .sort((a, b) => b.learners - a.learners)
    .slice(0, 5)
    .map((c) => ({ ...c, avgProgress: c.learners ? Math.round(c.sum / c.learners) : 0 }));


  // ── 빈 상태 ────────────────────────────────────────────
  if (scopeLoading) {
    return (
      <DashboardLayout role="teacher">
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("common.loading", "불러오는 중...")}</p>
        </div>
      </DashboardLayout>
    );
  }
  if (!hasDepartment) {
    return (
      <DashboardLayout role="teacher">
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("teacher.noDepartment", "소속 지점이 설정되지 않았습니다. 관리자에게 문의하세요.")}
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary" aria-hidden="true" /> {t("teacher.teacherDashboard", "러닝리더 대시보드")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {branchLabel ? `${branchLabel} · ` : ""}
            {t("teacher.leaderSubtitle", "내 지점 학습 현황을 한눈에 확인하세요")}
          </p>
        </div>


        {/* Period & scope filters (leader scope) */}
        <DashboardFilterBar
          filters={leaderFilters}
          onChange={setLeaderFilters}
          role="teacher"
          leaderId={user?.id}
        />

        {/* 6 Average Metric Cards (leader scope) */}
        <DashboardMetricCards filters={leaderFilters} leaderId={user?.id} />

        {/* Weekly Summary + Dropoff Courses */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashboardWeeklySummary filters={leaderFilters} leaderId={user?.id} />
          <DashboardDropoffCourses filters={leaderFilters} leaderId={user?.id} limit={5} />
        </div>

        {/* Learner Details Table (branch-scoped) */}
        <DashboardLearnerTable filters={leaderFilters} leaderId={user?.id} limit={100} />


        {/* TOP 5 Learners & Top Courses */}
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <h2 className="text-base font-semibold text-foreground">{t("teacher.topLearners", "우수 학습자 TOP 5")}</h2>
            </div>
            {topLearners.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">{t("teacher.noLearnerData", "학습 데이터가 아직 없습니다")}</p>
            ) : (
              <div className="divide-y divide-border">
                {topLearners.map((s, idx) => (
                  <Link
                    key={s.id}
                    to={`/teacher/students/${s.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-accent/20 transition-colors"
                  >
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold ${
                      idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-700" : idx === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"
                    }`}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("teacher.progressPercent", { percent: s.avgProgress })} · {t("teacher.completedCount", { count: s.completed, defaultValue: "완료 {{count}}" })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-foreground">{s.points.toLocaleString()} pt</p>
                      {s.streak > 0 && (
                        <p className="text-[10px] text-amber-600 inline-flex items-center gap-0.5">
                          <Flame className="h-3 w-3" />{s.streak}d
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">{t("teacher.popularCourses", "지점 수강 TOP 5 강의")}</h2>
            </div>
            {topCourses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">{t("teacher.noCourseData", "수강 데이터가 아직 없습니다")}</p>
            ) : (
              <div className="divide-y divide-border">
                {topCourses.map((c) => (
                  <div key={c.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">{c.title}</span>
                        {c.mandatory && (
                          <Badge variant="secondary" className="text-[9px] h-4 bg-rose-100 text-rose-700 whitespace-nowrap shrink-0">
                            {t("teacher.mandatoryBadge", "필수")}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                        {c.learners}{t("common.people")} · {c.avgProgress}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${c.avgProgress}%`,
                          background: `linear-gradient(to right, hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.55), hsl(var(--primary)))`,
                        }}
                      />
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Submissions & Dormant Students */}
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">{t("teacher.recentSubmissionsTitle")}</h2>
              <Link to="/teacher/assignments" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center">
                {t("common.viewAll")} <ArrowRight className="h-3 w-3 ml-0.5" />
              </Link>
            </div>
            {recentSubmissions.length === 0 ? (
              <div className="text-center py-10">
                <ClipboardCheck className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t("teacher.noSubmissions")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentSubmissions.slice(0, 5).map((sub: any) => (
                  <div key={sub.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                      {(profileMap.get(sub.student_id) || t("teacher.student"))[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{profileMap.get(sub.student_id) || t("teacher.student")}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{sub.assignments?.title} · {sub.assignments?.courses?.title}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge
                        variant="secondary"
                        className={`text-[9px] ${
                          sub.status === "submitted"
                            ? "bg-amber-100 text-amber-700"
                            : sub.status === "graded"
                            ? "bg-green-100 text-green-700"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {sub.status === "submitted" ? t("teacher.ungraded") : sub.status === "graded" ? t("teacher.graded") : t("teacher.returned")}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {sub.submitted_at ? formatDistanceToNow(new Date(sub.submitted_at), { addSuffix: true, locale: dateFnsLocale }) : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <h2 className="text-base font-semibold text-foreground">{t("teacher.needsAttention", "관심이 필요한 학습자")}</h2>
              </div>
              <span className="text-xs text-muted-foreground">{t("teacher.dormantHint", "14일+ 미접속")}</span>
            </div>
            {dormantStudents.length === 0 ? (
              <div className="text-center py-10">
                <Activity className="h-7 w-7 text-emerald-500/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("teacher.allActive", "모든 학습자가 활발히 활동 중입니다")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {dormantStudents.slice(0, 8).map((id: string) => (
                  <Link
                    key={id}
                    to={`/teacher/students/${id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-accent/20 transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-semibold shrink-0">
                      {(profileMap.get(id) || "—")[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{profileMap.get(id) || "—"}</p>
                      <p className="text-[11px] text-amber-700">{t("teacher.followUpHint", "팔로업이 필요합니다")}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TeacherDashboard;
