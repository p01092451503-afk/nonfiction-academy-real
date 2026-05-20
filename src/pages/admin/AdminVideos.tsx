import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Video, Plus, Search, Trash2, Copy, Edit, ExternalLink, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";

const BunnyBulkUploadDialog = lazy(() => import("@/components/admin/BunnyBulkUploadDialog"));

interface VideoAsset {
  id: string;
  title: string;
  video_url: string;
  video_provider: string;
  duration_minutes: number | null;
  file_size_mb: number | null;
  description: string | null;
  thumbnail_url: string | null;
  uploaded_by: string;
  created_at: string;
}

const AdminVideos = () => {
  const { t } = useTranslation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const providerLabels: Record<string, string> = {
    custom: t("videoMgmt.providerCustom"),
    youtube: t("videoMgmt.providerYoutube"),
    vimeo: t("videoMgmt.providerVimeo"),
    upload: t("videoMgmt.providerUpload"),
    bunny: t("videoMgmt.providerBunny"),
    cloudflare: t("videoMgmt.providerCloudflare"),
    kollus: t("videoMgmt.providerKollus"),
  };

  const [form, setForm] = useState({
    title: "",
    video_url: "",
    video_provider: "custom",
    duration_minutes: "",
    file_size_mb: "",
    description: "",
    thumbnail_url: "",
  });

  const resetForm = () => {
    setForm({ title: "", video_url: "", video_provider: "custom", duration_minutes: "", file_size_mb: "", description: "", thumbnail_url: "" });
    setEditingId(null);
  };

  const { data: videos = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["video-assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_assets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VideoAsset[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        video_url: form.video_url,
        video_provider: form.video_provider,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        file_size_mb: form.file_size_mb ? parseFloat(form.file_size_mb) : null,
        description: form.description || null,
        thumbnail_url: form.thumbnail_url || null,
        uploaded_by: user!.id,
      };
      if (editingId) {
        const { error } = await supabase.from("video_assets").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("video_assets").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-assets"] });
      toast({ title: editingId ? t("videoMgmt.updated") : t("videoMgmt.saved") });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => toast({ title: t("videoMgmt.saveFailed"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("video_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-assets"] });
      toast({ title: t("videoMgmt.deleted") });
      setDeleteId(null);
    },
  });

  const copyUrl = async (url: string) => {
    if (!url) {
      toast({ title: t("videoMgmt.urlCopyFailed", "복사할 URL이 없습니다."), variant: "destructive" });
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand copy failed");
      }
      toast({ title: t("videoMgmt.urlCopied", "URL이 복사되었습니다."), description: url });
    } catch (err) {
      console.error("Copy failed:", err);
      toast({
        title: t("videoMgmt.urlCopyFailed", "URL 복사에 실패했습니다."),
        description: url,
        variant: "destructive",
      });
    }
  };

  const openEdit = (v: VideoAsset) => {
    setForm({
      title: v.title,
      video_url: v.video_url,
      video_provider: v.video_provider,
      duration_minutes: v.duration_minutes?.toString() || "",
      file_size_mb: v.file_size_mb?.toString() || "",
      description: v.description || "",
      thumbnail_url: v.thumbnail_url || "",
    });
    setEditingId(v.id);
    setDialogOpen(true);
  };

  const filtered = videos.filter((v) => {
    const matchSearch = v.title.toLowerCase().includes(search.toLowerCase()) || v.video_url.toLowerCase().includes(search.toLowerCase());
    const matchProvider = providerFilter === "all" || v.video_provider === providerFilter;
    return matchSearch && matchProvider;
  });

  const totalSizeMb = videos.reduce((sum, v) => sum + (v.file_size_mb || 0), 0);
  const totalDuration = videos.reduce((sum, v) => sum + (v.duration_minutes || 0), 0);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Video className="h-6 w-6" /> {t("videoMgmt.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("videoMgmt.subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> {t("bunnyUpload.button", "다중 업로드")}
            </Button>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> {t("videoMgmt.addVideo")}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t("videoMgmt.totalVideos")}</p>
            <p className="text-2xl font-bold">{videos.length}{t("common.count", "")}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t("videoMgmt.totalSize")}</p>
            <p className="text-2xl font-bold">{totalSizeMb >= 1024 ? `${(totalSizeMb / 1024).toFixed(1)}GB` : `${totalSizeMb.toFixed(0)}MB`}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t("videoMgmt.totalDuration")}</p>
            <p className="text-2xl font-bold">{Math.floor(totalDuration / 60)}{t("common.hours")} {totalDuration % 60}{t("common.minutes")}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("videoMgmt.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("common.filter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("videoMgmt.all")}</SelectItem>
              <SelectItem value="custom">{t("videoMgmt.providerCustom")}</SelectItem>
              <SelectItem value="upload">{t("videoMgmt.providerUpload")}</SelectItem>
              <SelectItem value="youtube">{t("videoMgmt.providerYoutube")}</SelectItem>
              <SelectItem value="vimeo">{t("videoMgmt.providerVimeo")}</SelectItem>
              <SelectItem value="bunny">{t("videoMgmt.providerBunny")}</SelectItem>
              <SelectItem value="cloudflare">{t("videoMgmt.providerCloudflare")}</SelectItem>
              <SelectItem value="kollus">{t("videoMgmt.providerKollus")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("videoMgmt.colTitle")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("videoMgmt.colProvider")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("videoMgmt.colDuration")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("videoMgmt.colSize")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("videoMgmt.colDate")}</TableHead>
                <TableHead className="text-right">{t("videoMgmt.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("common.loading")}</TableCell></TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <div className="space-y-3">
                      <p>{error instanceof Error ? error.message : t("videoMgmt.loadFailed", "동영상 목록을 불러오지 못했습니다.")}</p>
                      <Button variant="outline" size="sm" onClick={() => refetch()}>{t("common.retry", "다시 시도")}</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("videoMgmt.noVideos")}</TableCell></TableRow>
              ) : filtered.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {v.thumbnail_url ? (
                        <img
                          src={v.thumbnail_url}
                          alt=""
                          className="h-10 w-16 rounded object-cover bg-muted"
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.style.display = "none";
                            const fb = img.nextElementSibling as HTMLElement | null;
                            if (fb) fb.style.display = "flex";
                          }}
                        />
                      ) : null}
                      <div
                        className="h-10 w-16 rounded bg-muted flex items-center justify-center"
                        style={{ display: v.thumbnail_url ? "none" : "flex" }}
                      >
                        <Video className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium truncate">{v.title}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={(e) => { e.stopPropagation(); copyUrl(v.video_url); }}
                            title={t("videoMgmt.copyUrl", "URL 복사")}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{v.video_url}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="secondary">{providerLabels[v.video_provider] || v.video_provider}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{v.duration_minutes ? `${v.duration_minutes}${t("common.minutes")}` : "-"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{v.file_size_mb ? `${v.file_size_mb}MB` : "-"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{new Date(v.created_at).toLocaleDateString("ko")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => copyUrl(v.video_url)} title={t("videoMgmt.copyUrl")}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" asChild title={t("videoMgmt.open")}>
                        <a href={v.video_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(v)} title={t("common.edit")}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(v.id)} title={t("common.delete")}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("videoMgmt.editVideo") : t("videoMgmt.addVideo")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("videoMgmt.fieldTitle")}</label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("videoMgmt.fieldTitlePlaceholder")} />
            </div>
            <div>
              <label className="text-sm font-medium">{form.video_provider === "kollus" ? t("videoMgmt.fieldKollusKey") : t("videoMgmt.fieldUrl")}</label>
              <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder={form.video_provider === "kollus" ? t("videoMgmt.fieldKollusPlaceholder") : t("videoMgmt.fieldUrlPlaceholder")} />
              {form.video_provider === "kollus" && (
                <p className="text-xs text-muted-foreground mt-1">{t("videoMgmt.fieldKollusHint")}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("videoMgmt.fieldProvider")}</label>
                <Select value={form.video_provider} onValueChange={(v) => setForm({ ...form, video_provider: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">{t("videoMgmt.providerCustom")}</SelectItem>
                    <SelectItem value="upload">{t("videoMgmt.providerUpload")}</SelectItem>
                    <SelectItem value="youtube">{t("videoMgmt.providerYoutube")}</SelectItem>
                    <SelectItem value="vimeo">{t("videoMgmt.providerVimeo")}</SelectItem>
                    <SelectItem value="bunny">{t("videoMgmt.providerBunny")}</SelectItem>
                    <SelectItem value="cloudflare">{t("videoMgmt.providerCloudflare")}</SelectItem>
                    <SelectItem value="kollus">{t("videoMgmt.providerKollus")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("videoMgmt.fieldDuration")}</label>
                <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} placeholder="30" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("videoMgmt.fieldSize")}</label>
                <Input type="number" value={form.file_size_mb} onChange={(e) => setForm({ ...form, file_size_mb: e.target.value })} placeholder="200" />
              </div>
              <div>
                <label className="text-sm font-medium">{t("videoMgmt.fieldThumbnail")}</label>
                <Input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} placeholder="https://..." />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("videoMgmt.fieldDescription")}</label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("videoMgmt.fieldDescriptionPlaceholder")} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">{t("common.cancel")}</Button></DialogClose>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.title || !form.video_url || saveMutation.isPending}>
              {saveMutation.isPending ? t("videoMgmt.saving") : editingId ? t("videoMgmt.update") : t("videoMgmt.register")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("videoMgmt.deleteVideo")}</AlertDialogTitle>
            <AlertDialogDescription>{t("videoMgmt.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {bulkOpen && (
        <Suspense fallback={null}>
          <BunnyBulkUploadDialog open={bulkOpen} onOpenChange={setBulkOpen} />
        </Suspense>
      )}
    </DashboardLayout>
  );
};

export default AdminVideos;
