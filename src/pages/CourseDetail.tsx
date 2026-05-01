import { useState, useRef, useCallback, useEffect } from "react";
import { translateKoToEn } from "@/lib/translate";
import AssessmentManager from "@/components/AssessmentManager";
import StudentSurvey from "@/components/StudentSurvey";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, Clock, Users, ArrowLeft, CheckCircle2, Lock,
  FileText, Video, ChevronRight, BarChart3, Plus, Pencil,
  Trash2, Eye, EyeOff, Settings, ChevronUp, ChevronDown,
  GripVertical, ExternalLink, Copy, MoreHorizontal,
  ClipboardCheck, AlertTriangle, Upload, X, Image, Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import PageSkeleton from "@/components/PageSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useLanguageSwitching } from "@/hooks/useLanguageSwitching";

const contentTypeIcon: Record<string, React.ElementType> = {
  video: Video, document: FileText, quiz: BarChart3, assignment: FileText, live: Video,
};

type ContentFormData = {
  title: string;
  content_type: string;
  video_url: string;
  video_provider: string;
  duration_minutes: number | null;
  description: string;
  is_preview: boolean;
  is_published: boolean;
};

type ContentI18nData = {
  title: string;
  description: string;
  video_url: string;
  video_provider: string;
  duration_minutes: number | null;
};

const emptyContent: ContentFormData = {
  title: "", content_type: "video", video_url: "", video_provider: "",
  duration_minutes: null, description: "", is_preview: false, is_published: true,
};

const emptyI18n: ContentI18nData = {
  title: "", description: "", video_url: "", video_provider: "", duration_minutes: null,
};

const CourseDetail = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useUser();
  const { primaryRole } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");
  const currentLang: "ko" | "en" | "ja" | "zh-CN" = (() => {
    const l = i18n.language || "ko";
    if (l.startsWith("en")) return "en";
    if (l.startsWith("ja")) return "ja";
    if (l.startsWith("zh")) return "zh-CN";
    return "ko";
  })();

  const isLangSwitching = useLanguageSwitching();

  const [contentDialogOpen, setContentDialogOpen] = useState(false);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [contentForm, setContentForm] = useState<ContentFormData>(emptyContent);
  const [contentEnForm, setContentEnForm] = useState<ContentI18nData>(emptyI18n);
  const [courseEditOpen, setCourseEditOpen] = useState(false);
  const [courseForm, setCourseForm] = useState({
    title: "", description: "", status: "draft", is_mandatory: false, deadline: "",
    category_id: "", difficulty_level: "beginner", estimated_duration_hours: "", max_students: "",
    is_sequential: false,
  });
  const [courseEnForm, setCourseEnForm] = useState({ title: "", description: "" });
  const [courseThumbnailFile, setCourseThumbnailFile] = useState<File | null>(null);
  const [courseThumbnailPreview, setCourseThumbnailPreview] = useState<string | null>(null);

  // Categories query for edit dialog
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").eq("is_active", true).order("display_order");
      return data || [];
    },
  });

  // Determine view context
  const isAdminRoute = location.pathname.startsWith("/admin/courses/");
  const isTeacherRoute = location.pathname.startsWith("/teacher/courses/");
  const forceLearnView = searchParams.get("view") === "learn";
  const role: "admin" | "teacher" | "student" = isAdminRoute
    ? "admin"
    : isTeacherRoute
    ? "teacher"
    : "student";
  const isTeacherOrAdmin = role === "admin" || role === "teacher";
  const routePrefix = isAdminRoute ? "/admin" : isTeacherRoute ? "/teacher" : "/student";
  const viewParam = role === "student" ? "?view=learn" : "";

  // --- Queries ---
  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").eq("id", courseId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const { data: courseI18n, isFetching: courseI18nFetching } = useQuery({
    queryKey: ["course-i18n", courseId, currentLang],
    queryFn: async () => {
      const { data } = await supabase.from("course_i18n").select("*").eq("course_id", courseId!);
      return data || [];
    },
    enabled: !!courseId,
    staleTime: 0,
  });

  const { data: contents = [], isFetching: contentsFetching } = useQuery({
    queryKey: ["course-contents", courseId, currentLang],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_contents").select("*").eq("course_id", courseId!).order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const { data: contentI18nData = [], isFetching: contentI18nFetching } = useQuery({
    queryKey: ["content-i18n", courseId, currentLang, contents.map(c => c.id).join(",")],
    queryFn: async () => {
      const contentIds = contents.map(c => c.id);
      if (contentIds.length === 0) return [];
      const { data } = await supabase.from("course_content_i18n").select("*").in("content_id", contentIds);
      return data || [];
    },
    enabled: contents.length > 0,
    staleTime: 0,
  });

  const { data: enrollment } = useQuery({
    queryKey: ["enrollment", courseId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("enrollments").select("*").eq("course_id", courseId!).eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId && !!user?.id,
  });

  const { data: enrollmentCount = 0 } = useQuery({
    queryKey: ["enrollment-count", courseId],
    queryFn: async () => {
      const { count, error } = await supabase.from("enrollments").select("*", { count: "exact", head: true }).eq("course_id", courseId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!courseId && isTeacherOrAdmin,
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
    enabled: !!user?.id && contents.length > 0 && !isTeacherOrAdmin,
  });

  // Assessments for this course (for inline display in student curriculum)
  const { data: assessments = [] } = useQuery({
    queryKey: ["course-assessments", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessments").select("*").eq("course_id", courseId!).eq("is_published", true).order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const { data: assessmentAttempts = [] } = useQuery({
    queryKey: ["assessment-attempts-all", courseId, user?.id],
    queryFn: async () => {
      const assessmentIds = assessments.map(a => a.id);
      if (assessmentIds.length === 0) return [];
      const { data, error } = await supabase.from("assessment_attempts").select("*").eq("user_id", user!.id).in("assessment_id", assessmentIds).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && assessments.length > 0,
  });

  // i18n helpers
  const getContentI18n = (contentId: string, lang: string) =>
    contentI18nData.find((i: any) => i.content_id === contentId && i.language_code === lang);

  const stripLessonPrefix = (title: string) =>
    title
      .replace(/^\d+차시\.\s*/, "")
      .replace(/^Lesson\s*\d+[\.:]?\s*/i, "")
      .replace(/^第\s*\d+\s*课[\.:：]?\s*/, "")
      .replace(/^レッスン\s*\d+[\.:：]?\s*/, "")
      .replace(/^第\s*\d+\s*回[\.:：]?\s*/, "");

  const getLocalizedContentTitle = (content: any) => {
    if (currentLang === "ko") return stripLessonPrefix(content.title);
    const tr = getContentI18n(content.id, currentLang);
    return stripLessonPrefix(tr?.title || content.title);
  };

  const getCourseTitle = () => {
    if (currentLang === "ko") return course?.title || "";
    const tr = courseI18n?.find((i: any) => i.language_code === currentLang);
    return tr?.title || course?.title || "";
  };

  const getCourseDesc = () => {
    if (currentLang === "ko") return course?.description || "";
    const tr = courseI18n?.find((i: any) => i.language_code === currentLang);
    return tr?.description || course?.description || "";
  };

  // Invalidate language-scoped caches whenever the active language changes,
  // so localized titles/descriptions never display stale data from another language.
  useEffect(() => {
    if (!courseId) return;
    queryClient.invalidateQueries({ queryKey: ["course-i18n", courseId] });
    queryClient.invalidateQueries({ queryKey: ["content-i18n", courseId] });
    queryClient.invalidateQueries({ queryKey: ["course-contents", courseId] });
  }, [currentLang, courseId, queryClient]);

  // --- Mutations ---
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    queryClient.invalidateQueries({ queryKey: ["course-contents", courseId] });
    queryClient.invalidateQueries({ queryKey: ["content-i18n", courseId] });
    queryClient.invalidateQueries({ queryKey: ["course-i18n", courseId] });
  };

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("enrollments").insert({ user_id: user!.id, course_id: courseId! });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollment", courseId] });
      toast({ title: t("course.enrollmentComplete") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateCourseMutation = useMutation({
    mutationFn: async (vals: typeof courseForm) => {
      let thumbnailUrl = course?.thumbnail_url || null;

      // Upload thumbnail if changed
      if (courseThumbnailFile) {
        const ext = courseThumbnailFile.name.split(".").pop();
        const path = `${courseId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("course-thumbnails").upload(path, courseThumbnailFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("course-thumbnails").getPublicUrl(path);
        thumbnailUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from("courses").update({
        title: vals.title,
        description: vals.description,
        status: vals.status,
        is_mandatory: vals.is_mandatory,
        deadline: vals.deadline || null,
        category_id: vals.category_id || null,
        difficulty_level: vals.difficulty_level || "beginner",
        estimated_duration_hours: vals.estimated_duration_hours ? parseInt(vals.estimated_duration_hours) : 0,
        max_students: vals.max_students ? parseInt(vals.max_students) : null,
        thumbnail_url: thumbnailUrl,
        is_sequential: vals.is_sequential,
      } as any).eq("id", courseId!);
      if (error) throw error;
      // Upsert English i18n
      if (courseEnForm.title.trim()) {
        await supabase.from("course_i18n").upsert({
          course_id: courseId!,
          language_code: "en",
          title: courseEnForm.title,
          description: courseEnForm.description || null,
        }, { onConflict: "course_id,language_code" });
      }
    },
    onSuccess: () => { invalidateAll(); setCourseEditOpen(false); setCourseThumbnailFile(null); toast({ title: t("course.courseModified") }); },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const upsertContentMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        course_id: courseId!,
        title: contentForm.title,
        content_type: contentForm.content_type as any,
        video_url: contentForm.video_url || null,
        video_provider: (contentForm.video_provider || null) as any,
        duration_minutes: contentForm.duration_minutes,
        description: contentForm.description || null,
        is_preview: contentForm.is_preview,
        is_published: contentForm.is_published,
      };

      let savedContentId = editingContentId;

      if (editingContentId) {
        const { error } = await supabase.from("course_contents").update(payload).eq("id", editingContentId);
        if (error) throw error;
      } else {
        const maxOrder = contents.length > 0 ? Math.max(...contents.map(c => c.order_index ?? 0)) + 1 : 0;
        const { data, error } = await supabase.from("course_contents").insert({ ...payload, order_index: maxOrder }).select("id").single();
        if (error) throw error;
        savedContentId = data.id;
      }

      // Upsert English i18n if provided
      if (savedContentId && contentEnForm.title.trim()) {
        await supabase.from("course_content_i18n").upsert({
          content_id: savedContentId,
          language_code: "en",
          title: contentEnForm.title,
          description: contentEnForm.description || null,
          video_url: contentEnForm.video_url || null,
          video_provider: contentEnForm.video_provider || null,
          duration_minutes: contentEnForm.duration_minutes,
        }, { onConflict: "content_id,language_code" });
      }
    },
    onSuccess: () => {
      invalidateAll();
      setContentDialogOpen(false);
      setEditingContentId(null);
      setContentForm(emptyContent);
      setContentEnForm(emptyI18n);
      toast({ title: editingContentId ? t("course.contentModified") : t("course.contentAdded") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteContentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_contents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast({ title: t("course.contentDeleted") }); },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ id, newIndex }: { id: string; newIndex: number }) => {
      const sorted = [...contents].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      const currentIdx = sorted.findIndex(c => c.id === id);
      if (currentIdx === -1 || newIndex < 0 || newIndex >= sorted.length) return;
      const [item] = sorted.splice(currentIdx, 1);
      sorted.splice(newIndex, 0, item);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].order_index !== i) {
          await supabase.from("course_contents").update({ order_index: i }).eq("id", sorted[i].id);
        }
      }
    },
    onSuccess: () => invalidateAll(),
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase.from("course_contents").update({ is_published: published }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // --- Helpers ---
  const openAddContent = () => {
    setEditingContentId(null);
    setContentForm(emptyContent);
    setContentEnForm(emptyI18n);
    setContentDialogOpen(true);
  };
  const openEditContent = (c: typeof contents[0]) => {
    setEditingContentId(c.id);
    setContentForm({
      title: c.title, content_type: c.content_type || "video",
      video_url: c.video_url || "", video_provider: c.video_provider || "",
      duration_minutes: c.duration_minutes, description: c.description || "",
      is_preview: c.is_preview ?? false, is_published: c.is_published ?? true,
    });
    // Load English i18n
    const enI18n = getContentI18n(c.id, "en");
    setContentEnForm(enI18n ? {
      title: enI18n.title || "", description: enI18n.description || "",
      video_url: enI18n.video_url || "", video_provider: enI18n.video_provider || "",
      duration_minutes: enI18n.duration_minutes,
    } : emptyI18n);
    setContentDialogOpen(true);
  };
  const openCourseEdit = () => {
    if (!course) return;
    setCourseForm({
      title: course.title,
      description: course.description || "",
      status: course.status || "draft",
      is_mandatory: course.is_mandatory || false,
      deadline: course.deadline || "",
      category_id: course.category_id || "",
      difficulty_level: course.difficulty_level || "beginner",
      estimated_duration_hours: course.estimated_duration_hours ? String(course.estimated_duration_hours) : "",
      max_students: course.max_students ? String(course.max_students) : "",
      is_sequential: (course as any).is_sequential || false,
    });
    const enCourse = courseI18n?.find((i: any) => i.language_code === "en");
    setCourseEnForm({ title: enCourse?.title || "", description: enCourse?.description || "" });
    setCourseThumbnailFile(null);
    setCourseThumbnailPreview(course.thumbnail_url || null);
    setCourseEditOpen(true);
  };

  const progressMap = new Map(progressData.map((p) => [p.content_id, p]));
  const completedCount = progressData.filter((p) => p.completed).length;
  const overallProgress = contents.length > 0 ? Math.round((completedCount / contents.length) * 100) : 0;
  const publishedCount = contents.filter(c => c.is_published).length;
  const totalDuration = contents.reduce((sum, c) => sum + (c.duration_minutes || 0), 0);

  if (courseLoading) {
    return (
      <DashboardLayout role={role}>
        <PageSkeleton blocks={4} />
      </DashboardLayout>
    );
  }

  if (!course) {
    return (
      <DashboardLayout role={role}>
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground">{t("course.courseNotFound")}</p>
          <Button variant="outline" onClick={() => navigate(`${routePrefix}/courses`)}>{t("common.back")}</Button>
        </div>
      </DashboardLayout>
    );
  }

  // ===== TEACHER / ADMIN VIEW =====
  if (isTeacherOrAdmin) {
    return (
      <DashboardLayout role={role}>
        <div className="space-y-5">
          <header className="space-y-3">
            <button
              type="button"
              onClick={() => navigate(role === "admin" ? "/admin/courses" : "/teacher/courses")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t("course.backToCourseList")}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t("course.backToCourseList")}
            </button>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="sr-only">
                <h1>{getCourseTitle()}</h1>
              </div>
              <div
                className="ml-auto flex flex-wrap items-center justify-end gap-2"
                role="toolbar"
                aria-label={isEn ? "Course actions" : "강의 작업"}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs"
                  onClick={openCourseEdit}
                  aria-label={t("course.courseSettings")}
                >
                  <Settings className="h-3 w-3" aria-hidden="true" />
                  {t("course.courseSettings")}
                </Button>
                <Button
                  size="sm"
                  className="h-9 gap-1.5 text-xs"
                  onClick={openAddContent}
                  aria-label={t("course.addContent")}
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  {t("course.addContent")}
                </Button>
              </div>
            </div>
          </header>

          <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="course-detail-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {course.thumbnail_url ? (
                <img
                  src={course.thumbnail_url}
                  alt={isEn ? `${getCourseTitle()} thumbnail` : `${getCourseTitle()} 썸네일`}
                  className="h-20 w-full rounded-lg object-cover sm:w-32 sm:shrink-0"
                />
              ) : (
                <div className="flex h-20 w-full items-center justify-center rounded-lg bg-accent sm:w-32 sm:shrink-0" aria-hidden="true">
                  <BookOpen className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={course.status === "published" ? "default" : "secondary"} className="text-[10px] h-5">
                    {course.status === "published" ? t("course.publishedStatus") : t("course.draftStatus")}
                  </Badge>
                  {course.is_mandatory && <Badge variant="destructive" className="text-[10px] h-5">{t("course.mandatory")}</Badge>}
                </div>
                <h1 id="course-detail-heading" className="text-base font-semibold leading-snug text-foreground">
                  {getCourseTitle()}
                </h1>
                {getCourseDesc() && <p className="line-clamp-2 text-xs text-muted-foreground">{getCourseDesc()}</p>}
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap items-center gap-5 border-t border-border pt-3" aria-label={isEn ? "Course summary" : "강의 요약 정보"}>
              <li className="flex items-center gap-1 text-xs text-muted-foreground">
                <BookOpen className="h-3 w-3" aria-hidden="true" />
                {t("course.content")} <span className="font-semibold text-foreground">{contents.length}</span> | {t("course.publishedStatus")} <span className="font-semibold text-foreground">{publishedCount}</span>
              </li>
              <li className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {totalDuration}{t("common.minutes")}
              </li>
              <li className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" aria-hidden="true" />
                {enrollmentCount}
              </li>
            </ul>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="teacher-content-list-heading">
            <div className="border-b border-border bg-secondary/30 px-4 py-3">
              <h2 id="teacher-content-list-heading" className="text-sm font-semibold text-foreground">
                {t("course.contentList")} ({contents.length})
              </h2>
            </div>
            {contents.length === 0 ? (
              <div className="space-y-3 py-12 text-center" role="status" aria-live="polite">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent" aria-hidden="true">
                  <BookOpen className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-sm text-muted-foreground">{t("course.noContents")}</p>
                <Button variant="outline" size="sm" onClick={openAddContent} className="gap-1.5 text-xs" aria-label={t("course.addFirstContent")}>
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  {t("course.addFirstContent")}
                </Button>
              </div>
            ) : (
              <ol className="divide-y divide-border">
                {contents.map((content, idx) => {
                  const Icon = contentTypeIcon[content.content_type || "video"] || Video;
                  const isUnpublished = !content.is_published;
                  const localizedTitle = getLocalizedContentTitle(content);
                  const providerLabel = content.video_provider === "custom" ? t("course.flip") : t("course.video");
                  return (
                    <li key={content.id} className={isUnpublished ? "opacity-50" : undefined}>
                      <div
                        className="group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/30"
                        role="group"
                        aria-label={`${idx + 1}. ${localizedTitle}`}
                      >
                        <div className="flex shrink-0 flex-col">
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-20"
                            disabled={idx === 0}
                            onClick={() => reorderMutation.mutate({ id: content.id, newIndex: idx - 1 })}
                            aria-label={isEn ? `Move ${localizedTitle} up` : `${localizedTitle} 위로 이동`}
                          >
                            <ChevronUp className="h-3 w-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-20"
                            disabled={idx === contents.length - 1}
                            onClick={() => reorderMutation.mutate({ id: content.id, newIndex: idx + 1 })}
                            aria-label={isEn ? `Move ${localizedTitle} down` : `${localizedTitle} 아래로 이동`}
                          >
                            <ChevronDown className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                        <span className="w-5 shrink-0 text-center font-mono text-[10px] text-muted-foreground">{String(idx + 1).padStart(2, "0")}</span>
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent" aria-hidden="true">
                          <Icon className="h-3.5 w-3.5 text-accent-foreground" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-foreground">{localizedTitle}</span>
                            {isUnpublished && <Badge variant="outline" className="h-4 shrink-0 border-dashed text-[9px]">{t("course.draftStatus")}</Badge>}
                            {content.is_preview && <Badge variant="secondary" className="h-4 shrink-0 text-[9px]">{t("course.allowPreview")}</Badge>}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${content.video_provider === "custom" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"}`} aria-label={providerLabel}>
                          {providerLabel}
                        </span>
                        <span className="w-10 shrink-0 text-right text-[10px] text-muted-foreground">
                          {content.duration_minutes ? `${content.duration_minutes}${t("common.minutes")}` : "-"}
                        </span>
                        <div
                          className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                          role="toolbar"
                          aria-label={isEn ? `${localizedTitle} actions` : `${localizedTitle} 작업`}
                        >
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={() => togglePublishMutation.mutate({ id: content.id, published: !content.is_published })}
                            aria-label={content.is_published ? (isEn ? `Hide ${localizedTitle}` : `${localizedTitle} 비공개`) : (isEn ? `Publish ${localizedTitle}` : `${localizedTitle} 공개`)}
                          >
                            {content.is_published ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={() => navigate(`${routePrefix}/courses/${courseId}/content/${content.id}${viewParam}`)}
                            aria-label={isEn ? `Open ${localizedTitle}` : `${localizedTitle} 열기`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={() => openEditContent(content)}
                            aria-label={isEn ? `Edit ${localizedTitle}` : `${localizedTitle} 수정`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                aria-label={isEn ? `Delete ${localizedTitle}` : `${localizedTitle} 삭제`}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("course.deleteContent")}</AlertDialogTitle>
                                <AlertDialogDescription>{t("course.deleteContentConfirm", { title: content.title })}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteContentMutation.mutate(content.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  {t("common.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* Assessment Management Section */}
          {courseId && (
            <AssessmentManager courseId={courseId} />
          )}
        </div>

        <ContentDialog
          open={contentDialogOpen}
          onOpenChange={setContentDialogOpen}
          form={contentForm}
          setForm={setContentForm}
          enForm={contentEnForm}
          setEnForm={setContentEnForm}
          editingId={editingContentId}
          courseId={courseId!}
          onSubmit={() => upsertContentMutation.mutate()}
          isPending={upsertContentMutation.isPending}
          t={t}
        />

        <CourseEditDialog
          open={courseEditOpen}
          onOpenChange={setCourseEditOpen}
          form={courseForm}
          setForm={setCourseForm}
          enForm={courseEnForm}
          setEnForm={setCourseEnForm}
          courseId={courseId!}
          onSubmit={() => updateCourseMutation.mutate(courseForm)}
          isPending={updateCourseMutation.isPending}
          t={t}
          thumbnailPreview={courseThumbnailPreview}
          onThumbnailChange={(file) => {
            setCourseThumbnailFile(file);
            setCourseThumbnailPreview(URL.createObjectURL(file));
          }}
          onThumbnailRemove={() => {
            setCourseThumbnailFile(null);
            setCourseThumbnailPreview(null);
          }}
          categories={categories}
        />
      </DashboardLayout>
    );
  }

  // ===== STUDENT VIEW =====
  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <header className="space-y-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard/courses")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t("course.myCourseRoom")}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("course.myCourseRoom")}
          </button>
        </header>

        <section className="space-y-4 rounded-xl border border-border bg-card p-5" aria-labelledby="student-course-detail-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {course.thumbnail_url ? (
              <img
                src={course.thumbnail_url}
                alt={isEn ? `${getCourseTitle()} thumbnail` : `${getCourseTitle()} 썸네일`}
                className="h-40 w-full rounded-xl object-cover sm:h-16 sm:w-16 sm:shrink-0"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-accent" aria-hidden="true">
                <BookOpen className="h-7 w-7 text-accent-foreground" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {course.is_mandatory && <Badge variant="destructive" className="text-[10px]">{t("course.mandatory")}</Badge>}
              </div>
              <h1 id="student-course-detail-heading" className="text-lg font-semibold text-foreground">
                {getCourseTitle()}
              </h1>
              {getCourseDesc() && <p className="text-xs text-muted-foreground">{getCourseDesc()}</p>}
            </div>
          </div>

          <ul className="flex flex-wrap items-center gap-4 border-t border-border pt-2 text-xs text-muted-foreground" aria-label={isEn ? "Course details" : "강의 정보"}>
            <li className="flex items-center gap-1">
              <Video className="h-3 w-3" aria-hidden="true" />
              {t("course.courseContentCount", { count: contents.length })}
            </li>
            {course.estimated_duration_hours && (
              <li className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {t("course.approxDuration", { hours: course.estimated_duration_hours })}
              </li>
            )}
          </ul>

          {enrollment ? (
            <div className="space-y-1.5" aria-label={isEn ? `Progress ${overallProgress}%` : `진도율 ${overallProgress}%`}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("course.enrollProgress")}</span>
                <span className="font-medium text-foreground">{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-1.5" aria-label={`${t("course.enrollProgress")} ${overallProgress}%`} />
              <p className="text-[10px] text-muted-foreground">{completedCount}/{contents.length} {t("course.completed")}</p>
            </div>
          ) : (
            <Button className="w-full sm:w-auto" onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending} aria-label={t("course.enrollCourse")}>
              {enrollMutation.isPending ? t("common.registering") : t("course.enrollCourse")}
            </Button>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="student-course-contents-heading">
          <h2 id="student-course-contents-heading" className="text-sm font-semibold text-foreground">
            {t("course.courseContents")}
          </h2>
          <ol className="space-y-1.5">
            {(() => {
              const isSequential = (course as any)?.is_sequential || false;
              const publishedContents = contents.filter(c => c.is_published);
              
              // Build assessment gate map: assessmentOrderIndex -> assessment
              // An assessment with order_index N acts as a gate AFTER content at position N
              const assessmentGateMap = new Map<number, typeof assessments[0]>();
              assessments.forEach(a => {
                if ((a as any).order_index != null) {
                  assessmentGateMap.set((a as any).order_index, a);
                }
              });
              
              // Check if assessment is passed
              const isAssessmentPassed = (assessmentId: string) => {
                const attempts = assessmentAttempts.filter(a => a.assessment_id === assessmentId && a.completed_at);
                return attempts.some(a => a.passed);
              };
              
              // Calculate sequential accessibility
              // For each content, check if all previous contents are completed
              // AND if there's a gate assessment before it, check if it's passed
              const getSequentialAccessibility = (contentIdx: number) => {
                if (!isSequential || !enrollment) return { accessible: !!enrollment || publishedContents[contentIdx]?.is_preview, reason: "" };
                if (contentIdx === 0) return { accessible: true, reason: "" };
                
                // Check all previous contents are completed
                for (let i = 0; i < contentIdx; i++) {
                  const prevContent = publishedContents[i];
                  const prevProgress = progressMap.get(prevContent.id);
                  if (!prevProgress?.completed) {
                    return { accessible: false, reason: t("course.sequentialLocked") };
                  }
                  // Check if there's a gate assessment after this content position
                  const gate = assessmentGateMap.get(i);
                  if (gate && !isAssessmentPassed(gate.id)) {
                    return { accessible: false, reason: t("course.sequentialAssessmentRequired") };
                  }
                }
                return { accessible: true, reason: "" };
              };
              
              const elements: React.ReactNode[] = [];
              
              publishedContents.forEach((content, idx) => {
                const progress = progressMap.get(content.id);
                const isCompleted = progress?.completed;
                const seqAccess = getSequentialAccessibility(idx);
                const isAccessible = isSequential ? (seqAccess.accessible && !!enrollment) : (!!enrollment || content.is_preview);
                const Icon = contentTypeIcon[content.content_type || "video"] || Video;
                const localizedTitle = getLocalizedContentTitle(content);
                const providerLabel = content.video_provider === "custom" ? t("course.flip") : t("course.video");
                
                elements.push(
                  <li key={content.id}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${!isAccessible ? "opacity-50" : "cursor-pointer hover:bg-accent/30"}`}
                      onClick={() => isAccessible && navigate(`${routePrefix}/courses/${courseId}/content/${content.id}${viewParam}`)}
                      aria-disabled={!isAccessible}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isCompleted ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : !isAccessible ? "bg-muted" : "bg-accent text-accent-foreground"}`} aria-hidden="true">
                        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : !isAccessible ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="flex-1 truncate text-sm font-medium text-foreground">{localizedTitle}</span>
                      {!isAccessible && seqAccess.reason && (
                        <span className="text-[9px] text-muted-foreground shrink-0">{t("course.sequentialLockedShort")}</span>
                      )}
                      {content.language_code && (() => {
                        const code = content.language_code;
                        const label = code === "ko" ? "KO" : code === "en" ? "EN" : code === "ja" ? "JA" : code.startsWith("zh") ? "ZH" : code.toUpperCase();
                        return (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground" aria-label={`${isEn ? "Language" : "언어"}: ${label}`}>
                            {label}
                          </span>
                        );
                      })()}
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${content.video_provider === "custom" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"}`}>
                        {providerLabel}
                      </span>
                      {content.duration_minutes && <span className="shrink-0 text-[10px] text-muted-foreground">{content.duration_minutes}{t("common.minutes")}</span>}
                      {isAccessible && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    </button>
                  </li>
                );
                
                // Insert inline assessment gate after this content if one exists
                const gateAssessment = assessmentGateMap.get(idx);
                if (gateAssessment && enrollment) {
                  const passed = isAssessmentPassed(gateAssessment.id);
                  const completedAttempts = assessmentAttempts.filter(a => a.assessment_id === gateAssessment.id && a.completed_at);
                  const bestScore = completedAttempts.length > 0 ? Math.max(...completedAttempts.map(a => Number(a.score) || 0)) : null;
                  const canAccess = isCompleted; // Can only access gate if current content is completed
                  
                  elements.push(
                    <li key={`gate-${gateAssessment.id}`}>
                      <div className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 transition-all ${passed ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/10" : "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/10"}`}>
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${passed ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"}`}>
                          {passed ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{t("course.sequentialAssessmentGate")}: {gateAssessment.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {passed ? t("course.sequentialAssessmentPass") : bestScore !== null ? `${t("course.sequentialAssessmentFail")} (${bestScore}${t("common.points")})` : t("course.sequentialAssessmentNotTaken")}
                          </p>
                        </div>
                        {canAccess && !passed && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs shrink-0"
                            onClick={() => navigate(`${routePrefix}/courses/${courseId}/assessment/${gateAssessment.id}${routePrefix === "/student" ? "?view=learn" : ""}`)}
                          >
                            {t("course.sequentialAssessmentTakeNow")}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                }
              });
              
              return elements;
            })()}
          </ol>
        </section>

        {/* Student Assessment Section */}
        {courseId && <StudentAssessmentSection courseId={courseId} overallProgress={overallProgress} routePrefix={routePrefix} t={t} isEn={isEn} />}

        {/* Survey Section - shown after course completion */}
        {courseId && enrollment?.completed_at && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("survey.title", "과정 설문")}</h2>
            <StudentSurvey courseId={courseId} />
          </section>
        )}
      </div>
    </DashboardLayout>
  );
};

// --- Student Assessment Section ---
const StudentAssessmentSection = ({
  courseId, overallProgress, routePrefix, t, isEn,
}: {
  courseId: string;
  overallProgress: number;
  routePrefix: string;
  t: any;
  isEn: boolean;
}) => {
  const navigate = useNavigate();
  const { data: assessment } = useQuery({
    queryKey: ["assessment", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessments").select("*").eq("course_id", courseId).eq("is_published", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { user } = useUser();
  const { data: attempts = [] } = useQuery({
    queryKey: ["assessment-attempts-student", assessment?.id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessment_attempts").select("*").eq("assessment_id", assessment!.id).eq("user_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assessment?.id && !!user?.id,
  });

  if (!assessment) return null;

  const threshold = Number(assessment.completion_threshold);
  const meetsThreshold = overallProgress >= threshold;
  const completedAttempts = attempts.filter((a: any) => a.completed_at);
  const bestScore = completedAttempts.length > 0 ? Math.max(...completedAttempts.map((a: any) => Number(a.score) || 0)) : null;
  const passed = bestScore !== null ? bestScore >= assessment.passing_score : false;

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{t("assessment.title")}: {assessment.title}</h2>
      </div>

      {!meetsThreshold ? (
        <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
          <p className="text-xs text-muted-foreground">
            {t("assessment.progressRequired", { threshold })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("assessment.currentProgress", { progress: overallProgress })}
          </p>
          <Progress value={overallProgress} className="h-1.5 mt-1" />
        </div>
      ) : (
        <div className="space-y-2">
          {bestScore !== null && (
            <div className={`rounded-lg border p-3 flex items-center gap-2 ${passed ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20"}`}>
              {passed ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /> : <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
              <div>
                <p className="text-xs font-semibold">{passed ? t("assessment.passedResult") : t("assessment.failedResult")}</p>
                <p className="text-[10px] text-muted-foreground">{t("assessment.bestScore")}: {bestScore}{t("common.points")} ({completedAttempts.length}/{assessment.max_attempts} {isEn ? "attempts" : "회 응시"})</p>
              </div>
            </div>
          )}
          <Button
            variant={bestScore !== null ? "outline" : "default"}
            size="sm"
            className="w-full"
            onClick={() => navigate(`${routePrefix}/courses/${courseId}/assessment/${assessment.id}${routePrefix === "/student" ? "?view=learn" : ""}`)}
          >
            {bestScore !== null ? t("assessment.retakeAssessment") : t("assessment.takeAssessment")}
          </Button>
        </div>
      )}
    </section>
  );
};

// --- Content Dialog with i18n tabs ---
const ContentDialog = ({
  open, onOpenChange, form, setForm, enForm, setEnForm, editingId, courseId, onSubmit, isPending, t,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: ContentFormData;
  setForm: React.Dispatch<React.SetStateAction<ContentFormData>>;
  enForm: ContentI18nData;
  setEnForm: React.Dispatch<React.SetStateAction<ContentI18nData>>;
  editingId: string | null;
  courseId: string;
  onSubmit: () => void;
  isPending: boolean;
  t: any;
}) => {
  const [translating, setTranslating] = useState(false);

  // Real-time sync: copy non-translatable fields from KO to EN automatically
  useEffect(() => {
    setEnForm(f => ({
      ...f,
      video_url: f.video_url || form.video_url,
      video_provider: f.video_provider || form.video_provider,
      duration_minutes: f.duration_minutes ?? form.duration_minutes,
    }));
  }, [form.video_url, form.video_provider, form.duration_minutes]);

  // Real-time sync: mirror KO title/description to EN (raw, untranslated) so EN is never empty
  useEffect(() => {
    setEnForm(f => ({
      ...f,
      title: f.title || form.title,
      description: f.description || form.description,
    }));
  }, [form.title, form.description]);

  const handleAutoTranslate = async () => {
    const textsToTranslate = [form.title, form.description].filter(Boolean);
    if (textsToTranslate.length === 0) return;
    setTranslating(true);
    try {
      const results = await translateKoToEn(textsToTranslate);
      let idx = 0;
      const translatedTitle = form.title ? (results[idx++] || "") : "";
      const translatedDesc = form.description ? (results[idx++] || "") : "";
      setEnForm(f => ({
        ...f,
        title: translatedTitle || f.title,
        description: translatedDesc || f.description,
        video_url: f.video_url || form.video_url,
        video_provider: f.video_provider || form.video_provider,
        duration_minutes: f.duration_minutes ?? form.duration_minutes,
      }));
      // Auto-save translated i18n to DB if editing existing content
      if (editingId && translatedTitle) {
        await supabase.from("course_content_i18n").upsert({
          content_id: editingId,
          language_code: "en",
          title: translatedTitle,
          description: translatedDesc || null,
          video_url: form.video_url || null,
          video_provider: form.video_provider || null,
          duration_minutes: form.duration_minutes,
        }, { onConflict: "content_id,language_code" });
      }
    } catch {
      // silently fail
    } finally {
      setTranslating(false);
    }
  };

  return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-base">{editingId ? t("course.editContent") : t("course.addContent")}</DialogTitle>
      </DialogHeader>
      <Tabs defaultValue="ko" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="ko" className="flex-1">{t("course.koTab")}</TabsTrigger>
          <TabsTrigger value="en" className="flex-1">{t("course.enTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="ko" className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("course.contentTitle")} *</Label>
            <Input className="h-9 text-sm" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t("course.contentPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("course.contentType")}</Label>
              <Select value={form.content_type} onValueChange={(v) => setForm(f => ({ ...f, content_type: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">{t("course.video")}</SelectItem>
                  <SelectItem value="document">{t("course.document")}</SelectItem>
                  <SelectItem value="quiz">{t("course.quiz")}</SelectItem>
                  <SelectItem value="assignment">{t("course.assignment")}</SelectItem>
                  <SelectItem value="live">{t("course.live")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("course.playbackTime")}</Label>
              <Input className="h-9 text-sm" type="number" value={form.duration_minutes ?? ""} onChange={(e) => setForm(f => ({ ...f, duration_minutes: e.target.value ? Number(e.target.value) : null }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("course.contentUrl")}</Label>
            <Input className="h-9 text-sm" value={form.video_url} onChange={(e) => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("course.provider")}</Label>
            <Select value={form.video_provider} onValueChange={(v) => setForm(f => ({ ...f, video_provider: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("course.select")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">{t("course.youtube")}</SelectItem>
                <SelectItem value="vimeo">{t("course.vimeo")}</SelectItem>
                <SelectItem value="custom">{t("course.flipLearningMango")}</SelectItem>
                <SelectItem value="upload">{t("course.cdnUpload")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("course.description")}</Label>
            <Textarea className="text-sm" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_published} onCheckedChange={(v) => setForm(f => ({ ...f, is_published: v }))} />
              <Label className="text-xs">{t("course.isPublished")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_preview} onCheckedChange={(v) => setForm(f => ({ ...f, is_preview: v }))} />
              <Label className="text-xs">{t("course.allowPreview")}</Label>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="en" className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{t("course.enOptional")}</p>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleAutoTranslate} disabled={translating || (!form.title && !form.description)}>
              <Languages className="h-3 w-3" />
              {t("course.autoTranslate", "자동 번역")}
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("course.enTitle")}</Label>
            <Input className="h-9 text-sm" value={enForm.title} onChange={(e) => setEnForm(f => ({ ...f, title: e.target.value }))} placeholder="English title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("course.contentType")}</Label>
              <Select value={form.content_type} onValueChange={(v) => setForm(f => ({ ...f, content_type: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">{t("course.video")}</SelectItem>
                  <SelectItem value="document">{t("course.document")}</SelectItem>
                  <SelectItem value="quiz">{t("course.quiz")}</SelectItem>
                  <SelectItem value="assignment">{t("course.assignment")}</SelectItem>
                  <SelectItem value="live">{t("course.live")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("course.playbackTime")}</Label>
              <Input className="h-9 text-sm" type="number" value={enForm.duration_minutes ?? ""} onChange={(e) => setEnForm(f => ({ ...f, duration_minutes: e.target.value ? Number(e.target.value) : null }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("course.contentUrl")}</Label>
            <Input className="h-9 text-sm" value={enForm.video_url} onChange={(e) => setEnForm(f => ({ ...f, video_url: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("course.provider")}</Label>
            <Select value={enForm.video_provider || form.video_provider} onValueChange={(v) => setEnForm(f => ({ ...f, video_provider: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("course.select")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">{t("course.youtube")}</SelectItem>
                <SelectItem value="vimeo">{t("course.vimeo")}</SelectItem>
                <SelectItem value="custom">{t("course.flipLearningMango")}</SelectItem>
                <SelectItem value="upload">{t("course.cdnUpload")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("course.enDescription")}</Label>
            <Textarea className="text-sm" value={enForm.description} onChange={(e) => setEnForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="English description" />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_published} onCheckedChange={(v) => setForm(f => ({ ...f, is_published: v }))} />
              <Label className="text-xs">{t("course.isPublished")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_preview} onCheckedChange={(v) => setForm(f => ({ ...f, is_preview: v }))} />
              <Label className="text-xs">{t("course.allowPreview")}</Label>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
        <Button size="sm" onClick={onSubmit} disabled={!form.title.trim() || isPending}>
          {isPending ? t("common.saving") : editingId ? t("common.edit") : t("common.add")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  );
};

// --- Course Edit Dialog with i18n tabs + thumbnail + extended fields ---
const CourseEditDialog = ({
  open, onOpenChange, form, setForm, enForm, setEnForm, courseId, onSubmit, isPending, t,
  thumbnailPreview, onThumbnailChange, onThumbnailRemove, categories,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: { title: string; description: string; status: string; is_mandatory: boolean; deadline: string; category_id: string; difficulty_level: string; estimated_duration_hours: string; max_students: string; is_sequential: boolean };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  enForm: { title: string; description: string };
  setEnForm: React.Dispatch<React.SetStateAction<{ title: string; description: string }>>;
  courseId: string;
  onSubmit: () => void;
  isPending: boolean;
  t: any;
  thumbnailPreview: string | null;
  onThumbnailChange: (file: File) => void;
  onThumbnailRemove: () => void;
  categories: { id: string; name: string }[];
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [translating, setTranslating] = useState(false);
  const [enTitleManual, setEnTitleManual] = useState(false);
  const [enDescManual, setEnDescManual] = useState(false);
  const prevKoTitle = useRef(form.title);
  const prevKoDesc = useRef(form.description);

  // Sync KO → EN title if not manually edited
  useEffect(() => {
    if (!enTitleManual) {
      setEnForm(f => ({ ...f, title: form.title }));
    }
    prevKoTitle.current = form.title;
  }, [form.title, enTitleManual]);

  // Sync KO → EN description if not manually edited
  useEffect(() => {
    if (!enDescManual) {
      setEnForm(f => ({ ...f, description: form.description }));
    }
    prevKoDesc.current = form.description;
  }, [form.description, enDescManual]);

  const handleAutoTranslate = async () => {
    const textsToTranslate = [form.title, form.description].filter(Boolean);
    if (textsToTranslate.length === 0) return;
    setTranslating(true);
    try {
      const results = await translateKoToEn(textsToTranslate);
      let idx = 0;
      const translatedTitle = form.title ? (results[idx++] || "") : "";
      const translatedDesc = form.description ? (results[idx++] || "") : "";
      setEnForm(f => ({
        ...f,
        title: translatedTitle || f.title,
        description: translatedDesc || f.description,
      }));
      setEnTitleManual(true);
      setEnDescManual(true);
      // Auto-save translated i18n to DB
      if (courseId && translatedTitle) {
        await supabase.from("course_i18n").upsert({
          course_id: courseId,
          language_code: "en",
          title: translatedTitle,
          description: translatedDesc || null,
        }, { onConflict: "course_id,language_code" });
      }
    } catch {
      // silently fail
    } finally {
      setTranslating(false);
    }
  };

  return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-base">{t("course.courseEditTitle")}</DialogTitle>
      </DialogHeader>
      <Tabs defaultValue="ko" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="ko" className="flex-1">{t("course.koTab")}</TabsTrigger>
          <TabsTrigger value="en" className="flex-1">{t("course.enTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="ko" className="space-y-3 pt-2">
          {/* Thumbnail */}
          <div className="space-y-1">
            <Label className="text-xs">{t("createCourse.thumbnailLabel") || "썸네일"}</Label>
            {thumbnailPreview ? (
              <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
                <img src={thumbnailPreview} alt="thumbnail" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={onThumbnailRemove}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full h-24 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              >
                <Upload className="h-4 w-4" />
                {t("createCourse.thumbnailDropHint")}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onThumbnailChange(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("course.courseTitle")}</Label>
            <Input className="h-9 text-sm" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("course.description")}</Label>
            <Textarea className="text-sm" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          </div>

          {/* Category & Difficulty in row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("createCourse.categoryLabel")}</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm(f => ({ ...f, category_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("common.select") || "선택"} /></SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("createCourse.difficultyLabel")}</Label>
              <Select value={form.difficulty_level} onValueChange={(v) => setForm(f => ({ ...f, difficulty_level: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">{t("createCourse.beginnerLevel")}</SelectItem>
                  <SelectItem value="intermediate">{t("createCourse.intermediateLevel")}</SelectItem>
                  <SelectItem value="advanced">{t("createCourse.advancedLevel")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration & Max students */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("createCourse.estimatedDuration") || "예상 소요시간(h)"}</Label>
              <Input className="h-9 text-sm" type="number" min={0} value={form.estimated_duration_hours} onChange={(e) => setForm(f => ({ ...f, estimated_duration_hours: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("createCourse.maxStudents") || "최대 수강인원"}</Label>
              <Input className="h-9 text-sm" type="number" min={0} value={form.max_students} onChange={(e) => setForm(f => ({ ...f, max_students: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("course.courseStatus")}</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("course.draftStatus")}</SelectItem>
                <SelectItem value="published">{t("course.publishedStatus")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 필수교육 설정 */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">{t("course.mandatoryToggle")}</Label>
                <p className="text-[11px] text-muted-foreground">{t("course.mandatoryToggleDesc")}</p>
              </div>
              <Switch
                checked={form.is_mandatory}
                onCheckedChange={(v) => setForm(f => ({ ...f, is_mandatory: v }))}
              />
            </div>
            {form.is_mandatory && (
              <div className="space-y-1">
                <Label className="text-xs">{t("course.deadlineLabel")}</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={form.deadline}
                  onChange={(e) => setForm(f => ({ ...f, deadline: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground">{t("course.deadlineHelp")}</p>
              </div>
            )}
            {/* Sequential Learning Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">{t("course.sequentialToggle")}</Label>
                <p className="text-[11px] text-muted-foreground">{t("course.sequentialToggleDesc")}</p>
              </div>
              <Switch
                checked={form.is_sequential}
                onCheckedChange={(v) => setForm(f => ({ ...f, is_sequential: v }))}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="en" className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{t("course.enOptional")}</p>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleAutoTranslate} disabled={translating || (!form.title && !form.description)}>
              <Languages className="h-3 w-3" />
              {t("course.autoTranslate", "자동 번역")}
            </Button>
          </div>

          {/* Thumbnail (shared) */}
          <div className="space-y-1">
            <Label className="text-xs">{t("createCourse.thumbnailLabel") || "썸네일"}</Label>
            {thumbnailPreview ? (
              <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
                <img src={thumbnailPreview} alt="thumbnail" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={onThumbnailRemove}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full h-24 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              >
                <Upload className="h-4 w-4" />
                {t("createCourse.thumbnailDropHint")}
              </button>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("course.enTitle")}</Label>
            <Input className="h-9 text-sm" value={enForm.title} onChange={(e) => { setEnTitleManual(true); setEnForm(f => ({ ...f, title: e.target.value })); }} placeholder="English title" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("course.enDescription")}</Label>
            <Textarea className="text-sm" value={enForm.description} onChange={(e) => { setEnDescManual(true); setEnForm(f => ({ ...f, description: e.target.value })); }} rows={3} placeholder="English description" />
          </div>

          {/* Category & Difficulty (shared) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("createCourse.categoryLabel")}</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm(f => ({ ...f, category_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("common.select") || "선택"} /></SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("createCourse.difficultyLabel")}</Label>
              <Select value={form.difficulty_level} onValueChange={(v) => setForm(f => ({ ...f, difficulty_level: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">{t("createCourse.beginnerLevel")}</SelectItem>
                  <SelectItem value="intermediate">{t("createCourse.intermediateLevel")}</SelectItem>
                  <SelectItem value="advanced">{t("createCourse.advancedLevel")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration & Max students (shared) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("createCourse.estimatedDuration") || "예상 소요시간(h)"}</Label>
              <Input className="h-9 text-sm" type="number" min={0} value={form.estimated_duration_hours} onChange={(e) => setForm(f => ({ ...f, estimated_duration_hours: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("createCourse.maxStudents") || "최대 수강인원"}</Label>
              <Input className="h-9 text-sm" type="number" min={0} value={form.max_students} onChange={(e) => setForm(f => ({ ...f, max_students: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("course.courseStatus")}</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("course.draftStatus")}</SelectItem>
                <SelectItem value="published">{t("course.publishedStatus")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 필수교육 설정 (shared) */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">{t("course.mandatoryToggle")}</Label>
                <p className="text-[11px] text-muted-foreground">{t("course.mandatoryToggleDesc")}</p>
              </div>
              <Switch
                checked={form.is_mandatory}
                onCheckedChange={(v) => setForm(f => ({ ...f, is_mandatory: v }))}
              />
            </div>
            {form.is_mandatory && (
              <div className="space-y-1">
                <Label className="text-xs">{t("course.deadlineLabel")}</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={form.deadline}
                  onChange={(e) => setForm(f => ({ ...f, deadline: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground">{t("course.deadlineHelp")}</p>
              </div>
            )}
            {/* Sequential Learning Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">{t("course.sequentialToggle")}</Label>
                <p className="text-[11px] text-muted-foreground">{t("course.sequentialToggleDesc")}</p>
              </div>
              <Switch
                checked={form.is_sequential}
                onCheckedChange={(v) => setForm(f => ({ ...f, is_sequential: v }))}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
        <Button size="sm" onClick={onSubmit} disabled={!form.title.trim() || isPending}>
          {isPending ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  );
};

export default CourseDetail;
