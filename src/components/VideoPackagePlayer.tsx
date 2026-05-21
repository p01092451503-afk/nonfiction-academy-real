import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import { Play, RotateCcw, Video as VideoIcon, CheckCircle2, Clock, Lock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { VideoThumbnail } from "@/components/VideoThumbnail";
import { toast } from "@/hooks/use-toast";
import { normalizeLang } from "@/lib/i18nLang";

const SEEK_TOLERANCE = 2; // seconds — natural playback drift allowance


interface VideoPackagePlayerProps {
  contentId: string;
  onComplete?: () => void;
  title?: string;
  isAlreadyCompleted?: boolean;
}

interface VPItem {
  id: string;
  content_id: string;
  video_asset_id: string | null;
  language_code: string;
  order_index: number;
  video_url: string;
  video_provider: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  title: string | null;
}

const STORAGE_KEY = (cid: string, vid: string) => `vp-progress:${cid}:${vid}`;

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url);
const hasPlaceholderHost = (url: string) => /placeholder_value_to_be_replaced/i.test(url);
const isBunnyIframe = (url: string) => /(?:iframe|player)\.mediadelivery\.net\/(embed|play)\//i.test(url);
const isBunnyProvider = (provider?: string | null) => provider?.toLowerCase() === "bunny";
const getBunnyVideoId = (url: string) =>
  url.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i)?.[1] || null;
const toBunnyEmbedUrl = (url: string) =>
  url
    .replace("iframe.mediadelivery.net/play/", "iframe.mediadelivery.net/embed/")
    .replace("player.mediadelivery.net/embed/", "iframe.mediadelivery.net/embed/");
const sanitizeBunnyAssetUrl = (url: string | null | undefined) => {
  const raw = url?.trim() || "";
  return raw && !hasPlaceholderHost(raw) ? raw : null;
};
const getFrameNonce = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const VideoPackagePlayer = ({ contentId, onComplete, title, isAlreadyCompleted = false }: VideoPackagePlayerProps) => {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [resumePos, setResumePos] = useState(0);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [resolvedPoster, setResolvedPoster] = useState<string | null>(null);
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
  const [iframeStartTime, setIframeStartTime] = useState<number | null>(null);
  const [iframeInstanceKey, setIframeInstanceKey] = useState(getFrameNonce);
  const completedRef = useRef(false);
  const maxWatchedRef = useRef<number>(0);
  const seekGuardRef = useRef<boolean>(false);
  const lastSeekWarnRef = useRef<number>(0);

  const warnSeekBlocked = () => {
    const now = Date.now();
    if (now - lastSeekWarnRef.current < 2500) return;
    lastSeekWarnRef.current = now;
    toast({
      title: t("videoPackage.seekBlockedTitle", "앞으로 건너뛸 수 없습니다"),
      description: t(
        "videoPackage.seekBlockedDesc",
        "정확한 학습을 위해 시청하지 않은 구간으로 이동할 수 없습니다."
      ),
    });
  };



  // Fetch all items for this content (all languages), then filter by language
  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ["video-package-items", contentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("video_package_items")
        .select("*")
        .eq("content_id", contentId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data || []) as VPItem[];
    },
    enabled: !!contentId,
  });

  const items = useMemo(() => {
    const byLang = allItems.filter((it) => it.language_code === lang);
    if (byLang.length > 0) return byLang;
    // Fallback to Korean if user's language has no items
    const ko = allItems.filter((it) => it.language_code === "ko");
    return ko.length > 0 ? ko : allItems;
  }, [allItems, lang]);

  // Reset when content or language changes
  useEffect(() => {
    setActiveIdx(0);
    setCompletedItems(new Set());
    setProgress({ current: 0, duration: 0 });
    setIframeStartTime(null);
    completedRef.current = false;
  }, [contentId, lang]);

  // Once content was completed previously, mark all items as completed permanently
  // (replay mode — keep showing "완료" and skip seek-forward restriction)
  useEffect(() => {
    if (isAlreadyCompleted && items.length > 0) {
      setCompletedItems((prev) => {
        if (prev.size >= items.length && items.every((it) => prev.has(it.id))) return prev;
        const next = new Set(prev);
        items.forEach((it) => next.add(it.id));
        return next;
      });
    }
  }, [isAlreadyCompleted, items]);

  const activeItem = items[activeIdx];


  // Load resume position when active item changes
  useEffect(() => {
    if (!activeItem) return;
    setIframeStartTime(null);
    setShowResumeDialog(false);
    setProgress({ current: 0, duration: activeItem.duration_seconds || 0 });
    try {
      const raw = localStorage.getItem(STORAGE_KEY(contentId, activeItem.id));
      const saved = raw ? parseFloat(raw) : 0;
      const pos = isFinite(saved) && saved > 5 ? saved : 0;
      setResumePos(pos);
      // Allow seeking up to previously-watched position
      maxWatchedRef.current = pos;
      if (pos > 0) setShowResumeDialog(true);
    } catch {
      setResumePos(0);
      maxWatchedRef.current = 0;
    }
  }, [contentId, activeItem?.id]);


  useEffect(() => {
    if (activeItem && playbackUrl && isBunnyIframe(playbackUrl)) {
      setIframeInstanceKey(getFrameNonce());
    }
  }, [activeItem?.id, playbackUrl, iframeStartTime]);


  useEffect(() => {
    if (!activeItem) {
      setPlaybackUrl(null);
      setResolvedPoster(null);
      setVideoLoadError(null);
      return;
    }

    let cancelled = false;
    const rawUrl = activeItem.video_url?.trim() || "";
    const needsResolve = isBunnyProvider(activeItem.video_provider);

    setVideoLoadError(null);
    setResolvedPoster(sanitizeBunnyAssetUrl(activeItem.thumbnail_url));

    if (!needsResolve) {
      // Non-Bunny direct URL — safe to set immediately
      setPlaybackUrl(rawUrl || null);
      setIsResolvingUrl(false);
      return;
    }

    // For Bunny: NEVER render the iframe with an unsigned URL (token auth → 403).
    // Clear playbackUrl and show loading until the signed URL arrives.
    setPlaybackUrl(null);

    const videoId = getBunnyVideoId(rawUrl);
    if (!videoId) {
      setIsResolvingUrl(false);
      setVideoLoadError(t("videoPackage.invalidUrl", "재생 주소가 올바르지 않습니다."));
      return;
    }

    setIsResolvingUrl(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("bunny-resolve-video", {
        body: { videoId, url: rawUrl, thumbnailUrl: activeItem.thumbnail_url },
      });
      if (cancelled) return;
      setIsResolvingUrl(false);
      if (error || !data?.playUrl) {
        setVideoLoadError(t("videoPackage.invalidUrl", "재생 주소를 불러오지 못했습니다."));
        return;
      }
      // Bunny Pull Zone CDN token auth can make the official iframe's internal HLS
      // requests return 403. Prefer our signed HLS proxy/direct playlist so every
      // playlist and segment request is signed server-side.
      setPlaybackUrl(data.proxyPlaylistUrl || data.playlistUrl || toBunnyEmbedUrl(data.embedUrl || data.playUrl));
      setResolvedPoster(sanitizeBunnyAssetUrl(data.thumbnailUrl) || sanitizeBunnyAssetUrl(activeItem.thumbnail_url));
    })();

    return () => {
      cancelled = true;
    };
  }, [activeItem?.id, activeItem?.video_url, activeItem?.video_provider, activeItem?.thumbnail_url, t]);

  // Attach video src via hls.js (HLS) or native
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeItem || !playbackUrl || isBunnyIframe(playbackUrl)) return;

    // Cleanup any previous hls instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setVideoLoadError(null);
    const url = playbackUrl;
    if (isHls(url)) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
      } else if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setVideoLoadError(t("videoPackage.invalidUrl", "재생 주소를 불러오지 못했습니다."));
          }
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else {
        video.src = url;
      }
    } else {
      video.src = url;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeItem?.id, playbackUrl, t]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !activeItem) return;
    const cur = v.currentTime;
    const dur = v.duration || 0;
    // Track furthest watched position for seek-forward prevention
    if (cur > maxWatchedRef.current) maxWatchedRef.current = cur;
    setProgress({ current: cur, duration: dur });
    // Save position every ~5s
    if (Math.floor(cur) % 5 === 0) {
      try {
        localStorage.setItem(STORAGE_KEY(contentId, activeItem.id), String(cur));
      } catch {}
    }
    if (dur > 0 && cur / dur >= 0.8 && !completedItems.has(activeItem.id)) {
      setCompletedItems((prev) => {
        const next = new Set(prev);
        next.add(activeItem.id);
        return next;
      });
    }
  };

  const handleSeeking = () => {
    const v = videoRef.current;
    if (!v || !activeItem) return;
    // Allow seeks after completion (re-watching freely)
    if (completedItems.has(activeItem.id)) return;
    if (seekGuardRef.current) return;
    const target = v.currentTime;
    const limit = maxWatchedRef.current + SEEK_TOLERANCE;
    if (target > limit) {
      seekGuardRef.current = true;
      try {
        v.currentTime = Math.max(0, maxWatchedRef.current);
      } catch {}
      warnSeekBlocked();
      setTimeout(() => { seekGuardRef.current = false; }, 50);
    }
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !activeItem) return;
    setProgress({ current: 0, duration: v.duration || 0 });
  };

  const handleResume = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = resumePos;
    if (resumePos > maxWatchedRef.current) maxWatchedRef.current = resumePos;
    setResumePos(0);
    v.play().catch(() => {});
  };

  const handleEnded = () => {
    const v = videoRef.current;
    if (!v || !activeItem) return;
    setCompletedItems((prev) => {
      if (prev.has(activeItem.id)) return prev;
      const next = new Set(prev);
      next.add(activeItem.id);
      return next;
    });
    try {
      localStorage.removeItem(STORAGE_KEY(contentId, activeItem.id));
    } catch {}
    // Auto-advance to next
    if (activeIdx < items.length - 1) {
      setActiveIdx((i) => i + 1);
    }
  };

  // Trigger onComplete when all items completed (>=80% each)
  useEffect(() => {
    if (
      items.length > 0 &&
      completedItems.size >= items.length &&
      !completedRef.current
    ) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [completedItems, items.length, onComplete]);

  // Bunny iframe progress tracking via Player.js postMessage protocol
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!activeItem || !playbackUrl || !isBunnyIframe(playbackUrl) || !iframe) return;

    let cancelled = false;
    let player: any = null;
    let durationCache = 0;
    let lastSavedSec = -1;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    let PlayerCtor: any = null;
    let attachTimer: ReturnType<typeof setTimeout> | null = null;

    const updateProgress = (curRaw: number, durRaw?: number) => {
      if (cancelled) return;
      const cur = isFinite(curRaw) && curRaw > 0 ? curRaw : 0;
      const dur = isFinite(durRaw || 0) && (durRaw || 0) > 0 ? durRaw || 0 : durationCache;
      if (dur > 0) durationCache = dur;
      // Enforce no-skip-forward: if cur jumped beyond max + tolerance, snap back
      if (
        !completedItems.has(activeItem.id) &&
        !seekGuardRef.current &&
        cur > maxWatchedRef.current + SEEK_TOLERANCE + 1
      ) {
        seekGuardRef.current = true;
        try {
          player?.setCurrentTime?.(Math.max(0, maxWatchedRef.current));
        } catch {}
        warnSeekBlocked();
        setTimeout(() => { seekGuardRef.current = false; }, 200);
        return;
      }
      if (cur > maxWatchedRef.current) maxWatchedRef.current = cur;
      setProgress({ current: cur, duration: dur });
      const sec = Math.floor(cur);
      if (sec > 0 && sec !== lastSavedSec && sec % 5 === 0) {
        lastSavedSec = sec;
        try {
          localStorage.setItem(STORAGE_KEY(contentId, activeItem.id), String(cur));
        } catch {}
      }
      if (dur > 0 && cur / dur >= 0.8 && !completedItems.has(activeItem.id)) {
        setCompletedItems((prev) => {
          const next = new Set(prev);
          next.add(activeItem.id);
          return next;
        });
      }
    };


    const pollBunnyProgress = () => {
      if (!player) return;
      try {
        player.getCurrentTime((cur: number) => {
          if (durationCache > 0) {
            updateProgress(cur, durationCache);
            return;
          }
          player.getDuration((dur: number) => updateProgress(cur, dur));
        });
      } catch {}
    };

    const attach = async () => {
      try {
        const mod: any = await import("player.js");
        if (cancelled) return;
        PlayerCtor = mod.Player || mod.default?.Player || mod.default;
        if (!PlayerCtor || !iframeRef.current) return;
        player = new PlayerCtor(iframeRef.current);
        player.on("ready", () => {
          player.getDuration((d: number) => {
            if (d && isFinite(d)) {
              durationCache = d;
              setProgress((p) => ({ current: p.current, duration: d }));
            }
          });
          pollBunnyProgress();
          pollTimer = setInterval(pollBunnyProgress, 1000);
        });
        player.on("timeupdate", (data: { seconds: number; duration: number }) => {
          updateProgress(data?.seconds ?? 0, data?.duration ?? durationCache);
        });
        player.on("ended", () => {
          setCompletedItems((prev) => {
            if (prev.has(activeItem.id)) return prev;
            const next = new Set(prev);
            next.add(activeItem.id);
            return next;
          });
          try {
            localStorage.removeItem(STORAGE_KEY(contentId, activeItem.id));
          } catch {}
          if (activeIdx < items.length - 1) {
            setActiveIdx((i) => i + 1);
          }
        });
      } catch {
        /* ignore */
      }
    };

    // Wait for iframe to mount/load
    attachTimer = setTimeout(attach, 300);

    return () => {
      cancelled = true;
      if (attachTimer) clearTimeout(attachTimer);
      if (pollTimer) clearInterval(pollTimer);
      try {
        player?.off?.("timeupdate");
        player?.off?.("ended");
        player?.off?.("ready");
      } catch {}
    };
  }, [activeItem?.id, playbackUrl, iframeInstanceKey, contentId, items.length, activeIdx, completedItems]);

  if (isLoading) {
    return (
      <div className="aspect-video w-full">
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="aspect-video w-full flex items-center justify-center text-sm text-muted-foreground rounded-lg bg-muted/30">
        {t("videoPackage.empty", "등록된 동영상이 없습니다.")}
      </div>
    );
  }

  const pct = progress.duration > 0 ? (progress.current / progress.duration) * 100 : 0;
  const totalEpisodes = items.length;
  const isItemComplete = activeItem ? completedItems.has(activeItem.id) : false;

  return (
    <div className="w-full">
      {/* Video player */}
      <div
        className="relative bg-black overflow-hidden rounded-2xl w-full"
      >
        <div className="relative w-full aspect-video">
          {isResolvingUrl ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground bg-black">
              {t("common.loading", "불러오는 중...")}
            </div>
          ) : videoLoadError ? (
            <div
              className="flex h-full w-full items-center justify-center text-sm text-muted-foreground bg-black px-4 text-center"
              role="alert"
            >
              {videoLoadError}
            </div>
          ) : playbackUrl && isBunnyIframe(playbackUrl) ? (
            (() => {
              const sep = playbackUrl.includes("?") ? "&" : "?";
              const params = [`preload=true`, `responsive=true`, `_vp=${encodeURIComponent(iframeInstanceKey)}`];
              if (iframeStartTime && iframeStartTime > 0) {
                params.push(`t=${Math.floor(iframeStartTime)}`, `autoplay=true`);
              }
              const finalSrc = `${playbackUrl}${sep}${params.join("&")}`;
              return (
                <iframe
                  ref={iframeRef}
                  key={finalSrc}
                  src={finalSrc}
                  width="100%"
                  height="100%"
                  className="absolute inset-0 h-full w-full border-0 bg-black"
                  style={{ aspectRatio: "16 / 9" }}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="no-referrer"
                  tabIndex={-1}
                  title={activeItem?.title || t("course.video", "영상")}
                />
              );
            })()
          ) : (
            <video
              ref={videoRef}
              key={activeItem?.id}
              controls
              controlsList="nodownload noplaybackrate noremoteplayback"
              disablePictureInPicture
              disableRemotePlayback
              playsInline
              poster={resolvedPoster || undefined}
              preload="metadata"
              className="absolute inset-0 h-full w-full bg-black object-contain"
              onTimeUpdate={handleTimeUpdate}
              onSeeking={handleSeeking}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              aria-label={activeItem?.title || t("course.video", "영상")}
            />
          )}
          {playbackUrl && isBunnyIframe(playbackUrl) && !isItemComplete && (
            <div
              className="absolute inset-x-[6%] [bottom:clamp(3.5rem,18%,4.75rem)] z-10 h-20 cursor-not-allowed touch-none"
              aria-hidden="true"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                warnSeekBlocked();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          )}
        </div>

        {/* Progress strip — matches single-video player */}
        <div className="px-4 py-2.5 bg-foreground/90 text-background flex items-center gap-3 text-xs flex-wrap">
          <span className="shrink-0 font-medium">
            {t("contentPlayer.watchProgress", "시청 진행률")}
          </span>
          <Progress
            value={pct}
            className="h-1.5 flex-1 min-w-[80px] bg-background/20"
            aria-label={t("contentPlayer.watchProgress", "시청 진행률")}
          />
          <span
            className="font-medium shrink-0 tabular-nums"
            aria-live="polite"
          >

            {progress.duration > 0
              ? `${formatTime(progress.current)} / ${formatTime(progress.duration)}`
              : `${Math.round(pct)}%`}
          </span>
          {resumePos > 0 && !isItemComplete && (
            <button
              type="button"
              onClick={() => {
                if (playbackUrl && isBunnyIframe(playbackUrl)) {
                  setIframeStartTime(resumePos);
                  setResumePos(0);
                } else {
                  handleResume();
                }
              }}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              {t("contentPlayer.resumeFrom", {
                time: formatTime(resumePos),
                defaultValue: `${formatTime(resumePos)}부터 이어보기`,
              })}
            </button>
          )}
          {isItemComplete && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 shrink-0">
              <CheckCircle2 className="h-3 w-3" />
              {t("videoPackage.itemComplete", "시청 완료")}
            </span>
          )}
        </div>

      </div>




      {/* Episode list (1차시 / 2차시 / 3차시 ...) */}
      {totalEpisodes > 1 && (
        <section
          className="mt-[27px] space-y-1.5"
          aria-label={title || t("videoPackage.episodes", "구성된 동영상")}
        >
          <div className="flex items-center justify-between px-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {(() => {
                const lc = (items[0]?.language_code || "").toLowerCase();
                const code = lc === "ko" ? "KO"
                  : lc === "en" ? "EN"
                  : lc === "ja" ? "JA"
                  : lc.startsWith("zh") ? "ZH"
                  : "";
                const styleMap: Record<string, string> = {
                  KO: "bg-foreground text-background",
                  EN: "bg-blue-600 text-white dark:bg-blue-500",
                  JA: "bg-rose-600 text-white dark:bg-rose-500",
                  ZH: "bg-amber-600 text-white dark:bg-amber-500",
                };
                return code ? (
                  <span
                    className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-[10px] font-bold tracking-wider shadow-sm ${styleMap[code]}`}
                    aria-label={code}
                  >
                    {code}
                  </span>
                ) : null;
              })()}
              <h4 className="text-lg font-semibold text-foreground truncate min-w-0">
                {title || t("videoPackage.episodes", "구성된 동영상")}
              </h4>
            </div>
          </div>
          <ul
            className="space-y-1"
            role="list"
          >
            {items.map((it, idx) => {
              const isActive = idx === activeIdx;
              const isDone = completedItems.has(it.id);
              const episodeLabel = `${idx + 1}${t("videoPackage.episodeSuffix", "차시")}`;
              const itemTitle = it.title || `${t("course.video", "영상")} ${idx + 1}`;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => setActiveIdx(idx)}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`${episodeLabel} ${itemTitle}${isDone ? ` (${t("course.completed", "완료")})` : isActive ? ` (${t("course.playing", "재생 중")})` : ""}`}
                    className={`w-full flex items-center gap-2 px-3 py-2 min-h-12 text-left rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive ? "bg-accent" : "hover:bg-accent/50 active:bg-accent/50"
                    }`}
                  >
                    <VideoThumbnail
                      src={it.thumbnail_url}
                      className="h-10 w-10 rounded-md shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums shrink-0">
                          {episodeLabel}
                        </span>
                        <span className="text-sm font-medium text-foreground truncate">
                          {itemTitle}
                        </span>
                      </div>
                    </div>
                    {(() => {
                      const total = it.duration_seconds || 0;
                      let watched = 0;
                      if (isActive) {
                        watched = Math.min(progress.current || 0, total || progress.duration || 0);
                      } else {
                        try {
                          const raw = localStorage.getItem(STORAGE_KEY(contentId, it.id));
                          const v = raw ? parseFloat(raw) : 0;
                          watched = isFinite(v) ? v : 0;
                        } catch {
                          watched = 0;
                        }
                      }
                      if (isDone && total) watched = total;
                      return (
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {isDone ? (
                            <Badge
                              className="gap-1 text-[11px] font-semibold rounded-full px-3 py-1 border-0 bg-emerald-500 text-white hover:bg-emerald-500 shadow-sm"
                            >
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              {t("course.completed", "완료")}
                            </Badge>
                          ) : isActive ? (
                            <Badge className="gap-1 text-[11px] font-semibold rounded-full px-3 py-1 border-0 bg-orange-500 text-white hover:bg-orange-500 shadow-sm">
                              <Play className="h-3 w-3" aria-hidden="true" />
                              {t("course.playing", "재생 중")}
                            </Badge>
                          ) : null}
                          {total > 0 && (
                            <span
                              className="text-[10px] text-muted-foreground tabular-nums"
                              aria-label={`${t("course.watched", "학습 시간")} ${formatTime(watched)} / ${formatTime(total)}`}
                            >
                              {formatTime(watched)} / {formatTime(total)}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Resume / Restart dialog */}
      <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("contentPlayer.resumeTitle", "이전 시청 기록")}</DialogTitle>
            <DialogDescription>
              {t("contentPlayer.resumeDesc", {
                time: formatTime(resumePos),
                defaultValue: `이전에 ${formatTime(resumePos)} 지점까지 시청했습니다. 이어보시겠어요?`,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-full"
              onClick={() => {
                try {
                  if (activeItem) localStorage.removeItem(STORAGE_KEY(contentId, activeItem.id));
                } catch {}
                setResumePos(0);
                setShowResumeDialog(false);
                if (playbackUrl && isBunnyIframe(playbackUrl)) {
                  setIframeStartTime(0);
                } else {
                  const v = videoRef.current;
                  if (v) {
                    v.currentTime = 0;
                    v.play().catch(() => {});
                  }
                }
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              {t("contentPlayer.startOver", "처음부터")}
            </Button>
            <Button
              className="flex-1 rounded-full"
              onClick={() => {
                setShowResumeDialog(false);
                if (playbackUrl && isBunnyIframe(playbackUrl)) {
                  setIframeStartTime(resumePos);
                  setResumePos(0);
                } else {
                  handleResume();
                }
              }}
            >
              <Play className="h-4 w-4 mr-1.5" />
              {t("contentPlayer.resumeAt", {
                time: formatTime(resumePos),
                defaultValue: `이어보기 (${formatTime(resumePos)})`,
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};



export default VideoPackagePlayer;
