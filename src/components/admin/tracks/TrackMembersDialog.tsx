import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Users, Search, Trash2, Loader2, Building2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  trackId: string;
  trackTitle: string;
  onClose: () => void;
};

type EnrollmentRow = {
  id: string;
  user_id: string;
  status: string;
  assigned_at: string;
  completed_at: string | null;
  full_name: string | null;
  email: string | null;
  department_id: string | null;
  department_name: string | null;
};

const statusLabel: Record<string, { text: string; cls: string }> = {
  not_started: { text: "미시작", cls: "bg-secondary text-muted-foreground" },
  in_progress: { text: "진행중", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  completed: { text: "완료", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const TrackMembersDialog = ({ trackId, trackTitle, onClose }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["track-members", trackId],
    queryFn: async (): Promise<EnrollmentRow[]> => {
      const { data: enrolls, error } = await supabase
        .from("track_enrollments" as any)
        .select("id, user_id, status, assigned_at, completed_at")
        .eq("track_id", trackId)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      const list = (enrolls as any[]) || [];
      const userIds = list.map((r) => r.user_id);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, department_id")
        .in("user_id", userIds);

      const deptIds = Array.from(
        new Set((profiles || []).map((p: any) => p.department_id).filter(Boolean))
      );
      let deptMap = new Map<string, string>();
      if (deptIds.length > 0) {
        const { data: depts } = await supabase
          .from("departments")
          .select("id, name, team_name")
          .in("id", deptIds);
        (depts || []).forEach((d: any) => {
          deptMap.set(d.id, d.team_name ? `${d.name} · ${d.team_name}` : d.name);
        });
      }
      const profileMap = new Map<string, any>();
      (profiles || []).forEach((p: any) => profileMap.set(p.user_id, p));

      return list.map((r) => {
        const p = profileMap.get(r.user_id);
        return {
          id: r.id,
          user_id: r.user_id,
          status: r.status,
          assigned_at: r.assigned_at,
          completed_at: r.completed_at,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
          department_id: p?.department_id ?? null,
          department_name: p?.department_id ? deptMap.get(p.department_id) ?? null : null,
        };
      });
    },
  });

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.department_id && r.department_name) map.set(r.department_id, r.department_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (deptFilter !== "all" && r.department_id !== deptFilter) return false;
      if (!q) return true;
      return (
        (r.full_name || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.department_name || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter, deptFilter]);

  const removeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("track_enrollments" as any)
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      toast({
        title: t("track.removeSuccess", "배정 해제 완료"),
        description: `${ids.length}${t("track.removeCount", "명의 배정이 해제되었습니다")}`,
      });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["track-members", trackId] });
      qc.invalidateQueries({ queryKey: ["existing-track-enrollments", trackId] });
    },
    onError: (e: any) => {
      toast({ title: t("common.error", "오류"), description: e.message, variant: "destructive" });
    },
  });

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  const handleRemoveSelected = () => {
    if (selected.size === 0) return;
    if (!confirm(t("track.confirmRemove", `선택한 ${selected.size}명의 배정을 해제하시겠습니까?`))) return;
    removeMutation.mutate(Array.from(selected));
  };

  const handleRemoveOne = (id: string, name: string | null) => {
    if (!confirm(t("track.confirmRemoveOne", `${name || "이 학생"}의 배정을 해제하시겠습니까?`))) return;
    removeMutation.mutate([id]);
  };

  const fmtDate = (s: string) => {
    try { return new Date(s).toLocaleDateString(); } catch { return s; }
  };

  const counts = useMemo(() => {
    const c = { total: rows.length, not_started: 0, in_progress: 0, completed: 0 };
    rows.forEach((r) => {
      if (r.status === "completed") c.completed += 1;
      else if (r.status === "in_progress") c.in_progress += 1;
      else c.not_started += 1;
    });
    return c;
  }, [rows]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            {t("track.members", "배정 인원 관리")}
          </DialogTitle>
          <DialogDescription className="truncate">{trackTitle}</DialogDescription>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline" className="text-xs">
              {t("track.total", "전체")} {counts.total}
            </Badge>
            <Badge variant="outline" className="text-xs bg-secondary">
              {t("track.notStarted", "미시작")} {counts.not_started}
            </Badge>
            <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/30">
              {t("track.inProgress", "진행중")} {counts.in_progress}
            </Badge>
            <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/30">
              {t("track.completed", "완료")} {counts.completed}
            </Badge>
          </div>
        </DialogHeader>

        <div className="px-6 py-3 border-b space-y-2">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("track.searchMember", "이름, 이메일, 소속 검색")}
                className="pl-9 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("track.allStatus", "전체 상태")}</SelectItem>
                <SelectItem value="not_started">{t("track.notStarted", "미시작")}</SelectItem>
                <SelectItem value="in_progress">{t("track.inProgress", "진행중")}</SelectItem>
                <SelectItem value="completed">{t("track.completed", "완료")}</SelectItem>
              </SelectContent>
            </Select>
            {departments.length > 0 && (
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-44 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("track.allDept", "전체 소속")}</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {selected.size > 0 && (
            <div className="flex items-center justify-between bg-accent/40 border border-border rounded-md px-3 py-2">
              <span className="text-xs text-foreground">
                {selected.size}{t("track.selectedCount", "명 선택됨")}
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs gap-1"
                onClick={handleRemoveSelected}
                disabled={removeMutation.isPending}
              >
                <Trash2 className="h-3 w-3" />
                {t("track.removeSelected", "선택 해제")}
              </Button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {t("common.loading", "불러오는 중...")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {rows.length === 0
                ? t("track.noMembers", "아직 배정된 인원이 없습니다")
                : t("track.noMatch", "검색 결과가 없습니다")}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">
                <Checkbox
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onCheckedChange={toggleAll}
                />
                <div className="flex-1 min-w-0">{t("track.colMember", "회원")}</div>
                <div className="hidden md:block w-44 truncate">{t("track.colDept", "소속")}</div>
                <div className="w-20 text-center">{t("track.colStatus", "상태")}</div>
                <div className="hidden sm:block w-24 text-right">{t("track.colAssigned", "배정일")}</div>
                <div className="w-8" />
              </div>
              <ul className="divide-y divide-border">
                {filtered.map((r) => {
                  const st = statusLabel[r.status] || statusLabel.not_started;
                  const isSel = selected.has(r.id);
                  return (
                    <li
                      key={r.id}
                      className={`flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/30 ${isSel ? "bg-accent/30" : ""}`}
                    >
                      <Checkbox checked={isSel} onCheckedChange={() => toggleOne(r.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {r.full_name || t("track.unknownUser", "이름 없음")}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{r.email || "-"}</div>
                      </div>
                      <div className="hidden md:flex items-center gap-1 w-44 text-xs text-muted-foreground truncate">
                        {r.department_name ? (
                          <>
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{r.department_name}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground/60">-</span>
                        )}
                      </div>
                      <div className="w-20 text-center">
                        <Badge variant="secondary" className={`text-[10px] font-medium ${st.cls}`}>
                          {st.text}
                        </Badge>
                      </div>
                      <div className="hidden sm:block w-24 text-right text-[11px] text-muted-foreground">
                        {fmtDate(r.assigned_at)}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveOne(r.id, r.full_name)}
                        disabled={removeMutation.isPending}
                        aria-label={t("track.removeOne", "배정 해제")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t flex justify-end">
          <Button variant="outline" onClick={onClose} className="h-9">
            {t("common.close", "닫기")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TrackMembersDialog;
