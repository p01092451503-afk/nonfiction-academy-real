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
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { logContentAccess } from "@/hooks/useTrafficLogger";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import MediaPackagePlayer from "@/components/MediaPackagePlayer";
import CourseComments from "@/components/CourseComments";
import { computeCourseProgress, syncEnrollmentOnContentCompleted } from "@/lib/courseCompletion";

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
  const isEn = i18n.language?.startsWith("en");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mangoPopupOpen, setMangoPopupOpen] = useState(false);
  const [mangoElapsed, setMangoElapsed] = useState(0);
  const mangoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mobileCurriculumOpen, setMobileCurriculumOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
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

  const { data: contents = [] } = useQuery({
    queryKey: ["course-contents", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_contents").select("*").eq("course_id", courseId!).order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const { data: commentCount = 0 } = useQuery({
    queryKey: ["course-comments-count", courseId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("course_comments" as any)
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId!)
        .eq("is_deleted", false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!courseId,
    staleTime: 30_000,
  });

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

  const getI18n = (cId: string) => contentI18nData.find((i: any) => i.content_id === cId && i.language_code === "en");
  const stripLessonPrefix = (title: string) =>
    (title || "")
      .replace(/^\d+차시\.\s*/, "")
      .replace(/^Lesson\s*\d+[\.:]?\s*/i, "")
      .replace(/^第\s*\d+\s*课[\.:：]?\s*/, "")
      .replace(/^レッスン\s*\d+[\.:：]?\s*/, "")
      .replace(/^第\s*\d+\s*回[\.:：]?\s*/, "");
  const getTitle = (c: any) => { if (isEn) { const en = getI18n(c.id); return stripLessonPrefix(en?.title || c.title); } return stripLessonPrefix(c.title); };
  const getDescription = (c: any) => { if (isEn) { const en = getI18n(c.id); return en?.description || c.description; } return c.description; };
  const getVideoUrl = (c: any) => { if (isEn) { const en = getI18n(c.id); return en?.video_url || c.video_url; } return c.video_url; };
  const getVideoProvider = (c: any) => { if (isEn) { const en = getI18n(c.id); return en?.video_provider || c.video_provider; } return c.video_provider; };
  const getCourseTitle = () => { if (isEn) { const en = courseI18n?.find((i: any) => i.language_code === "en"); return en?.title || course?.title || ""; } return course?.title || ""; };

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
  const [kollusLoading, setKollusLoading] = useState(false);

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
  const currentIndex = contents.findIndex((c) => c.id === contentId);
  const prevContent = currentIndex > 0 ? contents[currentIndex - 1] : null;
  const nextContent = currentIndex < contents.length - 1 ? contents[currentIndex + 1] : null;
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
      const existing = currentProgress;
      if (existing) {
        const { error } = await supabase.from("content_progress").update({ completed: true, completed_at: new Date().toISOString(), progress_percentage: 100 }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("content_progress").insert({ user_id: user!.id, content_id: contentId!, completed: true, completed_at: new Date().toISOString(), progress_percentage: 100 });
        if (error) throw error;
      }
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

  const getVideoEmbed = (url: string | null, provider: string | null) => {
    if (!url) return null;
    if (isMangoboard(url)) return normalizeMangoboardUrl(url);
    if (isKollus(provider)) return kollusEmbedUrl;

    const resolvedYouTubeId = getYouTubeVideoId(url);
    if ((provider === "youtube" || url.includes("youtube.com") || url.includes("youtu.be")) && resolvedYouTubeId) {
      const params = new URLSearchParams({
        enablejsapi: "1",
        rel: "0",
        modestbranding: "1",
        ...(videoProgress.resumePosition > 0 && !currentProgress?.completed ? { start: String(videoProgress.resumePosition) } : {}),
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
      <header className="flex items-center gap-3 sm:gap-4 px-4 lg:px-6 h-14 border-b border-border bg-background shrink-0">
        <button onClick={handleClose} className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors" title={t("common.close")}>
          <X className="h-5 w-5" />
        </button>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <Badge variant="secondary" className="text-sm font-bold px-3 py-1 truncate max-w-[40%] sm:max-w-[50%]">
          {getCourseTitle()}
        </Badge>
        <div className="flex items-center gap-3 ml-auto shrink-0">
          <button onClick={() => setMobileCurriculumOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors" title={t("course.learningProgress")}>
            <List className="h-5 w-5" />
          </button>
          {_courseCompletion.isCompleted ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("course.completed")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {t("course.inProgress")}
            </span>
          )}
        </div>
      </header>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 pt-0 pb-6 lg:px-8 lg:py-8">
            {/* Media area */}
            <div className="bg-background lg:bg-foreground/5 rounded-none lg:rounded-2xl overflow-hidden mb-0 lg:mb-6 relative -mx-4 lg:mx-0">
              {currentContent.content_type === "media_package" ? (
                <div className="p-4">
                  <MediaPackagePlayer contentId={currentContent.id} />
                </div>
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
                    <iframe key={`video-${contentId}`} ref={isTrackableVideo ? videoIframeCallback : undefined} id={`video-player-${contentId}`} src={embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowFullScreen referrerPolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms" title={localTitle} />
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
                    <p className="text-base text-muted-foreground">{contentTypeLabel[currentContent.content_type || "video"]}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Info row */}
            <div className="flex items-center gap-3 flex-wrap px-4 lg:px-0 py-3 lg:py-0">
                {(() => {
                  const url = localVideoUrl;
                  const provider = currentContent.video_provider;
                  let sourceLabel = "";
                  let sourceColor = "";
                  if (isMangoboard(url)) { sourceLabel = "Mangoboard"; sourceColor = "bg-blue-500 text-white"; }
                  else if (provider === "youtube" || url?.includes("youtube.com") || url?.includes("youtu.be")) { sourceLabel = "YouTube"; sourceColor = "bg-rose-500 text-white"; }
                  else if (provider === "vimeo" || url?.includes("vimeo.com")) { sourceLabel = "Vimeo"; sourceColor = "bg-sky-500 text-white"; }
                  else if (provider === "upload") { sourceLabel = "CDN"; sourceColor = "bg-emerald-500 text-white"; }
                  else if (provider === "custom" && !isMangoboard(url)) { sourceLabel = t("createCourse.customInput"); sourceColor = "bg-amber-500 text-white"; }
                  return sourceLabel ? (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md shrink-0 ${sourceColor}`}>{sourceLabel}</span>
                  ) : null;
                })()}
                <h2 className="text-lg font-bold text-foreground tracking-tight border-b-2 border-foreground/80 pb-0.5 shrink-0">
                  {localTitle}
                </h2>
                <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 rounded-lg uppercase tracking-wider shrink-0">
                  {contentTypeLabel[currentContent.content_type || "video"]}
                </Badge>
                {currentContent.duration_minutes && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="font-medium">{currentContent.duration_minutes}{t("common.minutes")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                  {currentProgress?.completed ? (
                    <Badge variant="outline" className="text-xs font-semibold px-3 py-1.5 rounded-xl border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t("course.alreadyCompleted")}
                    </Badge>
                  ) : user ? (
                    <Badge variant="outline" className="text-xs font-semibold px-3 py-1.5 rounded-xl gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {t("course.inProgress")}
                    </Badge>
                  ) : null}
                </div>
            </div>

            <div className="space-y-6 mt-6">
              {/* Mobile: comment trigger button → Drawer */}
              {courseId && (
                <button
                  type="button"
                  onClick={() => setCommentsOpen(true)}
                  className="lg:hidden w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors"
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

              {/* Desktop: inline comments */}
              {courseId && (
                <div className="hidden lg:block">
                  <CourseComments courseId={courseId} />
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div>
                  {prevContent ? (
                    <Button variant="outline" className="rounded-xl gap-2" onClick={() => navigate(`${routePrefix}/courses/${courseId}/content/${prevContent.id}`)}>
                      <ChevronLeft className="h-4 w-4" />
                      <span className="text-sm">{t("common.previous")}</span>
                    </Button>
                  ) : <div />}
                </div>
                <div>
                  {nextContent ? (() => {
                    const isSeq = (course as any)?.is_sequential;
                    const currentDone = currentProgress?.completed;
                    const locked = isSeq && !currentDone && routePrefix === "/student";
                    return (
                      <Button variant="outline" className="rounded-xl gap-2" onClick={() => !locked && navigate(`${routePrefix}/courses/${courseId}/content/${nextContent.id}`)} disabled={locked}>
                        <span className="text-sm">{locked ? t("course.sequentialLockedShort") : t("common.next")}</span>
                        {locked ? <LockIcon className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    );
                  })() : <div />}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar - curriculum panel */}
        <aside className={`hidden lg:flex flex-col border-l border-border bg-card transition-all duration-300 ${sidebarOpen ? "w-96 mr-4" : "w-0 overflow-hidden"}`}>
          {sidebarOpen && (
            <>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t("course.learningProgress")}</h3>
                  <div className="mt-1">
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
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-2 space-y-1">
                {contents.map((c, idx) => {
                  const isActive = c.id === contentId;
                  const isCompleted = progressMap.get(c.id)?.completed;
                  const langCode = (c as any).language_code || "";
                  const langLabel = langCode === "ko" ? "KO" : langCode === "en" ? "EN" : langCode === "ja" ? "JA" : langCode.startsWith("zh") ? "ZH" : (langCode ? langCode.toUpperCase() : "");
                  const langStyleMap: Record<string, string> = {
                    KO: "bg-foreground text-background",
                    EN: "bg-slate-700 text-white dark:bg-slate-600",
                    JA: "bg-rose-600 text-white dark:bg-rose-500",
                    ZH: "bg-amber-600 text-white dark:bg-amber-500",
                  };
                  const langClass = langStyleMap[langLabel] || "bg-muted text-muted-foreground";
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
                      <span className="truncate flex-1">{getTitle(c)}</span>
                      {c.duration_minutes && <span className="text-[10px] text-muted-foreground shrink-0">{c.duration_minutes}{t("common.minutes")}</span>}
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </aside>

        {/* Sidebar toggle when closed */}
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="hidden lg:flex items-center gap-1 absolute right-4 top-20 z-30 px-3 py-2 bg-primary text-primary-foreground border border-border rounded-xl hover:bg-primary/90 transition-colors shadow-sm">
            <List className="h-4 w-4" />
            <span className="text-xs font-medium">{t("course.learningProgress")}</span>
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

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
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
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
            <DrawerTitle className="text-base">{t("course.learningProgress")}</DrawerTitle>
            <div className="mt-1">
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
              {contents.map((c, idx) => {
                const isActive = c.id === contentId;
                const isCompleted = progressMap.get(c.id)?.completed;
                const langCode = (c as any).language_code || "";
                const langLabel = langCode === "ko" ? "KO" : langCode === "en" ? "EN" : langCode === "ja" ? "JA" : langCode.startsWith("zh") ? "ZH" : (langCode ? langCode.toUpperCase() : "");
                const langStyleMap: Record<string, string> = {
                  KO: "bg-foreground text-background",
                  EN: "bg-slate-700 text-white dark:bg-slate-600",
                  JA: "bg-rose-600 text-white dark:bg-rose-500",
                  ZH: "bg-amber-600 text-white dark:bg-amber-500",
                };
                const langClass = langStyleMap[langLabel] || "bg-muted text-muted-foreground";
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
                    <span className="truncate flex-1">{getTitle(c)}</span>
                    {c.duration_minutes && <span className="text-[11px] text-muted-foreground shrink-0">{c.duration_minutes}{t("common.minutes")}</span>}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Comments Drawer (mobile only - Instagram-style bottom sheet) */}
      <Drawer open={commentsOpen} onOpenChange={setCommentsOpen}>
        <DrawerContent className="lg:hidden h-[90vh] p-0 flex flex-col">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{t("comments.title", "댓글")}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {courseId && <CourseComments courseId={courseId} />}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default ContentPlayer;
