import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Video as VideoIcon, ZoomIn, X, Plus, Minus, RotateCcw, Play, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const STORAGE_KEY = (cid: string) => `mp-progress:${cid}`;
const VIDEO_COMPLETE_THRESHOLD = 0.95; // 95% 시청 시 완료 인정
type StoredProgress = { index: number; visited: number[] };

const loadProgress = (cid: string): StoredProgress | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(cid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.index !== "number" || !Array.isArray(parsed?.visited)) return null;
    return parsed as StoredProgress;
  } catch {
    return null;
  }
};


interface VideoTrackInfo {
  watched: number; // 실제 시청 누적 초 (최대치 기준, 되감기로 중복 카운트 안 함)
  duration: number;
  completed: boolean;
}

interface MediaPackagePlayerProps {
  contentId: string;
  onComplete?: () => void | boolean | Promise<void | boolean>;
  onPartialProgress?: (completedCount: number, totalCount: number) => void;
  /** 영상 슬라이드들의 실제 시청 초가 변할 때 호출 (디바운스됨). 학습시간 통계에 사용 */
  onWatchedSecondsTracked?: (totalSeconds: number) => void;
  /** 이 차시에 배분된 최소 학습시간(초). 슬라이드 수로 균등 배분되어 카드별 게이팅에 사용 */
  perContentMinSeconds?: number;
}

interface PackageItem {
  id: string;
  item_type: "image" | "video";
  media_url: string;
  caption: string | null;
  order_index: number;
  overlay_video_url?: string | null;
  overlay_video_provider?: string | null;
  overlay_thumbnail_url?: string | null;
  overlay_x?: number | null;
  overlay_y?: number | null;
  overlay_w?: number | null;
  overlay_h?: number | null;
  overlay_autoplay?: boolean | null;
  overlay_loop?: boolean | null;
  overlay_muted?: boolean | null;
  overlay_show_controls?: boolean | null;
  overlay_volume?: number | null;
  overlay_playback_rate?: number | null;
  overlay_start_sec?: number | null;
  overlay_end_sec?: number | null;
  overlay_delay_sec?: number | null;
  overlay_opacity?: number | null;
}

/**
 * Overlay video with mango-board parity playback options:
 * autoplay / loop / muted / controls / volume / playbackRate / trim (start–end) / delayed start / opacity.
 */
const OverlayVideo = ({
  item,
  isActive,
  onProgress,
}: {
  item: PackageItem;
  isActive: boolean;
  onProgress?: (itemId: string, watched: number, duration: number, completed: boolean) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWatchedRef = useRef<number>(0);
  const completedRef = useRef<boolean>(false);
  const seekGuardRef = useRef<boolean>(false);

  const autoplay = item.overlay_autoplay ?? true;
  const loop = item.overlay_loop ?? true;
  const muted = item.overlay_muted ?? false;
  const showControls = item.overlay_show_controls ?? true;
  const volume = (item.overlay_volume ?? 100) / 100;
  const rate = item.overlay_playback_rate ?? 1.0;
  const startSec = item.overlay_start_sec ?? 0;
  const endSec = item.overlay_end_sec ?? null;
  const delaySec = item.overlay_delay_sec ?? 0;
  const opacity = (item.overlay_opacity ?? 100) / 100;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.volume = Math.max(0, Math.min(1, volume));
    v.playbackRate = rate;
  }, [muted, volume, rate]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (!isActive) {
      try { v.pause(); } catch {}
      return;
    }
    const start = () => {
      try {
        if (startSec > 0 && Math.abs(v.currentTime - startSec) > 0.2) {
          v.currentTime = startSec;
        }
        if (autoplay) v.play().catch(() => {});
      } catch {}
    };
    if (delaySec > 0) {
      delayTimerRef.current = setTimeout(start, delaySec * 1000);
    } else {
      start();
    }
    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, [isActive, autoplay, delaySec, startSec]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    // 트림 처리
    if (endSec != null && v.currentTime >= endSec) {
      if (loop) {
        v.currentTime = startSec;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }
    // 앞으로 빨리감기 차단 (이미 완료된 영상은 자유)
    if (!completedRef.current && !seekGuardRef.current) {
      const cur = v.currentTime;
      if (cur > maxWatchedRef.current + 2) {
        seekGuardRef.current = true;
        try { v.currentTime = maxWatchedRef.current; } catch {}
        setTimeout(() => { seekGuardRef.current = false; }, 300);
        return;
      }
    }
    if (v.currentTime > maxWatchedRef.current) {
      maxWatchedRef.current = v.currentTime;
    }
    const dur = Math.max(0, (endSec ?? v.duration) - startSec);
    const watched = Math.max(0, Math.min(maxWatchedRef.current - startSec, dur));
    const completed = dur > 0 && watched / dur >= VIDEO_COMPLETE_THRESHOLD;
    if (completed) completedRef.current = true;
    onProgress?.(item.id, watched, dur, completedRef.current);
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    const dur = Math.max(0, (endSec ?? v.duration) - startSec);
    onProgress?.(item.id, 0, dur, false);
  };

  const url = item.overlay_video_url || "";
  const isIframeUrl = /(?:iframe|player)\.mediadelivery\.net\/(embed|play)\//i.test(url);
  const overlayStyle: React.CSSProperties = {
    left: `${(item.overlay_x ?? 0) * 100}%`,
    top: `${(item.overlay_y ?? 0) * 100}%`,
    width: `${(item.overlay_w ?? 0) * 100}%`,
    height: `${(item.overlay_h ?? 0) * 100}%`,
    opacity,
    pointerEvents: "auto",
  };

  if (isIframeUrl) {
    // iframe 임베드는 시청 이벤트를 받을 수 없어 잠금/시간추적 대상에서 제외됨
    const embedUrl = url
      .replace("iframe.mediadelivery.net/play/", "iframe.mediadelivery.net/embed/")
      .replace("player.mediadelivery.net/embed/", "iframe.mediadelivery.net/embed/");
    const params: string[] = [];
    if (autoplay) params.push("autoplay=true");
    if (muted) params.push("muted=true");
    if (loop) params.push("loop=true");
    const finalUrl = params.length
      ? `${embedUrl}${embedUrl.includes("?") ? "&" : "?"}${params.join("&")}`
      : embedUrl;
    return (
      <iframe
        src={isActive ? finalUrl : "about:blank"}
        className="absolute bg-black border-0"
        style={overlayStyle}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
      />
    );
  }

  return (
    <video
      ref={videoRef}
      src={url || undefined}
      poster={item.overlay_thumbnail_url || undefined}
      controls={showControls}
      controlsList="nodownload noplaybackrate noremoteplayback"
      disablePictureInPicture
      disableRemotePlayback
      playsInline
      preload="metadata"
      loop={loop && endSec == null}
      onTimeUpdate={handleTimeUpdate}
      onLoadedMetadata={handleLoadedMetadata}
      onEnded={() => {
        completedRef.current = true;
        const v = videoRef.current;
        const dur = v ? Math.max(0, (endSec ?? v.duration) - startSec) : 0;
        onProgress?.(item.id, dur, dur, true);
      }}
      className="absolute object-cover bg-black"
      style={overlayStyle}
    />
  );
};

/** 직접 video 슬라이드용: 시청 추적 + 앞으로감기 차단 */
const TrackedDirectVideo = ({
  item,
  onProgress,
}: {
  item: PackageItem;
  onProgress?: (itemId: string, watched: number, duration: number, completed: boolean) => void;
}) => {
  const ref = useRef<HTMLVideoElement>(null);
  const maxRef = useRef(0);
  const completedRef = useRef(false);
  const completionAttemptRef = useRef(false);
  const [completionRetryTick, setCompletionRetryTick] = useState(0);
  const seekGuardRef = useRef(false);

  const handleTimeUpdate = () => {
    const v = ref.current;
    if (!v) return;
    if (!completedRef.current && !seekGuardRef.current) {
      if (v.currentTime > maxRef.current + 2) {
        seekGuardRef.current = true;
        try { v.currentTime = maxRef.current; } catch {}
        setTimeout(() => { seekGuardRef.current = false; }, 300);
        return;
      }
    }
    if (v.currentTime > maxRef.current) maxRef.current = v.currentTime;
    const dur = v.duration || 0;
    const completed = dur > 0 && maxRef.current / dur >= VIDEO_COMPLETE_THRESHOLD;
    if (completed) completedRef.current = true;
    onProgress?.(item.id, Math.min(maxRef.current, dur), dur, completedRef.current);
  };

  return (
    <video
      ref={ref}
      src={item.media_url}
      controls
      controlsList="nodownload noplaybackrate noremoteplayback"
      disablePictureInPicture
      disableRemotePlayback
      className="w-full max-h-[85vh]"
      playsInline
      preload="metadata"
      onTimeUpdate={handleTimeUpdate}
      onLoadedMetadata={() => {
        const v = ref.current;
        if (v) onProgress?.(item.id, 0, v.duration || 0, false);
      }}
      onEnded={() => {
        const v = ref.current;
        const dur = v?.duration || 0;
        completedRef.current = true;
        onProgress?.(item.id, dur, dur, true);
      }}
    />
  );
};

const isImageUrl = (url: string) =>
  /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(url);

const MediaPackagePlayer = ({ contentId, onComplete, onPartialProgress, onWatchedSecondsTracked, perContentMinSeconds = 0 }: MediaPackagePlayerProps) => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [resumeIndex, setResumeIndex] = useState<number | null>(null);
  const restoredRef = useRef(false);

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

  // ── 영상 슬라이드 시청 추적 ──
  const [videoStates, setVideoStates] = useState<Record<string, VideoTrackInfo>>({});
  const videoStatesRef = useRef(videoStates);
  videoStatesRef.current = videoStates;
  const lastReportedSecRef = useRef<number>(-1);
  const lockToastRef = useRef<number>(0);

  // ── 카드별 최소 체류 시간(초) 트래킹 ──
  const [dwellSec, setDwellSec] = useState<Record<number, number>>({});
  const dwellSecRef = useRef(dwellSec);
  dwellSecRef.current = dwellSec;

  const handleVideoProgress = useCallback(
    (itemId: string, watched: number, duration: number, completed: boolean) => {
      setVideoStates((prev) => {
        const prevState = prev[itemId];
        if (
          prevState &&
          Math.abs(prevState.watched - watched) < 1 &&
          Math.abs(prevState.duration - duration) < 0.5 &&
          prevState.completed === completed
        ) {
          return prev;
        }
        return {
          ...prev,
          [itemId]: {
            watched: Math.max(prevState?.watched ?? 0, watched),
            duration: Math.max(prevState?.duration ?? 0, duration),
            completed: prevState?.completed || completed,
          },
        };
      });
    },
    []
  );

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

  // Reset state when content changes
  useEffect(() => {
    setIndex(0);
    setVisited(new Set([0]));
    setResumeIndex(null);
    completedRef.current = false;
    completionAttemptRef.current = false;
    restoredRef.current = false;
  }, [contentId]);

  // Restore saved progress once items are loaded
  useEffect(() => {
    if (restoredRef.current) return;
    if (!contentId || items.length === 0) return;
    restoredRef.current = true;
    const saved = loadProgress(contentId);
    if (!saved) return;
    const validVisited = saved.visited.filter((n) => n >= 0 && n < items.length);
    if (validVisited.length > 0) {
      setVisited(new Set([0, ...validVisited]));
    }
    const savedIdx = Math.min(Math.max(0, saved.index), items.length - 1);
    // Only suggest resume if not already completed and not at start
    if (savedIdx > 0 && validVisited.length < items.length) {
      setResumeIndex(savedIdx);
    }
  }, [contentId, items.length]);

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

  // Persist progress
  useEffect(() => {
    if (!contentId || items.length === 0) return;
    try {
      const payload: StoredProgress = { index, visited: Array.from(visited) };
      localStorage.setItem(STORAGE_KEY(contentId), JSON.stringify(payload));
    } catch {
      /* ignore quota errors */
    }
  }, [contentId, index, visited, items.length]);

  // 영상 슬라이드 잠금 판정 헬퍼
  const isItemTrackableVideo = useCallback((it: PackageItem | undefined) => {
    if (!it) return false;
    if (it.item_type === "video") return true;
    if (it.overlay_video_url) {
      // iframe 임베드(Bunny mediadelivery)는 이벤트를 받을 수 없으므로 추적 불가 → 잠금/시간추적 대상 아님
      return !/(?:iframe|player)\.mediadelivery\.net\/(embed|play)\//i.test(it.overlay_video_url);
    }
    return false;
  }, []);

  // 카드별 최소 체류 시간은 사용하지 않음. 강의 전체 최소 학습시간은
  // ContentPlayer에서 마지막 차시 도달 시 팝업으로 안내한다.
  const perCardMinSec = 0;

  const isTimeGated = useCallback(
    (slideIdx: number) => {
      if (perCardMinSec <= 0) return false;
      return (dwellSec[slideIdx] || 0) < perCardMinSec;
    },
    [dwellSec, perCardMinSec]
  );

  const isItemLocked = useCallback(
    (slideIdx: number) => {
      const it = items[slideIdx];
      const videoLocked = isItemTrackableVideo(it) && !videoStates[it.id]?.completed;
      return videoLocked || isTimeGated(slideIdx);
    },
    [items, videoStates, isItemTrackableVideo, isTimeGated]
  );

  const showLockToast = useCallback(
    (reason: "video" | "time" = "video") => {
      const now = Date.now();
      if (now - lockToastRef.current < 2000) return;
      lockToastRef.current = now;
      if (reason === "time") {
        const remain = Math.max(0, perCardMinSec - (dwellSecRef.current[index] || 0));
        toast({
          title: t("contentPlayer.timeLockTitle", "학습시간을 채워야 이동할 수 있어요"),
          description: t("contentPlayer.timeLockDesc", "이 카드에 배분된 학습시간이 {{s}}초 남았어요.", { s: remain }),
        });
      } else {
        toast({
          title: t("contentPlayer.videoLockTitle", "영상을 끝까지 시청해주세요"),
          description: t(
            "contentPlayer.videoLockDesc",
            "영상이 95% 이상 재생되어야 다음 카드로 이동할 수 있어요."
          ),
        });
      }
    },
    [t, perCardMinSec, index]
  );

  // 현재 카드에서 1초마다 체류 시간 누적 (탭 활성일 때만)
  useEffect(() => {
    if (perCardMinSec <= 0) return;
    if (items.length === 0) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setDwellSec((prev) => {
        const cur = prev[index] || 0;
        if (cur >= perCardMinSec) return prev;
        return { ...prev, [index]: cur + 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [index, perCardMinSec, items.length]);

  // 마지막 슬라이드 도달 + 영상 시청 완료 + 카드 학습시간 충족 시 onComplete
  useEffect(() => {
    if (items.length === 0) return;
    const allVideosDone = items.every((it) =>
      !isItemTrackableVideo(it) || videoStatesRef.current[it.id]?.completed
    );
    const allTimeMet = perCardMinSec <= 0
      || items.every((_, i) => (dwellSec[i] || 0) >= perCardMinSec);
    const reachedLastSlide = index === items.length - 1;
    const progressCount = reachedLastSlide ? items.length : visited.size;
    onPartialProgress?.(progressCount, items.length);
    if (reachedLastSlide && allVideosDone && allTimeMet && !completedRef.current && !completionAttemptRef.current) {
      completionAttemptRef.current = true;
      try {
        Promise.resolve(onComplete?.())
          .then((result) => {
            if (result !== false) completedRef.current = true;
          })
          .finally(() => {
            completionAttemptRef.current = false;
          });
      } catch {
        completionAttemptRef.current = false;
      }
    }
  }, [index, visited, items, videoStates, dwellSec, perCardMinSec, onComplete, onPartialProgress, isItemTrackableVideo, completionRetryTick]);

  // 최소 학습시간이 부족해 완료가 보류된 경우, 마지막 슬라이드에서 주기적으로 재확인한다.
  useEffect(() => {
    if (items.length === 0 || index !== items.length - 1 || completedRef.current) return;
    const id = setInterval(() => setCompletionRetryTick((tick) => tick + 1), 10_000);
    return () => clearInterval(id);
  }, [index, items.length]);

  // 실제 시청 누적 초 → 부모에 보고 (3초 디바운스)
  useEffect(() => {
    const timer = setTimeout(() => {
      const total = Object.values(videoStates).reduce((sum, s) => sum + (s.watched || 0), 0);
      const rounded = Math.round(total);
      if (rounded !== lastReportedSecRef.current && rounded > 0) {
        lastReportedSecRef.current = rounded;
        onWatchedSecondsTracked?.(rounded);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [videoStates, onWatchedSecondsTracked]);

  // Keyboard navigation (잠금 고려)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") {
        setIndex((i) => {
          if (i >= items.length - 1) return i;
          if (isItemLocked(i)) {
            showLockToast(isTimeGated(i) ? "time" : "video");
            return i;
          }
          return i + 1;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, isItemLocked, showLockToast, isTimeGated]);

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
      if (isItemLocked(index)) {
        showLockToast(isTimeGated(index) ? "time" : "video");
      } else {
        setIndex((i) => i + 1);
      }
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
          <div className="relative w-full">
            <img
              src={item.media_url}
              alt={item.caption || "슬라이드"}
              className="w-full h-auto block select-none pointer-events-none"
              style={transform ? { transform, transformOrigin: "center center", transition: inlinePinchStart.current || inlinePanStart.current ? "none" : "transform 0.15s ease-out" } : undefined}
              draggable={false}
            />
            {item.overlay_video_url &&
              item.overlay_x != null && item.overlay_y != null &&
              item.overlay_w != null && item.overlay_h != null && (
              <OverlayVideo item={item} isActive={isCurrent} onProgress={handleVideoProgress} />
            )}
          </div>
        ) : (
          <TrackedDirectVideo item={item} onProgress={handleVideoProgress} />
        )}
      </div>
    );
  };

  const current = items[index];
  const isImage = current.item_type === "image" || isImageUrl(current.media_url);
  const translatePct = -index * 100;
  const dragPct = (dragOffset / containerWidth) * 100;

  return (
    <div className="w-full px-3 sm:px-6 py-3 sm:py-4">
      {/* Media display – horizontal slider */}
      <div
        ref={containerRef}
        className="relative overflow-hidden touch-pan-y rounded-2xl border border-border/60 bg-muted/30 shadow-sm"
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
            {t("course.pinchToZoomHint", "두 손가락으로 확대/축소")}
          </div>
        )}
      </div>

      {/* Progress strip — visited slides / total + percentage */}
      {items.length > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-foreground/90 text-background px-4 py-2.5 text-xs flex-wrap">
          <span className="shrink-0 font-medium">
            {t("contentPlayer.watchProgress", "시청 진행률")}
          </span>
          <Progress
            value={(visited.size / items.length) * 100}
            className="h-1.5 flex-1 min-w-[80px] bg-background/20"
            aria-label={t("contentPlayer.watchProgress", "시청 진행률")}
          />
          <span className="font-medium shrink-0 tabular-nums" aria-live="polite">
            {visited.size} / {items.length} ({Math.round((visited.size / items.length) * 100)}%)
          </span>
          {resumeIndex !== null && resumeIndex !== index && (
            <button
              type="button"
              onClick={() => {
                setIndex(resumeIndex);
                setResumeIndex(null);
              }}
              className="inline-flex items-center gap-1 rounded-full bg-background text-foreground px-3 py-1 text-[11px] font-semibold shadow-sm hover:bg-background/90 transition-colors"
            >
              <Play className="h-3 w-3" aria-hidden="true" />
              {t("contentPlayer.resume", "이어보기")} ({resumeIndex + 1})
            </button>
          )}
        </div>
      )}

      {/* Step dots – right below image */}
      {items.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                // 앞으로 건너뛰려는 시도에서 잠긴 슬라이드가 있는지 검사
                if (i > index) {
                  for (let k = index; k < i; k++) {
                    if (isItemLocked(k)) {
                      showLockToast(isTimeGated(k) ? "time" : "video");
                      return;
                    }
                  }
                }
                setIndex(i);
              }}
              className={`h-2 rounded-full transition-all ${
                i === index
                  ? "w-6 bg-primary"
                  : visited.has(i)
                  ? "w-2 bg-primary/40 hover:bg-primary/60"
                  : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              }`}
              aria-label={`슬라이드 ${i + 1}로 이동`}
            />
          ))}
        </div>
      )}

      {/* 현재 슬라이드에 미완료 영상이 있거나 배분된 학습시간이 남았으면 안내 */}
      {isItemLocked(index) && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {isTimeGated(index)
              ? t("contentPlayer.timeLockHint", "이 카드에 배분된 학습시간을 채우면 다음 카드로 이동할 수 있어요 ({{s}}초 남음)", {
                  s: Math.max(0, perCardMinSec - (dwellSec[index] || 0)),
                })
              : t("contentPlayer.videoLockHint", "영상을 끝까지 시청하면 다음 카드로 이동할 수 있어요")}
          </span>
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