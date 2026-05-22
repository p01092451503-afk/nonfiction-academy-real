import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Globe2, Download, ChevronRight, ArrowLeft, Users, Activity,
  TrendingUp, ShieldCheck, Trophy, AlertTriangle, MapPin, Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Track { id: string; title: string; title_en: string | null; }
interface Stage { id: string; track_id: string; }
interface StageCourse { stage_id: string; course_id: string; }
interface Department {
  id: string; name: string; name_en: string | null; code: string | null; country: string | null;
  parent_department_id: string | null; is_active: boolean | null;
}
interface Profile { user_id: string; department_id: string | null; full_name: string | null; email: string | null; }
interface Enrollment { user_id: string; course_id: string; progress: number | null; completed_at: string | null; }
interface CourseMeta { id: string; is_mandatory: boolean | null; status: string | null; }
interface Session { user_id: string; login_at: string; }

const flag = (cc: string | null) => {
  if (!cc || cc.length !== 2) return "🌐";
  return String.fromCodePoint(...cc.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
};

const COUNTRY_NAMES: Record<string, { ko: string; en: string }> = {
  KR: { ko: "대한민국", en: "Korea" }, JP: { ko: "일본", en: "Japan" },
  US: { ko: "미국", en: "United States" }, HK: { ko: "홍콩", en: "Hong Kong" },
  CN: { ko: "중국", en: "China" }, TW: { ko: "대만", en: "Taiwan" },
  SG: { ko: "싱가포르", en: "Singapore" }, VN: { ko: "베트남", en: "Vietnam" },
  TH: { ko: "태국", en: "Thailand" }, MY: { ko: "말레이시아", en: "Malaysia" },
  ID: { ko: "인도네시아", en: "Indonesia" }, PH: { ko: "필리핀", en: "Philippines" },
  GB: { ko: "영국", en: "United Kingdom" }, FR: { ko: "프랑스", en: "France" },
  DE: { ko: "독일", en: "Germany" },
};

const heatColor = (pct: number) => {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-emerald-400";
  if (pct >= 40) return "bg-amber-400";
  if (pct >= 20) return "bg-orange-400";
  if (pct > 0)   return "bg-rose-400";
  return "bg-muted";
};

const heatText = (pct: number) => {
  if (pct >= 60) return "text-emerald-700 dark:text-emerald-400";
  if (pct >= 40) return "text-amber-700 dark:text-amber-400";
  if (pct > 0)   return "text-rose-700 dark:text-rose-400";
  return "text-muted-foreground";
};

interface CountryGroup {
  id: string; code: string; country: string;
  name: string; name_en: string | null;
  branches: Department[];
}

export default function AdminGlobalDashboard() {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");
  const [selectedTrackId, setSelectedTrackId] = useState<string>("all");
  const [drillCountry, setDrillCountry] = useState<string | null>(null);

  const { data: tracks = [] } = useQuery({
    queryKey: ["gd-tracks"],
    queryFn: async () => {
      const { data } = await supabase.from("learning_tracks").select("id,title,title_en").eq("status", "published");
      return (data || []) as Track[];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["gd-stages"],
    queryFn: async () => {
      const { data } = await supabase.from("track_stages").select("id,track_id");
      return (data || []) as Stage[];
    },
  });

  const { data: stageCourses = [] } = useQuery({
    queryKey: ["gd-stage-courses"],
    queryFn: async () => {
      const { data } = await supabase.from("track_stage_courses").select("stage_id,course_id");
      return (data || []) as StageCourse[];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["gd-departments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id,name,name_en,code,country,parent_department_id,is_active")
        .eq("is_active", true);
      return (data || []) as Department[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["gd-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id,department_id,full_name,email");
      return (data || []) as Profile[];
    },
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["gd-enrollments"],
    queryFn: async () => {
      const { data } = await supabase.from("enrollments").select("user_id,course_id,progress,completed_at");
      return (data || []) as Enrollment[];
    },
  });

  const { data: courseMeta = [] } = useQuery({
    queryKey: ["gd-courses-meta"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id,is_mandatory,status");
      return (data || []) as CourseMeta[];
    },
  });

  // Recent sessions (last 7 days) for activity
  const { data: recentSessions = [] } = useQuery({
    queryKey: ["gd-recent-sessions"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("user_sessions")
        .select("user_id,login_at")
        .gte("login_at", since)
        .limit(10000);
      return (data || []) as Session[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Derived ─────────────────────────────────────────────────────────────────

  const activeTracks = useMemo(
    () => (selectedTrackId === "all" ? tracks : tracks.filter((tr) => tr.id === selectedTrackId)),
    [tracks, selectedTrackId]
  );

  // Required course IDs per track
  const trackRequiredCourseIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const tr of activeTracks) {
      const tsIds = new Set(stages.filter((s) => s.track_id === tr.id).map((s) => s.id));
      map.set(tr.id, new Set(stageCourses.filter((sc) => tsIds.has(sc.stage_id)).map((sc) => sc.course_id)));
    }
    return map;
  }, [activeTracks, stages, stageCourses]);

  // Mandatory published course IDs
  const mandatoryCourseIds = useMemo(
    () => new Set(courseMeta.filter((c) => c.is_mandatory && c.status === "published").map((c) => c.id)),
    [courseMeta]
  );

  const activeUserIds = useMemo(() => new Set(recentSessions.map((s) => s.user_id)), [recentSessions]);

  // Country grouping
  const countries = useMemo<CountryGroup[]>(() => {
    const map = new Map<string, CountryGroup>();
    for (const d of departments) {
      const cc = (d.country || "").toUpperCase();
      if (!cc) continue;
      if (!map.has(cc)) {
        const localized = COUNTRY_NAMES[cc];
        map.set(cc, {
          id: cc, code: cc, country: cc,
          name: localized?.ko || cc, name_en: localized?.en || cc,
          branches: [],
        });
      }
      map.get(cc)!.branches.push(d);
    }
    return Array.from(map.values()).sort((a, b) => b.branches.length - a.branches.length);
  }, [departments]);

  const isUserTrackComplete = (userId: string, trackId: string) => {
    const required = trackRequiredCourseIds.get(trackId);
    if (!required || required.size === 0) return false;
    for (const cid of required) {
      const e = enrollments.find((en) => en.user_id === userId && en.course_id === cid);
      if (!e || (e.progress ?? 0) < 100) return false;
    }
    return true;
  };

  // Compute the canonical metric set for any user pool
  const computeMetrics = (userIds: string[]) => {
    const idSet = new Set(userIds);
    const userCount = userIds.length;

    // Activity (7d)
    let active = 0;
    for (const uid of userIds) if (activeUserIds.has(uid)) active += 1;
    const activeRate = userCount > 0 ? Math.round((active / userCount) * 100) : 0;

    // Avg progress across enrollments belonging to these users
    let progSum = 0, progCnt = 0;
    for (const e of enrollments) {
      if (!idSet.has(e.user_id)) continue;
      progSum += e.progress ?? 0;
      progCnt += 1;
    }
    const avgProgress = progCnt > 0 ? Math.round(progSum / progCnt) : 0;

    // Mandatory completion: per user, all mandatory courses completed
    let mandDone = 0, mandUsers = 0;
    if (mandatoryCourseIds.size > 0) {
      for (const uid of userIds) {
        mandUsers += 1;
        let allDone = true;
        for (const cid of mandatoryCourseIds) {
          const e = enrollments.find((en) => en.user_id === uid && en.course_id === cid);
          if (!e || !e.completed_at) { allDone = false; break; }
        }
        if (allDone) mandDone += 1;
      }
    }
    const mandRate = mandUsers > 0 && mandatoryCourseIds.size > 0
      ? Math.round((mandDone / mandUsers) * 100) : 0;

    // Track completion (across activeTracks)
    let trkDone = 0, trkPoss = 0;
    for (const tr of activeTracks) {
      for (const uid of userIds) {
        trkPoss += 1;
        if (isUserTrackComplete(uid, tr.id)) trkDone += 1;
      }
    }
    const trackRate = trkPoss > 0 ? Math.round((trkDone / trkPoss) * 100) : 0;

    return { userCount, active, activeRate, avgProgress, mandRate, mandDone, mandUsers, trackRate, trkDone, trkPoss };
  };

  // Per country
  const countryStats = useMemo(() => {
    return countries.map((c) => {
      const deptIds = new Set(c.branches.map((b) => b.id));
      const users = profiles.filter((p) => p.department_id && deptIds.has(p.department_id)).map((p) => p.user_id);
      return { country: c, ...computeMetrics(users) };
    }).sort((a, b) => b.userCount - a.userCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, profiles, enrollments, activeUserIds, mandatoryCourseIds, activeTracks, trackRequiredCourseIds]);

  // Per branch (for leaderboard)
  const branchStats = useMemo(() => {
    return departments.map((d) => {
      const users = profiles.filter((p) => p.department_id === d.id).map((p) => p.user_id);
      return { branch: d, ...computeMetrics(users) };
    }).filter((b) => b.userCount >= 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments, profiles, enrollments, activeUserIds, mandatoryCourseIds, activeTracks, trackRequiredCourseIds]);

  // Drill-down branches
  const drilledBranches = useMemo(() => {
    if (!drillCountry) return [];
    const c = countries.find((x) => x.id === drillCountry);
    if (!c) return [];
    return c.branches.map((b) => {
      const users = profiles.filter((p) => p.department_id === b.id);
      const m = computeMetrics(users.map((u) => u.user_id));
      const userRows = users.map((u) => {
        const userEnr = enrollments.filter((e) => e.user_id === u.user_id);
        const avg = userEnr.length > 0
          ? Math.round(userEnr.reduce((s, e) => s + (e.progress ?? 0), 0) / userEnr.length) : 0;
        const tracks = activeTracks.map((tr) => ({ track: tr, complete: isUserTrackComplete(u.user_id, tr.id) }));
        const mandDone = mandatoryCourseIds.size > 0 && Array.from(mandatoryCourseIds).every((cid) => {
          const e = userEnr.find((x) => x.course_id === cid);
          return e && e.completed_at;
        });
        return { user: u, avg, tracks, active: activeUserIds.has(u.user_id), mandDone };
      });
      return { branch: b, ...m, userRows };
    }).sort((a, b) => b.userCount - a.userCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillCountry, countries, profiles, enrollments, activeUserIds, mandatoryCourseIds, activeTracks, trackRequiredCourseIds]);

  // Overall
  const overall = useMemo(() => {
    const allCountryUserIds = countryStats.flatMap((cs) => {
      const deptIds = new Set(cs.country.branches.map((b) => b.id));
      return profiles.filter((p) => p.department_id && deptIds.has(p.department_id)).map((p) => p.user_id);
    });
    return computeMetrics(allCountryUserIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryStats, profiles, enrollments, activeUserIds, mandatoryCourseIds, activeTracks, trackRequiredCourseIds]);

  // Track × Country matrix
  const trackMatrix = useMemo(() => {
    return activeTracks.map((tr) => {
      const row = countryStats.map((cs) => {
        const deptIds = new Set(cs.country.branches.map((b) => b.id));
        const users = profiles.filter((p) => p.department_id && deptIds.has(p.department_id));
        let done = 0;
        for (const u of users) if (isUserTrackComplete(u.user_id, tr.id)) done += 1;
        const rate = users.length > 0 ? Math.round((done / users.length) * 100) : 0;
        return { country: cs.country, done, total: users.length, rate };
      });
      return { track: tr, row };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTracks, countryStats, profiles, enrollments, trackRequiredCourseIds]);

  // Leaderboards
  const topBranches = useMemo(
    () => [...branchStats]
      .map((b) => ({ ...b, score: b.mandRate * 0.5 + b.avgProgress * 0.3 + b.activeRate * 0.2 }))
      .sort((a, b) => b.score - a.score).slice(0, 5),
    [branchStats]
  );

  const watchBranches = useMemo(
    () => [...branchStats]
      .filter((b) => b.userCount >= 3)
      .sort((a, b) => (a.activeRate - b.activeRate) || (a.avgProgress - b.avgProgress))
      .slice(0, 5),
    [branchStats]
  );

  const exportCSV = () => {
    const rows: string[][] = [];
    rows.push([
      t("globalDashboard.country", "국가"),
      t("globalDashboard.entity", "법인/지점"),
      t("globalDashboard.learners", "학습자"),
      t("globalDashboard.activeRate", "7일 활성률 %"),
      t("globalDashboard.avgProgress", "평균 진도 %"),
      t("globalDashboard.mandRate", "필수교육 이수율 %"),
      t("globalDashboard.trackRate", "트랙 수료율 %"),
    ]);
    for (const cs of countryStats) {
      for (const b of cs.country.branches) {
        const bs = branchStats.find((x) => x.branch.id === b.id);
        if (!bs) continue;
        rows.push([
          (isEn ? cs.country.name_en : cs.country.name) || cs.country.name,
          (isEn ? b.name_en : b.name) || b.name,
          String(bs.userCount),
          String(bs.activeRate),
          String(bs.avgProgress),
          String(bs.mandRate),
          String(bs.trackRate),
        ]);
      }
    }
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `global-dashboard-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Globe2 className="h-6 w-6 text-primary" aria-hidden="true" />
              <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
                {t("globalDashboard.title", "글로벌 학습 대시보드")}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t("globalDashboard.subtitleV2", "국가·지점별 학습 참여와 필수 교육 이수 현황을 한눈에 확인합니다.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedTrackId} onValueChange={setSelectedTrackId}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("globalDashboard.allTracks", "전체 트랙")}</SelectItem>
                {tracks.map((tr) => (
                  <SelectItem key={tr.id} value={tr.id}>{(isEn ? tr.title_en : tr.title) || tr.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" /> {t("globalDashboard.exportCsv", "CSV 내보내기")}
            </Button>
          </div>
        </div>

        {/* KPI bar — 4 actionable metrics */}
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-border">
              <Kpi
                icon={Users} tone="primary"
                label={t("globalDashboard.totalLearners", "전체 학습자")}
                value={overall.userCount.toLocaleString()}
                sub={`${countries.length} ${t("globalDashboard.countries", "국가")} · ${departments.length} ${t("globalDashboard.branches", "지점")}`}
              />
              <Kpi
                icon={Activity} tone="emerald"
                label={t("globalDashboard.activeLearners7d", "7일 활성 학습자")}
                value={`${overall.active.toLocaleString()}`}
                sub={`${t("globalDashboard.activeRate", "활성률")} ${overall.activeRate}%`}
                progress={overall.activeRate}
              />
              <Kpi
                icon={TrendingUp} tone="blue"
                label={t("globalDashboard.avgProgress", "평균 학습 진도")}
                value={`${overall.avgProgress}%`}
                sub={t("globalDashboard.allEnrollments", "전체 수강신청 기준")}
                progress={overall.avgProgress}
              />
              <Kpi
                icon={ShieldCheck} tone="amber"
                label={t("globalDashboard.mandRate", "필수교육 이수율")}
                value={`${overall.mandRate}%`}
                sub={mandatoryCourseIds.size > 0
                  ? `${overall.mandDone}/${overall.mandUsers} ${t("globalDashboard.completedShort", "이수")}`
                  : t("globalDashboard.noMandatory", "필수 과정 없음")}
                progress={overall.mandRate}
              />
            </div>
          </CardContent>
        </Card>

        {/* Country comparison cards */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              {t("globalDashboard.countryOverview", "국가별 종합 현황")}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t("globalDashboard.clickHint", "카드를 클릭하면 해당 국가의 지점·학습자 상세를 볼 수 있습니다.")}
            </p>
          </CardHeader>
          <CardContent>
            {countryStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("globalDashboard.noCountries", "국가 단위 조직이 없습니다.")}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {countryStats.map((cs) => {
                  const name = (isEn ? cs.country.name_en : cs.country.name) || cs.country.name;
                  const cc = cs.country.country;
                  const isSelected = drillCountry === cs.country.id;
                  return (
                    <button
                      key={cs.country.id}
                      type="button"
                      onClick={() => {
                        const next = isSelected ? null : cs.country.id;
                        setDrillCountry(next);
                        // Scroll drill-down into view after state update
                        if (next) {
                          setTimeout(() => {
                            const el = document.getElementById("drill-down-panel");
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                          }, 50);
                        }
                      }}
                      className={`group relative rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm min-w-1/0 ${
                        isSelected ? "border-primary ring-2 ring-primary/15" : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-2xl shrink-1" aria-hidden="true">{flag(cc)}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {cs.userCount} {t("globalDashboard.learnersShort", "명")} · {cs.country.branches.length} {t("globalDashboard.branches", "지점")}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase shrink-0">{cc}</Badge>
                      </div>

                      <div className="space-y-2">
                        <MetricRow
                          label={t("globalDashboard.activeRate", "활성률")}
                          value={cs.activeRate}
                          icon={Activity}
                        />
                        <MetricRow
                          label={t("globalDashboard.avgProgress", "평균 진도")}
                          value={cs.avgProgress}
                          icon={TrendingUp}
                        />
                        <MetricRow
                          label={t("globalDashboard.mandRate", "필수 이수")}
                          value={cs.mandRate}
                          icon={ShieldCheck}
                          disabled={mandatoryCourseIds.size === 0}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Two-up: Track × Country matrix + Leaderboards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Track × Country */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                {t("globalDashboard.trackByCountry", "트랙별 국가 수료율")}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {trackMatrix.length === 0 || countryStats.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {t("globalDashboard.noTracks", "활성화된 트랙이 없습니다.")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[140px]">{t("globalDashboard.track", "트랙")}</TableHead>
                      {countryStats.map((cs) => (
                        <TableHead key={cs.country.id} className="text-center text-xs">
                          <span aria-hidden="true">{flag(cs.country.country)}</span>{" "}
                          {cs.country.country}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trackMatrix.map(({ track, row }) => (
                      <TableRow key={track.id}>
                        <TableCell className="font-medium text-sm">
                          {(isEn ? track.title_en : track.title) || track.title}
                        </TableCell>
                        {row.map((cell) => (
                          <TableCell key={cell.country.id} className="text-center p-1">
                            <div
                              className={`inline-flex flex-col items-center justify-center min-w-[52px] py-1.5 rounded-md ${heatColor(cell.rate)} bg-opacity-15`}
                              title={`${cell.done}/${cell.total}`}
                            >
                              <span className={`text-xs font-bold ${heatText(cell.rate)}`}>{cell.rate}%</span>
                              <span className="text-[10px] text-muted-foreground">{cell.done}/{cell.total}</span>
                            </div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Leaderboards */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  {t("globalDashboard.topBranches", "우수 지점 TOP 5")}
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t("globalDashboard.scoreFormula", "필수이수 50% + 평균진도 30% + 활성률 20% 가중치")}
                </p>
              </CardHeader>
              <CardContent>
                {topBranches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t("common.noData", "데이터가 없습니다")}
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {topBranches.map((b, idx) => (
                      <li key={b.branch.id} className="flex items-center gap-3 py-1.5 border-b-2 border-border/60 last:border-0">
                        <span className={`text-sm font-bold w-5 text-center ${idx < 3 ? "text-primary" : "text-muted-foreground"}`}>{idx + 1}</span>
                        <span className="text-base shrink-0" aria-hidden="true">{flag(b.branch.country)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{(isEn ? b.branch.name_en : b.branch.name) || b.branch.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {b.userCount}{t("globalDashboard.learnersShort", "명")} · {t("globalDashboard.mandShort", "필수")} {b.mandRate}% · {t("globalDashboard.progShort", "진도")} {b.avgProgress}%
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  {t("globalDashboard.watchBranches", "주의가 필요한 지점")}
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t("globalDashboard.watchHint", "활성률·진도가 낮은 3명 이상 지점")}
                </p>
              </CardHeader>
              <CardContent>
                {watchBranches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t("globalDashboard.allHealthy", "주의가 필요한 지점이 없습니다.")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {watchBranches.map((b) => (
                      <li key={b.branch.id} className="flex items-center gap-3 py-1.5 border-b-2 border-border/60 last:border-0">
                        <span className="text-base shrink-0" aria-hidden="true">{flag(b.branch.country)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{(isEn ? b.branch.name_en : b.branch.name) || b.branch.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {t("globalDashboard.activeShort", "활성")} {b.activeRate}% · {t("globalDashboard.progShort", "진도")} {b.avgProgress}%
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400 border-amber-500/30">
                          {b.userCount}{t("globalDashboard.learnersShort", "명")}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Drill-down panel */}
        {drillCountry && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Button variant="ghost" size="sm" onClick={() => setDrillCountry(null)} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> {t("common.back", "뒤로")}
                  </Button>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-2xl">
                    {flag(countries.find((c) => c.id === drillCountry)?.country || null)}
                  </span>
                  <CardTitle className="text-base truncate">
                    {(() => {
                      const c = countries.find((x) => x.id === drillCountry);
                      return (isEn ? c?.name_en : c?.name) || c?.name;
                    })()}
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {drilledBranches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("common.noData", "데이터가 없습니다")}</p>
              ) : (
                <div className="space-y-6">
                  {/* Branch summary table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("globalDashboard.entity", "법인/지점")}</TableHead>
                          <TableHead className="text-right">{t("globalDashboard.learners", "학습자")}</TableHead>
                          <TableHead className="text-right">{t("globalDashboard.activeRate", "활성률")}</TableHead>
                          <TableHead className="text-right">{t("globalDashboard.avgProgress", "평균 진도")}</TableHead>
                          <TableHead className="text-right">{t("globalDashboard.mandRate", "필수 이수")}</TableHead>
                          <TableHead className="w-[180px]">{t("globalDashboard.trackRate", "트랙 수료율")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drilledBranches.map((r) => (
                          <TableRow key={r.branch.id}>
                            <TableCell className="font-medium">{(isEn ? r.branch.name_en : r.branch.name) || r.branch.name}</TableCell>
                            <TableCell className="text-right">{r.userCount}</TableCell>
                            <TableCell className="text-right">{r.activeRate}%</TableCell>
                            <TableCell className="text-right">{r.avgProgress}%</TableCell>
                            <TableCell className="text-right">
                              {mandatoryCourseIds.size > 0 ? `${r.mandRate}%` : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={r.trackRate} className="h-2" />
                                <span className="text-xs font-semibold w-10 text-right">{r.trackRate}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Per-learner breakdown */}
                  <div className="overflow-x-auto">
                    <h3 className="text-sm font-semibold text-foreground mb-2">
                      {t("globalDashboard.learnerBreakdown", "학습자별 현황")}
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("globalDashboard.learner", "학습자")}</TableHead>
                          <TableHead>{t("globalDashboard.entity", "지점")}</TableHead>
                          <TableHead className="text-center">{t("globalDashboard.activeShort", "활성")}</TableHead>
                          <TableHead className="text-right">{t("globalDashboard.avgProgress", "평균 진도")}</TableHead>
                          <TableHead className="text-center">{t("globalDashboard.mandShort", "필수")}</TableHead>
                          {activeTracks.map((tr) => (
                            <TableHead key={tr.id} className="text-center text-xs">
                              {(isEn ? tr.title_en : tr.title) || tr.title}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drilledBranches.flatMap((r) =>
                          r.userRows.map(({ user, avg, tracks, active, mandDone }) => (
                            <TableRow key={user.user_id}>
                              <TableCell className="font-medium text-sm">
                                {user.full_name || user.email || user.user_id.slice(0, 8)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {(isEn ? r.branch.name_en : r.branch.name) || r.branch.name}
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={`inline-block h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                              </TableCell>
                              <TableCell className="text-right text-sm">{avg}%</TableCell>
                              <TableCell className="text-center">
                                {mandatoryCourseIds.size === 0 ? (
                                  <span className="text-muted-foreground text-xs">—</span>
                                ) : mandDone ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                                    ✓
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-rose-600 border-rose-300/40">!</Badge>
                                )}
                              </TableCell>
                              {tracks.map(({ track, complete }) => (
                                <TableCell key={track.id} className="text-center">
                                  {complete ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                                      <Trophy className="h-3 w-3 mr-1" />
                                      {t("globalDashboard.done", "완료")}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">—</Badge>
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────────

const toneMap: Record<string, { bg: string; fg: string; bar: string }> = {
  primary: { bg: "bg-primary/10", fg: "text-primary", bar: "bg-primary" },
  emerald: { bg: "bg-emerald-500/10", fg: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  blue:    { bg: "bg-blue-500/10",    fg: "text-blue-600 dark:text-blue-400",       bar: "bg-blue-500" },
  amber:   { bg: "bg-amber-500/10",   fg: "text-amber-600 dark:text-amber-400",     bar: "bg-amber-500" },
};

function Kpi({
  icon: Icon, label, value, sub, tone = "primary", progress,
}: {
  icon: any; label: string; value: string; sub?: string;
  tone?: "primary" | "emerald" | "blue" | "amber"; progress?: number;
}) {
  const t = toneMap[tone];
  return (
    <div className="flex items-center gap-3 px-4 py-3 min-w-0">
      <div className={`h-9 w-9 rounded-lg ${t.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`h-4 w-4 ${t.fg}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
        {progress !== undefined ? (
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden mt-1">
            <div className={`h-full ${t.bar} transition-all`} style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        ) : null}
        {sub && <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function MetricRow({
  label, value, icon: Icon, disabled,
}: { label: string; value: number; icon: any; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-[11px] text-muted-foreground w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${disabled ? "bg-muted-foreground/20" : heatColor(value)} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-[11px] font-semibold w-9 text-right tabular-nums ${disabled ? "text-muted-foreground" : "text-foreground"}`}>
        {disabled ? "—" : `${value}%`}
      </span>
    </div>
  );
}
