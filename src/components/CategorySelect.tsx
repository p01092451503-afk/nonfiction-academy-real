import { useState } from "react";
import { Plus, Pencil, Trash2, Settings2, Check, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CategorySelectProps {
  value: string;
  onValueChange: (v: string) => void;
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

type MlNames = {
  name: string;
  name_en: string;
  name_ja: string;
  name_yue: string;
  name_zh_cn: string;
};

const emptyMl: MlNames = { name: "", name_en: "", name_ja: "", name_yue: "", name_zh_cn: "" };

const CategorySelect = ({ value, onValueChange }: CategorySelectProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newNames, setNewNames] = useState<MlNames>(emptyMl);
  const [manageOpen, setManageOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNames, setEditingNames] = useState<MlNames>(emptyMl);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "select-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, name_en, name_ja, name_yue, name_zh_cn, slug")
        .eq("is_active", true)
        .order("display_order");
      return data || [];
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const invalidateCategoryCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["categories", "select-active"] });
    queryClient.invalidateQueries({ queryKey: ["categories", "admin-all"] });
  };

  const createMutation = useMutation({
    mutationFn: async (names: MlNames) => {
      const { data, error } = await supabase
        .from("categories")
        .insert({
          name: names.name,
          name_en: names.name_en || null,
          name_ja: names.name_ja || null,
          name_yue: names.name_yue || null,
          name_zh_cn: names.name_zh_cn || null,
          slug: slugify(names.name),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateCategoryCaches();
      onValueChange(data.id);
      setDialogOpen(false);
      setNewNames(emptyMl);
      toast({ title: "카테고리가 추가되었습니다." });
    },
    onError: () => {
      toast({ title: "카테고리 추가 실패", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, names }: { id: string; names: MlNames }) => {
      const { error } = await supabase
        .from("categories")
        .update({
          name: names.name,
          name_en: names.name_en || null,
          name_ja: names.name_ja || null,
          name_yue: names.name_yue || null,
          name_zh_cn: names.name_zh_cn || null,
          slug: slugify(names.name),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCategoryCaches();
      setEditingId(null);
      setEditingNames(emptyMl);
      toast({ title: "카테고리가 수정되었습니다." });
    },
    onError: () => {
      toast({ title: "카테고리 수정 실패", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { count, error: cntErr } = await supabase
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id);
      if (cntErr) throw cntErr;
      if ((count ?? 0) > 0) {
        throw new Error(`이 카테고리를 사용 중인 강의가 ${count}개 있어 삭제할 수 없습니다.`);
      }
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      invalidateCategoryCaches();
      if (value === id) onValueChange("");
      setDeleteId(null);
      toast({ title: "카테고리가 삭제되었습니다." });
    },
    onError: (e: any) => {
      setDeleteId(null);
      toast({ title: "카테고리 삭제 실패", description: e?.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newNames.name.trim()) return;
    createMutation.mutate({
      name: newNames.name.trim(),
      name_en: newNames.name_en.trim(),
      name_ja: newNames.name_ja.trim(),
      name_yue: newNames.name_yue.trim(),
      name_zh_cn: newNames.name_zh_cn.trim(),
    });
  };

  const startEdit = (cat: any) => {
    setEditingId(cat.id);
    setEditingNames({
      name: cat.name || "",
      name_en: cat.name_en || "",
      name_ja: cat.name_ja || "",
      name_yue: cat.name_yue || "",
      name_zh_cn: cat.name_zh_cn || "",
    });
  };

  const saveEdit = () => {
    if (!editingId || !editingNames.name.trim()) return;
    updateMutation.mutate({
      id: editingId,
      names: {
        name: editingNames.name.trim(),
        name_en: editingNames.name_en.trim(),
        name_ja: editingNames.name_ja.trim(),
        name_yue: editingNames.name_yue.trim(),
        name_zh_cn: editingNames.name_zh_cn.trim(),
      },
    });
  };

  const MlFields = ({
    values, onChange,
  }: {
    values: MlNames;
    onChange: (patch: Partial<MlNames>) => void;
  }) => (
    <div className="space-y-2">
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <Label className="text-xs text-muted-foreground">KO</Label>
        <Input value={values.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="한국어 (필수)" className="h-9" />
      </div>
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <Label className="text-xs text-muted-foreground">EN</Label>
        <Input value={values.name_en} onChange={(e) => onChange({ name_en: e.target.value })} placeholder="English" className="h-9" />
      </div>
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <Label className="text-xs text-muted-foreground">JA</Label>
        <Input value={values.name_ja} onChange={(e) => onChange({ name_ja: e.target.value })} placeholder="日本語" className="h-9" />
      </div>
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <Label className="text-xs text-muted-foreground">HK</Label>
        <Input value={values.name_yue} onChange={(e) => onChange({ name_yue: e.target.value })} placeholder="粵語" className="h-9" />
      </div>
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <Label className="text-xs text-muted-foreground">CN</Label>
        <Input value={values.name_zh_cn} onChange={(e) => onChange({ name_zh_cn: e.target.value })} placeholder="简体中文" className="h-9" />
      </div>
    </div>
  );

  return (
    <>
      <Select value={value} onValueChange={(v) => {
        if (v === "__add_new") { setDialogOpen(true); return; }
        if (v === "__manage") { setManageOpen(true); return; }
        onValueChange(v);
      }}>
        <SelectTrigger className="h-11 rounded-xl border-border">
          <SelectValue placeholder="선택" />
        </SelectTrigger>
        <SelectContent position="popper" className="z-[9999] max-h-60 overflow-y-auto">
          {categories.length === 0 ? (
            <SelectItem value="__empty" disabled>카테고리 없음</SelectItem>
          ) : (
            categories.map((cat: any) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))
          )}
          <div className="border-t border-border mt-1 pt-1">
            <SelectItem value="__add_new" className="text-primary font-medium">
              <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> 새 카테고리 추가</span>
            </SelectItem>
            <SelectItem value="__manage" className="font-medium">
              <span className="flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" /> 카테고리 관리</span>
            </SelectItem>
          </div>
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setNewNames(emptyMl); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 카테고리 추가</DialogTitle>
            <DialogDescription>언어별 이름을 직접 입력할 수 있습니다. 비워두면 한국어가 기본으로 사용됩니다.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <MlFields values={newNames} onChange={(p) => setNewNames((s) => ({ ...s, ...p }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleCreate} disabled={!newNames.name.trim() || createMutation.isPending}>
              {createMutation.isPending ? "추가 중..." : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageOpen} onOpenChange={(o) => { setManageOpen(o); if (!o) { setEditingId(null); setEditingNames(emptyMl); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>카테고리 관리</DialogTitle>
            <DialogDescription>카테고리 이름을 언어별로 직접 수정하거나 삭제할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
            {categories.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">카테고리가 없습니다.</p>
            ) : (
              categories.map((cat: any) => (
                <div key={cat.id} className="py-3">
                  {editingId === cat.id ? (
                    <div className="space-y-3">
                      <MlFields values={editingNames} onChange={(p) => setEditingNames((s) => ({ ...s, ...p }))} />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditingNames(emptyMl); }}>
                          <X className="h-4 w-4 mr-1" /> 취소
                        </Button>
                        <Button size="sm" onClick={saveEdit} disabled={!editingNames.name.trim() || updateMutation.isPending}>
                          <Check className="h-4 w-4 mr-1" /> 저장
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">{cat.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          EN: {cat.name_en || "—"} · JA: {cat.name_ja || "—"} · HK: {cat.name_yue || "—"} · CN: {cat.name_zh_cn || "—"}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(cat)} aria-label="수정">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(cat.id)} aria-label="삭제">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>카테고리를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              사용 중인 강의가 있으면 삭제되지 않습니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CategorySelect;
