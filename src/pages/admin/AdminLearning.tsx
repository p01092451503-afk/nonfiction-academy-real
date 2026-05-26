import { GraduationCap, Download, BarChart3, AlertTriangle, Users, ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import PageSkeleton from "@/components/PageSkeleton";
import StatCard from "@/components/ui/stat-card";
import { useDashboardSparklines, computeDelta } from "@/hooks/useDashboardSparklines";

type SortDir = "asc" | "desc";
type ProgressSortKey = "name" | "course" | "progress" | "status" | "enrolled_at" | "completed_at";
type CompleterSortKey = "name" | "course" | "completed_at";

const AdminLearning = () => {
  const { t, i18n } = useTranslation();
  const [courseFilter, setCourseFilter] = useState("all");
  const [progressSort, setProgressSort] = useState<{ key: ProgressSortKey; dir: SortDir }>({ key: "enrolled_at", dir: "desc" });
  const [completerSort, setCompleterSort] = useState<{ key: CompleterSortKey; dir: SortDir }>({ key: "completed_at", dir: "desc" });
  const [completerSearch, setCompleterSearch] = useState("");


  const { data: courses = [], isPending: coursesPending } = useQuery({
    queryKey: ["admin-learning-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, title, status").order("title");
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollments = [], isPending: enrollmentsPending } = useQuery({
    queryKey: ["admin-learning-enrollments"],
    queryFn: async () => {
      // Supabase 기본 1000행 제한을 우회하기 위해 range로 페이지네이션
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("enrollments")
          .select("id, user_id, course_id, progress, enrolled_at, completed_at")
          .order("enrolled_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  const { data: profiles = [], isPending: profilesPending } = useQuery({
    queryKey: ["admin-learning-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name, department");
      if (error) throw error;
      return data;
    },
  });

  const isLoading = coursesPending || enrollmentsPending || profilesPending;

  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));
  const courseMap = new Map(courses.map((c: any) => [c.id, c]));

  const filtered = courseFilter === "all" ? enrollments : enrollments.filter((e: any) => e.course_id === courseFilter);
  const completerRows = filtered.filter((e: any) => e.completed_at);
  const statusRank = (e: any) => {
    if (e.completed_at) return 2;
    if ((Number(e.progress) || 0) > 0) return 1;
    return 0;
  };
  const cmp = (a: any, b: any) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), i18n.language || undefined);
  };

  const sortedProgressRows = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = progressSort;
    arr.sort((a: any, b: any) => {
      let va: any, vb: any;
      switch (key) {
        case "name": va = profileMap.get(a.user_id)?.full_name || ""; vb = profileMap.get(b.user_id)?.full_name || ""; break;
        case "course": va = courseMap.get(a.course_id)?.title || ""; vb = courseMap.get(b.course_id)?.title || ""; break;
        case "progress": va = Number(a.progress) || 0; vb = Number(b.progress) || 0; break;
        case "status": va = statusRank(a); vb = statusRank(b); break;
        case "enrolled_at": va = a.enrolled_at ? new Date(a.enrolled_at).getTime() : 0; vb = b.enrolled_at ? new Date(b.enrolled_at).getTime() : 0; break;
        case "completed_at": va = a.completed_at ? new Date(a.completed_at).getTime() : 0; vb = b.completed_at ? new Date(b.completed_at).getTime() : 0; break;
      }
      const c = cmp(va, vb);
      return dir === "asc" ? c : -c;
    });
    return arr;
  }, [filtered, progressSort, profileMap, courseMap, i18n.language]);

  const sortedCompleterRows = useMemo(() => {
    const q = completerSearch.trim().toLowerCase();
    const base = q
      ? completerRows.filter((e: any) => (profileMap.get(e.user_id)?.full_name || "").toLowerCase().includes(q))
      : completerRows;
    const arr = [...base];
    const { key, dir } = completerSort;
    arr.sort((a: any, b: any) => {
      let va: any, vb: any;
      switch (key) {
        case "name": va = profileMap.get(a.user_id)?.full_name || ""; vb = profileMap.get(b.user_id)?.full_name || ""; break;
        case "course": va = courseMap.get(a.course_id)?.title || ""; vb = courseMap.get(b.course_id)?.title || ""; break;
        case "completed_at": va = a.completed_at ? new Date(a.completed_at).getTime() : 0; vb = b.completed_at ? new Date(b.completed_at).getTime() : 0; break;
      }
      const c = cmp(va, vb);
      return dir === "asc" ? c : -c;
    });
    return arr;
  }, [completerRows, completerSort, completerSearch, profileMap, courseMap, i18n.language]);

  const visibleProgressRows = sortedProgressRows.slice(0, 50);
  const visibleCompleterRows = sortedCompleterRows.slice(0, 50);
  const totalStudents = new Set(filtered.map((e: any) => e.user_id)).size;
  const completedCount = completerRows.length;
  const { data: learnSpark } = useDashboardSparklines(14);
  const avgProgress = filtered.length > 0 ? Math.round(filtered.reduce((s: number, e: any) => s + (Number(e.progress) || 0), 0) / filtered.length) : 0;
  const atRisk = filtered.filter((e: any) => (Number(e.progress) || 0) < 20 && !e.completed_at).length;

  const toggleProgressSort = (key: ProgressSortKey) => {
    setProgressSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };
  const toggleCompleterSort = (key: CompleterSortKey) => {
    setCompleterSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };
  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
    if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />;
    return dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />;
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return i18n.language?.startsWith("en")
      ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : new Date(d).toLocaleDateString("ko-KR");
  };

  const getStatusBadge = (e: any) => {
    if (e.completed_at) return <Badge variant="default" className="text-[10px]">{t("common.complete")}</Badge>;
    if ((Number(e.progress) || 0) > 0) return <Badge variant="secondary" className="text-[10px]">{t("dashboard.inProgress")}</Badge>;
    return <Badge variant="outline" className="text-[10px]">{t("admin.notStarted")}</Badge>;
  };

  const exportCSV = () => {
    const header = [t("admin.nameColumn"), t("admin.courseLabel"), t("admin.progressLabel"), t("admin.statusLabel"), t("admin.startDate"), t("admin.completionDate")];
    const rows = filtered.map((e: any) => {
      const p = profileMap.get(e.user_id);
      const c = courseMap.get(e.course_id);
      const status = e.completed_at ? t("common.complete") : (Number(e.progress) || 0) > 0 ? t("dashboard.inProgress") : t("admin.notStarted");
      return [p?.full_name || "-", c?.title || "-", `${Math.round(Number(e.progress) || 0)}%`, status, formatDate(e.enrolled_at), formatDate(e.completed_at)];
    });
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "learning_report.csv";
    a.click();
  };

  return (
    <DashboardLayout role="admin">
      {isLoading ? (
        <PageSkeleton blocks={4} />
      ) : (
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
              <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              {t("admin.learningManagement")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("admin.learningManagementDesc")}</p>
          </div>
          <Button onClick={exportCSV} variant="outline" className="rounded-xl gap-2 text-sm w-full sm:w-auto justify-center sm:justify-start">
            <Download className="h-4 w-4" aria-hidden="true" /> CSV {t("admin.download")}
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <StatCard
            label={t("admin.totalEnrolled")}
            value={totalStudents}
            icon={Users}
            tone="primary"
            trend={(learnSpark?.enrollments ?? []).slice(-7)}
            delta={computeDelta(learnSpark?.enrollments)}
            hint={t("admin.enrolledStudentsLabel")}
          />
          <StatCard
            label={t("admin.completionCount")}
            value={completedCount}
            icon={GraduationCap}
            tone="success"
            trend={(learnSpark?.completions ?? []).slice(-7)}
            delta={computeDelta(learnSpark?.completions)}
            hint={`${filtered.length > 0 ? Math.round((completedCount / filtered.length) * 100) : 0}% ${t("admin.completionRateLabel")}`}
          />
          <StatCard
            label={t("admin.avgProgressLabel")}
            value={`${avgProgress}%`}
            icon={BarChart3}
            tone="info"
          />
          <StatCard
            label={t("admin.atRisk")}
            value={atRisk}
            icon={AlertTriangle}
            tone="danger"
            hint={t("admin.needsAttention")}
          />
        </div>

        <Tabs defaultValue="progress" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="progress" className="px-3 py-2 text-xs sm:text-sm">{t("admin.progressStatus")}</TabsTrigger>
            <TabsTrigger value="completers" className="px-3 py-2 text-xs sm:text-sm">{t("admin.completersList")}</TabsTrigger>
          </TabsList>

          <TabsContent value="progress" className="mt-0 space-y-4">
            <div className="stat-card !p-3 sm:!p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-sm sm:text-base font-semibold text-foreground">{t("admin.studentProgressStatus")}</h3>
                <Select value={courseFilter} onValueChange={setCourseFilter}>
                  <SelectTrigger className="w-full sm:w-48 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.allCourses")}</SelectItem>
                    {courses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:hidden space-y-3" aria-label={t("admin.studentProgressStatus")}>
                {visibleProgressRows.length === 0 ? (
                  <div className="rounded-xl border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("admin.noLearningData")}
                  </div>
                ) : (
                  visibleProgressRows.map((e: any) => {
                    const p = profileMap.get(e.user_id);
                    const c = courseMap.get(e.course_id);
                    const progressValue = Math.round(Number(e.progress) || 0);

                    return (
                      <article key={e.id} className="rounded-xl border border-border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-foreground break-words">{p?.full_name || "-"}</h4>
                            <p className="text-xs text-muted-foreground mt-1 break-words">{c?.title || "-"}</p>
                          </div>
                          <div className="shrink-0">{getStatusBadge(e)}</div>
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-muted-foreground">{t("admin.progressLabel")}</span>
                            <span className="font-medium text-foreground">{progressValue}%</span>
                          </div>
                          <Progress value={progressValue} className="mt-2 h-2" aria-label={`${t("admin.progressLabel")}: ${progressValue}%`} />
                        </div>

                        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <dt className="text-muted-foreground">{t("admin.startDate")}</dt>
                            <dd className="mt-1 text-foreground">{formatDate(e.enrolled_at)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">{t("admin.completionDate")}</dt>
                            <dd className="mt-1 text-foreground">{formatDate(e.completed_at)}</dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })
                )}
              </div>

              <div className="hidden sm:block overflow-x-auto -mx-3 sm:-mx-5">
                <div className="min-w-[720px] px-3 sm:px-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.nameColumn")} <SortIcon active={progressSort.key === "name"} dir={progressSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("course")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.courseLabel")} <SortIcon active={progressSort.key === "course"} dir={progressSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("progress")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.progressLabel")} <SortIcon active={progressSort.key === "progress"} dir={progressSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("status")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.statusLabel")} <SortIcon active={progressSort.key === "status"} dir={progressSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("enrolled_at")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.startDate")} <SortIcon active={progressSort.key === "enrolled_at"} dir={progressSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("completed_at")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.completionDate")} <SortIcon active={progressSort.key === "completed_at"} dir={progressSort.dir} /></button></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleProgressRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("admin.noLearningData")}</TableCell>
                        </TableRow>
                      ) : (
                        visibleProgressRows.map((e: any) => {
                          const p = profileMap.get(e.user_id);
                          const c = courseMap.get(e.course_id);
                          return (
                            <TableRow key={e.id}>
                              <TableCell className="font-medium text-sm">{p?.full_name || "-"}</TableCell>
                              <TableCell className="max-w-[260px] text-sm whitespace-normal break-words">{c?.title || "-"}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress value={Number(e.progress) || 0} className="w-20 h-1.5" />
                                  <span className="text-xs">{Math.round(Number(e.progress) || 0)}%</span>
                                </div>
                              </TableCell>
                              <TableCell>{getStatusBadge(e)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatDate(e.enrolled_at)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatDate(e.completed_at)}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="completers" className="mt-0">
            <div className="stat-card !p-3 sm:!p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-sm sm:text-base font-semibold text-foreground">{t("admin.completersList")}</h3>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="search"
                    value={completerSearch}
                    onChange={(e) => setCompleterSearch(e.target.value)}
                    placeholder={t("admin.searchByName", "이름으로 검색")}
                    className="pl-9 h-9"
                    aria-label={t("admin.searchByName", "이름으로 검색")}
                  />
                </div>
              </div>

              <div className="sm:hidden space-y-3" aria-label={t("admin.completersList")}>
                {visibleCompleterRows.length === 0 ? (
                  <div className="rounded-xl border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("admin.noCompleters")}
                  </div>
                ) : (
                  visibleCompleterRows.map((e: any) => {
                    const p = profileMap.get(e.user_id);
                    const c = courseMap.get(e.course_id);

                    return (
                      <article key={e.id} className="rounded-xl border border-border bg-background p-4">
                        <h4 className="text-sm font-semibold text-foreground break-words">{p?.full_name || "-"}</h4>
                        <p className="text-xs text-muted-foreground mt-1 break-words">{c?.title || "-"}</p>
                        <dl className="mt-4 text-xs">
                          <dt className="text-muted-foreground">{t("admin.completionDate")}</dt>
                          <dd className="mt-1 text-foreground">{formatDate(e.completed_at)}</dd>
                        </dl>
                      </article>
                    );
                  })
                )}
              </div>

              <div className="hidden sm:block overflow-x-auto -mx-3 sm:-mx-5">
                <div className="min-w-[560px] px-3 sm:px-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead><button type="button" onClick={() => toggleCompleterSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.nameColumn")} <SortIcon active={completerSort.key === "name"} dir={completerSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleCompleterSort("course")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.courseLabel")} <SortIcon active={completerSort.key === "course"} dir={completerSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleCompleterSort("completed_at")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.completionDate")} <SortIcon active={completerSort.key === "completed_at"} dir={completerSort.dir} /></button></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleCompleterRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">{t("admin.noCompleters")}</TableCell>
                        </TableRow>
                      ) : (
                        visibleCompleterRows.map((e: any) => {
                          const p = profileMap.get(e.user_id);
                          const c = courseMap.get(e.course_id);
                          return (
                            <TableRow key={e.id}>
                              <TableCell className="font-medium text-sm">{p?.full_name || "-"}</TableCell>
                              <TableCell className="max-w-[280px] text-sm whitespace-normal break-words">{c?.title || "-"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatDate(e.completed_at)}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      )}
    </DashboardLayout>
  );
};

export default AdminLearning;
