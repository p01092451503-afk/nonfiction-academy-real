import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Users, Search, Building2, Globe, Shield, User, BookOpen, ChevronDown } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";

type Mode = "individual" | "country" | "branch" | "role";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCourseId?: string;
  defaultUserIds?: string[];
}

const ROLE_OPTIONS = [
  { value: "student", label: "학습자" },
  { value: "teacher", label: "러닝 리더" },
  { value: "admin", label: "관리자" },
  { value: "super_admin", label: "최고 관리자" },
];

const BulkEnrollDialog = ({ open, onOpenChange, defaultCourseId, defaultUserIds }: Props) => {
  const { t } = useTranslation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [courseIds, setCourseIds] = useState<Set<string>>(
    new Set(defaultCourseId ? [defaultCourseId] : [])
  );
  const [courseSearch, setCourseSearch] = useState("");
  const [mode, setMode] = useState<Mode>("individual");
  const [search, setSearch] = useState("");
  const [excludeApproved, setExcludeApproved] = useState(true);

  // selections per mode
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(
    new Set(defaultUserIds || [])
  );
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());

  // Courses (published only)
  const { data: courses = [] } = useQuery({
    queryKey: ["bulk-enroll-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title")
        .eq("status", "published")
        .order("title");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Profiles (with department_id)
  const { data: profiles = [] } = useQuery({
    queryKey: ["bulk-enroll-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, department_id")
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Departments
  const { data: departments = [] } = useQuery({
    queryKey: ["bulk-enroll-depts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, country, parent_department_id")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // User roles
  const { data: userRoles = [] } = useQuery({
    queryKey: ["bulk-enroll-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Approved enrollments for ALL selected courses → Map<courseId, Set<userId>>
  const courseIdsKey = useMemo(() => Array.from(courseIds).sort().join(","), [courseIds]);
  const { data: approvedByCourse = new Map<string, Set<string>>() } = useQuery({
    queryKey: ["bulk-enroll-approved-multi", courseIdsKey],
    queryFn: async () => {
      const ids = Array.from(courseIds);
      const map = new Map<string, Set<string>>();
      if (ids.length === 0) return map;
      const { data, error } = await supabase
        .from("enrollments")
        .select("user_id, course_id")
        .in("course_id", ids)
        .eq("status", "approved");
      if (error) throw error;
      ids.forEach((id) => map.set(id, new Set()));
      (data || []).forEach((r: any) => {
        const s = map.get(r.course_id) || new Set<string>();
        s.add(r.user_id);
        map.set(r.course_id, s);
      });
      return map;
    },
    enabled: open && courseIds.size > 0,
  });

  // Union of approved across selected courses — used by individual list display
  const approvedUnion = useMemo(() => {
    const u = new Set<string>();
    approvedByCourse.forEach((s) => s.forEach((id) => u.add(id)));
    return u;
  }, [approvedByCourse]);

  // Maps
  const deptMap = useMemo(() => new Map(departments.map((d: any) => [d.id, d])), [departments]);
  const branches = useMemo(() => departments.filter((d: any) => !d.parent_department_id), [departments]);
  const countries = useMemo(() => {
    const set = new Set<string>();
    departments.forEach((d: any) => d.country && set.add(d.country));
    return Array.from(set).sort();
  }, [departments]);

  const rolesByUser = useMemo(() => {
    const m = new Map<string, Set<string>>();
    userRoles.forEach((r: any) => {
      if (!m.has(r.user_id)) m.set(r.user_id, new Set());
      m.get(r.user_id)!.add(r.role);
    });
    return m;
  }, [userRoles]);

  const branchScope = (branchId: string): Set<string> => {
    const set = new Set<string>([branchId]);
    departments.forEach((d: any) => {
      if (d.parent_department_id === branchId) set.add(d.id);
    });
    return set;
  };

  // Resolve target users based on current mode + selection
  const rawTargetUserIds = useMemo((): string[] => {
    if (mode === "individual") return Array.from(selectedUsers);

    const ids = new Set<string>();
    profiles.forEach((p: any) => {
      let match = false;
      if (mode === "country" && p.department_id) {
        const dept: any = deptMap.get(p.department_id);
        if (dept && selectedCountries.has(dept.country)) match = true;
      } else if (mode === "branch" && p.department_id) {
        for (const b of selectedBranches) {
          if (branchScope(b).has(p.department_id)) { match = true; break; }
        }
      } else if (mode === "role") {
        const rs = rolesByUser.get(p.user_id);
        if (rs) {
          for (const r of selectedRoles) {
            if (rs.has(r)) { match = true; break; }
          }
        }
      }
      if (match) ids.add(p.user_id);
    });
    return Array.from(ids);
  }, [mode, selectedUsers, selectedCountries, selectedBranches, selectedRoles, profiles, deptMap, rolesByUser, departments]);

  // Total (user × course) inserts after per-course exclusion
  const { totalInserts, excludedCount } = useMemo(() => {
    const ids = Array.from(courseIds);
    let inserts = 0;
    let excluded = 0;
    ids.forEach((cid) => {
      const approved = approvedByCourse.get(cid) || new Set<string>();
      rawTargetUserIds.forEach((uid) => {
        if (excludeApproved && approved.has(uid)) excluded += 1;
        else inserts += 1;
      });
    });
    return { totalInserts: inserts, excludedCount: excluded };
  }, [courseIds, rawTargetUserIds, approvedByCourse, excludeApproved]);

  // Search-filtered profiles for individual list
  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p: any) =>
      (p.full_name || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q)
    );
  }, [profiles, search]);

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c: any) => (c.title || "").toLowerCase().includes(q));
  }, [courses, courseSearch]);

  const reset = () => {
    setSelectedUsers(new Set());
    setSelectedCountries(new Set());
    setSelectedBranches(new Set());
    setSelectedRoles(new Set());
    setCourseIds(new Set());
    setSearch("");
    setCourseSearch("");
  };

  const bulkApprove = useMutation({
    mutationFn: async () => {
      if (courseIds.size === 0) throw new Error("강의를 1개 이상 선택하세요");
      if (rawTargetUserIds.length === 0) throw new Error("대상자가 없습니다");

      const now = new Date().toISOString();
      const allRows: any[] = [];
      for (const cid of courseIds) {
        const approved = approvedByCourse.get(cid) || new Set<string>();
        rawTargetUserIds.forEach((uid) => {
          if (excludeApproved && approved.has(uid)) return;
          allRows.push({
            user_id: uid,
            course_id: cid,
            status: "approved" as const,
            reviewed_by: user!.id,
            reviewed_at: now,
            enrolled_at: now,
          });
        });
      }

      if (allRows.length === 0) throw new Error("등록할 항목이 없습니다");

      const chunkSize = 500;
      for (let i = 0; i < allRows.length; i += chunkSize) {
        const chunk = allRows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("enrollments")
          .upsert(chunk, { onConflict: "user_id,course_id" });
        if (error) throw error;
      }
      return { rows: allRows.length, users: rawTargetUserIds.length, courses: courseIds.size };
    },
    onSuccess: ({ rows, users, courses }) => {
      toast({
        title: "일괄 수강 등록 완료",
        description: `${users}명을 ${courses}개 강의에 등록했습니다. (총 ${rows}건)`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["bulk-enroll-approved-multi"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: t("common.error", "오류"), description: e.message, variant: "destructive" });
    },
  });

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, value: string) => {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    setter(next);
  };

  const selectedCourseTitles = useMemo(() => {
    return courses
      .filter((c: any) => courseIds.has(c.id))
      .map((c: any) => c.title);
  }, [courses, courseIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" /> 일괄 수강 등록
          </DialogTitle>
          <DialogDescription>
            여러 강의를 선택하고 대상(개인 · 국가 · 조직 · 역할)을 지정하여 한 번에 일괄 등록합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Multi-course selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              강의 선택 (복수 선택 가능)
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between rounded-xl font-normal">
                  <span className="flex items-center gap-2 min-w-0">
                    <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    {courseIds.size === 0 ? (
                      <span className="text-muted-foreground">강의를 선택하세요</span>
                    ) : (
                      <span className="truncate">
                        {courseIds.size}개 선택됨
                        {selectedCourseTitles.length > 0 && (
                          <span className="text-muted-foreground"> · {selectedCourseTitles.slice(0, 2).join(", ")}{selectedCourseTitles.length > 2 ? " 외" : ""}</span>
                        )}
                      </span>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="강의 검색"
                      value={courseSearch}
                      onChange={(e) => setCourseSearch(e.target.value)}
                      className="pl-8 h-8 rounded-lg text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 px-1">
                    <button
                      type="button"
                      onClick={() => setCourseIds(new Set(filteredCourses.map((c: any) => c.id)))}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={() => setCourseIds(new Set())}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      선택 해제
                    </button>
                  </div>
                </div>
                <ScrollArea className="h-64">
                  <div className="p-2 space-y-0.5">
                    {filteredCourses.map((c: any) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={courseIds.has(c.id)}
                          onCheckedChange={() => toggle(courseIds, setCourseIds, c.id)}
                        />
                        <span className="text-sm truncate">{c.title}</span>
                      </label>
                    ))}
                    {filteredCourses.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">강의 없음</p>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>

          {/* Mode tabs */}
          <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setSearch(""); }}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="individual" className="gap-1.5"><User className="h-3.5 w-3.5" />개인</TabsTrigger>
              <TabsTrigger value="country" className="gap-1.5"><Globe className="h-3.5 w-3.5" />국가</TabsTrigger>
              <TabsTrigger value="branch" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />조직</TabsTrigger>
              <TabsTrigger value="role" className="gap-1.5"><Shield className="h-3.5 w-3.5" />역할</TabsTrigger>
            </TabsList>

            {/* Individual */}
            <TabsContent value="individual" className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="이름 또는 이메일 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 rounded-xl"
                />
              </div>
              {(() => {
                const selectableIds = filteredProfiles.map((p: any) => p.user_id);
                const allSelected = selectableIds.length > 0 && selectableIds.every((id: string) => selectedUsers.has(id));
                const someSelected = selectableIds.some((id: string) => selectedUsers.has(id));
                return (
                  <div className="flex items-center justify-between px-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={allSelected ? true : (someSelected ? "indeterminate" : false)}
                        onCheckedChange={(v) => {
                          const next = new Set(selectedUsers);
                          if (v) selectableIds.forEach((id: string) => next.add(id));
                          else selectableIds.forEach((id: string) => next.delete(id));
                          setSelectedUsers(next);
                        }}
                      />
                      <span className="text-xs text-muted-foreground">
                        전체 선택 ({selectableIds.length}명)
                      </span>
                    </label>
                    {selectedUsers.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedUsers(new Set())}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline"
                      >
                        선택 해제
                      </button>
                    )}
                  </div>
                );
              })()}
              <ScrollArea className="h-64 border rounded-xl">
                <div className="p-2 space-y-1">
                  {filteredProfiles.map((p: any) => {
                    const dept: any = p.department_id ? deptMap.get(p.department_id) : null;
                    const isApproved = approvedUnion.has(p.user_id);
                    return (
                      <label
                        key={p.user_id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-accent/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedUsers.has(p.user_id)}
                          onCheckedChange={() => toggle(selectedUsers, setSelectedUsers, p.user_id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate flex items-center gap-1.5">
                            {p.full_name || "(이름 없음)"}
                            {isApproved && courseIds.size > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-green-600 border-green-300 bg-green-50">
                                일부 강의 승인됨
                              </Badge>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {p.email} {dept ? `· ${dept.name}` : ""}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                  {filteredProfiles.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">검색 결과 없음</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Country */}
            <TabsContent value="country" className="space-y-2">
              <SelectAllRow
                total={countries.length}
                selectedCount={selectedCountries.size}
                onToggleAll={(checked) => setSelectedCountries(checked ? new Set(countries) : new Set())}
              />
              <ScrollArea className="h-64 border rounded-xl">
                <div className="p-2 space-y-1">
                  {countries.map((c) => (
                    <label key={c} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/40 cursor-pointer">
                      <Checkbox
                        checked={selectedCountries.has(c)}
                        onCheckedChange={() => toggle(selectedCountries, setSelectedCountries, c)}
                      />
                      <span className="text-sm">{c}</span>
                    </label>
                  ))}
                  {countries.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">등록된 국가 없음</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Branch */}
            <TabsContent value="branch" className="space-y-2">
              <p className="text-[11px] text-muted-foreground">지점을 선택하면 하위 팀의 인원까지 모두 포함됩니다.</p>
              <SelectAllRow
                total={branches.length}
                selectedCount={selectedBranches.size}
                onToggleAll={(checked) =>
                  setSelectedBranches(checked ? new Set(branches.map((b: any) => b.id)) : new Set())
                }
              />
              <ScrollArea className="h-64 border rounded-xl">
                <div className="p-2 space-y-1">
                  {branches.map((b: any) => (
                    <label key={b.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/40 cursor-pointer">
                      <Checkbox
                        checked={selectedBranches.has(b.id)}
                        onCheckedChange={() => toggle(selectedBranches, setSelectedBranches, b.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{b.name}</p>
                        <p className="text-[11px] text-muted-foreground">{b.country || ""}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Role */}
            <TabsContent value="role" className="space-y-2">
              <SelectAllRow
                total={ROLE_OPTIONS.length}
                selectedCount={selectedRoles.size}
                onToggleAll={(checked) =>
                  setSelectedRoles(checked ? new Set(ROLE_OPTIONS.map((r) => r.value)) : new Set())
                }
              />
              <ScrollArea className="h-64 border rounded-xl">
                <div className="p-2 space-y-1">
                  {ROLE_OPTIONS.map((r) => (
                    <label key={r.value} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/40 cursor-pointer">
                      <Checkbox
                        checked={selectedRoles.has(r.value)}
                        onCheckedChange={() => toggle(selectedRoles, setSelectedRoles, r.value)}
                      />
                      <span className="text-sm">{r.label}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Exclude approved toggle */}
          <label className="flex items-center gap-2 px-1 cursor-pointer select-none">
            <Checkbox
              checked={excludeApproved}
              onCheckedChange={(v) => setExcludeApproved(!!v)}
            />
            <span className="text-xs text-foreground">이미 승인된 (사용자×강의) 조합 제외</span>
          </label>

          {/* Preview */}
          <div className="flex items-center justify-between p-3 bg-accent/40 rounded-xl">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {rawTargetUserIds.length}명 × {courseIds.size}개 강의
              </span>
              {excludedCount > 0 && (
                <span className="text-[11px] text-muted-foreground">(중복 제외 {excludedCount}건)</span>
              )}
            </div>
            <Badge variant="secondary" className="text-sm font-semibold">총 {totalInserts}건</Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">취소</Button>
          <Button
            onClick={() => bulkApprove.mutate()}
            disabled={courseIds.size === 0 || totalInserts === 0 || bulkApprove.isPending}
            className="rounded-xl gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            {bulkApprove.isPending ? "처리 중..." : `${totalInserts}건 일괄 등록`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SelectAllRow = ({
  total,
  selectedCount,
  onToggleAll,
}: {
  total: number;
  selectedCount: number;
  onToggleAll: (checked: boolean) => void;
}) => {
  if (total === 0) return null;
  const allSelected = selectedCount === total;
  const someSelected = selectedCount > 0 && !allSelected;
  return (
    <label className="flex items-center gap-2 px-1 cursor-pointer select-none">
      <Checkbox
        checked={allSelected ? true : someSelected ? "indeterminate" : false}
        onCheckedChange={(v) => onToggleAll(!!v)}
      />
      <span className="text-xs text-muted-foreground">전체 선택 ({total})</span>
    </label>
  );
};

export default BulkEnrollDialog;
