import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Database, Search, Download, Users, CheckCircle2, XCircle, Globe2, ArrowUpDown, ArrowUp, ArrowDown, UserPlus, Upload, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

const STATUS_KEYS = ["completed", "not_completed", "in_progress", "not_assigned", "on_leave"] as const;
type CompletionStatus = typeof STATUS_KEYS[number];

const POSITIONS = ["Staff", "Senior", "Manager", "Director", "Trainee"] as const;

// Simple CSV parser (handles quotes + commas)
const parseCSV = (text: string): Record<string, string>[] => {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
      } else if (c === "," && !inQ) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((ln) => {
    const cols = split(ln);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  });
};

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
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
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
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editStatusMap, setEditStatusMap] = useState<Record<number, CompletionStatus>>({});
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  // Add Employee form
  const [newEmp, setNewEmp] = useState({
    country: "KR" as Employee["country"],
    store: "",
    name: "",
    email: "",
    position: "Staff",
    start_date: "",
  });
  const [addSaving, setAddSaving] = useState(false);

  // CSV Upload state
  const empCsvRef = useRef<HTMLInputElement>(null);
  const cmpCsvRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<{ type: string; added: number; updated: number; errors: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);

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

  // Reset edit state on selection change
  useEffect(() => { setEditStatusMap({}); }, [selectedEmp?.employee_id]);

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["mig-employees"] });
    queryClient.invalidateQueries({ queryKey: ["mig-completions"] });
  };

  // === Add Employee ===
  const handleAddEmployee = async () => {
    if (!newEmp.name.trim() || !newEmp.email.trim() || !newEmp.country) {
      toast({ title: "필수 항목 누락", description: "이름·이메일·국가는 필수입니다.", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    try {
      const { data: maxRow, error: maxErr } = await supabase
        .from("migration_employees")
        .select("employee_id")
        .order("employee_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) throw maxErr;
      const nextId = (maxRow?.employee_id ?? 0) + 1;
      const { error } = await supabase.from("migration_employees").insert({
        employee_id: nextId,
        country: newEmp.country,
        store: newEmp.store || null,
        name: newEmp.name.trim(),
        email: newEmp.email.trim().toLowerCase(),
        position: newEmp.position || null,
        start_date: newEmp.start_date || null,
      });
      if (error) throw error;
      toast({ title: "직원 추가 완료", description: `#${nextId} ${newEmp.name}` });
      setAddOpen(false);
      setNewEmp({ country: "KR", store: "", name: "", email: "", position: "Staff", start_date: "" });
      refetchAll();
    } catch (err: any) {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
    } finally {
      setAddSaving(false);
    }
  };

  // === Save inline status edits ===
  const handleSaveStatusEdits = async () => {
    if (!selectedEmp || Object.keys(editStatusMap).length === 0) return;
    setSaving(true);
    try {
      const rows = Object.entries(editStatusMap).map(([course_id, status]) => ({
        employee_id: selectedEmp.employee_id,
        course_id: Number(course_id),
        status,
      }));
      const { error } = await supabase
        .from("migration_completions")
        .upsert(rows, { onConflict: "employee_id,course_id" });
      if (error) throw error;
      toast({ title: "저장 완료", description: `${rows.length}건 업데이트` });
      setEditStatusMap({});
      refetchAll();
    } catch (err: any) {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // === CSV Upload ===
  const handleEmployeesCsv = async (file: File) => {
    setUploading(true);
    setUploadResult(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) throw new Error("CSV에 데이터가 없습니다");

      // existing employee_ids → know add vs update
      const { data: existing } = await supabase.from("migration_employees").select("employee_id");
      const existingIds = new Set((existing || []).map((e: any) => e.employee_id));
      const { data: maxRow } = await supabase
        .from("migration_employees")
        .select("employee_id")
        .order("employee_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextId = (maxRow?.employee_id ?? 0) + 1;

      const errors: string[] = [];
      const payload: any[] = [];
      let added = 0, updated = 0;
      rows.forEach((r, idx) => {
        const name = r.name?.trim();
        const email = r.email?.trim().toLowerCase();
        const country = (r.country || "").toUpperCase();
        if (!name || !email || !["KR", "JP", "HK", "US"].includes(country)) {
          errors.push(`${idx + 2}행: 필수값 누락 (name/email/country)`);
          return;
        }
        let employee_id: number;
        if (r.employee_id && /^\d+$/.test(r.employee_id)) {
          employee_id = Number(r.employee_id);
          if (existingIds.has(employee_id)) updated++; else added++;
        } else {
          employee_id = nextId++;
          added++;
        }
        payload.push({
          employee_id,
          country,
          store: r.store || null,
          name,
          email,
          position: r.position || null,
          start_date: r.start_date || null,
        });
      });

      if (payload.length > 0) {
        const { error } = await supabase
          .from("migration_employees")
          .upsert(payload, { onConflict: "employee_id" });
        if (error) throw error;
      }
      setUploadResult({ type: "직원", added, updated, errors });
      refetchAll();
    } catch (err: any) {
      toast({ title: "업로드 실패", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleCompletionsCsv = async (file: File) => {
    setUploading(true);
    setUploadResult(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) throw new Error("CSV에 데이터가 없습니다");

      const { data: existing } = await supabase
        .from("migration_completions")
        .select("employee_id,course_id");
      const existingKeys = new Set((existing || []).map((e: any) => `${e.employee_id}-${e.course_id}`));

      const errors: string[] = [];
      const payload: any[] = [];
      let added = 0, updated = 0;
      rows.forEach((r, idx) => {
        const employee_id = Number(r.employee_id);
        const course_id = Number(r.course_id);
        const status = r.status as CompletionStatus;
        if (!employee_id || !course_id || !STATUS_KEYS.includes(status)) {
          errors.push(`${idx + 2}행: 잘못된 값 (employee_id/course_id/status)`);
          return;
        }
        const key = `${employee_id}-${course_id}`;
        if (existingKeys.has(key)) updated++; else added++;
        payload.push({ employee_id, course_id, status });
      });

      if (payload.length > 0) {
        const { error } = await supabase
          .from("migration_completions")
          .upsert(payload, { onConflict: "employee_id,course_id" });
        if (error) throw error;
      }
      setUploadResult({ type: "수료 이력", added, updated, errors });
      refetchAll();
    } catch (err: any) {
      toast({ title: "업로드 실패", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };


  const exportExcel = () => {
    const data = sortedRows.map((r) => ({
      이름: r.employee.name,
      이메일: r.employee.email || "",
      매장: r.employee.store || "",
      직급: r.employee.position || "",
      국가: r.employee.country,
      
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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-6 w-6 text-primary" aria-hidden="true" />
              <h1 className="text-xl sm:text-2xl font-semibold text-foreground">이관 학습 이력</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              과거 학습 이력 데이터(직원·과정·수료 현황) 통합 검색 및 관리
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
              <Upload className="h-4 w-4" /> CSV 업로드
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
              <UserPlus className="h-4 w-4" /> 직원 추가
            </Button>
          </div>
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
                    
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("course_name")}>과정명<SortIcon k="course_name" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("year")}>연도<SortIcon k="year" /></TableHead>
                    <TableHead className="cursor-pointer text-center" onClick={() => toggleSort("status")}>수료상태<SortIcon k="status" /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">로딩 중...</TableCell></TableRow>
                  ) : pageRows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">데이터가 없습니다</TableCell></TableRow>
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
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">학습 이력</h3>
                      <Button
                        size="sm"
                        onClick={handleSaveStatusEdits}
                        disabled={Object.keys(editStatusMap).length === 0 || saving}
                        className="gap-1.5"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? "저장 중..." : `저장 (${Object.keys(editStatusMap).length})`}
                      </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>과정명</TableHead>
                          <TableHead className="w-16">연도</TableHead>
                          <TableHead className="w-36 text-center">상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {empSummary.rows.map((r) => {
                          const currentStatus = editStatusMap[r.course_id] ?? r.status;
                          return (
                            <TableRow key={r.course_id}>
                              <TableCell className="text-sm">{r.course!.course_name}</TableCell>
                              <TableCell className="text-sm">{r.course!.year}</TableCell>
                              <TableCell className="text-center">
                                <Select
                                  value={currentStatus}
                                  onValueChange={(v) => {
                                    if (v === r.status) {
                                      const { [r.course_id]: _, ...rest } = editStatusMap;
                                      setEditStatusMap(rest);
                                    } else {
                                      setEditStatusMap({ ...editStatusMap, [r.course_id]: v as CompletionStatus });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_KEYS.map((k) => (
                                      <SelectItem key={k} value={k}>{STATUS_META[k].label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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

        {/* Add Employee Dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>직원 추가</DialogTitle>
              <DialogDescription>신규 직원 정보를 입력하세요. ID는 자동 생성됩니다.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">국가 *</Label>
                  <Select value={newEmp.country} onValueChange={(v) => setNewEmp({ ...newEmp, country: v as Employee["country"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">매장</Label>
                  <Input value={newEmp.store} onChange={(e) => setNewEmp({ ...newEmp, store: e.target.value })} placeholder="매장명" />
                </div>
              </div>
              <div>
                <Label className="text-xs">이름 *</Label>
                <Input value={newEmp.name} onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">이메일 *</Label>
                <Input type="email" value={newEmp.email} onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">직급</Label>
                  <Select value={newEmp.position} onValueChange={(v) => setNewEmp({ ...newEmp, position: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">입사일</Label>
                  <Input type="date" value={newEmp.start_date} onChange={(e) => setNewEmp({ ...newEmp, start_date: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addSaving}>취소</Button>
              <Button onClick={handleAddEmployee} disabled={addSaving}>{addSaving ? "추가 중..." : "추가"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CSV Upload Dialog */}
        <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) setUploadResult(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>CSV 일괄 업로드</DialogTitle>
              <DialogDescription>
                직원 또는 수료 이력 CSV를 업로드합니다. employee_id 기준 중복은 자동 갱신됩니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:bg-accent/30 transition"
                onClick={() => empCsvRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleEmployeesCsv(f); }}
              >
                <Users className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                <p className="text-sm font-medium">employees.csv</p>
                <p className="text-xs text-muted-foreground mt-1">
                  컬럼: employee_id(선택)·country·store·name·email·position·start_date
                </p>
                <input ref={empCsvRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEmployeesCsv(f); e.target.value = ""; }} />
              </div>

              <div
                className="border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:bg-accent/30 transition"
                onClick={() => cmpCsvRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleCompletionsCsv(f); }}
              >
                <CheckCircle2 className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                <p className="text-sm font-medium">completions.csv</p>
                <p className="text-xs text-muted-foreground mt-1">
                  컬럼: employee_id·course_id·status (completed/not_completed/in_progress/not_assigned/on_leave)
                </p>
                <input ref={cmpCsvRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCompletionsCsv(f); e.target.value = ""; }} />
              </div>

              {uploading && <p className="text-sm text-center text-muted-foreground">처리 중...</p>}

              {uploadResult && (
                <div className="rounded-lg border border-border p-3 bg-muted/30 text-sm space-y-1">
                  <p className="font-medium">{uploadResult.type} 업로드 결과</p>
                  <p>추가: <strong className="text-emerald-600">{uploadResult.added}건</strong> · 수정: <strong className="text-amber-600">{uploadResult.updated}건</strong> · 오류: <strong className="text-rose-600">{uploadResult.errors.length}건</strong></p>
                  {uploadResult.errors.length > 0 && (
                    <ul className="text-xs text-muted-foreground mt-2 max-h-24 overflow-y-auto list-disc pl-4">
                      {uploadResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                      {uploadResult.errors.length > 10 && <li>... 외 {uploadResult.errors.length - 10}건</li>}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
