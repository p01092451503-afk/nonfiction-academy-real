import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Users, Search, Building2, Globe, Shield, User } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";

type Mode = "individual" | "country" | "branch" | "role";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCourseId?: string;
}

const ROLE_OPTIONS = [
  { value: "student", label: "학습자" },
  { value: "teacher", label: "러닝 리더" },
  { value: "admin", label: "관리자" },
  { value: "super_admin", label: "최고 관리자" },
];

const BulkEnrollDialog = ({ open, onOpenChange, defaultCourseId }: Props) => {
  const { t } = useTranslation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [courseId, setCourseId] = useState<string>(defaultCourseId || "");
  const [mode, setMode] = useState<Mode>("individual");
  const [search, setSearch] = useState("");
  const [excludeApproved, setExcludeApproved] = useState(true);

  // selections per mode
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
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

  // Already-approved user IDs for the selected course
  const { data: approvedUserIds = [] } = useQuery({
    queryKey: ["bulk-enroll-approved", courseId],
    queryFn: async () => {
      if (!courseId) return [] as string[];
      const { data, error } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", courseId)
        .eq("status", "approved");
      if (error) throw error;
      return (data || []).map((r: any) => r.user_id);
    },
    enabled: open && !!courseId,
  });
  const approvedSet = useMemo(() => new Set(approvedUserIds), [approvedUserIds]);

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

  // Branch children (branch + child teams)
  const branchScope = (branchId: string): Set<string> => {
    const set = new Set<string>([branchId]);
    departments.forEach((d: any) => {
      if (d.parent_department_id === branchId) set.add(d.id);
    });
    return set;
  };

  // Resolve target users based on current mode + selection (before exclusion)
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

  // After excluding already-approved users (if toggle on)
  const targetUserIds = useMemo(
    () => excludeApproved ? rawTargetUserIds.filter((id) => !approvedSet.has(id)) : rawTargetUserIds,
    [rawTargetUserIds, excludeApproved, approvedSet]
  );
  const excludedCount = rawTargetUserIds.length - targetUserIds.length;

  // Search-filtered profiles for individual list
  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p: any) =>
      (p.full_name || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q)
    );
  }, [profiles, search]);

  const reset = () => {
    setSelectedUsers(new Set());
    setSelectedCountries(new Set());
    setSelectedBranches(new Set());
    setSelectedRoles(new Set());
    setSearch("");
  };

  const bulkApprove = useMutation({
    mutationFn: async () => {
      if (!courseId) throw new Error("강의를 선택하세요");
      if (targetUserIds.length === 0) throw new Error("대상자가 없습니다");

      const now = new Date().toISOString();
      const rows = targetUserIds.map((uid) => ({
        user_id: uid,
        course_id: courseId,
        status: "approved" as const,
        reviewed_by: user!.id,
        reviewed_at: now,
        enrolled_at: now,
      }));

      // Chunk to avoid request size limits
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("enrollments")
          .upsert(chunk, { onConflict: "user_id,course_id" });
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (count) => {
      toast({ title: "일괄 수강 승인 완료", description: `${count}명이 승인되었습니다.` });
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" /> 일괄 수강 승인
          </DialogTitle>
          <DialogDescription>
            강의를 선택하고 대상(개인 · 국가 · 조직 · 역할)을 지정하여 한 번에 수강 승인합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Course selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">강의 선택</label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="강의를 선택하세요" /></SelectTrigger>
              <SelectContent>
                {courses.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                const selectableIds = filteredProfiles
                  .map((p: any) => p.user_id)
                  .filter((id: string) => !excludeApproved || !approvedSet.has(id));
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
                    const isApproved = approvedSet.has(p.user_id);
                    const disabled = excludeApproved && isApproved;
                    return (
                      <label
                        key={p.user_id}
                        className={`flex items-center gap-3 px-2 py-1.5 rounded-lg ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/40 cursor-pointer"}`}
                      >
                        <Checkbox
                          checked={selectedUsers.has(p.user_id)}
                          disabled={disabled}
                          onCheckedChange={() => !disabled && toggle(selectedUsers, setSelectedUsers, p.user_id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate flex items-center gap-1.5">
                            {p.full_name || "(이름 없음)"}
                            {isApproved && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-green-600 border-green-300 bg-green-50">승인됨</Badge>
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
            <span className="text-xs text-foreground">이미 승인된 사용자 제외</span>
            {courseId && excludeApproved && approvedUserIds.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                · 이 강의 기승인 {approvedUserIds.length}명
              </span>
            )}
          </label>

          {/* Preview */}
          <div className="flex items-center justify-between p-3 bg-accent/40 rounded-xl">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">대상 인원</span>
              {excludedCount > 0 && (
                <span className="text-[11px] text-muted-foreground">(제외 {excludedCount}명)</span>
              )}
            </div>
            <Badge variant="secondary" className="text-sm font-semibold">{targetUserIds.length}명</Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">취소</Button>
          <Button
            onClick={() => bulkApprove.mutate()}
            disabled={!courseId || targetUserIds.length === 0 || bulkApprove.isPending}
            className="rounded-xl gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            {bulkApprove.isPending ? "처리 중..." : `${targetUserIds.length}명 일괄 승인`}
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
