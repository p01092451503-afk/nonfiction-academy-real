import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import { Play, RotateCcw, Video as VideoIcon, CheckCircle2, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { VideoThumbnail } from "@/components/VideoThumbnail";
import { normalizeLang } from "@/lib/i18nLang";

interface VideoPackagePlayerProps {
  contentId: string;
  onComplete?: () => void;
  title?: string;
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
const isBunnyIframe = (url: string) => /iframe\.mediadelivery\.net\/(embed|play)\//i.test(url);
const isBunnyProvider = (provider?: string | null) => provider?.toLowerCase() === "bunny";
const getBunnyVideoId = (url: string) =>
  url.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i)?.[1] || null;
const sanitizeBunnyAssetUrl = (url: string | null | undefined) => {
  const raw = url?.trim() || "";
  return raw && !hasPlaceholderHost(raw) ? raw : null;
};

const VideoPackagePlayer = ({ contentId, onComplete, title }: VideoPackagePlayerProps) => {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [resumePos, setResumePos] = useState(0);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [resolvedPoster, setResolvedPoster] = useState<string | null>(null);
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
  const [iframeStartTime, setIframeStartTime] = useState<number | null>(null);
  const completedRef = useRef(false);

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

  const activeItem = items[activeIdx];

  // Load resume position when active item changes
  useEffect(() => {
    if (!activeItem) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY(contentId, activeItem.id));
      const t = raw ? parseFloat(raw) : 0;
      setResumePos(isFinite(t) && t > 5 ? t : 0);
    } catch {
      setResumePos(0);
    }
  }, [contentId, activeItem?.id]);

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
      setPlaybackUrl(data.playUrl);
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

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !activeItem) return;
    setProgress({ current: 0, duration: v.duration || 0 });
  };

  const handleResume = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = resumePos;
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
        className="relative bg-black overflow-hidden rounded-2xl mx-auto w-full"
        style={{ maxWidth: "calc((100vh - 240px) * 16 / 9)" }}
      >
        <div className="relative w-full aspect-video max-h-[calc(100vh-240px)]">
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
            <iframe
              key={`${playbackUrl}#${iframeStartTime ?? 0}`}
              src={
                iframeStartTime && iframeStartTime > 0
                  ? `${playbackUrl}${playbackUrl.includes("?") ? "&" : "?"}t=${Math.floor(iframeStartTime)}&autoplay=true`
                  : playbackUrl
              }
              className="absolute inset-0 h-full w-full border-0 bg-black"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              title={activeItem?.title || t("course.video", "영상")}
            />
          ) : (
            <video
              ref={videoRef}
              key={activeItem?.id}
              controls
              playsInline
              poster={resolvedPoster || undefined}
              className="absolute inset-0 w-full h-full object-contain bg-black"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              aria-label={activeItem?.title || t("course.video", "영상")}
            />
          )}
        </div>

        {/* Progress strip — matches single-video player */}
        <div className="px-4 py-2.5 bg-secondary/60 flex items-center gap-3 text-xs flex-wrap">
          <span className="text-muted-foreground shrink-0">
            {t("contentPlayer.watchProgress", "시청 진행률")}
          </span>
          <Progress
            value={pct}
            className="h-1.5 flex-1 min-w-[80px]"
            aria-label={t("contentPlayer.watchProgress", "시청 진행률")}
          />
          <span
            className="text-muted-foreground font-medium shrink-0 tabular-nums"
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
          {!isItemComplete && (
            <span className="text-[10px] text-muted-foreground/70 shrink-0">
              {t("contentPlayer.autoCompleteAt80", "80% 이상 시청 시 자동 완료")}
            </span>
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
    </div>
  );
};


export default VideoPackagePlayer;
