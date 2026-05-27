import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, CheckCircle2, Play, FileText,
  Video, BarChart3, ExternalLink, Clock, X, RotateCcw, List, FolderOpen,
  Lock as LockIcon, MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { normalizeLang } from "@/lib/i18nLang";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { logContentAccess } from "@/hooks/useTrafficLogger";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import MediaPackagePlayer from "@/components/MediaPackagePlayer";
import VideoPackagePlayer from "@/components/VideoPackagePlayer";
import CourseComments from "@/components/CourseComments";
import { computeCourseProgress, syncEnrollmentOnContentCompleted, syncEnrollmentPartialProgress } from "@/lib/courseCompletion";
import {
  getContentTitle,
  getContentDescription,
  getContentVideoUrl,
  getContentVideoProvider,
  getCourseTitleByLangWithContentFallback,
  hasUploadedContent,
  localizeLessonPrefix,
} from "@/lib/courseContentI18n";

const contentTypeIcon: Record<string, React.ElementType> = {
  video: Video, document: FileText, quiz: BarChart3, assignment: FileText, live: Video,
};

const getYouTubeVideoId = (url: string | null) => {
  if (!url) return null;

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] || null;
    }

    if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      const parts = parsed.pathname.split("/").filter(Boolean);
      const markerIndex = parts.findIndex((part) => ["embed", "shorts", "live"].includes(part));
      if (markerIndex !== -1) {
        return parts[markerIndex + 1] || null;
      }
    }
  } catch {
    // Fall through to regex parsing
  }

  const fallbackMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([^&?#/]+)/);
  return fallbackMatch?.[1] || null;
};

const getVimeoVideoId = (url: string | null) => {
  if (!url) return null;
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match?.[1] || null;
};

const getBunnyVideoId = (url: string | null) =>
  url?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] || null;

const isBunnyVideo = (url: string | null, provider: string | null) =>
  provider === "bunny" || /(?:iframe|player)\.mediadelivery\.net|b-cdn\.net/i.test(url || "");

const toBunnyEmbedUrl = (url: string) =>
  url
    .replace("iframe.mediadelivery.net/play/", "iframe.mediadelivery.net/embed/")
    .replace("player.mediadelivery.net/embed/", "iframe.mediadelivery.net/embed/");

const ContentPlayer = () => {
  const { courseId, contentId } = useParams<{ courseId: string; contentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Derive route prefix from current path (e.g. /student, /teacher, /admin)
  const routePrefix = location.pathname.startsWith("/admin/") ? "/admin" : location.pathname.startsWith("/teacher/") ? "/teacher" : "/student";
  const { user, profile } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const isLocalized = lang !== "ko";
  const isEn = lang === "en";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mangoPopupOpen, setMangoPopupOpen] = useState(false);
  const [mangoElapsed, setMangoElapsed] = useState(0);
  const mangoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mobileCurriculumOpen, setMobileCurriculumOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [isLgUp, setIsLgUp] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsLgUp(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  const contentTypeLabel: Record<string, string> = {
    video: t("course.video"), document: t("course.document"),
    quiz: t("course.quiz"), assignment: t("course.assignment"), live: t("course.live"),
  };

  const { data: course } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").eq("id", courseId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const { data: courseI18n } = useQuery({
    queryKey: ["course-i18n", courseId],
    queryFn: async () => {
      const { data } = await supabase.from("course_i18n").select("*").eq("course_id", courseId!);
      return data || [];
    },
    enabled: !!courseId,
  });

  const { data: contents = [], isLoading: contentsLoading, isFetching: contentsFetching } = useQuery({
    queryKey: ["course-contents", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_contents").select("*").eq("course_id", courseId!).order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const { data: mediaPackageContentIds } = useQuery({
    queryKey: ["course-media-package-ids", courseId, contents.map(c => c.id).join(",")],
    queryFn: async () => {
      const mpIds = contents
        .filter((c: any) => (c.content_type || "").toLowerCase() === "media_package")
        .map((c: any) => c.id);
      if (mpIds.length === 0) return new Set<string>();
      const { data } = await (supabase as any)
        .from("media_package_items")
        .select("content_id")
        .in("content_id", mpIds);
      return new Set<string>((data || []).map((r: any) => r.content_id));
    },
    enabled: contents.length > 0,
    staleTime: 60_000,
  });

  const { data: videoPackageContentIds } = useQuery({
    queryKey: ["course-video-package-ids", courseId, contents.map(c => c.id).join(",")],
    queryFn: async () => {
      const vpIds = contents
        .filter((c: any) => (c.content_type || "").toLowerCase() === "video_package")
        .map((c: any) => c.id);
      if (vpIds.length === 0) return new Set<string>();
      const { data } = await (supabase as any)
        .from("video_package_items")
        .select("content_id")
        .in("content_id", vpIds);
      return new Set<string>((data || []).map((r: any) => r.content_id));
    },
    enabled: contents.length > 0,
    staleTime: 60_000,
  });

  // Hide multilingual content rows that have no uploaded material from the curriculum list.
  const visibleContents = contents.filter((c: any) => hasUploadedContent(c, mediaPackageContentIds, videoPackageContentIds));

  const { data: commentCount = 0 } = useQuery({
    queryKey: ["course-comments-count", courseId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("course_comments" as any)
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId!)
        .or("is_deleted.is.null,is_deleted.eq.false");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!courseId,
    staleTime: 30_000,
  });

  // Realtime 동기화: 새 댓글/삭제 시 카운트 즉시 갱신
  useEffect(() => {
    if (!courseId) return;
    const uid = `${courseId}-count-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(`comments-count-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "course_comments", filter: `course_id=eq.${courseId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["course-comments-count", courseId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId]);

  const { data: contentI18nData = [] } = useQuery({
    queryKey: ["content-i18n", courseId],
    queryFn: async () => {
      const contentIds = contents.map(c => c.id);
      if (contentIds.length === 0) return [];
      const { data } = await supabase.from("course_content_i18n").select("*").in("content_id", contentIds);
      return data || [];
    },
    enabled: contents.length > 0,
  });

  const { data: progressData = [] } = useQuery({
    queryKey: ["content-progress", courseId, user?.id],
    queryFn: async () => {
      const contentIds = contents.map((c) => c.id);
      if (contentIds.length === 0) return [];
      const { data, error } = await supabase.from("content_progress").select("*").eq("user_id", user!.id).in("content_id", contentIds);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && contents.length > 0,
  });

  // course_contents 행 자체가 언어별로 분리되어 있으므로(language_code 컬럼) 항상 행의 원본 값을 사용.
  // course_content_i18n 은 레거시/placeholder 데이터가 섞여 있어 신뢰하지 않는다 (행의 값이 비어 있을 때만 보조 fallback).
  // 헬퍼는 src/lib/courseContentI18n.ts 에 단일 소스로 모여 있으며 회귀 테스트로 보호됨.
  const getTitle = (c: any) => getContentTitle(c, contentI18nData);
  const getDescription = (c: any) => getContentDescription(c, contentI18nData);
  const getVideoUrl = (c: any) => getContentVideoUrl(c, contentI18nData);
  const getVideoProvider = (c: any) => getContentVideoProvider(c, contentI18nData);
  const getCourseTitle = () =>
    isLocalized
      ? getCourseTitleByLangWithContentFallback(course, courseI18n, contents as any, contentI18nData, lang)
      : course?.title || "";


  const isMangoboard = (url: string | null) => url?.includes("mangoboard.net") ?? false;
  const isCardContent = (desc: string | null) => desc?.startsWith("[card-content]") ?? false;
  
  const getCardUrls = (desc: string | null, fallbackUrl: string | null): string[] => {
    if (!desc?.startsWith("[card-content]")) return fallbackUrl ? [fallbackUrl] : [];
    const payload = desc.replace("[card-content]", "");
    try {
      const parsed = JSON.parse(payload);
      if (parsed.urls && parsed.urls.length > 0) return parsed.urls;
    } catch { /* old format */ }
    return fallbackUrl ? [fallbackUrl] : [];
  };

  const [cardIndex, setCardIndex] = useState(0);
  const [kollusEmbedUrl, setKollusEmbedUrl] = useState<string | null>(null);
  const [bunnyEmbedUrl, setBunnyEmbedUrl] = useState<string | null>(null);
  const [kollusLoading, setKollusLoading] = useState(false);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const resumePromptedRef = useRef<string | null>(null);

  const currentContent = contents.find((c) => c.id === contentId);

  // Log content access for traffic monitoring
  useEffect(() => {
    if (user?.id && contentId && courseId && currentContent) {
      logContentAccess(
        user.id, contentId, courseId,
        currentContent.content_type || "video",
        currentContent.video_provider,
        profile?.tenant_id,
      );
    }
  }, [contentId, user?.id, courseId, currentContent]);
  const currentIndex = visibleContents.findIndex((c) => c.id === contentId);
  const prevContent = currentIndex > 0 ? visibleContents[currentIndex - 1] : null;
  const nextContent = currentIndex >= 0 && currentIndex < visibleContents.length - 1 ? visibleContents[currentIndex + 1] : null;
  const progressMap = new Map(progressData.map((p) => [p.content_id, p]));
  const currentProgress = progressMap.get(contentId || "");
  // 차시들은 동일 콘텐츠의 다국어 버전이므로, 어느 한 차시라도 완료되면 강의가 완료로 처리된다.
  const _courseCompletion = computeCourseProgress(contents as any, progressData as any);
  const completedCount = _courseCompletion.isCompleted ? 1 : 0;
  const overallProgress = _courseCompletion.percentage;

  const localVideoUrlForHook = currentContent ? getVideoUrl(currentContent) : null;
  const localProviderForHook = currentContent ? getVideoProvider(currentContent) : null;
  const youtubeVideoId = getYouTubeVideoId(localVideoUrlForHook);
  const vimeoVideoId = getVimeoVideoId(localVideoUrlForHook);

  const isYouTube = (url: string | null, provider: string | null) =>
    provider === "youtube" || url?.includes("youtube.com") || url?.includes("youtu.be");
  const isVimeo = (url: string | null, provider: string | null) =>
    provider === "vimeo" || url?.includes("vimeo.com");
  const isTrackableVideo = !!(
    currentContent &&
    localVideoUrlForHook &&
    !isMangoboard(localVideoUrlForHook) &&
    ((isYouTube(localVideoUrlForHook, localProviderForHook) && youtubeVideoId) ||
      (isVimeo(localVideoUrlForHook, localProviderForHook) && vimeoVideoId))
  );

  const videoProgress = useVideoProgress({
    userId: user?.id,
    contentId,
    courseId,
    durationMinutes: currentContent?.duration_minutes ?? undefined,
    existingProgress: currentProgress,
    enabled: isTrackableVideo,
  });

  const videoIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (videoProgress.autoCompleted) {
      toast({ title: t("contentPlayer.autoCompleted"), description: t("contentPlayer.autoCompletedDesc") });
      queryClient.invalidateQueries({ queryKey: ["content-progress", courseId] });
    }
  }, [videoProgress.autoCompleted]);

  // 이어보기 다이얼로그: 플레이어 준비되고 저장된 위치가 있으면 한 번 표시
  useEffect(() => {
    if (!contentId) return;
    if (!videoProgress.playerReady) return;
    if (resumePromptedRef.current === contentId) return;
    if (videoProgress.resumePosition > 0 && !currentProgress?.completed) {
      resumePromptedRef.current = contentId;
      setResumeDialogOpen(true);
    }
  }, [videoProgress.playerReady, videoProgress.resumePosition, currentProgress?.completed, contentId]);

  // 콘텐츠 변경 시 다이얼로그 상태 리셋
  useEffect(() => {
    setResumeDialogOpen(false);
  }, [contentId]);


  const videoIframeCallback = useCallback(
    (el: HTMLElement | null) => {
      if (!el || !currentContent || !isTrackableVideo) return;
      videoIframeRef.current = el as HTMLIFrameElement;

      if (youtubeVideoId) {
        videoProgress.initYouTube(el, youtubeVideoId);
      } else if (vimeoVideoId) {
        videoProgress.initVimeo(el as HTMLIFrameElement);
      }
    },
    [
      currentContent?.id,
      isTrackableVideo,
      youtubeVideoId,
      vimeoVideoId,
      videoProgress.initYouTube,
      videoProgress.initVimeo,
    ]
  );

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [contentId]);

  useEffect(() => {
    setMangoElapsed(0);
    setCardIndex(0);
  }, [contentId]);

  // Mangoboard timer
  useEffect(() => {
    if (mangoPopupOpen && currentContent && isMangoboard(getVideoUrl(currentContent))) {
      setMangoElapsed(0);
      mangoTimerRef.current = setInterval(() => setMangoElapsed((prev) => prev + 1), 1000);
    } else {
      if (mangoTimerRef.current) { clearInterval(mangoTimerRef.current); mangoTimerRef.current = null; }
    }
    return () => { if (mangoTimerRef.current) clearInterval(mangoTimerRef.current); };
  }, [mangoPopupOpen, currentContent?.id]);

  const requiredSeconds = (currentContent?.duration_minutes || 5) * 60 * 0.8;
  const mangoAutoCompleted = mangoElapsed >= requiredSeconds;

  useEffect(() => {
    if (mangoAutoCompleted && !currentProgress?.completed && mangoPopupOpen) {
      markCompleteMutation.mutate();
    }
  }, [mangoAutoCompleted]);

  const markCompleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("content_progress").upsert(
        {
          user_id: user!.id,
          content_id: contentId!,
          completed: true,
          completed_at: new Date().toISOString(),
          progress_percentage: 100,
          last_accessed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,content_id" }
      );
      if (error) throw error;
      // 차시 = 동일 콘텐츠의 다국어 버전. 한 차시 완료 시 강의 전체를 완료 처리.
      if (user?.id && courseId) {
        await syncEnrollmentOnContentCompleted({ userId: user.id, courseId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-progress", courseId] });
      queryClient.invalidateQueries({ queryKey: ["enrollment", courseId] });
      queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      toast({ title: t("course.completed"), description: t("course.learningComplete") });
    },
  });

  // Persist partial (per-item) progress for video/media packages so the
  // course-level progress bar reflects intermediate completion. Skips writes
  // once content is already fully completed in DB.
  const partialProgressInFlight = useRef(false);
  const lastSavedPctRef = useRef<number>(-1);
  const handlePartialProgress = useCallback(
    async (completedCount: number, totalCount: number) => {
      if (!user?.id || !contentId || !totalCount) return;
      if (currentProgress?.completed) return;
      const pct = Math.max(0, Math.min(99, Math.round((completedCount / totalCount) * 100)));
      if (pct <= 0) return;
      if (pct === lastSavedPctRef.current) return;
      if (partialProgressInFlight.current) return;
      partialProgressInFlight.current = true;
      try {
        // Don't downgrade existing percentage or completed rows.
        const existingPct = Number(currentProgress?.progress_percentage) || 0;
        if (currentProgress?.completed || pct <= existingPct) {
          lastSavedPctRef.current = pct;
          return;
        }
        const { error } = await supabase.from("content_progress").upsert(
          {
            user_id: user.id,
            content_id: contentId,
            completed: false,
            progress_percentage: pct,
            last_accessed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,content_id", ignoreDuplicates: true }
        );
        if (error) throw error;
        lastSavedPctRef.current = pct;
        if (courseId) {
          await syncEnrollmentPartialProgress({ userId: user.id, courseId });
        }
        queryClient.invalidateQueries({ queryKey: ["content-progress", courseId] });
        queryClient.invalidateQueries({ queryKey: ["enrollment", courseId] });
        queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      } finally {
        partialProgressInFlight.current = false;
      }
    },
    [user?.id, contentId, courseId, currentProgress?.id, currentProgress?.completed, currentProgress?.progress_percentage, queryClient]
  );


  const normalizeMangoboardUrl = (url: string) => {
    let normalized = url.trim();
    if (!normalized.startsWith("http")) normalized = "https://" + normalized;
    return normalized;
  };

  const isKollus = (provider: string | null) => provider === "kollus";

  // Fetch Kollus embed URL when content changes
  useEffect(() => {
    if (!currentContent || !user?.id) return;
    const provider = getVideoProvider(currentContent);
    const videoUrl = getVideoUrl(currentContent);
    if (!isKollus(provider) || !videoUrl) {
      setKollusEmbedUrl(null);
      return;
    }
    let cancelled = false;
    setKollusLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("kollus-token", {
          body: { media_content_key: videoUrl },
        });
        if (!cancelled && !error && data?.embed_url) {
          setKollusEmbedUrl(data.embed_url);
        }
      } catch (e) {
        console.error("Kollus token error:", e);
      } finally {
        if (!cancelled) setKollusLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentContent?.id, user?.id]);

  useEffect(() => {
    if (!currentContent) return;
    const provider = getVideoProvider(currentContent);
    const videoUrl = getVideoUrl(currentContent);
    if (!isBunnyVideo(videoUrl, provider)) {
      setBunnyEmbedUrl(null);
      return;
    }
    const videoId = getBunnyVideoId(videoUrl);
    if (!videoId) {
      setBunnyEmbedUrl(null);
      return;
    }
    let cancelled = false;
    setBunnyEmbedUrl(null);
    (async () => {
      const { data, error } = await supabase.functions.invoke("bunny-resolve-video", {
        body: { videoId, url: videoUrl },
      });
      if (cancelled) return;
      if (!error && (data?.embedUrl || data?.playUrl)) {
        const resolvedUrl = toBunnyEmbedUrl(data.embedUrl || data.playUrl);
        const sep = resolvedUrl.includes("?") ? "&" : "?";
        setBunnyEmbedUrl(`${resolvedUrl}${sep}autoplay=false&muted=false&preload=true&responsive=true&playsinline=true&disableIosPlayer=true`);
      }
    })();
    return () => { cancelled = true; };
  }, [currentContent?.id]);

  const getVideoEmbed = (url: string | null, provider: string | null) => {
    if (!url) return null;
    if (isMangoboard(url)) return normalizeMangoboardUrl(url);
    if (isKollus(provider)) return kollusEmbedUrl;
    if (isBunnyVideo(url, provider)) return bunnyEmbedUrl;

    const resolvedYouTubeId = getYouTubeVideoId(url);
    if ((provider === "youtube" || url.includes("youtube.com") || url.includes("youtu.be")) && resolvedYouTubeId) {
      const params = new URLSearchParams({
        enablejsapi: "1",
        rel: "0",
        modestbranding: "1",
      });
      return `https://www.youtube.com/embed/${resolvedYouTubeId}?${params.toString()}`;
    }

    const resolvedVimeoId = getVimeoVideoId(url);
    if ((provider === "vimeo" || url.includes("vimeo.com")) && resolvedVimeoId) {
      return `https://player.vimeo.com/video/${resolvedVimeoId}`;
    }

    return url;
  };

  const handleClose = () => {
    navigate(`${routePrefix}/courses/${courseId}?view=learn`);
  };

  if (!currentContent) {
    // 콘텐츠 목록을 아직 불러오는 중이면 "찾을 수 없음" 대신 로딩 UI를 표시한다.
    if (contentsLoading || contentsFetching || contents.length === 0) {
      return (
        <div className="fixed inset-0 z-[60] bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            <p className="text-sm">{t("common.loading", "불러오는 중...")}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-[60] bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{t("course.contentNotFound")}</p>
          <Button variant="outline" onClick={handleClose}>{t("course.backToCourse")}</Button>
        </div>
      </div>
    );
  }

  const localTitle = getTitle(currentContent);
  const localDesc = getDescription(currentContent);
  const localVideoUrl = getVideoUrl(currentContent);
  const localProvider = getVideoProvider(currentContent);
  const embedUrl = getVideoEmbed(localVideoUrl, localProvider);

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      {/* Top header */}
      <header className="flex items-center gap-3 px-4 lg:px-6 h-14 border-b border-border bg-background shrink-0">
        <button
          onClick={handleClose}
          className="p-2 -ml-2 rounded-lg hover:bg-accent text-foreground transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
          aria-label={t("common.close", "닫기")}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <Badge
          variant="secondary"
          className="text-sm font-semibold px-3 py-1 rounded-full truncate flex-1 min-w-0 block"
        >
          {getCourseTitle()}
        </Badge>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            onClick={() => {
              if (isLgUp) setSidebarOpen((v) => !v);
              else setMobileCurriculumOpen(true);
            }}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
            aria-label={t("course.learningProgress", "학습 진행률")}
          >
            <List className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="w-full mx-auto px-4 pt-4 pb-6 lg:max-w-5xl lg:px-8 lg:py-8">
            {/* Media area */}
            <div className="bg-background overflow-hidden mb-6 relative rounded-2xl">
              {currentContent.content_type === "video_package" ? (
                <VideoPackagePlayer
                  contentId={currentContent.id}
                  title={getTitle(currentContent)}
                  isAlreadyCompleted={!!currentProgress?.completed}
                  savedProgressPercentage={Number(currentProgress?.progress_percentage) || 0}
                  onPartialProgress={handlePartialProgress}
                  onComplete={() => {
                    if (user && !currentProgress?.completed && !markCompleteMutation.isPending) {
                      markCompleteMutation.mutate();
                    }
                  }}
                />
              ) : currentContent.content_type === "media_package" ? (
                <MediaPackagePlayer
                  contentId={currentContent.id}
                  onPartialProgress={handlePartialProgress}
                  onComplete={() => {
                    if (user && !currentProgress?.completed && !markCompleteMutation.isPending) {
                      markCompleteMutation.mutate();
                    }
                  }}
                />
              ) : isCardContent(currentContent.description) ? (() => {
                const urls = getCardUrls(currentContent.description, localVideoUrl);
                const totalCards = urls.length;
                const currentUrl = urls[cardIndex] || urls[0] || "";
                const isImage = currentUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i);
                return (
                  <div className="flex flex-col items-center py-6 space-y-4">
                    <div className="relative w-72 sm:w-80">
                      <div className="rounded-2xl overflow-hidden border border-border shadow-lg" style={{ aspectRatio: "9/16" }}>
                        {isImage ? (
                          <img src={currentUrl} alt={`${localTitle} - ${cardIndex + 1}/${totalCards}`} className="w-full h-full object-cover" />
                        ) : currentUrl ? (
                          <iframe src={currentUrl} className="w-full h-full" title={`${localTitle} - ${cardIndex + 1}`} allowFullScreen />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">카드 없음</div>
                        )}
                      </div>
                      {totalCards > 1 && (
                        <>
                          <button onClick={() => setCardIndex(Math.max(0, cardIndex - 1))} disabled={cardIndex === 0} className="absolute left-[-40px] top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 border border-border shadow flex items-center justify-center disabled:opacity-30 hover:bg-background transition-colors">
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button onClick={() => setCardIndex(Math.min(totalCards - 1, cardIndex + 1))} disabled={cardIndex === totalCards - 1} className="absolute right-[-40px] top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 border border-border shadow flex items-center justify-center disabled:opacity-30 hover:bg-background transition-colors">
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </div>
                    {totalCards > 1 && (
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                          {urls.map((_, i) => (
                            <button key={i} onClick={() => setCardIndex(i)} className={`h-2 rounded-full transition-all ${i === cardIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"}`} />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">{cardIndex + 1} / {totalCards}</span>
                      </div>
                    )}
                  </div>
                );
              })() : isMangoboard(localVideoUrl) && embedUrl ? (
                <button onClick={() => setMangoPopupOpen(true)} className="relative aspect-video w-full flex items-center justify-center group cursor-pointer bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
                  <div className="text-center space-y-4">
                    <div className="h-20 w-20 rounded-full bg-primary/90 group-hover:bg-primary mx-auto flex items-center justify-center transition-all group-hover:scale-110 shadow-lg">
                      <Play className="h-8 w-8 text-primary-foreground ml-1" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">{t("course.startLearning")}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t("course.clickToLearn")}</p>
                    </div>
                  </div>
                </button>
              ) : currentContent.content_type === "video" && embedUrl ? (
                <div className="relative">
                  <div className="aspect-video w-full">
                    <iframe key={`video-${contentId}`} ref={isTrackableVideo ? videoIframeCallback : undefined} id={`video-player-${contentId}`} src={embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms" title={localTitle} />
                  </div>
                  {isTrackableVideo && (
                    <div className="px-4 py-2.5 bg-secondary/60 flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground shrink-0">{t("contentPlayer.watchProgress")}</span>
                      <Progress value={videoProgress.duration > 0 ? (videoProgress.currentTime / videoProgress.duration) * 100 : (currentProgress?.progress_percentage || 0)} className="h-1.5 flex-1" />
                      <span className="text-muted-foreground font-medium shrink-0">
                        {videoProgress.duration > 0 ? `${formatTime(videoProgress.currentTime)} / ${formatTime(videoProgress.duration)}` : `${Math.round(currentProgress?.progress_percentage || 0)}%`}
                      </span>
                      {videoProgress.resumePosition > 0 && !currentProgress?.completed && (
                        <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                          <RotateCcw className="h-3 w-3" />
                          {t("contentPlayer.resumeFrom", { time: formatTime(videoProgress.resumePosition) })}
                        </Badge>
                      )}
                      {!currentProgress?.completed && (
                        <span className="text-[10px] text-muted-foreground/70 shrink-0">{t("contentPlayer.autoCompleteAt80")}</span>
                      )}
                    </div>
                  )}
                </div>
              ) : currentContent.content_type === "video" && localVideoUrl ? (
                <div className="aspect-video w-full flex items-center justify-center">
                  <a href={localVideoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-base text-muted-foreground hover:text-foreground transition-colors">
                    <ExternalLink className="h-5 w-5" /> {t("course.openExternal")}
                  </a>
                </div>
              ) : (
                <div className="aspect-video w-full flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="h-16 w-16 rounded-2xl bg-accent mx-auto flex items-center justify-center">
                      {currentContent.content_type === "document" ? <FileText className="h-7 w-7 text-accent-foreground" /> : <Play className="h-7 w-7 text-accent-foreground" />}
                    </div>
                    <p className="text-base text-muted-foreground">{t("course.flip")}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Info area */}
            <div className="px-4 lg:px-0 py-1 lg:py-0 space-y-3">

            </div>

            <div className="space-y-6 mt-6">
              {/* Comment trigger button (all viewports) */}
              {courseId && (
                <button
                  type="button"
                  onClick={() => setCommentsOpen(true)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      {t("comments.title", "댓글")}
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground">
                      {commentCount}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("comments.viewAll", "모두 보기")}
                  </span>
                </button>
              )}

            </div>
          </div>
        </div>

        {/* Right sidebar - curriculum panel */}
        <aside className={`hidden lg:flex flex-col border-l border-border bg-card transition-all duration-300 ${sidebarOpen ? "w-96 mr-4" : "w-0 overflow-hidden"}`}>
          {sidebarOpen && (
            <>
              <div className="p-4 border-b border-border flex items-center justify-end">
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground" title={t("common.collapse", "접기")}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-2 space-y-1">
                {visibleContents.map((c, idx) => {
                  const isActive = c.id === contentId;
                  const isCompleted = progressMap.get(c.id)?.completed;
                  const langCode = (c as any).language_code || "";
                  const langLabel = langCode === "ko" ? "KO" : langCode === "en" ? "EN" : langCode === "ja" ? "JA" : langCode.startsWith("zh") ? "ZH" : (langCode ? langCode.toUpperCase() : "");
                  const langStyleMap: Record<string, string> = {
                    KO: "bg-foreground text-background",
                    EN: "bg-blue-600 text-white dark:bg-blue-500",
                    JA: "bg-rose-600 text-white dark:bg-rose-500",
                    ZH: "bg-amber-600 text-white dark:bg-amber-500",
                  };
                  const langClass = langStyleMap[langLabel] || "bg-muted text-muted-foreground";
                  // 다국어 차시: 뱃지 텍스트도 각 차시의 언어 코드에 맞춰 번역
                  const itemLang = normalizeLang(langCode || i18n.language);
                  const tItem = i18n.getFixedT(itemLang);
                  return (
                    <button
                      key={c.id}
                      ref={isActive ? activeItemRef : undefined}
                      onClick={() => navigate(`${routePrefix}/courses/${courseId}/content/${c.id}`)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm transition-all ${isActive ? "bg-primary/10 text-primary font-semibold ring-1 ring-primary/20" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}
                    >
                      {langLabel ? (
                        <span className={`relative h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-[9px] font-bold tracking-wider shadow-sm ${langClass}`}>
                          {langLabel}
                          {isCompleted && (
                            <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-green-500 text-white flex items-center justify-center ring-2 ring-card">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </span>
                      ) : (
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-medium ${isCompleted ? "bg-green-500 text-white" : isActive ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                          {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                        </div>
                      )}
                      <span className="truncate flex-1">{localizeLessonPrefix(getTitle(c), itemLang, idx)}</span>
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-green-500 text-white px-2.5 py-0.5 text-[10px] font-semibold shadow-sm">
                          <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                          Completed
                        </span>
                      ) : isActive ? (
                        <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-orange-500 text-white px-2.5 py-0.5 text-[10px] font-semibold shadow-sm">
                          <Play className="h-2.5 w-2.5" aria-hidden="true" />
                          Now Playing
                        </span>
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </aside>

        {/* Sidebar toggle when closed */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="hidden lg:flex items-center justify-center absolute right-0 top-20 z-30 h-10 w-6 bg-card hover:bg-accent border border-border border-r-0 rounded-l-md text-muted-foreground hover:text-foreground transition-colors"
            title={t("course.learningProgress")}
            aria-label={t("course.learningProgress")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 이어보기 다이얼로그 */}
      {resumeDialogOpen && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4 animate-in fade-in-0">
          <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("contentPlayer.resumeDialogTitle", "이어보시겠어요?")}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {t("contentPlayer.resumeDialogDesc", {
                time: formatTime(videoProgress.resumePosition),
                defaultValue: "이전에 {{time}} 지점까지 학습한 기록이 있어요. 이어서 보시겠어요, 처음부터 다시 시작하시겠어요?",
              })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={async () => {
                  await videoProgress.seekTo(0);
                  setResumeDialogOpen(false);
                }}
              >
                {t("contentPlayer.fromBeginning", "처음부터")}
              </Button>
              <Button
                className="rounded-full"
                onClick={async () => {
                  await videoProgress.seekTo(videoProgress.resumePosition);
                  setResumeDialogOpen(false);
                }}
              >
                {t("contentPlayer.resumePlayback", "이어보기")}
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* Mangoboard Popup */}
      {mangoPopupOpen && currentContent && isMangoboard(localVideoUrl) && embedUrl && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center">
          <button onClick={() => setMangoPopupOpen(false)} className="absolute top-4 right-4 z-[110] p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
          <div className="absolute top-4 left-4 right-16 z-[110]">
            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2.5">
              <Clock className="h-4 w-4 text-white/70 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between text-[11px] text-white/80 mb-1">
                  <span>{t("contentPlayer.learningTime")}</span>
                  <span>
                    {Math.floor(mangoElapsed / 60)}:{String(mangoElapsed % 60).padStart(2, "0")}
                    {" / "}
                    {Math.floor(requiredSeconds / 60)}:{String(Math.round(requiredSeconds % 60)).padStart(2, "0")}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${mangoAutoCompleted ? "bg-green-400" : "bg-white/70"}`} style={{ width: `${Math.min((mangoElapsed / requiredSeconds) * 100, 100)}%` }} />
                </div>
              </div>
              {mangoAutoCompleted && <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />}
            </div>
          </div>
          <div className="w-[95vw] h-[calc(95vh-60px)] sm:h-[95vh] sm:w-auto" style={{ aspectRatio: window.innerWidth < 640 ? undefined : "9/16", maxWidth: "95vw" }}>
            <iframe
              src={embedUrl}
              className="w-full h-full border-0 rounded-lg"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation"
              referrerPolicy="no-referrer-when-downgrade"
              title={localTitle}
              style={{ WebkitOverflowScrolling: 'touch' }}
            />
          </div>
        </div>
      )}
      {/* Mobile curriculum drawer */}
      <Drawer open={mobileCurriculumOpen} onOpenChange={setMobileCurriculumOpen} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[80vh] z-[110]">
          <DrawerHeader className="pb-2">
            <div className="flex items-center justify-center gap-2">
              <DrawerTitle className="text-base">{t("course.learningProgress")}</DrawerTitle>
              {_courseCompletion.isCompleted ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                  <CheckCircle2 className="h-3 w-3" />
                  {t("course.completed")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {t("course.inProgress")}
                </span>
              )}
            </div>
          </DrawerHeader>

          <ScrollArea className="flex-1 px-4 pb-4 max-h-[55vh]">
            <div className="space-y-1">
              {visibleContents.map((c, idx) => {
                const isActive = c.id === contentId;
                const isCompleted = progressMap.get(c.id)?.completed;
                const langCode = (c as any).language_code || "";
                const langLabel = langCode === "ko" ? "KO" : langCode === "en" ? "EN" : langCode === "ja" ? "JA" : langCode.startsWith("zh") ? "ZH" : (langCode ? langCode.toUpperCase() : "");
                const langStyleMap: Record<string, string> = {
                  KO: "bg-foreground text-background",
                  EN: "bg-blue-600 text-white dark:bg-blue-500",
                  JA: "bg-rose-600 text-white dark:bg-rose-500",
                  ZH: "bg-amber-600 text-white dark:bg-amber-500",
                };
                const langClass = langStyleMap[langLabel] || "bg-muted text-muted-foreground";
                const itemLang = normalizeLang(langCode || i18n.language);
                const tItem = i18n.getFixedT(itemLang);
                return (
                  <button
                    key={c.id}
                    onClick={() => { setMobileCurriculumOpen(false); navigate(`${routePrefix}/courses/${courseId}/content/${c.id}`); }}
                    className={`w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 text-sm transition-all ${isActive ? "bg-primary/10 text-primary font-semibold ring-1 ring-primary/20" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}
                  >
                    {langLabel ? (
                      <span className={`relative h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-[10px] font-bold tracking-wider shadow-sm ${langClass}`}>
                        {langLabel}
                        {isCompleted && (
                          <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-green-500 text-white flex items-center justify-center ring-2 ring-background">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </span>
                    ) : (
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${isCompleted ? "bg-green-500 text-white" : isActive ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                      </div>
                    )}
                    <span className="truncate flex-1">{localizeLessonPrefix(getTitle(c), itemLang, idx)}</span>
                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-green-500 text-white px-2.5 py-0.5 text-[10px] font-semibold shadow-sm">
                        <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                        Completed
                      </span>
                    ) : isActive ? (
                      <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-orange-500 text-white px-2.5 py-0.5 text-[10px] font-semibold shadow-sm">
                        <Play className="h-2.5 w-2.5" aria-hidden="true" />
                        Now Playing
                      </span>
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Comments overlay: Sheet on desktop, Drawer on mobile */}
      {courseId && isLgUp ? (
        <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col z-[120] rounded-l-2xl overflow-hidden [&>button]:z-10"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t("comments.title", "댓글")}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 flex flex-col rounded-l-2xl overflow-hidden">
              <CourseComments courseId={courseId} />
            </div>
          </SheetContent>
        </Sheet>
      ) : courseId && commentsOpen ? (
        <div
          className="fixed inset-x-2 bottom-2 z-[100] flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
          style={{ top: "calc(3.5rem + 42.1875vw)" }}
        >
          <button
            type="button"
            aria-label={t("common.close", "닫기")}
            onClick={() => setCommentsOpen(false)}
            className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1 min-h-0 flex flex-col">
            <CourseComments courseId={courseId} />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ContentPlayer;
