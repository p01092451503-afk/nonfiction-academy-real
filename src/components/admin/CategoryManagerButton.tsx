import { useState } from "react";
import { Plus, Pencil, Trash2, Settings2, Check, X, Tag } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/**
 * 관리자용 카테고리 관리 진입 버튼.
 * CategorySelect 안에 있는 관리 UI를 강의 목록 페이지에서도 바로 열 수 있도록 별도 제공.
 */
type MlNames = {
  name: string;
  name_en: string;
  name_ja: string;
  name_yue: string;
  name_zh_cn: string;
};

const emptyMl: MlNames = { name: "", name_en: "", name_ja: "", name_yue: "", name_zh_cn: "" };

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const MlFields = ({ values, onChange }: { values: MlNames; onChange: (p: Partial<MlNames>) => void }) => (
  <div className="space-y-2">
    <div className="grid grid-cols-[64px_1fr] items-center gap-2">
      <Label className="text-xs text-muted-foreground">KO</Label>
      <Input value={values.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="한국어" className="h-9" />
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

const CategoryManagerButton = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newNames, setNewNames] = useState<MlNames>(emptyMl);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNames, setEditingNames] = useState<MlNames>(emptyMl);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "admin-manage"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, name_en, name_ja, name_yue, name_zh_cn, slug, is_active")
        .order("display_order");
      return data || [];
    },
    enabled: open,
    staleTime: 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

  const createMutation = useMutation({
    mutationFn: async (names: MlNames) => {
      const { error } = await supabase.from("categories").insert({
        name: names.name,
        name_en: names.name_en || null,
        name_ja: names.name_ja || null,
        name_yue: names.name_yue || null,
        name_zh_cn: names.name_zh_cn || null,
        slug: slugify(names.name),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setNewNames(emptyMl);
      toast({ title: "카테고리가 추가되었습니다." });
    },
    onError: (e: any) => toast({ title: "추가 실패", description: e.message, variant: "destructive" }),
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
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setEditingNames(emptyMl);
      toast({ title: "저장되었습니다." });
    },
    onError: (e: any) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setDeleteId(null);
      toast({ title: "삭제되었습니다." });
    },
    onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

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

  return (
    <>
      <Button variant="outline" className="rounded-xl gap-2 flex-1 sm:flex-none" onClick={() => setOpen(true)}>
        <Tag className="h-4 w-4" /> 카테고리 관리
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> 카테고리 관리</DialogTitle>
            <DialogDescription>카테고리 이름을 언어별로 직접 수정하거나 삭제할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> 새 카테고리 추가
            </Button>
          </div>
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
                        <Button size="sm" onClick={() => updateMutation.mutate({ id: cat.id, names: editingNames })} disabled={!editingNames.name.trim() || updateMutation.isPending}>
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
            <Button variant="outline" onClick={() => setOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setNewNames(emptyMl); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 카테고리 추가</DialogTitle>
            <DialogDescription>언어별 이름을 입력할 수 있습니다. 비워두면 한국어가 기본으로 사용됩니다.</DialogDescription>
          </DialogHeader>
          <MlFields values={newNames} onChange={(p) => setNewNames((s) => ({ ...s, ...p }))} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>취소</Button>
            <Button onClick={() => createMutation.mutate(newNames)} disabled={!newNames.name.trim() || createMutation.isPending}>
              {createMutation.isPending ? "추가 중..." : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>카테고리를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>사용 중인 강의가 있으면 삭제되지 않습니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
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

export default CategoryManagerButton;
