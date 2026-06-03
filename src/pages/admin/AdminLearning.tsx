import { GraduationCap, Download, BarChart3, Globe, Users, ArrowUp, ArrowDown, ArrowUpDown, Search, ChevronLeft, ChevronRight, ChevronDown, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import PageSkeleton from "@/components/PageSkeleton";
import StatCard from "@/components/ui/stat-card";
import { useDashboardSparklines, computeDelta } from "@/hooks/useDashboardSparklines";

type SortDir = "asc" | "desc";
type ProgressSortKey = "name" | "course" | "progress" | "status" | "enrolled_at" | "completed_at";
type CompleterSortKey = "name" | "course" | "completed_at";

const PAGE_SIZE = 50;

// ----- Multi-select popover -----
interface MultiSelectOption { id: string; label: string; sub?: string }
const MultiSelectPopover = ({
  label, placeholder, options, selected, onChange, width = "w-[260px]",
}: {
  label: string;
  placeholder: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  width?: string;
}) => {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.sub || "").toLowerCase().includes(q));
  }, [options, query]);
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const allOnPageIds = filtered.map((o) => o.id);
  const allSelectedOnPage = allOnPageIds.length > 0 && allOnPageIds.every((id) => selected.includes(id));
  const toggleAll = () => {
    if (allSelectedOnPage) onChange(selected.filter((id) => !allOnPageIds.includes(id)));
    else onChange(Array.from(new Set([...selected, ...allOnPageIds])));
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 justify-between gap-2 text-xs min-w-[140px]">
          <span className="truncate">
            {selected.length > 0 ? `${label}: ${selected.length}` : placeholder}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`${width} p-0`} align="start">
        <div className="p-2 border-b border-border">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border text-[11px]">
          <button type="button" onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
            {allSelectedOnPage ? "전체 해제" : "전체 선택"}
          </button>
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-muted-foreground hover:text-destructive">
              초기화
            </button>
          )}
        </div>
        <ScrollArea className="max-h-[260px]">
          <div className="p-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3 text-center">결과 없음</p>
            ) : (
              filtered.map((o) => (
                <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs">
                  <Checkbox checked={selected.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.sub && <span className="text-[10px] text-muted-foreground shrink-0">{o.sub}</span>}
                </label>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

const AdminLearning = () => {
  const { t, i18n } = useTranslation();
  // Filters
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [progressSort, setProgressSort] = useState<{ key: ProgressSortKey; dir: SortDir }>({ key: "enrolled_at", dir: "desc" });
  const [completerSort, setCompleterSort] = useState<{ key: CompleterSortKey; dir: SortDir }>({ key: "completed_at", dir: "desc" });
  const [progressPage, setProgressPage] = useState(1);
  const [completerPage, setCompleterPage] = useState(1);

  // Row selection (per tab)
  const [selectedProgress, setSelectedProgress] = useState<Set<string>>(new Set());
  const [selectedCompleters, setSelectedCompleters] = useState<Set<string>>(new Set());

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
    queryKey: ["admin-learning-profiles", "v3-with-empid"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, department, department_id, employee_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["admin-learning-departments", "v3-branches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, country, parent_department_id");
      if (error) throw error;
      return data;
    },
  });

  // Quiz attempts → pass/fail per (user_id, course_id)
  const { data: quizPassMap = new Map<string, boolean>() } = useQuery({
    queryKey: ["admin-learning-quiz-attempts"],
    queryFn: async () => {
      const [{ data: assessments }, { data: attempts }] = await Promise.all([
        supabase.from("assessments").select("id, course_id"),
        supabase.from("assessment_attempts").select("assessment_id, user_id, passed, completed_at").not("completed_at", "is", null),
      ]);
      const aToCourse = new Map<string, string>((assessments || []).map((a: any) => [a.id, a.course_id]));
      const map = new Map<string, boolean>();
      (attempts || []).forEach((at: any) => {
        const courseId = aToCourse.get(at.assessment_id);
        if (!courseId) return;
        const key = `${at.user_id}::${courseId}`;
        const prev = map.get(key);
        const passed = !!at.passed;
        if (prev === undefined) map.set(key, passed);
        else if (passed && !prev) map.set(key, true);
      });
      return map;
    },
  });

  const isLoading = coursesPending || enrollmentsPending || profilesPending;

  const departmentMap = useMemo(() => new Map(departments.map((d: any) => [d.id, d])), [departments]);
  const profileMap = useMemo(() => new Map(profiles.map((p: any) => [p.user_id, p])), [profiles]);
  const courseMap = useMemo(() => new Map(courses.map((c: any) => [c.id, c])), [courses]);

  const getQuizResult = (userId: string, courseId: string): "pass" | "fail" | null => {
    const v = quizPassMap.get(`${userId}::${courseId}`);
    if (v === undefined) return null;
    return v ? "pass" : "fail";
  };
  const QuizBadge = ({ result }: { result: "pass" | "fail" | null }) => {
    if (result === null) return <span className="text-xs text-muted-foreground">-</span>;
    if (result === "pass") return <Badge variant="default" className="text-[10px]">합격</Badge>;
    return <Badge variant="destructive" className="text-[10px]">불합격</Badge>;
  };

  // Top-level branches only (parent_department_id IS NULL)
  const branches = useMemo(
    () => (departments as any[]).filter((d) => !d.parent_department_id).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [departments]
  );

  // Country list derived from branches
  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    branches.forEach((b: any) => { if (b.country) set.add(b.country); });
    return Array.from(set).sort().map((c) => ({ id: c, label: c }));
  }, [branches]);

  // Resolve a user's branch (root department)
  const userBranchId = (userId: string): string | null => {
    const p: any = profileMap.get(userId);
    if (!p?.department_id) return null;
    const dept: any = departmentMap.get(p.department_id);
    if (!dept) return null;
    return dept.parent_department_id || dept.id;
  };
  const userCountry = (userId: string): string | null => {
    const bId = userBranchId(userId);
    if (!bId) return null;
    return (departmentMap.get(bId) as any)?.country || null;
  };

  // Apply filters
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return (enrollments as any[]).filter((e) => {
      if (courseIds.length > 0 && !courseIds.includes(e.course_id)) return false;
      if (branchIds.length > 0) {
        const bId = userBranchId(e.user_id);
        if (!bId || !branchIds.includes(bId)) return false;
      }
      if (countries.length > 0) {
        const c = userCountry(e.user_id);
        if (!c || !countries.includes(c)) return false;
      }
      if (q) {
        const p: any = profileMap.get(e.user_id);
        const name = (p?.full_name || "").toLowerCase();
        const emp = (p?.employee_id || "").toLowerCase();
        if (!name.includes(q) && !emp.includes(q)) return false;
      }
      return true;
    });
  }, [enrollments, courseIds, branchIds, countries, searchTerm, profileMap, departmentMap]);

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
        case "name": va = (profileMap.get(a.user_id) as any)?.full_name || ""; vb = (profileMap.get(b.user_id) as any)?.full_name || ""; break;
        case "course": va = (courseMap.get(a.course_id) as any)?.title || ""; vb = (courseMap.get(b.course_id) as any)?.title || ""; break;
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
    const arr = [...completerRows];
    const { key, dir } = completerSort;
    arr.sort((a: any, b: any) => {
      let va: any, vb: any;
      switch (key) {
        case "name": va = (profileMap.get(a.user_id) as any)?.full_name || ""; vb = (profileMap.get(b.user_id) as any)?.full_name || ""; break;
        case "course": va = (courseMap.get(a.course_id) as any)?.title || ""; vb = (courseMap.get(b.course_id) as any)?.title || ""; break;
        case "completed_at": va = a.completed_at ? new Date(a.completed_at).getTime() : 0; vb = b.completed_at ? new Date(b.completed_at).getTime() : 0; break;
      }
      const c = cmp(va, vb);
      return dir === "asc" ? c : -c;
    });
    return arr;
  }, [completerRows, completerSort, profileMap, courseMap, i18n.language]);

  const progressTotalPages = Math.max(1, Math.ceil(sortedProgressRows.length / PAGE_SIZE));
  const completerTotalPages = Math.max(1, Math.ceil(sortedCompleterRows.length / PAGE_SIZE));
  const currentProgressPage = Math.min(progressPage, progressTotalPages);
  const currentCompleterPage = Math.min(completerPage, completerTotalPages);
  const visibleProgressRows = sortedProgressRows.slice((currentProgressPage - 1) * PAGE_SIZE, currentProgressPage * PAGE_SIZE);
  const visibleCompleterRows = sortedCompleterRows.slice((currentCompleterPage - 1) * PAGE_SIZE, currentCompleterPage * PAGE_SIZE);

  useEffect(() => { setProgressPage(1); setSelectedProgress(new Set()); }, [courseIds, branchIds, countries, searchTerm, progressSort.key, progressSort.dir]);
  useEffect(() => { setCompleterPage(1); setSelectedCompleters(new Set()); }, [courseIds, branchIds, countries, searchTerm, completerSort.key, completerSort.dir]);

  const Pagination = ({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (p: number) => void }) => {
    if (total === 0) return null;
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
        <span className="tabular-nums">{start.toLocaleString()}–{end.toLocaleString()} / {total.toLocaleString()}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 px-2" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 tabular-nums">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" className="h-8 px-2" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const totalStudents = new Set(filtered.map((e: any) => e.user_id)).size;
  const completedCount = completerRows.length;
  const { data: learnSpark } = useDashboardSparklines(14);
  const avgProgress = filtered.length > 0 ? Math.round(filtered.reduce((s: number, e: any) => s + (Number(e.progress) || 0), 0) / filtered.length) : 0;

  const countryProgress = useMemo(() => {
    const map = new Map<string, { total: number; sum: number }>();
    filtered.forEach((e: any) => {
      const country = userCountry(e.user_id) || t("admin.unknownCountry", "미지정");
      if (!map.has(country)) map.set(country, { total: 0, sum: 0 });
      const v = map.get(country)!;
      v.total++;
      v.sum += Number(e.progress) || 0;
    });
    return Array.from(map.entries())
      .map(([country, v]) => ({ country, avg: Math.round(v.sum / v.total), count: v.total }))
      .sort((a, b) => b.avg - a.avg);
  }, [filtered, profileMap, departmentMap, t]);

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

  const rowToCsv = (e: any) => {
    const p: any = profileMap.get(e.user_id);
    const c: any = courseMap.get(e.course_id);
    const bId = userBranchId(e.user_id);
    const branch = bId ? (departmentMap.get(bId) as any)?.name : (p?.department || "-");
    const country = userCountry(e.user_id) || "-";
    const status = e.completed_at ? t("common.complete") : (Number(e.progress) || 0) > 0 ? t("dashboard.inProgress") : t("admin.notStarted");
    return [
      country,
      branch || "-",
      p?.full_name || "-",
      p?.employee_id || "-",
      c?.title || "-",
      `${Math.round(Number(e.progress) || 0)}%`,
      status,
      formatDate(e.enrolled_at),
      formatDate(e.completed_at),
    ];
  };

  const csvHeader = [
    t("admin.countryColumn", "국가"),
    t("admin.branchColumn", "지점"),
    t("admin.nameColumn"),
    "ID",
    t("admin.courseLabel"),
    t("admin.progressLabel"),
    t("admin.statusLabel"),
    t("admin.startDate"),
    t("admin.completionDate"),
  ];
  const escape = (v: any) => {
    const s = String(v ?? "-");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const downloadCsv = (rows: any[], filename: string) => {
    const csv = [csvHeader, ...rows.map(rowToCsv)].map((r) => r.map(escape).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAll = () => downloadCsv(filtered, "learning_report_all.csv");
  const exportSelectedProgress = () => {
    const rows = sortedProgressRows.filter((e) => selectedProgress.has(e.id));
    if (rows.length === 0) return;
    downloadCsv(rows, "learning_report_selected.csv");
  };
  const exportSelectedCompleters = () => {
    const rows = sortedCompleterRows.filter((e) => selectedCompleters.has(e.id));
    if (rows.length === 0) return;
    downloadCsv(rows, "completers_selected.csv");
  };

  const togglePageSelectionProgress = () => {
    const ids = visibleProgressRows.map((r) => r.id);
    const allSel = ids.length > 0 && ids.every((id) => selectedProgress.has(id));
    const next = new Set(selectedProgress);
    if (allSel) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    setSelectedProgress(next);
  };
  const togglePageSelectionCompleters = () => {
    const ids = visibleCompleterRows.map((r) => r.id);
    const allSel = ids.length > 0 && ids.every((id) => selectedCompleters.has(id));
    const next = new Set(selectedCompleters);
    if (allSel) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    setSelectedCompleters(next);
  };

  const courseOptions: MultiSelectOption[] = courses.map((c: any) => ({ id: c.id, label: c.title }));
  const branchOptions: MultiSelectOption[] = branches.map((b: any) => ({ id: b.id, label: b.name, sub: b.country || undefined }));

  const activeFilterCount = courseIds.length + branchIds.length + countries.length + (searchTerm.trim() ? 1 : 0);
  const clearAllFilters = () => { setCourseIds([]); setBranchIds([]); setCountries([]); setSearchTerm(""); };

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
          <Button onClick={exportAll} variant="outline" className="rounded-xl gap-2 text-sm w-full sm:w-auto justify-center sm:justify-start">
            <Download className="h-4 w-4" aria-hidden="true" /> 전체 CSV ({filtered.length.toLocaleString()})
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <StatCard label={t("admin.totalEnrolled")} value={totalStudents} icon={Users} tone="primary"
            trend={(learnSpark?.enrollments ?? []).slice(-7)} delta={computeDelta(learnSpark?.enrollments)} hint={t("admin.enrolledStudentsLabel")} />
          <StatCard label={t("admin.completionCount")} value={completedCount} icon={GraduationCap} tone="success"
            trend={(learnSpark?.completions ?? []).slice(-7)} delta={computeDelta(learnSpark?.completions)}
            hint={`${filtered.length > 0 ? Math.round((completedCount / filtered.length) * 100) : 0}% ${t("admin.completionRateLabel")}`} />
          <StatCard label={t("admin.avgProgressLabel")} value={`${avgProgress}%`} icon={BarChart3} tone="info"
            trend={(learnSpark?.completions ?? []).slice(-7)} delta={computeDelta(learnSpark?.completions)}
            hint={`${completedCount}/${totalStudents} ${t("admin.completedRatio", "이수")}`} />
          <div className="stat-card !p-4 sm:!p-5 flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="rounded-lg p-2 shrink-0 bg-primary/10">
                  <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
                </span>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{t("admin.countryProgress", "국가별 진도율")}</p>
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{countryProgress.length}{t("admin.countriesUnit", "개국")}</span>
            </div>
            <div className="space-y-2 min-w-0">
              {countryProgress.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">{t("admin.noLearningData")}</p>
              ) : (
                countryProgress.slice(0, 4).map((c, i) => {
                  const color = c.avg >= 80 ? "hsl(var(--success))" : c.avg >= 50 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
                  return (
                    <div key={c.country} className="min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground w-3 shrink-0">{i + 1}</span>
                          <span className="text-xs font-medium text-foreground truncate">{c.country}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">({c.count})</span>
                        </div>
                        <span className="text-xs font-bold tabular-nums shrink-0" style={{ color }}>{c.avg}%</span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, Math.min(100, c.avg))}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="stat-card !p-3 sm:!p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-foreground">
              <Filter className="h-4 w-4" /> 필터링
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5">{activeFilterCount}개 적용</Badge>
              )}
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearAllFilters}>
                <X className="h-3 w-3" /> 필터 초기화
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <MultiSelectPopover
              label="강의" placeholder="강의 선택 (복수)"
              options={courseOptions} selected={courseIds} onChange={setCourseIds}
              width="w-[320px]"
            />
            <MultiSelectPopover
              label="지점" placeholder="지점 선택 (복수)"
              options={branchOptions} selected={branchIds} onChange={setBranchIds}
            />
            <MultiSelectPopover
              label="국가" placeholder="국가 선택 (복수)"
              options={countryOptions} selected={countries} onChange={setCountries}
              width="w-[200px]"
            />
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="이름 또는 ID로 검색"
                className="pl-9 h-9 text-xs"
                aria-label="이름 또는 ID로 검색"
              />
            </div>
          </div>
        </div>

        <Tabs defaultValue="progress" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="progress" className="px-3 py-2 text-xs sm:text-sm">{t("admin.progressStatus")}</TabsTrigger>
            <TabsTrigger value="completers" className="px-3 py-2 text-xs sm:text-sm">{t("admin.completersList")}</TabsTrigger>
          </TabsList>

          <TabsContent value="progress" className="mt-0 space-y-4">
            <div className="stat-card !p-3 sm:!p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-sm sm:text-base font-semibold text-foreground">
                  {t("admin.studentProgressStatus")}
                  <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">({sortedProgressRows.length.toLocaleString()})</span>
                </h3>
                <div className="flex items-center gap-2">
                  {selectedProgress.size > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">선택: {selectedProgress.size.toLocaleString()}</span>
                  )}
                  <Button size="sm" variant="outline" className="h-9 gap-2 text-xs" disabled={selectedProgress.size === 0} onClick={exportSelectedProgress}>
                    <Download className="h-3.5 w-3.5" /> 선택 CSV
                  </Button>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-3" aria-label={t("admin.studentProgressStatus")}>
                {visibleProgressRows.length === 0 ? (
                  <div className="rounded-xl border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">{t("admin.noLearningData")}</div>
                ) : (
                  visibleProgressRows.map((e: any) => {
                    const p: any = profileMap.get(e.user_id);
                    const c: any = courseMap.get(e.course_id);
                    const progressValue = Math.round(Number(e.progress) || 0);
                    const checked = selectedProgress.has(e.id);
                    return (
                      <article key={e.id} className="rounded-xl border border-border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 min-w-0">
                            <Checkbox checked={checked} onCheckedChange={(v) => {
                              const next = new Set(selectedProgress);
                              if (v) next.add(e.id); else next.delete(e.id);
                              setSelectedProgress(next);
                            }} />
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-foreground break-words">{p?.full_name || "-"}</h4>
                              {p?.employee_id && <p className="text-[10px] text-muted-foreground">{p.employee_id}</p>}
                              <p className="text-xs text-muted-foreground mt-1 break-words">{c?.title || "-"}</p>
                            </div>
                          </div>
                          <div className="shrink-0">{getStatusBadge(e)}</div>
                        </div>
                        <div className="mt-4">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-muted-foreground">{t("admin.progressLabel")}</span>
                            <span className="font-medium text-foreground">{progressValue}%</span>
                          </div>
                          <Progress value={progressValue} className="mt-2 h-2" />
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                          <div><dt className="text-muted-foreground">{t("admin.startDate")}</dt><dd className="mt-1 text-foreground">{formatDate(e.enrolled_at)}</dd></div>
                          <div><dt className="text-muted-foreground">{t("admin.completionDate")}</dt><dd className="mt-1 text-foreground">{formatDate(e.completed_at)}</dd></div>
                        </dl>
                      </article>
                    );
                  })
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto -mx-3 sm:-mx-5">
                <div className="min-w-[820px] px-3 sm:px-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={visibleProgressRows.length > 0 && visibleProgressRows.every((r) => selectedProgress.has(r.id))}
                            onCheckedChange={togglePageSelectionProgress}
                            aria-label="페이지 전체 선택"
                          />
                        </TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.nameColumn")} <SortIcon active={progressSort.key === "name"} dir={progressSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("course")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.courseLabel")} <SortIcon active={progressSort.key === "course"} dir={progressSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("progress")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.progressLabel")} <SortIcon active={progressSort.key === "progress"} dir={progressSort.dir} /></button></TableHead>
                        <TableHead>퀴즈 결과</TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("status")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.statusLabel")} <SortIcon active={progressSort.key === "status"} dir={progressSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("enrolled_at")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.startDate")} <SortIcon active={progressSort.key === "enrolled_at"} dir={progressSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleProgressSort("completed_at")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.completionDate")} <SortIcon active={progressSort.key === "completed_at"} dir={progressSort.dir} /></button></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleProgressRows.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("admin.noLearningData")}</TableCell></TableRow>
                      ) : (
                        visibleProgressRows.map((e: any) => {
                          const p: any = profileMap.get(e.user_id);
                          const c: any = courseMap.get(e.course_id);
                          const checked = selectedProgress.has(e.id);
                          return (
                            <TableRow key={e.id} data-state={checked ? "selected" : undefined}>
                              <TableCell>
                                <Checkbox checked={checked} onCheckedChange={(v) => {
                                  const next = new Set(selectedProgress);
                                  if (v) next.add(e.id); else next.delete(e.id);
                                  setSelectedProgress(next);
                                }} />
                              </TableCell>
                              <TableCell className="font-medium text-sm">
                                <div>{p?.full_name || "-"}</div>
                                {p?.employee_id && <div className="text-[10px] text-muted-foreground">{p.employee_id}</div>}
                              </TableCell>
                              <TableCell className="max-w-[260px] text-sm whitespace-normal break-words">{c?.title || "-"}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress value={Number(e.progress) || 0} className="w-20 h-1.5" />
                                  <span className="text-xs">{Math.round(Number(e.progress) || 0)}%</span>
                                </div>
                              </TableCell>
                              <TableCell><QuizBadge result={getQuizResult(e.user_id, e.course_id)} /></TableCell>
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
              <Pagination page={currentProgressPage} totalPages={progressTotalPages} total={sortedProgressRows.length} onChange={setProgressPage} />
            </div>
          </TabsContent>

          <TabsContent value="completers" className="mt-0">
            <div className="stat-card !p-3 sm:!p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-sm sm:text-base font-semibold text-foreground">
                  {t("admin.completersList")}
                  <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">({sortedCompleterRows.length.toLocaleString()})</span>
                </h3>
                <div className="flex items-center gap-2">
                  {selectedCompleters.size > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">선택: {selectedCompleters.size.toLocaleString()}</span>
                  )}
                  <Button size="sm" variant="outline" className="h-9 gap-2 text-xs" disabled={selectedCompleters.size === 0} onClick={exportSelectedCompleters}>
                    <Download className="h-3.5 w-3.5" /> 선택 CSV
                  </Button>
                </div>
              </div>

              <div className="sm:hidden space-y-3" aria-label={t("admin.completersList")}>
                {visibleCompleterRows.length === 0 ? (
                  <div className="rounded-xl border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">{t("admin.noCompleters")}</div>
                ) : (
                  visibleCompleterRows.map((e: any) => {
                    const p: any = profileMap.get(e.user_id);
                    const c: any = courseMap.get(e.course_id);
                    const checked = selectedCompleters.has(e.id);
                    return (
                      <article key={e.id} className="rounded-xl border border-border bg-background p-4">
                        <div className="flex items-start gap-2">
                          <Checkbox checked={checked} onCheckedChange={(v) => {
                            const next = new Set(selectedCompleters);
                            if (v) next.add(e.id); else next.delete(e.id);
                            setSelectedCompleters(next);
                          }} />
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-foreground break-words">{p?.full_name || "-"}</h4>
                            {p?.employee_id && <p className="text-[10px] text-muted-foreground">{p.employee_id}</p>}
                            <p className="text-xs text-muted-foreground mt-1 break-words">{c?.title || "-"}</p>
                          </div>
                        </div>
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
                <div className="min-w-[620px] px-3 sm:px-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={visibleCompleterRows.length > 0 && visibleCompleterRows.every((r) => selectedCompleters.has(r.id))}
                            onCheckedChange={togglePageSelectionCompleters}
                            aria-label="페이지 전체 선택"
                          />
                        </TableHead>
                        <TableHead><button type="button" onClick={() => toggleCompleterSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.nameColumn")} <SortIcon active={completerSort.key === "name"} dir={completerSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleCompleterSort("course")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.courseLabel")} <SortIcon active={completerSort.key === "course"} dir={completerSort.dir} /></button></TableHead>
                        <TableHead><button type="button" onClick={() => toggleCompleterSort("completed_at")} className="inline-flex items-center gap-1 hover:text-foreground">{t("admin.completionDate")} <SortIcon active={completerSort.key === "completed_at"} dir={completerSort.dir} /></button></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleCompleterRows.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("admin.noCompleters")}</TableCell></TableRow>
                      ) : (
                        visibleCompleterRows.map((e: any) => {
                          const p: any = profileMap.get(e.user_id);
                          const c: any = courseMap.get(e.course_id);
                          const checked = selectedCompleters.has(e.id);
                          return (
                            <TableRow key={e.id} data-state={checked ? "selected" : undefined}>
                              <TableCell>
                                <Checkbox checked={checked} onCheckedChange={(v) => {
                                  const next = new Set(selectedCompleters);
                                  if (v) next.add(e.id); else next.delete(e.id);
                                  setSelectedCompleters(next);
                                }} />
                              </TableCell>
                              <TableCell className="font-medium text-sm">
                                <div>{p?.full_name || "-"}</div>
                                {p?.employee_id && <div className="text-[10px] text-muted-foreground">{p.employee_id}</div>}
                              </TableCell>
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
              <Pagination page={currentCompleterPage} totalPages={completerTotalPages} total={sortedCompleterRows.length} onChange={setCompleterPage} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
      )}
    </DashboardLayout>
  );
};

export default AdminLearning;
