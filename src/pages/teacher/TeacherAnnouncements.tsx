import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useLeaderScope } from "@/hooks/useLeaderScope";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Megaphone, Plus, Pin, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import TargetingFields, { isTargetingValid, type TargetingValue } from "@/components/admin/TargetingFields";
import MultilingualTextFields, { EMPTY_MULTILINGUAL, isMultilingualValid, type MultilingualValue } from "@/components/admin/MultilingualTextFields";
import { saveContentTranslations, loadContentTranslations } from "@/lib/i18nContent";

const EMPTY_TARGET: TargetingValue = { countries: [], branchIds: [], courseIds: [] };

const TeacherAnnouncements = () => {
  const { t } = useTranslation();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ is_pinned: false, is_published: true });
  const [ml, setMl] = useState<MultilingualValue>(EMPTY_MULTILINGUAL);
  const [target, setTarget] = useState<TargetingValue>(EMPTY_TARGET);

  const { data: announcements } = useQuery({
    queryKey: ["teacher-announcements", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .eq("author_id", user!.id)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const targetPayload = {
        target_countries: target.countries,
        target_branch_ids: target.branchIds,
        target_course_ids: target.courseIds,
      };
      const basePayload = { title: ml.ko.title, content: ml.ko.content, ...form, ...targetPayload };
      let recordId = editId;
      if (editId) {
        const { error } = await supabase.from("announcements").update({ ...basePayload, updated_at: new Date().toISOString() }).eq("id", editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("announcements").insert({ ...basePayload, author_id: user!.id }).select("id").single();
        if (error) throw error;
        recordId = data!.id;
      }
      if (recordId) {
        await saveContentTranslations({ table: "announcement_i18n", fkColumn: "announcement_id", recordId, value: ml });
      }
    },
    onSuccess: () => {
      toast({ title: editId ? t("announcements.updated", "수정 완료") : t("announcements.created", "공지사항 등록 완료") });
      queryClient.invalidateQueries({ queryKey: ["teacher-announcements"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: Error) => toast({ title: t("common.error", "오류"), description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t("announcements.deleted", "삭제 완료") });
      queryClient.invalidateQueries({ queryKey: ["teacher-announcements"] });
      setDeleteId(null);
    },
  });

  const resetForm = () => {
    setForm({ is_pinned: false, is_published: true });
    setMl(EMPTY_MULTILINGUAL);
    setTarget(EMPTY_TARGET);
    setEditId(null);
  };

  const openEdit = async (ann: any) => {
    setEditId(ann.id);
    setForm({ is_pinned: ann.is_pinned, is_published: ann.is_published });
    const loaded = await loadContentTranslations({
      table: "announcement_i18n",
      fkColumn: "announcement_id",
      recordId: ann.id,
      fallbackTitle: ann.title,
      fallbackContent: ann.content,
    });
    setMl(loaded);
    setTarget({
      countries: ann.target_countries || [],
      branchIds: ann.target_branch_ids || [],
      courseIds: ann.target_course_ids || [],
    });
    setDialogOpen(true);
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
              <Megaphone className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              {t("announcements.management", "공지사항 관리")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("announcements.teacherDesc", "수강생에게 공지사항을 등록합니다.")}</p>
          </div>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />{t("announcements.create", "공지 등록")}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" />{t("announcements.myAnnouncements", "내 공지사항")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>{t("announcements.titleLabel", "제목")}</TableHead>
                  <TableHead>{t("announcements.status", "상태")}</TableHead>
                  <TableHead>{t("announcements.date", "등록일")}</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("common.noData")}</TableCell></TableRow>
                )}
                {announcements?.map((ann) => (
                  <TableRow key={ann.id}>
                    <TableCell>{ann.is_pinned && <Pin className="h-4 w-4 text-primary" />}</TableCell>
                    <TableCell className="font-medium">{ann.title}</TableCell>
                    <TableCell>
                      <Badge variant={ann.is_published ? "default" : "secondary"}>
                        {ann.is_published ? t("announcements.published", "게시중") : t("announcements.draft", "비공개")}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(ann.created_at), "yyyy-MM-dd")}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(ann)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteId(ann.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? t("announcements.edit", "공지 수정") : t("announcements.create", "공지 등록")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <MultilingualTextFields value={ml} onChange={setMl} />
            <TargetingFields value={target} onChange={setTarget} compact />
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_pinned} onCheckedChange={(v) => setForm((f) => ({ ...f, is_pinned: v }))} />
                <Label>{t("announcements.pinned", "상단 고정")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_published} onCheckedChange={(v) => setForm((f) => ({ ...f, is_published: v }))} />
                <Label>{t("announcements.publish", "게시")}</Label>
              </div>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={!isMultilingualValid(ml) || !isTargetingValid(target) || saveMutation.isPending} className="w-full">
              {saveMutation.isPending ? t("common.processing") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("announcements.deleteConfirm", "공지사항을 삭제하시겠습니까?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("announcements.deleteDesc", "삭제된 공지사항은 복구할 수 없습니다.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default TeacherAnnouncements;
