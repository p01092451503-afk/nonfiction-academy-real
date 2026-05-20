import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import { Play, RotateCcw, Video as VideoIcon, CheckCircle2 } from "lucide-react";
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
const toBunnyEmbedUrl = (url: string) => url.replace("/play/", "/embed/");
const getBunnyVideoId = (url: string) =>
  url.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1] || null;

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
    const needsResolve = activeItem.video_provider === "bunny" && (hasPlaceholderHost(rawUrl) || isBunnyIframe(rawUrl));

    setVideoLoadError(null);
    setResolvedPoster(activeItem.thumbnail_url || null);
    setPlaybackUrl(rawUrl ? (isBunnyIframe(rawUrl) ? toBunnyEmbedUrl(rawUrl) : rawUrl) : null);

    if (!needsResolve) {
      setIsResolvingUrl(false);
      return;
    }

    const videoId = getBunnyVideoId(rawUrl);
    if (!videoId) {
      setIsResolvingUrl(false);
      setVideoLoadError(t("videoPackage.invalidUrl", "재생 주소가 올바르지 않습니다."));
      return;
    }

    setIsResolvingUrl(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("bunny-resolve-video", {
        body: { videoId, url: rawUrl },
      });
      if (cancelled) return;
      setIsResolvingUrl(false);
      if (error || !data?.playUrl) {
        setPlaybackUrl(`https://iframe.mediadelivery.net/embed/${data?.libraryId || ""}/${videoId}`);
        setVideoLoadError(null);
        return;
      }
      setPlaybackUrl(data.playUrl);
      setResolvedPoster(data.thumbnailUrl || activeItem.thumbnail_url || null);
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

    const url = playbackUrl;
    if (isHls(url)) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
      } else if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
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
  }, [activeItem?.id, playbackUrl]);

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
      <div className="relative bg-black overflow-hidden rounded-none lg:rounded-2xl">
        <div className="aspect-video w-full">
          {isResolvingUrl ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground bg-black">
              {t("common.loading", "불러오는 중...")}
            </div>
          ) : playbackUrl && isBunnyIframe(playbackUrl) ? (
            <iframe
              key={activeItem?.id}
              src={toBunnyEmbedUrl(playbackUrl)}
              className="h-full w-full border-0 bg-black"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              title={activeItem?.title || t("course.video", "영상")}
            />
          ) : videoLoadError ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground bg-black px-4 text-center">
              {videoLoadError}
            </div>
          ) : (
            <video
              ref={videoRef}
              key={activeItem?.id}
              controls
              playsInline
              poster={resolvedPoster || undefined}
              className="w-full h-full object-contain bg-black"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
            />
          )}
        </div>
      </div>

      {/* Progress + resume bar (matches student image) */}
      <div className="mt-2 px-3 py-2.5 bg-secondary/60 rounded-lg flex items-center gap-3 text-xs flex-wrap">
        <span className="text-muted-foreground shrink-0">
          {t("contentPlayer.watchProgress", "시청 진행률")}
        </span>
        <Progress value={pct} className="h-1.5 flex-1 min-w-[120px]" />
        <span className="text-muted-foreground font-medium shrink-0 tabular-nums">
          {Math.round(pct)}%
        </span>
        {resumePos > 0 && !isItemComplete && (
          <button
            type="button"
            onClick={handleResume}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            {t("contentPlayer.resumeFrom", { time: formatTime(resumePos), defaultValue: `${formatTime(resumePos)}부터 이어보기` })}
          </button>
        )}
        {!isItemComplete && (
          <span className="text-[10px] text-muted-foreground/70 shrink-0">
            {t("contentPlayer.autoCompleteAt80", "80% 이상 시청 시 자동 완료됩니다")}
          </span>
        )}
        {isItemComplete && (
          <span className="inline-flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            {t("course.completed", "완료")}
          </span>
        )}
      </div>

      {/* Episode list (1차시 / 2차시 / 3차시 ...) */}
      {totalEpisodes > 1 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              {t("videoPackage.episodes", "구성된 동영상")}
              {(() => {
                const lc = (items[0]?.language_code || "").toLowerCase();
                const isEn = lang === "en";
                const label = lc === "ko" ? (isEn ? "Korean" : "한국어")
                  : lc === "en" ? (isEn ? "English" : "영어")
                  : lc === "ja" ? (isEn ? "Japanese" : "일본어")
                  : lc.startsWith("zh") ? (isEn ? "Chinese" : "중국어")
                  : "";
                return label ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-foreground text-background">
                    {label}
                  </span>
                ) : null;
              })()}
            </h4>
            <span className="text-xs text-muted-foreground">
              {completedItems.size} / {totalEpisodes}
            </span>
          </div>
          <ul className="divide-y divide-border/60 border-y border-border/60">
            {items.map((it, idx) => {
              const isActive = idx === activeIdx;
              const isDone = completedItems.has(it.id);
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => setActiveIdx(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${
                      isActive ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    <VideoThumbnail src={it.thumbnail_url} className="h-9 w-9 rounded-md shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                          {idx + 1}{t("videoPackage.episodeSuffix", "차시")}
                        </span>
                        <span className="text-sm font-medium text-foreground truncate">
                          {it.title || `${t("course.video", "영상")} ${idx + 1}`}
                        </span>
                      </div>
                      {it.duration_seconds ? (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatTime(it.duration_seconds)}
                        </p>
                      ) : null}
                    </div>
                    {isDone ? (
                      <Badge variant="outline" className="gap-1 text-[10px] border-green-300 text-green-700 dark:border-green-800 dark:text-green-400 shrink-0">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("course.completed", "완료")}
                      </Badge>
                    ) : isActive ? (
                      <Badge variant="outline" className="gap-1 text-[10px] shrink-0">
                        <Play className="h-3 w-3" />
                        {t("course.playing", "재생 중")}
                      </Badge>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default VideoPackagePlayer;
