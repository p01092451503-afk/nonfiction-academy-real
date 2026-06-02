import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, Trash2, Video as VideoIcon, Loader2, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
  // Playback options (mango-board parity)
  overlay_autoplay?: boolean | null;
  overlay_loop?: boolean | null;
  overlay_muted?: boolean | null;
  overlay_show_controls?: boolean | null;
  overlay_volume?: number | null;        // 0~100
  overlay_playback_rate?: number | null; // 0.25~2
  overlay_start_sec?: number | null;
  overlay_end_sec?: number | null;
  overlay_delay_sec?: number | null;
  overlay_opacity?: number | null;       // 0~100
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
const fmtSec = (s: number) => {
  if (!isFinite(s)) return "0.0";
  return `${s.toFixed(1)}s`;
};

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

  // Playback options
  const [autoplay, setAutoplay] = useState(value.overlay_autoplay ?? true);
  const [loop, setLoop] = useState(value.overlay_loop ?? true);
  const [muted, setMuted] = useState(value.overlay_muted ?? true);
  const [showControls, setShowControls] = useState(value.overlay_show_controls ?? false);
  const [volume, setVolume] = useState(value.overlay_volume ?? 100);
  const [playbackRate, setPlaybackRate] = useState(value.overlay_playback_rate ?? 1.0);
  const [startSec, setStartSec] = useState<number | null>(value.overlay_start_sec ?? null);
  const [endSec, setEndSec] = useState<number | null>(value.overlay_end_sec ?? null);
  const [delaySec, setDelaySec] = useState(value.overlay_delay_sec ?? 0);
  const [opacity, setOpacity] = useState(value.overlay_opacity ?? 100);
  const [duration, setDuration] = useState<number | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
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
    setAutoplay(value.overlay_autoplay ?? true);
    setLoop(value.overlay_loop ?? true);
    setMuted(value.overlay_muted ?? true);
    setShowControls(value.overlay_show_controls ?? false);
    setVolume(value.overlay_volume ?? 100);
    setPlaybackRate(value.overlay_playback_rate ?? 1.0);
    setStartSec(value.overlay_start_sec ?? null);
    setEndSec(value.overlay_end_sec ?? null);
    setDelaySec(value.overlay_delay_sec ?? 0);
    setOpacity(value.overlay_opacity ?? 100);
    setDuration(null);
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
        if (w - dx >= minW) { x = newX; w = w - dx; }
        break;
      }
      case "s":
        h = Math.max(minH, Math.min(1 - y, h + dyRel));
        break;
      case "n": {
        const newY = clamp01(y + dyRel);
        const dy = newY - y;
        if (h - dy >= minH) { y = newY; h = h - dy; }
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
        if (h - dy >= minH) { y = newY; h = h - dy; }
        break;
      }
      case "sw": {
        const newX = clamp01(x + dxRel);
        const dx = newX - x;
        if (w - dx >= minW) { x = newX; w = w - dx; }
        h = Math.max(minH, Math.min(1 - y, h + dyRel));
        break;
      }
      case "nw": {
        const newX = clamp01(x + dxRel);
        const dx = newX - x;
        if (w - dx >= minW) { x = newX; w = w - dx; }
        const newY = clamp01(y + dyRel);
        const dy = newY - y;
        if (h - dy >= minH) { y = newY; h = h - dy; }
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

  const endDrag = () => { dragRef.current = null; };

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
      overlay_autoplay: autoplay,
      overlay_loop: loop,
      overlay_muted: muted,
      overlay_show_controls: showControls,
      overlay_volume: volume,
      overlay_playback_rate: playbackRate,
      overlay_start_sec: startSec,
      overlay_end_sec: endSec,
      overlay_delay_sec: delaySec,
      overlay_opacity: opacity,
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
      overlay_autoplay: null,
      overlay_loop: null,
      overlay_muted: null,
      overlay_show_controls: null,
      overlay_volume: null,
      overlay_playback_rate: null,
      overlay_start_sec: null,
      overlay_end_sec: null,
      overlay_delay_sec: null,
      overlay_opacity: null,
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

  const effectiveEnd = endSec ?? duration ?? 0;
  const effectiveStart = startSec ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("mediaOverlay.title", "동영상 오버레이 설정")}</DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-5">
          {/* LEFT: video + position */}
          <div className="space-y-4 min-w-0">
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
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {uploadProgress}%</>
                  ) : (
                    <><Upload className="h-3.5 w-3.5" /> {t("mediaOverlay.uploadVideo", "동영상 업로드")}</>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  {t("mediaOverlay.step2", "2. 동영상을 표시할 영역을 드래그로 지정하세요")}
                </Label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => handleSetPreset("center")}>중앙</Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => handleSetPreset("bottom")}>하단</Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => handleSetPreset("full")}>전체</Button>
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

                <div
                  className="absolute border-2 border-primary bg-primary/10 backdrop-blur-[1px] shadow-lg"
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.w * 100}%`,
                    height: `${rect.h * 100}%`,
                    cursor: "move",
                    opacity: opacity / 100,
                  }}
                  onPointerDown={(e) => beginDrag(e, "move")}
                >
                  <div className="absolute inset-0 flex items-center justify-center text-primary-foreground bg-primary/40 pointer-events-none">
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
                위치 X: {(rect.x * 100).toFixed(1)}% · Y: {(rect.y * 100).toFixed(1)}% · 너비: {(rect.w * 100).toFixed(1)}% · 높이: {(rect.h * 100).toFixed(1)}%
              </p>
            </div>

            {videoUrl && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("mediaOverlay.preview", "미리보기")} {duration != null && <span className="text-muted-foreground">({fmtSec(duration)})</span>}</Label>
                <video
                  ref={previewVideoRef}
                  key={videoUrl}
                  src={videoUrl}
                  controls
                  className="w-full rounded-md bg-black max-h-44"
                  onLoadedMetadata={(e) => {
                    const d = (e.currentTarget as HTMLVideoElement).duration;
                    if (isFinite(d)) setDuration(d);
                  }}
                />
              </div>
            )}
          </div>

          {/* RIGHT: playback options */}
          <div className="space-y-4 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Settings2 className="h-3.5 w-3.5" />
              {t("mediaOverlay.playbackOptions", "3. 재생 옵션")}
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>{t("mediaOverlay.autoplay", "자동 재생")}</span>
                <Switch checked={autoplay} onCheckedChange={setAutoplay} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>{t("mediaOverlay.loop", "반복 재생")}</span>
                <Switch checked={loop} onCheckedChange={setLoop} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>{t("mediaOverlay.muted", "음소거")}</span>
                <Switch checked={muted} onCheckedChange={setMuted} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>{t("mediaOverlay.showControls", "컨트롤 표시")}</span>
                <Switch checked={showControls} onCheckedChange={setShowControls} />
              </label>
            </div>

            {/* Trim range */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <Label className="text-xs">{t("mediaOverlay.playRange", "재생 구간")}</Label>
                <span className="text-muted-foreground tabular-nums">
                  {fmtSec(effectiveStart)} ~ {fmtSec(effectiveEnd)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">시작 (초)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={startSec ?? ""}
                    placeholder="0"
                    onChange={(e) => {
                      const v = e.target.value;
                      setStartSec(v === "" ? null : Math.max(0, parseFloat(v)));
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">종료 (초, 비우면 끝까지)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={endSec ?? ""}
                    placeholder={duration ? duration.toFixed(1) : "끝까지"}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEndSec(v === "" ? null : Math.max(0, parseFloat(v)));
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Playback rate */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <Label className="text-xs">{t("mediaOverlay.playbackRate", "재생 속도")}</Label>
                <span className="text-muted-foreground tabular-nums">{playbackRate.toFixed(2)}x</span>
              </div>
              <Slider
                min={0.25} max={2} step={0.05}
                value={[playbackRate]}
                onValueChange={(v) => setPlaybackRate(+v[0].toFixed(2))}
              />
            </div>

            {/* Volume */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <Label className="text-xs">{t("mediaOverlay.volume", "동영상 볼륨")}</Label>
                <span className="text-muted-foreground tabular-nums">{volume}</span>
              </div>
              <Slider
                min={0} max={100} step={1}
                value={[volume]}
                onValueChange={(v) => setVolume(Math.round(v[0]))}
                disabled={muted}
              />
              {muted && <p className="text-[10px] text-muted-foreground">음소거 상태에서는 볼륨이 적용되지 않습니다.</p>}
            </div>

            {/* Delay */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <Label className="text-xs">{t("mediaOverlay.delay", "재생 지연 시간")}</Label>
                <span className="text-muted-foreground tabular-nums">{delaySec.toFixed(1)}초 후 시작</span>
              </div>
              <Slider
                min={0} max={30} step={0.5}
                value={[delaySec]}
                onValueChange={(v) => setDelaySec(+v[0].toFixed(1))}
              />
            </div>

            {/* Opacity */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <Label className="text-xs">{t("mediaOverlay.opacity", "불투명도")}</Label>
                <span className="text-muted-foreground tabular-nums">{opacity}%</span>
              </div>
              <Slider
                min={0} max={100} step={1}
                value={[opacity]}
                onValueChange={(v) => setOpacity(Math.round(v[0]))}
              />
            </div>
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
