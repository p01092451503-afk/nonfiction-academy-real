import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useLeaderScope } from "@/hooks/useLeaderScope";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Pin, Upload, X, FileText, Eye, ClipboardList } from "lucide-react";
import TargetingFields, { isTargetingValid, type TargetingValue } from "@/components/admin/TargetingFields";
import MultilingualTextFields, { EMPTY_MULTILINGUAL, isMultilingualValid, type MultilingualValue } from "@/components/admin/MultilingualTextFields";
import { saveContentTranslations, loadContentTranslations } from "@/lib/i18nContent";
import { Skeleton } from "@/components/ui/skeleton";

const EMPTY_FORM = { is_pinned: false, is_published: true, course_id: "" };
const EMPTY_TARGET: TargetingValue = { countries: [], branchIds: [], courseIds: [] };

const AdminBoard = ({ role = "admin" }: { role?: "admin" | "teacher" }) => {
  const { t } = useTranslation();
  const { user } = useUser();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [ml, setMl] = useState<MultilingualValue>(EMPTY_MULTILINGUAL);
  const [target, setTarget] = useState<TargetingValue>(EMPTY_TARGET);
  const [files, setFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [filterCourse, setFilterCourse] = useState("all");

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["board-posts", role],
    queryFn: async () => {
      const q = supabase.from("board_posts").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
      if (role === "teacher") q.eq("author_id", user?.id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-for-board"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, title").order("title");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      let fileUrls = [...existingFiles];
      if (files.length > 0) {
        for (const file of files) {
          const path = `${Date.now()}_${file.name}`;
          const { error: upErr } = await supabase.storage.from("board-files").upload(path, file);
          if (upErr) throw upErr;
          const { data: urlData } = supabase.storage.from("board-files").getPublicUrl(path);
          fileUrls.push(urlData.publicUrl);
        }
      }
      const payload = {
        title: ml.ko.title,
        content: ml.ko.content,
        is_pinned: form.is_pinned,
        is_published: form.is_published,
        course_id: form.course_id || null,
        file_urls: fileUrls,
        author_id: user!.id,
        target_countries: target.countries,
        target_branch_ids: target.branchIds,
        target_course_ids: target.courseIds,
      };
      let recordId = editingId;
      if (editingId) {
        const { error } = await supabase.from("board_posts").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("board_posts").insert(payload).select("id").single();
        if (error) throw error;
        recordId = data!.id;
      }
      if (recordId) {
        await saveContentTranslations({ table: "board_post_i18n", fkColumn: "post_id", recordId, value: ml });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board-posts"] });
      toast.success(editingId ? t("common.edit") : t("common.add"));
      closeDialog();
    },
    onError: () => toast.error(t("common.error")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("board_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board-posts"] });
      toast.success(t("common.delete"));
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMl(EMPTY_MULTILINGUAL);
    setTarget(EMPTY_TARGET);
    setFiles([]);
    setExistingFiles([]);
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setMl(EMPTY_MULTILINGUAL);
    setTarget(EMPTY_TARGET);
    setFiles([]);
    setExistingFiles([]);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = async (post: any) => {
    setForm({
      is_pinned: post.is_pinned,
      is_published: post.is_published,
      course_id: post.course_id || "",
    });
    const loaded = await loadContentTranslations({
      table: "board_post_i18n",
      fkColumn: "post_id",
      recordId: post.id,
      fallbackTitle: post.title,
      fallbackContent: post.content,
    });
    setMl(loaded);
    setTarget({
      countries: post.target_countries || [],
      branchIds: post.target_branch_ids || [],
      courseIds: post.target_course_ids || [],
    });
    setExistingFiles(post.file_urls || []);
    setFiles([]);
    setEditingId(post.id);
    setDialogOpen(true);
  };

  const filteredPosts = filterCourse === "all" ? posts : filterCourse === "general" ? posts.filter(p => !p.course_id) : posts.filter(p => p.course_id === filterCourse);

  const getFileName = (url: string) => {
    try {
      const parts = url.split("/");
      const name = parts[parts.length - 1];
      return name.replace(/^\d+_/, "");
    } catch { return url; }
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-6 w-6" />
              {t("board.title", "게시판 관리")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t("board.subtitle", "학생에게 자료를 배포하고 안내사항을 게시합니다.")}</p>
          </div>
          <Button onClick={openNew} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> {t("board.newPost", "새 게시글")}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Select value={filterCourse} onValueChange={setFilterCourse}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("board.allPosts", "전체 게시글")}</SelectItem>
              <SelectItem value="general">{t("board.generalBoard", "일반 게시판")}</SelectItem>
              {courses.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3" role="status" aria-live="polite">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : filteredPosts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("common.noData")}</p>
        ) : (
          <div className="space-y-3">
            {filteredPosts.map(post => (
              <Card key={post.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {post.is_pinned && <Pin className="h-3.5 w-3.5 text-primary shrink-0" />}
                        <span className="font-medium text-foreground">{post.title}</span>
                        {!post.is_published && <Badge variant="secondary" className="text-[10px]">{t("board.draft", "비공개")}</Badge>}
                        {(post.target_countries?.length || 0) > 0 && (
                          <Badge variant="outline" className="text-[10px]">🌐 {post.target_countries.join(", ")}</Badge>
                        )}
                        {(post.target_branch_ids?.length || 0) > 0 && (
                          <Badge variant="outline" className="text-[10px]">조직 {post.target_branch_ids.length}</Badge>
                        )}
                        {(post.target_course_ids?.length || 0) > 0 && (
                          <Badge variant="outline" className="text-[10px]">강의 {post.target_course_ids.length}</Badge>
                        )}
                        {(post.file_urls?.length || 0) > 0 && <Badge variant="outline" className="text-[10px] gap-0.5"><FileText className="h-2.5 w-2.5" />{post.file_urls.length}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.content}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                        <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{post.view_count}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(post)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(post.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); else setDialogOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{editingId ? t("board.editPost", "게시글 수정") : t("board.newPost", "새 게시글")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <MultilingualTextFields value={ml} onChange={setMl} contentRows={5} />
            <TargetingFields value={target} onChange={setTarget} compact />
            <div className="space-y-2">
              <Label className="text-xs">{t("board.attachments", "첨부파일")}</Label>
              {existingFiles.length > 0 && (
                <div className="space-y-1">
                  {existingFiles.map((url, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1.5">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate flex-1">{getFileName(url)}</span>
                      <button onClick={() => setExistingFiles(f => f.filter((_, j) => j !== i))} className="text-destructive hover:text-destructive/80"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              {files.length > 0 && (
                <div className="space-y-1">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-accent rounded px-2 py-1.5">
                      <Upload className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate flex-1">{file.name}</span>
                      <button onClick={() => setFiles(f => f.filter((_, j) => j !== i))} className="text-destructive hover:text-destructive/80"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.multiple = true;
                input.onchange = (e) => {
                  const selected = Array.from((e.target as HTMLInputElement).files || []);
                  setFiles(prev => [...prev, ...selected]);
                };
                input.click();
              }}>
                <Upload className="h-3 w-3" /> {t("board.addFile", "파일 추가")}
              </Button>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_published} onCheckedChange={v => setForm(f => ({ ...f, is_published: v }))} />
                <Label className="text-xs">{t("board.publish", "공개")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_pinned} onCheckedChange={v => setForm(f => ({ ...f, is_pinned: v }))} />
                <Label className="text-xs">{t("board.pinToTop", "상단 고정")}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeDialog}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!isMultilingualValid(ml) || !isTargetingValid(target) || saveMutation.isPending}>
              {saveMutation.isPending ? t("common.processing") : editingId ? t("common.edit") : t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminBoard;
