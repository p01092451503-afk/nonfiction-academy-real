import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Video as VideoIcon, ZoomIn, X, Plus, Minus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface MediaPackagePlayerProps {
  contentId: string;
  onComplete?: () => void;
}

interface PackageItem {
  id: string;
  item_type: "image" | "video";
  media_url: string;
  caption: string | null;
  order_index: number;
}

const isImageUrl = (url: string) =>
  /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(url);

const MediaPackagePlayer = ({ contentId, onComplete }: MediaPackagePlayerProps) => {
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [zoomCaption, setZoomCaption] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Inline pinch-zoom state for mobile (applies to currently visible slide)
  const [inlineScale, setInlineScale] = useState(1);
  const [inlinePan, setInlinePan] = useState({ x: 0, y: 0 });
  const [showPinchHint, setShowPinchHint] = useState(false);
  const pinchHintShownRef = useRef(false);
  const pinchHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inlinePinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const inlinePanStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const completedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["media-package-items", contentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("media_package_items")
        .select("*")
        .eq("content_id", contentId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data || []) as PackageItem[];
    },
    enabled: !!contentId,
  });

  useEffect(() => {
    setIndex(0);
    setVisited(new Set([0]));
    completedRef.current = false;
  }, [contentId]);

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    // Reset inline zoom when switching slides
    setInlineScale(1);
    setInlinePan({ x: 0, y: 0 });
  }, [index]);

  useEffect(() => {
    if (
      items.length > 0 &&
      visited.size >= items.length &&
      !completedRef.current
    ) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [visited, items.length, onComplete]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(items.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  if (isLoading) {
    return (
      <div className="aspect-video w-full">
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="aspect-video w-full flex items-center justify-center text-sm text-muted-foreground">
        등록된 미디어가 없습니다.
      </div>
    );
  }

  const isLast = index === items.length - 1;
  const isFirst = index === 0;
  const containerWidth = containerRef.current?.clientWidth || 1;

  const triggerPinchHint = () => {
    if (pinchHintShownRef.current) return;
    pinchHintShownRef.current = true;
    setShowPinchHint(true);
    if (pinchHintTimerRef.current) clearTimeout(pinchHintTimerRef.current);
    pinchHintTimerRef.current = setTimeout(() => setShowPinchHint(false), 1800);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      inlinePinchStart.current = { dist: Math.hypot(dx, dy), scale: inlineScale };
      triggerPinchHint();
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }
    if (inlineScale > 1) {
      // Pan start
      inlinePanStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        px: inlinePan.x,
        py: inlinePan.y,
      };
      return;
    }
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && inlinePinchStart.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const next = (inlinePinchStart.current.scale * dist) / inlinePinchStart.current.dist;
      setInlineScale(Math.min(5, Math.max(1, +next.toFixed(2))));
      return;
    }
    if (inlinePanStart.current) {
      setInlinePan({
        x: inlinePanStart.current.px + (e.touches[0].clientX - inlinePanStart.current.x),
        y: inlinePanStart.current.py + (e.touches[0].clientY - inlinePanStart.current.y),
      });
      return;
    }
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // Lock horizontal direction when clearly horizontal swipe
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragOffset(dx);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (inlinePinchStart.current && e.touches.length < 2) {
      inlinePinchStart.current = null;
      if (inlineScale <= 1.02) {
        setInlineScale(1);
        setInlinePan({ x: 0, y: 0 });
      }
      return;
    }
    if (inlinePanStart.current && e.touches.length === 0) {
      inlinePanStart.current = null;
      return;
    }
    const threshold = Math.min(80, containerWidth * 0.18);
    if (dragOffset < -threshold && !isLast) {
      setIndex((i) => i + 1);
    } else if (dragOffset > threshold && !isFirst) {
      setIndex((i) => i - 1);
    }
    setDragOffset(0);
    setIsDragging(false);
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const renderSlide = (item: PackageItem, key: string, slideIdx: number) => {
    const isImage = item.item_type === "image" || isImageUrl(item.media_url);
    const isCurrent = slideIdx === index;
    const transform = isCurrent && inlineScale > 1
      ? `translate(${inlinePan.x}px, ${inlinePan.y}px) scale(${inlineScale})`
      : undefined;
    return (
      <div key={key} className="w-full shrink-0 flex items-center justify-center relative overflow-hidden">
        {isImage ? (
          <>
            <img
              src={item.media_url}
              alt={item.caption || "슬라이드"}
              className="w-full h-auto max-h-[85vh] object-contain select-none pointer-events-none"
              style={transform ? { transform, transformOrigin: "center center", transition: inlinePinchStart.current || inlinePanStart.current ? "none" : "transform 0.15s ease-out" } : undefined}
              draggable={false}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoomUrl(item.media_url);
                setZoomCaption(item.caption);
                setScale(1);
                setPan({ x: 0, y: 0 });
              }}
              className="hidden sm:inline-flex absolute top-2 right-2 z-10 items-center gap-1 rounded-full bg-background/90 hover:bg-background border border-border px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm"
              aria-label="이미지 확대"
            >
              <ZoomIn className="h-3.5 w-3.5" />
              확대
            </button>
          </>
        ) : (
          <video
            src={item.media_url}
            controls
            className="w-full max-h-[85vh]"
            playsInline
          />
        )}
      </div>
    );
  };

  const current = items[index];
  const isImage = current.item_type === "image" || isImageUrl(current.media_url);
  const translatePct = -index * 100;
  const dragPct = (dragOffset / containerWidth) * 100;

  return (
    <div className="w-full">
      {/* Media display – horizontal slider */}
      <div
        ref={containerRef}
        className="relative bg-foreground/5 rounded-2xl overflow-hidden touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={`flex w-full ${isDragging ? "" : "transition-transform duration-300 ease-out"}`}
          style={{ transform: `translateX(calc(${translatePct}% + ${dragPct}%))` }}
        >
          {items.map((it, i) => renderSlide(it, it.id, i))}
        </div>
        {showPinchHint && (
          <div className="sm:hidden pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-foreground/80 text-background text-xs px-3 py-1.5 shadow-md animate-fade-in">
            두 손가락으로 확대/축소
          </div>
        )}
      </div>

      {/* Step dots – right below image */}
      {items.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${
                i === index
                  ? "w-6 bg-primary"
                  : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              }`}
              aria-label={`슬라이드 ${i + 1}로 이동`}
            />
          ))}
        </div>
      )}

      {/* Caption */}
      {current.caption && (
        <p className="mt-2 text-sm text-foreground/80 px-1 whitespace-pre-wrap">
          {current.caption}
        </p>
      )}

      {/* Zoom dialog */}
      <Dialog
        open={!!zoomUrl}
        onOpenChange={(open) => {
          if (!open) {
            setZoomUrl(null);
            setZoomCaption(null);
            setScale(1);
            setPan({ x: 0, y: 0 });
          }
        }}
      >
        <DialogContent className="max-w-[100vw] sm:max-w-[95vw] w-full h-[100dvh] sm:h-[95vh] p-0 bg-background border-0 sm:rounded-2xl overflow-hidden">
          <div className="relative w-full h-full flex flex-col">
            {/* Toolbar */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-background/95 border border-border shadow-sm px-1.5 py-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setScale((s) => Math.max(1, +(s - 0.5).toFixed(2)))}
                aria-label="축소"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium tabular-nums w-10 text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setScale((s) => Math.min(5, +(s + 0.5).toFixed(2)))}
                aria-label="확대"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => {
                  setScale(1);
                  setPan({ x: 0, y: 0 });
                }}
                aria-label="원래 크기"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setZoomUrl(null)}
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Image area */}
            <div
              className="flex-1 overflow-hidden flex items-center justify-center bg-foreground/5 select-none"
              onWheel={(e) => {
                e.preventDefault();
                const delta = -e.deltaY * 0.002;
                setScale((s) => Math.min(5, Math.max(1, +(s + delta).toFixed(2))));
              }}
              onDoubleClick={() => {
                setScale((s) => (s >= 2 ? 1 : 2));
                setPan({ x: 0, y: 0 });
              }}
              onMouseDown={(e) => {
                if (scale <= 1) return;
                panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
              }}
              onMouseMove={(e) => {
                if (!panStart.current) return;
                setPan({
                  x: panStart.current.px + (e.clientX - panStart.current.x),
                  y: panStart.current.py + (e.clientY - panStart.current.y),
                });
              }}
              onMouseUp={() => (panStart.current = null)}
              onMouseLeave={() => (panStart.current = null)}
              onTouchStart={(e) => {
                if (e.touches.length === 2) {
                  const dx = e.touches[0].clientX - e.touches[1].clientX;
                  const dy = e.touches[0].clientY - e.touches[1].clientY;
                  pinchStart.current = { dist: Math.hypot(dx, dy), scale };
                } else if (e.touches.length === 1 && scale > 1) {
                  panStart.current = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY,
                    px: pan.x,
                    py: pan.y,
                  };
                }
              }}
              onTouchMove={(e) => {
                if (e.touches.length === 2 && pinchStart.current) {
                  const dx = e.touches[0].clientX - e.touches[1].clientX;
                  const dy = e.touches[0].clientY - e.touches[1].clientY;
                  const dist = Math.hypot(dx, dy);
                  const next = (pinchStart.current.scale * dist) / pinchStart.current.dist;
                  setScale(Math.min(5, Math.max(1, +next.toFixed(2))));
                } else if (e.touches.length === 1 && panStart.current) {
                  setPan({
                    x: panStart.current.px + (e.touches[0].clientX - panStart.current.x),
                    y: panStart.current.py + (e.touches[0].clientY - panStart.current.y),
                  });
                }
              }}
              onTouchEnd={(e) => {
                if (e.touches.length === 0) {
                  panStart.current = null;
                  pinchStart.current = null;
                }
              }}
              style={{ cursor: scale > 1 ? (panStart.current ? "grabbing" : "grab") : "zoom-in" }}
            >
              {zoomUrl && (
                <img
                  src={zoomUrl}
                  alt={zoomCaption || "확대 이미지"}
                  className="max-w-full max-h-full object-contain pointer-events-none transition-transform"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: "center center",
                  }}
                  draggable={false}
                />
              )}
            </div>

            {zoomCaption && (
              <p className="px-4 py-3 text-sm text-foreground/80 border-t border-border bg-background whitespace-pre-wrap">
                {zoomCaption}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MediaPackagePlayer;