import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, Trash2, Video as VideoIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface OverlayVideoData {
  overlay_video_url?: string | null;
  overlay_video_provider?: string | null;
  overlay_thumbnail_url?: string | null;
  overlay_x?: number | null; // 0~1
  overlay_y?: number | null;
  overlay_w?: number | null;
  overlay_h?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  value: OverlayVideoData;
  onSave: (next: OverlayVideoData) => void;
}

type DragMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | null;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const MediaOverlayVideoDialog = ({ open, onOpenChange, imageUrl, value, onSave }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [videoUrl, setVideoUrl] = useState(value.overlay_video_url || "");
  const [videoProvider, setVideoProvider] = useState(value.overlay_video_provider || "custom");
  const [thumbnailUrl, setThumbnailUrl] = useState(value.overlay_thumbnail_url || "");
  const [rect, setRect] = useState({
    x: value.overlay_x ?? 0.1,
    y: value.overlay_y ?? 0.2,
    w: value.overlay_w ?? 0.6,
    h: value.overlay_h ?? 0.35,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startRect: { x: number; y: number; w: number; h: number };
    stageW: number;
    stageH: number;
  } | null>(null);

  // Reset when dialog opens
  useEffect(() => {
    if (!open) return;
    setVideoUrl(value.overlay_video_url || "");
    setVideoProvider(value.overlay_video_provider || "custom");
    setThumbnailUrl(value.overlay_thumbnail_url || "");
    setRect({
      x: value.overlay_x ?? 0.1,
      y: value.overlay_y ?? 0.2,
      w: value.overlay_w ?? 0.6,
      h: value.overlay_h ?? 0.35,
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadVideo = (file: File) =>
    new Promise<{ playUrl: string; thumbnailUrl: string | null }>(async (resolve, reject) => {
      try {
        const { data: token, error: tokenErr } = await supabase.functions.invoke("bunny-create-video", {
          body: { title: file.name },
        });
        if (tokenErr || !token?.uploadUrl) {
          throw new Error(tokenErr?.message || token?.error || "토큰 발급 실패");
        }
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", token.uploadUrl, true);
        xhr.setRequestHeader("AccessKey", token.accessKey);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.max(2, Math.round((e.loaded / e.total) * 95)));
          }
        };
        xhr.onload = async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const cdn = token.cdnHostname as string | null;
            const playUrl =
              token.playUrl || `https://iframe.mediadelivery.net/play/${token.libraryId}/${token.videoId}`;
            const thumb = token.thumbnailUrl || (cdn ? `https://${cdn}/${token.videoId}/thumbnail.jpg` : null);
            try {
              await supabase.from("video_assets").insert({
                title: file.name,
                video_url: playUrl,
                video_provider: "bunny",
                file_size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
                thumbnail_url: thumb,
              } as any);
            } catch {}
            resolve({ playUrl, thumbnailUrl: thumb });
          } else {
            reject(new Error(`Bunny upload HTTP ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("network error"));
        xhr.send(file);
      } catch (e) {
        reject(e);
      }
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast({ title: "동영상 파일만 업로드할 수 있습니다.", variant: "destructive" });
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const { playUrl, thumbnailUrl: thumb } = await uploadVideo(file);
      setVideoUrl(playUrl);
      setVideoProvider("bunny");
      setThumbnailUrl(thumb || "");
      toast({ title: "동영상 업로드 완료" });
    } catch (err: any) {
      toast({ title: "업로드 실패", description: err?.message || "", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const beginDrag = (e: React.PointerEvent, mode: DragMode) => {
    if (!stageRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const stageRect = stageRef.current.getBoundingClientRect();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...rect },
      stageW: stageRect.width,
      stageH: stageRect.height,
    };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !d.mode) return;
    const dxRel = (e.clientX - d.startX) / d.stageW;
    const dyRel = (e.clientY - d.startY) / d.stageH;
    let { x, y, w, h } = d.startRect;
    const minW = 0.05;
    const minH = 0.05;
    switch (d.mode) {
      case "move":
        x = clamp01(x + dxRel);
        y = clamp01(y + dyRel);
        x = Math.min(x, 1 - w);
        y = Math.min(y, 1 - h);
        break;
      case "e":
        w = Math.max(minW, Math.min(1 - x, w + dxRel));
        break;
      case "w": {
        const newX = clamp01(x + dxRel);
        const dx = newX - x;
        if (w - dx >= minW) {
          x = newX;
          w = w - dx;
        }
        break;
      }
      case "s":
        h = Math.max(minH, Math.min(1 - y, h + dyRel));
        break;
      case "n": {
        const newY = clamp01(y + dyRel);
        const dy = newY - y;
        if (h - dy >= minH) {
          y = newY;
          h = h - dy;
        }
        break;
      }
      case "se":
        w = Math.max(minW, Math.min(1 - x, w + dxRel));
        h = Math.max(minH, Math.min(1 - y, h + dyRel));
        break;
      case "ne": {
        w = Math.max(minW, Math.min(1 - x, w + dxRel));
        const newY = clamp01(y + dyRel);
        const dy = newY - y;
        if (h - dy >= minH) {
          y = newY;
          h = h - dy;
        }
        break;
      }
      case "sw": {
        const newX = clamp01(x + dxRel);
        const dx = newX - x;
        if (w - dx >= minW) {
          x = newX;
          w = w - dx;
        }
        h = Math.max(minH, Math.min(1 - y, h + dyRel));
        break;
      }
      case "nw": {
        const newX = clamp01(x + dxRel);
        const dx = newX - x;
        if (w - dx >= minW) {
          x = newX;
          w = w - dx;
        }
        const newY = clamp01(y + dyRel);
        const dy = newY - y;
        if (h - dy >= minH) {
          y = newY;
          h = h - dy;
        }
        break;
      }
    }
    setRect({
      x: +x.toFixed(4),
      y: +y.toFixed(4),
      w: +w.toFixed(4),
      h: +h.toFixed(4),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleSave = () => {
    if (!videoUrl) {
      toast({ title: "동영상을 먼저 추가하세요.", variant: "destructive" });
      return;
    }
    onSave({
      overlay_video_url: videoUrl,
      overlay_video_provider: videoProvider,
      overlay_thumbnail_url: thumbnailUrl || null,
      overlay_x: rect.x,
      overlay_y: rect.y,
      overlay_w: rect.w,
      overlay_h: rect.h,
    });
    onOpenChange(false);
  };

  const handleRemove = () => {
    onSave({
      overlay_video_url: null,
      overlay_video_provider: null,
      overlay_thumbnail_url: null,
      overlay_x: null,
      overlay_y: null,
      overlay_w: null,
      overlay_h: null,
    });
    onOpenChange(false);
  };

  const handleSetPreset = (preset: "full" | "center" | "bottom") => {
    if (preset === "full") setRect({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
    else if (preset === "center") setRect({ x: 0.15, y: 0.2, w: 0.7, h: 0.5 });
    else setRect({ x: 0.1, y: 0.55, w: 0.8, h: 0.35 });
  };

  const handles: { mode: Exclude<DragMode, null | "move">; className: string }[] = [
    { mode: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
    { mode: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize" },
    { mode: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
    { mode: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
    { mode: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
    { mode: "s", className: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize" },
    { mode: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
    { mode: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("mediaOverlay.title", "동영상 오버레이 설정")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: video */}
          <div className="space-y-2">
            <Label className="text-xs">{t("mediaOverlay.step1", "1. 오버레이할 동영상")}</Label>
            <div className="flex gap-2">
              <Input
                value={videoUrl}
                onChange={(e) => {
                  setVideoUrl(e.target.value);
                  setVideoProvider("custom");
                }}
                placeholder="https://.../video.mp4 또는 m3u8"
                className="text-xs font-mono h-8"
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 shrink-0"
                disabled={uploading}
                onClick={() => videoInputRef.current?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" /> {t("mediaOverlay.uploadVideo", "동영상 업로드")}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Step 2: position */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                {t("mediaOverlay.step2", "2. 동영상을 표시할 영역을 드래그로 지정하세요")}
              </Label>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => handleSetPreset("center")}>
                  중앙
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => handleSetPreset("bottom")}>
                  하단
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => handleSetPreset("full")}>
                  전체
                </Button>
              </div>
            </div>

            <div
              ref={stageRef}
              className="relative w-full select-none rounded-lg border border-border overflow-hidden bg-muted/30"
              style={{ touchAction: "none" }}
              onPointerMove={onMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {imageUrl ? (
                <img src={imageUrl} alt="template" className="w-full h-auto block pointer-events-none" draggable={false} />
              ) : (
                <div className="aspect-video flex items-center justify-center text-xs text-muted-foreground">
                  이미지가 없습니다
                </div>
              )}

              {/* Overlay rectangle */}
              <div
                className="absolute border-2 border-primary bg-primary/10 backdrop-blur-[1px] shadow-lg"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                  cursor: "move",
                }}
                onPointerDown={(e) => beginDrag(e, "move")}
              >
                <div className="absolute inset-0 flex items-center justify-center text-primary-foreground bg-primary/40 mix-blend-normal pointer-events-none">
                  <VideoIcon className="h-8 w-8 opacity-80" />
                </div>
                {handles.map((h) => (
                  <div
                    key={h.mode}
                    onPointerDown={(e) => beginDrag(e, h.mode)}
                    className={`absolute h-3 w-3 bg-background border-2 border-primary rounded-sm ${h.className}`}
                  />
                ))}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
              위치 X: {(rect.x * 100).toFixed(1)}% · Y: {(rect.y * 100).toFixed(1)}% · 너비:{" "}
              {(rect.w * 100).toFixed(1)}% · 높이: {(rect.h * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {value.overlay_video_url && (
            <Button type="button" variant="outline" onClick={handleRemove} className="gap-1.5 mr-auto text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> {t("common.remove", "제거")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "취소")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!videoUrl}>
            {t("common.save", "저장")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MediaOverlayVideoDialog;
