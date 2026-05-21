import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Database, Search, Download, Users, CheckCircle2, XCircle, Globe2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import * as XLSX from "xlsx";

interface Employee {
  employee_id: number;
  country: "KR" | "JP" | "HK" | "US";
  store: string | null;
  name: string;
  email: string | null;
  position: string | null;
  start_date: string | null;
}
interface Course {
  course_id: number;
  country: string;
  year: number;
  course_name: string;
}
interface Completion {
  employee_id: number;
  course_id: number;
  status: "completed" | "not_completed" | "in_progress" | "not_assigned" | "on_leave";
}

const COUNTRIES = ["KR", "JP", "HK", "US"] as const;
const PAGE_SIZE = 50;

const STATUS_META: Record<Completion["status"], { label: string; cls: string }> = {
  completed:    { label: "수료",     cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  not_completed:{ label: "미수료",   cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30" },
  in_progress:  { label: "진행중",   cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  not_assigned: { label: "미배정",   cls: "bg-muted text-muted-foreground border-border" },
  on_leave:     { label: "휴직",     cls: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30" },
};

type SortKey = "name" | "store" | "position" | "country" | "start_date" | "course_name" | "year" | "status";

const useDebounced = <T,>(value: T, delay = 300): T => {
  const [v, setV] = useState(value);
  useMemo(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
};

export default function AdminMigrationRecords() {
  const [country, setCountry] = useState<"ALL" | typeof COUNTRIES[number]>("ALL");
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<string>("ALL");
  const [positionFilter, setPositionFilter] = useState<string>("ALL");
  const [yearFilter, setYearFilter] = useState<string>("ALL");
  const [startYearFilter, setStartYearFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);

  const debouncedSearch = useDebounced(search, 300);

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ["mig-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("migration_employees").select("*").order("employee_id");
      if (error) throw error; return (data || []) as Employee[];
    },
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["mig-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("migration_courses").select("*").order("course_id");
      if (error) throw error; return (data || []) as Course[];
    },
  });

  const { data: completions = [], isLoading: cmpLoading } = useQuery({
    queryKey: ["mig-completions"],
    queryFn: async () => {
      const all: Completion[] = [];
      let from = 0;
      const step = 1000;
      // paginate in case rows exceed default 1000 limit
      while (true) {
        const { data, error } = await supabase
          .from("migration_completions")
          .select("employee_id,course_id,status")
          .range(from, from + step - 1);
        if (error) throw error;
        const rows = (data || []) as Completion[];
        all.push(...rows);
        if (rows.length < step) break;
        from += step;
      }
      return all;
    },
  });

  const empMap = useMemo(() => new Map(employees.map((e) => [e.employee_id, e])), [employees]);
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.course_id, c])), [courses]);

  // Available filter options derived from data
  const stores = useMemo(() => {
    const list = employees
      .filter((e) => country === "ALL" || e.country === country)
      .map((e) => e.store)
      .filter((s): s is string => !!s);
    return Array.from(new Set(list)).sort();
  }, [employees, country]);

  const positions = useMemo(
    () => Array.from(new Set(employees.map((e) => e.position).filter((s): s is string => !!s))).sort(),
    [employees]
  );

  const startYears = useMemo(() => {
    const ys = employees
      .map((e) => (e.start_date ? new Date(e.start_date).getFullYear() : null))
      .filter((y): y is number => !!y && !Number.isNaN(y));
    return Array.from(new Set(ys)).sort((a, b) => a - b);
  }, [employees]);

  // Filtered employee set
  const filteredEmployees = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return employees.filter((e) => {
      if (country !== "ALL" && e.country !== country) return false;
      if (storeFilter !== "ALL" && e.store !== storeFilter) return false;
      if (positionFilter !== "ALL" && e.position !== positionFilter) return false;
      if (startYearFilter !== "ALL") {
        const y = e.start_date ? new Date(e.start_date).getFullYear() : null;
        if (String(y) !== startYearFilter) return false;
      }
      if (term) {
        const hay = `${e.name} ${e.email || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [employees, country, storeFilter, positionFilter, startYearFilter, debouncedSearch]);

  // Flatten: one row per (employee × completion)
  const flatRows = useMemo(() => {
    const empIds = new Set(filteredEmployees.map((e) => e.employee_id));
    return completions
      .filter((c) => empIds.has(c.employee_id))
      .filter((c) => statusFilter === "ALL" || c.status === statusFilter)
      .filter((c) => {
        if (yearFilter === "ALL") return true;
        const course = courseMap.get(c.course_id);
        return course ? String(course.year) === yearFilter : false;
      })
      .map((c) => {
        const emp = empMap.get(c.employee_id)!;
        const course = courseMap.get(c.course_id);
        return {
          employee: emp,
          course,
          status: c.status,
        };
      })
      .filter((r) => r.course);
  }, [completions, filteredEmployees, statusFilter, yearFilter, empMap, courseMap]);

  // Sort
  const sortedRows = useMemo(() => {
    const arr = [...flatRows];
    arr.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "name": av = a.employee.name; bv = b.employee.name; break;
        case "store": av = a.employee.store || ""; bv = b.employee.store || ""; break;
        case "position": av = a.employee.position || ""; bv = b.employee.position || ""; break;
        case "country": av = a.employee.country; bv = b.employee.country; break;
        case "start_date": av = a.employee.start_date || ""; bv = b.employee.start_date || ""; break;
        case "course_name": av = a.course!.course_name; bv = b.course!.course_name; break;
        case "year": av = a.course!.year; bv = b.course!.year; break;
        case "status": av = a.status; bv = b.status; break;
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [flatRows, sortKey, sortAsc]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = sortedRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(true); }
    setPage(0);
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    return sortAsc ? <ArrowUp className="inline h-3 w-3 ml-1" /> : <ArrowDown className="inline h-3 w-3 ml-1" />;
  };

  // Stats
  const stats = useMemo(() => {
    const total = employees.length;
    const byCountry: Record<string, number> = { KR: 0, JP: 0, HK: 0, US: 0 };
    for (const e of employees) byCountry[e.country]++;

    // Avg completion rate across all employees: completed / (assignedTotal where !not_assigned & !on_leave)
    let totalAssigned = 0; let totalCompleted = 0;
    const incompleteEmpIds = new Set<number>();
    for (const c of completions) {
      if (c.status === "not_assigned" || c.status === "on_leave") continue;
      totalAssigned++;
      if (c.status === "completed") totalCompleted++;
      if (c.status === "not_completed") incompleteEmpIds.add(c.employee_id);
    }
    const avgRate = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 1000) / 10 : 0;
    return { total, byCountry, avgRate, incompleteCount: incompleteEmpIds.size };
  }, [employees, completions]);

  // Selected employee completion summary
  const empSummary = useMemo(() => {
    if (!selectedEmp) return null;
    const rows = completions
      .filter((c) => c.employee_id === selectedEmp.employee_id)
      .map((c) => ({ ...c, course: courseMap.get(c.course_id) }))
      .filter((r) => r.course)
      .sort((a, b) => (b.course!.year - a.course!.year) || a.course!.course_name.localeCompare(b.course!.course_name));
    const assigned = rows.filter((r) => r.status !== "not_assigned" && r.status !== "on_leave");
    const completed = assigned.filter((r) => r.status === "completed").length;
    const rate = assigned.length > 0 ? Math.round((completed / assigned.length) * 1000) / 10 : 0;
    return { rows, assigned: assigned.length, completed, rate };
  }, [selectedEmp, completions, courseMap]);

  const exportExcel = () => {
    const data = sortedRows.map((r) => ({
      이름: r.employee.name,
      이메일: r.employee.email || "",
      매장: r.employee.store || "",
      직급: r.employee.position || "",
      국가: r.employee.country,
      입사일: r.employee.start_date || "",
      과정명: r.course!.course_name,
      연도: r.course!.year,
      수료상태: STATUS_META[r.status].label,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "학습이력");
    XLSX.writeFile(wb, `학습이력_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const loading = empLoading || cmpLoading;

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">이관 학습 이력</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            과거 학습 이력 데이터(직원·과정·수료 현황) 통합 검색 및 관리
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">전체 직원</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Globe2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">국가별 직원</p>
                <div className="flex gap-2 text-sm font-semibold flex-wrap">
                  {COUNTRIES.map((c) => (
                    <span key={c} className="whitespace-nowrap">
                      {c} <span className="text-muted-foreground font-normal">{stats.byCountry[c]}</span>
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">평균 수료율</p>
                <p className="text-2xl font-bold text-foreground">{stats.avgRate}%</p>
                <Progress value={stats.avgRate} className="h-1 mt-1" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">미수료자 (인원)</p>
                <p className="text-2xl font-bold text-foreground">{stats.incompleteCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Country tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={country === "ALL" ? "default" : "outline"}
            size="sm"
            onClick={() => { setCountry("ALL"); setStoreFilter("ALL"); setPage(0); }}
          >
            전체
          </Button>
          {COUNTRIES.map((c) => (
            <Button
              key={c}
              variant={country === c ? "default" : "outline"}
              size="sm"
              onClick={() => { setCountry(c); setStoreFilter("ALL"); setPage(0); }}
            >
              {c} <span className="ml-1.5 text-xs opacity-70">{stats.byCountry[c]}</span>
            </Button>
          ))}
        </div>

        {/* Filters bar */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
              <div className="lg:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="이름 또는 이메일 검색"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  className="pl-9"
                />
              </div>
              <Select value={storeFilter} onValueChange={(v) => { setStoreFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue placeholder="매장" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체 매장</SelectItem>
                  {stores.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={positionFilter} onValueChange={(v) => { setPositionFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue placeholder="직급" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체 직급</SelectItem>
                  {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={startYearFilter} onValueChange={(v) => { setStartYearFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue placeholder="입사연도" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">입사연도 전체</SelectItem>
                  {startYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue placeholder="과정 연도" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">과정 연도 전체</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="수료 상태" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체 상태</SelectItem>
                  {Object.entries(STATUS_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  총 <strong className="text-foreground">{sortedRows.length.toLocaleString()}</strong>건
                </span>
                <Button variant="outline" size="sm" onClick={exportExcel} className="gap-2">
                  <Download className="h-4 w-4" /> 엑셀 내보내기
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>이름<SortIcon k="name" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("store")}>매장<SortIcon k="store" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("position")}>직급<SortIcon k="position" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("country")}>국가<SortIcon k="country" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("start_date")}>입사일<SortIcon k="start_date" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("course_name")}>과정명<SortIcon k="course_name" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("year")}>연도<SortIcon k="year" /></TableHead>
                    <TableHead className="cursor-pointer text-center" onClick={() => toggleSort("status")}>수료상태<SortIcon k="status" /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">로딩 중...</TableCell></TableRow>
                  ) : pageRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">데이터가 없습니다</TableCell></TableRow>
                  ) : (
                    pageRows.map((r, i) => {
                      const meta = STATUS_META[r.status];
                      return (
                        <TableRow
                          key={`${r.employee.employee_id}-${r.course!.course_id}-${i}`}
                          className="cursor-pointer hover:bg-accent/40"
                          onClick={() => setSelectedEmp(r.employee)}
                        >
                          <TableCell className="font-medium">{r.employee.name}</TableCell>
                          <TableCell className="text-sm">{r.employee.store || "—"}</TableCell>
                          <TableCell className="text-sm">{r.employee.position || "—"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{r.employee.country}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{r.employee.start_date || "—"}</TableCell>
                          <TableCell className="text-sm max-w-[280px] truncate" title={r.course!.course_name}>{r.course!.course_name}</TableCell>
                          <TableCell className="text-sm">{r.course!.year}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-xs ${meta.cls}`}>{meta.label}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {sortedRows.length > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-border flex-wrap gap-2">
                <span className="text-xs text-muted-foreground">
                  {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, sortedRows.length)} / {sortedRows.length.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(0)}>처음</Button>
                  <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</Button>
                  <span className="text-sm px-3 whitespace-nowrap">
                    {currentPage + 1} / {totalPages}
                  </span>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>다음</Button>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>마지막</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Employee detail Sheet */}
        <Sheet open={!!selectedEmp} onOpenChange={(o) => !o && setSelectedEmp(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            {selectedEmp && empSummary && (
              <>
                <SheetHeader>
                  <SheetTitle>{selectedEmp.name}</SheetTitle>
                  <SheetDescription>{selectedEmp.email || "이메일 없음"}</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">국가</span><p className="font-medium">{selectedEmp.country}</p></div>
                    <div><span className="text-muted-foreground">매장</span><p className="font-medium">{selectedEmp.store || "—"}</p></div>
                    <div><span className="text-muted-foreground">직급</span><p className="font-medium">{selectedEmp.position || "—"}</p></div>
                    <div><span className="text-muted-foreground">입사일</span><p className="font-medium">{selectedEmp.start_date || "—"}</p></div>
                  </div>

                  <div className="rounded-lg border border-border p-4 bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">수료율</span>
                      <span className="text-lg font-bold">{empSummary.rate}%</span>
                    </div>
                    <Progress value={empSummary.rate} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-2">
                      {empSummary.completed} / {empSummary.assigned} 과정 수료 (미배정·휴직 제외)
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">학습 이력</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>과정명</TableHead>
                          <TableHead className="w-16">연도</TableHead>
                          <TableHead className="w-24 text-center">상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {empSummary.rows.map((r) => {
                          const meta = STATUS_META[r.status];
                          return (
                            <TableRow key={r.course_id}>
                              <TableCell className="text-sm">{r.course!.course_name}</TableCell>
                              <TableCell className="text-sm">{r.course!.year}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className={`text-xs ${meta.cls}`}>{meta.label}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}
