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

const CategorySelect = ({ value, onValueChange }: CategorySelectProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "select-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, slug")
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
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("categories")
        .insert({ name, slug: slugify(name) })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onValueChange(data.id);
      setDialogOpen(false);
      setNewName("");
      toast({ title: "카테고리가 추가되었습니다." });
    },
    onError: () => {
      toast({ title: "카테고리 추가 실패", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("categories")
        .update({ name, slug: slugify(name) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setEditingId(null);
      setEditingName("");
      toast({ title: "카테고리가 수정되었습니다." });
    },
    onError: () => {
      toast({ title: "카테고리 수정 실패", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Check usage in courses
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
      queryClient.invalidateQueries({ queryKey: ["categories"] });
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
    const trimmed = newName.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const saveEdit = () => {
    const trimmed = editingName.trim();
    if (!trimmed || !editingId) return;
    updateMutation.mutate({ id: editingId, name: trimmed });
  };

  return (
    <>
      <Select value={value} onValueChange={(v) => {
        if (v === "__add_new") {
          setDialogOpen(true);
          return;
        }
        if (v === "__manage") {
          setManageOpen(true);
          return;
        }
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>새 카테고리 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="카테고리 이름"
              className="h-11 rounded-xl"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreate())}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending}>
              {createMutation.isPending ? "추가 중..." : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageOpen} onOpenChange={(o) => { setManageOpen(o); if (!o) { setEditingId(null); setEditingName(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>카테고리 관리</DialogTitle>
            <DialogDescription>카테고리 이름을 수정하거나 삭제할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-border">
            {categories.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">카테고리가 없습니다.</p>
            ) : (
              categories.map((cat: any) => (
                <div key={cat.id} className="flex items-center gap-2 py-2">
                  {editingId === cat.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-9 flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
                          if (e.key === "Escape") { setEditingId(null); setEditingName(""); }
                        }}
                      />
                      <Button size="sm" variant="ghost" onClick={saveEdit} disabled={!editingName.trim() || updateMutation.isPending} aria-label="저장">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditingName(""); }} aria-label="취소">
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-foreground">{cat.name}</span>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(cat.id, cat.name)} aria-label="수정">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(cat.id)} aria-label="삭제">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
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
