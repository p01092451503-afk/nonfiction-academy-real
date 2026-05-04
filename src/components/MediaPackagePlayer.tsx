import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
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
  }, [contentId]);

  useEffect(() => {
    if (items.length > 0 && index === items.length - 1) {
      onComplete?.();
    }
  }, [index, items.length, onComplete]);

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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // Lock horizontal direction when clearly horizontal swipe
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragOffset(dx);
    }
  };

  const handleTouchEnd = () => {
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

  const renderSlide = (item: PackageItem, key: string) => {
    const isImage = item.item_type === "image" || isImageUrl(item.media_url);
    return (
      <div key={key} className="w-full shrink-0 aspect-video flex items-center justify-center">
        {isImage ? (
          <img
            src={item.media_url}
            alt={item.caption || "슬라이드"}
            className="w-full h-full object-contain select-none pointer-events-none"
            draggable={false}
          />
        ) : (
          <video
            src={item.media_url}
            controls
            className="w-full h-full"
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
          {items.map((it) => renderSlide(it, it.id))}
        </div>

        {/* Step badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-background/90 backdrop-blur px-2.5 py-1 text-[11px] font-medium border border-border pointer-events-none">
          {isImage ? <ImageIcon className="h-3 w-3" /> : <VideoIcon className="h-3 w-3" />}
          <span className="text-muted-foreground">
            {index + 1} / {items.length}
          </span>
        </div>
      </div>

      {/* Caption */}
      {current.caption && (
        <p className="mt-3 text-sm text-foreground/80 px-1 whitespace-pre-wrap">
          {current.caption}
        </p>
      )}

      {/* Controls */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          이전
        </Button>

        {/* Step dots */}
        <div className="flex items-center gap-1.5">
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

        <Button
          type="button"
          size="sm"
          onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
          disabled={isLast}
          className="gap-1.5"
        >
          다음
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default MediaPackagePlayer;