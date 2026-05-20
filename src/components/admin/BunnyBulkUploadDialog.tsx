import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, X, Image as ImageIcon, Video as VideoIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";

type ItemStatus = "queued" | "uploading" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  kind: "image" | "video";
  status: ItemStatus;
  progress: number;
  url?: string;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const MAX_VIDEO_MB = 5120; // 5GB
const MAX_IMAGE_MB = 50;

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export default function BunnyBulkUploadDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const reset = () => { setItems([]); setUploading(false); };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: UploadItem[] = [];
    Array.from(files).forEach((f) => {
      const isImg = f.type.startsWith("image/");
      const isVid = f.type.startsWith("video/");
      if (!isImg && !isVid) return;
      const limit = isVid ? MAX_VIDEO_MB : MAX_IMAGE_MB;
      if (f.size > limit * 1024 * 1024) {
        toast({ title: `${f.name}: ${t("bunnyUpload.tooLarge", "파일이 너무 큽니다")} (${limit}MB)`, variant: "destructive" });
        return;
      }
      next.push({
        id: crypto.randomUUID(),
        file: f,
        kind: isImg ? "image" : "video",
        status: "queued",
        progress: 0,
      });
    });
    setItems((prev) => [...prev, ...next]);
  };

  const removeItem = (id: string) => {
    if (uploading) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const uploadImage = async (item: UploadItem) => {
    updateItem(item.id, { status: "uploading", progress: 10 });
    const fd = new FormData();
    fd.append("file", item.file);
    fd.append("folder", "images");
    const { data, error } = await supabase.functions.invoke("bunny-upload-image", { body: fd });
    if (error || !data?.url) throw new Error(error?.message || data?.error || "upload failed");
    updateItem(item.id, { progress: 90, url: data.url });
    // Save to video_assets as image record (provider=bunny, no duration)
    const { error: dbErr } = await supabase.from("video_assets").insert({
      title: item.file.name,
      video_url: data.url,
      video_provider: "bunny",
      file_size_mb: Math.round((item.file.size / (1024 * 1024)) * 100) / 100,
      thumbnail_url: data.url,
      uploaded_by: user!.id,
    });
    if (dbErr) throw dbErr;
    updateItem(item.id, { status: "done", progress: 100 });
  };

  const uploadVideo = (item: UploadItem) =>
    new Promise<void>(async (resolve, reject) => {
      try {
        updateItem(item.id, { status: "uploading", progress: 2 });
        const { data: token, error: tokenErr } = await supabase.functions.invoke("bunny-create-video", {
          body: { title: item.file.name },
        });
        if (tokenErr || !token?.uploadUrl) throw new Error(tokenErr?.message || token?.error || "token failed");

        const xhr = new XMLHttpRequest();
        xhr.open("PUT", token.uploadUrl, true);
        xhr.setRequestHeader("AccessKey", token.accessKey);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 95);
            updateItem(item.id, { progress: Math.max(2, pct) });
          }
        };
        xhr.onload = async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const cdn = token.cdnHostname as string | null;
            const playUrl = cdn
              ? `https://${cdn}/${token.videoId}/playlist.m3u8`
              : `https://iframe.mediadelivery.net/play/${token.libraryId}/${token.videoId}`;
            const thumb = cdn ? `https://${cdn}/${token.videoId}/thumbnail.jpg` : null;
            const { error: dbErr } = await supabase.from("video_assets").insert({
              title: item.file.name,
              video_url: playUrl,
              video_provider: "bunny",
              file_size_mb: Math.round((item.file.size / (1024 * 1024)) * 100) / 100,
              thumbnail_url: thumb,
              uploaded_by: user!.id,
            });
            if (dbErr) return reject(dbErr);
            updateItem(item.id, { status: "done", progress: 100, url: playUrl });
            resolve();
          } else {
            reject(new Error(`Bunny upload HTTP ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("network error"));
        xhr.send(item.file);
      } catch (e) {
        reject(e);
      }
    });

  const startUpload = async () => {
    if (!items.length) return;
    setUploading(true);
    let okCount = 0;
    let errCount = 0;
    for (const item of items) {
      if (item.status === "done") { okCount++; continue; }
      try {
        if (item.kind === "image") await uploadImage(item);
        else await uploadVideo(item);
        okCount++;
      } catch (e) {
        errCount++;
        updateItem(item.id, { status: "error", error: e instanceof Error ? e.message : "upload failed" });
      }
    }
    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ["video-assets"] });
    if (errCount === 0 && okCount > 0) {
      toast({
        title: t("bunnyUpload.completed", "업로드 완료"),
        description: t("bunnyUpload.completedDesc", "{{count}}개 파일이 업로드되었습니다.", { count: okCount }),
      });
      reset();
      onOpenChange(false);
    } else if (okCount > 0) {
      toast({
        title: t("bunnyUpload.partial", "일부 업로드 완료"),
        description: `${t("common.success", "성공")}: ${okCount} · ${t("common.error", "실패")}: ${errCount}`,
        variant: "destructive",
      });
    } else {
      toast({ title: t("bunnyUpload.failed", "업로드 실패"), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t("bunnyUpload.title", "다중 미디어 업로드 (Bunny CDN)")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (!uploading) addFiles(e.dataTransfer.files); }}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">
              {t("bunnyUpload.dropHere", "이미지/영상을 드래그하거나 클릭하여 선택")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("bunnyUpload.limits", "이미지 최대 50MB, 영상 최대 5GB")}
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {items.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 border-b-2 border-border/80 pb-2">
                  <div className="shrink-0 h-8 w-8 rounded bg-muted flex items-center justify-center">
                    {it.kind === "image" ? <ImageIcon className="h-4 w-4" /> : <VideoIcon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{it.file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(it.file.size)}</p>
                    {(it.status === "uploading" || it.status === "done") && (
                      <Progress value={it.progress} className="h-1 mt-1" />
                    )}
                    {it.status === "error" && (
                      <p className="text-xs text-destructive mt-1 truncate">{it.error}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {it.status === "done" ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                      : it.status === "error" ? <AlertCircle className="h-4 w-4 text-destructive" />
                      : it.status === "uploading" ? <Upload className="h-4 w-4 text-muted-foreground" />
                      : (
                        <Button variant="ghost" size="icon" onClick={() => removeItem(it.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={uploading}>{t("common.cancel", "취소")}</Button>
          </DialogClose>
          <Button onClick={startUpload} disabled={uploading || items.length === 0}>
            {uploading ? t("bunnyUpload.uploading", "업로드 중...") : t("bunnyUpload.start", "업로드 시작")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}