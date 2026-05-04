import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Trash2, GripVertical, Video, FileText, BarChart3,
  MonitorPlay, BookOpen, ExternalLink, Link2, Eye, ImagePlus, X, CalendarIcon,
  Save, Languages, LayoutGrid, Image as ImageIcon, ChevronUp, Package, ChevronDown, Lock, Pencil, RotateCcw,
} from "lucide-react";
import { translateKoToEn, translateKoTo, type TargetLang } from "@/lib/translate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import CategorySelect from "@/components/CategorySelect";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { Database } from "@/integrations/supabase/types";

type ContentType = Database["public"]["Enums"]["content_type"];
type VideoProvider = Database["public"]["Enums"]["video_provider"];

type ContentSource = "video" | "mangoboard" | "card" | "package" | "images";

// 4-language fixed structure: 1 강의 = 4 차시 (KO / EN / ZH-CN / JA)
export const LESSON_LANGS = ["ko", "en", "zh-CN", "ja"] as const;
export type LessonLang = typeof LESSON_LANGS[number];
export const LESSON_LANG_LABELS: Record<LessonLang, string> = {
  ko: "한국어",
  en: "English",
  "zh-CN": "简体中文",
  ja: "日本語",
};

export interface PackageItemDraft {
  tempId: string;
  item_type: "image" | "video";
  media_url: string;
  caption: string;
}

interface ContentItem {
  tempId: string;
  title: string;
  description: string;
  content_type: ContentType;
  video_url: string;
  video_provider: VideoProvider | "";
  duration_minutes: number | null;
  is_preview: boolean;
  is_published: boolean;
  source: ContentSource;
  enTitle: string;
  enDescription: string;
  card_image_url?: string;
  card_urls?: string[];
  package_items?: PackageItemDraft[];
  language_code: LessonLang;
  manual_translation_override?: boolean; // true: 관리자가 직접 수정한 번역 (자동번역 덮어쓰기 방지)
}

// Helper: build the 4 default empty lesson slots
const buildDefaultLessonSlots = (): ContentItem[] =>
  LESSON_LANGS.map((lang) => ({
    tempId: crypto.randomUUID(),
    title: "",
    description: "",
    content_type: "document" as ContentType,
    video_url: "",
    video_provider: "custom" as VideoProvider,
    duration_minutes: null,
    is_preview: false,
    is_published: true,
    source: "mangoboard" as ContentSource,
    enTitle: "",
    enDescription: "",
    package_items: [],
    language_code: lang,
  }));

const CreateCourse = () => {
  const navigate = useNavigate();
  const { courseId: editCourseId } = useParams<{ courseId?: string }>();
  const isEditMode = !!editCourseId;
  const { user } = useUser();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");
  const layoutRole = isAdmin ? "admin" : "teacher";

  const contentTypeOptions: { value: ContentType; label: string; icon: React.ElementType }[] = [
    { value: "video", label: t("createCourse.videoLabel"), icon: Video },
    { value: "document", label: t("createCourse.documentLabel"), icon: FileText },
    { value: "quiz", label: t("createCourse.quizLabel"), icon: BarChart3 },
    { value: "assignment", label: t("createCourse.assignmentLabel"), icon: FileText },
    { value: "live", label: t("createCourse.liveLabel"), icon: Video },
  ];

  const videoProviderOptions: { value: VideoProvider; label: string }[] = [
    { value: "youtube", label: "YouTube" },
    { value: "vimeo", label: "Vimeo" },
    { value: "upload", label: t("createCourse.uploadCdn") },
    { value: "custom", label: t("createCourse.customInput") },
  ];

  // Course fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [enTitle, setEnTitle] = useState("");
  const [enDescription, setEnDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState("beginner");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [translatingCourse, setTranslatingCourse] = useState(false);
  const [enTitleManual, setEnTitleManual] = useState(false);
  const [enDescManual, setEnDescManual] = useState(false);
  const [maxStudents, setMaxStudents] = useState("");
  const [isMandatory, setIsMandatory] = useState(false);
  const [isSequential, setIsSequential] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [status, setStatus] = useState("draft");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Content items
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [editDataLoaded, setEditDataLoaded] = useState(false);
  const [existingThumbnailUrl, setExistingThumbnailUrl] = useState<string | null>(null);

  // Load existing course data for edit mode
  useEffect(() => {
    if (!isEditMode || !editCourseId || editDataLoaded) return;
    (async () => {
      const { data: course, error } = await supabase
        .from("courses")
        .select("*")
        .eq("id", editCourseId)
        .single();
      if (error || !course) {
        toast({ title: t("common.error"), description: "강의를 찾을 수 없습니다.", variant: "destructive" });
        navigate(-1);
        return;
      }
      setTitle(course.title || "");
      setDescription(course.description || "");
      setCategoryId(course.category_id || "");
      setDifficultyLevel(course.difficulty_level || "beginner");
      setEstimatedHours(course.estimated_duration_hours ? String(course.estimated_duration_hours) : "");
      setMaxStudents(course.max_students ? String(course.max_students) : "");
      setIsMandatory(course.is_mandatory || false);
      setIsSequential((course as any).is_sequential || false);
      setDeadline(course.deadline || "");
      setStatus(course.status || "draft");
      if (course.thumbnail_url) {
        setThumbnailPreview(course.thumbnail_url);
        setExistingThumbnailUrl(course.thumbnail_url);
      }

      // Load course i18n
      const { data: courseI18n } = await supabase
        .from("course_i18n")
        .select("*")
        .eq("course_id", editCourseId)
        .eq("language_code", "en")
        .maybeSingle();
      if (courseI18n) {
        setEnTitle(courseI18n.title || "");
        setEnDescription(courseI18n.description || "");
      }

      // Load contents
      const { data: courseContents } = await supabase
        .from("course_contents")
        .select("*")
        .eq("course_id", editCourseId)
        .order("order_index", { ascending: true });

      // Load content i18n
      const { data: contentI18ns } = await supabase
        .from("course_content_i18n")
        .select("*")
        .eq("language_code", "en");

      const i18nMap = new Map((contentI18ns || []).map((i: any) => [i.content_id, i]));

      // Load media package items for any media_package contents
      const packageContentIds = (courseContents || [])
        .filter((c: any) => c.content_type === "media_package")
        .map((c: any) => c.id);
      const packageItemsMap = new Map<string, PackageItemDraft[]>();
      if (packageContentIds.length > 0) {
        const { data: pkgItems } = await (supabase as any)
          .from("media_package_items")
          .select("*")
          .in("content_id", packageContentIds)
          .order("order_index", { ascending: true });
        (pkgItems || []).forEach((it: any) => {
          const arr = packageItemsMap.get(it.content_id) || [];
          arr.push({
            tempId: it.id,
            item_type: it.item_type,
            media_url: it.media_url,
            caption: it.caption || "",
          });
          packageItemsMap.set(it.content_id, arr);
        });
      }

      if (courseContents?.length) {
        // Map existing contents into 4 language slots (KO/EN/ZH-CN/JA).
        // Priority: existing language_code → fall back to order_index → fill missing slots empty.
        const byLang = new Map<LessonLang, any>();
        courseContents.forEach((c: any, idx: number) => {
          const lang: LessonLang =
            (LESSON_LANGS as readonly string[]).includes(c.language_code)
              ? (c.language_code as LessonLang)
              : (LESSON_LANGS[idx] || "ko");
          if (!byLang.has(lang)) byLang.set(lang, c);
        });

        const slots: ContentItem[] = LESSON_LANGS.map((lang) => {
          const c = byLang.get(lang);
          if (!c) {
            return {
              tempId: crypto.randomUUID(),
              title: "",
              description: "",
              content_type: "document" as ContentType,
              video_url: "",
              video_provider: "custom" as VideoProvider,
              duration_minutes: null,
              is_preview: false,
              is_published: true,
              source: "mangoboard" as ContentSource,
              enTitle: "",
              enDescription: "",
              package_items: [],
              language_code: lang,
            };
          }
          const en = i18nMap.get(c.id);
          const isCard = c.description?.startsWith("[card-content]");
          const isPackage = c.content_type === "media_package";
          let cleanDesc = "";
          let cardUrls: string[] = [];
          if (isCard) {
            const payload = c.description.replace("[card-content]", "");
            try {
              const parsed = JSON.parse(payload);
              cleanDesc = parsed.desc || "";
              cardUrls = parsed.urls || [];
            } catch {
              cleanDesc = payload;
            }
          } else {
            cleanDesc = c.description || "";
          }
          // Force source into mangoboard or package only
          const inferredSource: ContentSource = isPackage
            ? "package"
            : "mangoboard";
          return {
            tempId: c.id,
            title: c.title || "",
            description: cleanDesc,
            content_type: (isPackage ? "media_package" : "document") as ContentType,
            video_url: c.video_url || "",
            video_provider: (c.video_provider || "custom") as VideoProvider,
            duration_minutes: c.duration_minutes,
            is_preview: c.is_preview || false,
            is_published: c.is_published ?? true,
            source: inferredSource,
            enTitle: en?.title || "",
            enDescription: en?.description || "",
            card_urls: cardUrls,
            package_items: isPackage ? (packageItemsMap.get(c.id) || []) : [],
            language_code: lang,
          };
        });
        setContents(slots);
      } else {
        // No existing contents → seed 4 empty language slots
        setContents(buildDefaultLessonSlots());
      }
      setEditDataLoaded(true);
      setDraftLoaded(true);
    })();
  }, [isEditMode, editCourseId, editDataLoaded]);

  // Real-time sync KO → EN for course (auto-copy when user hasn't manually edited EN)
  useEffect(() => {
    if (!enTitleManual && title) setEnTitle(title);
  }, [title, enTitleManual]);
  useEffect(() => {
    if (!enDescManual && description) setEnDescription(description);
  }, [description, enDescManual]);

  // Auto-translate course info
  const handleTranslateCourse = async () => {
    const texts = [title, description].filter(Boolean);
    if (!texts.length) return;
    setTranslatingCourse(true);
    try {
      const results = await translateKoToEn(texts);
      let idx = 0;
      if (title) { setEnTitle(results[idx++] || ""); setEnTitleManual(true); }
      if (description) { setEnDescription(results[idx++] || ""); setEnDescManual(true); }
    } catch { /* silent */ }
    finally { setTranslatingCourse(false); }
  };

  const buildDraftData = useCallback(() => ({
    title, description, categoryId, difficultyLevel,
    estimatedHours, maxStudents, isMandatory, deadline, status, contents,
  }), [title, description, categoryId, difficultyLevel, estimatedHours, maxStudents, isMandatory, deadline, status, contents]);

  const saveDraft = useCallback(async () => {
    if (!user) return;
    setSavingDraft(true);
    try {
      await (supabase.from("course_drafts" as any) as any).upsert({
        user_id: user.id,
        draft_data: buildDraftData(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      setLastSaved(new Date());
      toast({ title: t("createCourse.draftSaved"), description: t("createCourse.draftSavedDesc") });
    } catch {
      toast({ title: t("createCourse.draftFailed"), description: t("createCourse.draftFailedDesc"), variant: "destructive" });
    } finally {
      setSavingDraft(false);
    }
  }, [user, buildDraftData, toast, t]);

  useEffect(() => {
    if (!user || draftLoaded || isEditMode) return;
    (async () => {
      const { data } = await (supabase.from("course_drafts" as any) as any).select("draft_data").eq("user_id", user.id).maybeSingle();
      if (data?.draft_data) {
        const d = data.draft_data as any;
        if (d.title) setTitle(d.title);
        if (d.description) setDescription(d.description);
        if (d.categoryId) setCategoryId(d.categoryId);
        if (d.difficultyLevel) setDifficultyLevel(d.difficultyLevel);
        if (d.estimatedHours) setEstimatedHours(d.estimatedHours);
        if (d.maxStudents) setMaxStudents(d.maxStudents);
        if (d.isMandatory != null) setIsMandatory(d.isMandatory);
        if (d.deadline) setDeadline(d.deadline);
        if (d.status) setStatus(d.status);
        if (d.contents?.length) {
          // Normalize draft contents into the 4 fixed language slots
          const byLang = new Map<LessonLang, any>();
          d.contents.forEach((c: any, idx: number) => {
            const lang: LessonLang =
              (LESSON_LANGS as readonly string[]).includes(c.language_code)
                ? (c.language_code as LessonLang)
                : (LESSON_LANGS[idx] || "ko");
            if (!byLang.has(lang)) byLang.set(lang, c);
          });
          const slots = LESSON_LANGS.map((lang) => {
            const existing = byLang.get(lang);
            const base = buildDefaultLessonSlots().find((s) => s.language_code === lang)!;
            if (!existing) return base;
            const src: ContentSource =
              existing.source === "package" || existing.content_type === "media_package"
                ? "package"
                : "mangoboard";
            return {
              ...base,
              ...existing,
              source: src,
              content_type: src === "package" ? ("media_package" as ContentType) : ("document" as ContentType),
              language_code: lang,
            } as ContentItem;
          });
          setContents(slots);
        } else {
          setContents(buildDefaultLessonSlots());
        }
        toast({ title: t("createCourse.draftRestored"), description: t("createCourse.draftRestoredDesc") });
      } else if (!isEditMode) {
        setContents(buildDefaultLessonSlots());
      }
      setDraftLoaded(true);
    })();
  }, [user, draftLoaded, isEditMode]);

  const deleteDraft = useCallback(async () => {
    if (!user) return;
    await (supabase.from("course_drafts" as any) as any).delete().eq("user_id", user.id);
  }, [user]);

  // 4-language fixed structure: addContent is disabled (always 4 slots).
  const addContent = () => {
    /* no-op: 1 강의 = 4 차시 고정 (KO/EN/ZH-CN/JA) */
  };

  const updateContent = (tempId: string, field: keyof ContentItem, value: any) => {
    setContents((prev) =>
      prev.map((c) => {
        if (c.tempId !== tempId) return c;
        const updated = { ...c, [field]: value };
        // When switching source, reset relevant fields
        if (field === "source") {
          if (value === "mangoboard") {
            updated.content_type = "document";
            updated.video_provider = "custom";
            updated.video_url = "";
            updated.card_image_url = "";
          } else if (value === "card") {
            updated.content_type = "document";
            updated.video_provider = "custom";
            updated.video_url = "";
            updated.card_image_url = "";
          } else if (value === "package" || value === "images") {
            updated.content_type = "media_package" as ContentType;
            updated.video_provider = "";
            updated.video_url = "";
            updated.card_image_url = "";
            if (!updated.package_items) updated.package_items = [];
          } else {
            updated.content_type = "video";
            updated.video_provider = "";
            updated.video_url = "";
            updated.card_image_url = "";
          }
        }
        // Auto-sync KO → EN for content items (only if EN hasn't been manually set differently)
        if (field === "title" && (c.enTitle === c.title || !c.enTitle)) {
          updated.enTitle = value;
        }
        if (field === "description" && (c.enDescription === c.description || !c.enDescription)) {
          updated.enDescription = value;
        }
        return updated;
      })
    );
  };

  const removeContent = (tempId: string) => {
    setContents((prev) => prev.filter((c) => c.tempId !== tempId));
  };

  /* ── Auto-translate KO lesson title/description into EN/ZH-CN/JA slots ──
     Triggered with debounce whenever the KO slot's title or description changes. */
  const koSlot = contents.find((c) => c.language_code === "ko");
  const koTitle = koSlot?.title || "";
  const koDesc = koSlot?.description || "";
  const [autoTranslating, setAutoTranslating] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!koTitle && !koDesc) return;
    const handle = setTimeout(async () => {
      const targets: TargetLang[] = ["en", "zh-CN", "ja"];
      // Mark all targets as translating
      setAutoTranslating((s) => ({ ...s, en: true, "zh-CN": true, ja: true }));
      try {
        const results = await Promise.all(
          targets.map(async (lang) => {
            try {
              const out = await translateKoTo(lang, [koTitle || "", koDesc || ""]);
              return { lang, title: out[0] || "", description: out[1] || "" };
            } catch {
              return { lang, title: "", description: "" };
            }
          })
        );
        setContents((prev) =>
          prev.map((c) => {
            if (c.language_code === "ko") return c;
            if (c.manual_translation_override) return c; // 수동 편집 슬롯은 보존
            const r = results.find((x) => x.lang === c.language_code);
            if (!r) return c;
            return {
              ...c,
              title: r.title || c.title,
              description: r.description || c.description,
            };
          })
        );
      } finally {
        setAutoTranslating({});
      }
    }, 1200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [koTitle, koDesc, contents.filter((c) => c.language_code !== "ko").map((c) => c.manual_translation_override ? "1" : "0").join(",")]);

  const uploadThumbnail = async (courseId: string): Promise<string | null> => {
    if (!thumbnailFile) return null;
    const ext = thumbnailFile.name.split(".").pop();
    const path = `${user!.id}/${courseId}.${ext}`;
    const { error } = await supabase.storage
      .from("course-thumbnails")
      .upload(path, thumbnailFile, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("course-thumbnails").getPublicUrl(path);
    return data.publicUrl;
  };

  const applyImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("common.error"), description: t("createCourse.imageSizeError"), variant: "destructive" });
      return;
    }
    setThumbnailFile(file);
    setThumbnailPreview(URL.createObjectURL(file));
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyImageFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) { applyImageFile(file); break; }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) applyImageFile(file);
  };

  const removeThumbnail = () => {
    setThumbnailFile(null);
    setThumbnailPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      let thumbnailUrl = existingThumbnailUrl;
      if (thumbnailFile) {
        thumbnailUrl = await uploadThumbnail(editCourseId!);
      }

      const { error: courseError } = await supabase
        .from("courses")
        .update({
          title,
          description: description || null,
          category_id: categoryId || null,
          difficulty_level: difficultyLevel,
          estimated_duration_hours: estimatedHours ? parseInt(estimatedHours) : null,
          max_students: maxStudents ? parseInt(maxStudents) : null,
          is_mandatory: isMandatory,
          is_sequential: isSequential,
          deadline: deadline || null,
          status,
          thumbnail_url: thumbnailUrl,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", editCourseId!);
      if (courseError) throw courseError;

      // Delete existing contents and re-insert
      await supabase.from("course_content_i18n").delete().eq("language_code", "en").in("content_id",
        (await supabase.from("course_contents").select("id").eq("course_id", editCourseId!)).data?.map((c: any) => c.id) || []
      );
      await supabase.from("course_contents").delete().eq("course_id", editCourseId!);

      // Save course i18n
      if (enTitle || enDescription) {
        await supabase.from("course_i18n").upsert({
          course_id: editCourseId!,
          language_code: "en",
          title: enTitle || title,
          description: enDescription || description || null,
        }, { onConflict: "course_id,language_code" });
      }

      if (contents.length > 0) {
        // KO 차시의 공통 옵션을 다른 언어 차시로 복사
        const koContent = contents.find((c) => c.language_code === "ko");
        const contentRows = contents.map((c, idx) => {
          const isKoRow = c.language_code === "ko";
          // description: 비-KO 슬롯은 자체 값(자동번역 또는 수동수정) 사용
          return {
            course_id: editCourseId!,
            title: c.title || `Lesson ${idx + 1}`,
            description: c.source === "card" ? `[card-content]${JSON.stringify({ urls: c.card_urls || [], desc: c.description || "" })}` : (c.description || null),
            content_type: ((c.source === "package" || c.source === "images") ? "media_package" : c.content_type),
            video_url: c.source === "card" ? (c.card_urls?.[0] || c.video_url || null) : (c.video_url || null),
            video_provider: c.video_provider || null,
            duration_minutes: isKoRow ? c.duration_minutes : (koContent?.duration_minutes ?? c.duration_minutes),
            order_index: idx,
            is_preview: isKoRow ? c.is_preview : (koContent?.is_preview ?? c.is_preview),
            is_published: isKoRow ? c.is_published : (koContent?.is_published ?? c.is_published),
            language_code: c.language_code,
          };
        });
        const { data: insertedContents, error: contentError } = await supabase
          .from("course_contents")
          .insert(contentRows)
          .select("id");
        if (contentError) throw contentError;

        // Save content i18n
        if (insertedContents?.length) {
          const i18nRows = insertedContents.map((ic: any, idx: number) => ({
            content_id: ic.id,
            language_code: "en",
            title: contents[idx].enTitle || contents[idx].title,
            description: contents[idx].enDescription || contents[idx].description || null,
          })).filter((r: any) => r.title);
          if (i18nRows.length) {
            await supabase.from("course_content_i18n").insert(i18nRows);
          }

          // Save media package items
          const pkgRows: any[] = [];
          insertedContents.forEach((ic: any, idx: number) => {
            const c = contents[idx];
            if ((c.source === "package" || c.source === "images") && c.package_items?.length) {
              c.package_items.forEach((it, itIdx) => {
                if (!it.media_url) return;
                pkgRows.push({
                  content_id: ic.id,
                  item_type: it.item_type,
                  media_url: it.media_url,
                  caption: it.caption || null,
                  order_index: itIdx,
                });
              });
            }
          });
          if (pkgRows.length) {
            await (supabase as any).from("media_package_items").insert(pkgRows);
          }
        }
      }

      return { id: editCourseId!, title };
    },
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: ["teacher-courses"] });
      queryClient.invalidateQueries({ queryKey: ["course", editCourseId] });
      toast({ title: t("createCourse.courseUpdated", "강의가 수정되었습니다"), description: title });
      navigate(-1);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: course, error: courseError } = await supabase
        .from("courses")
        .insert({
          title,
          description: description || null,
          category_id: categoryId || null,
          instructor_id: user!.id,
          difficulty_level: difficultyLevel,
          estimated_duration_hours: estimatedHours ? parseInt(estimatedHours) : null,
          max_students: maxStudents ? parseInt(maxStudents) : null,
          is_mandatory: isMandatory,
          is_sequential: isSequential,
          deadline: deadline || null,
          status,
        } as any)
        .select()
        .single();
      if (courseError) throw courseError;

      if (thumbnailFile) {
        const thumbnailUrl = await uploadThumbnail(course.id);
        if (thumbnailUrl) {
          await supabase.from("courses").update({ thumbnail_url: thumbnailUrl }).eq("id", course.id);
          course.thumbnail_url = thumbnailUrl;
        }
      }

      // Save course i18n
      if (enTitle || enDescription) {
        await supabase.from("course_i18n").insert({
          course_id: course.id,
          language_code: "en",
          title: enTitle || title,
          description: enDescription || description || null,
        });
      }

      if (contents.length > 0) {
        // KO 차시의 공통 옵션을 다른 언어 차시로 복사
        const koContent = contents.find((c) => c.language_code === "ko");
        const contentRows = contents.map((c, idx) => {
          const isKoRow = c.language_code === "ko";
          // description: 비-KO 슬롯은 자체 값(자동번역 또는 수동수정) 사용
          return {
            course_id: course.id,
            title: c.title || `Lesson ${idx + 1}`,
            description: c.source === "card" ? `[card-content]${JSON.stringify({ urls: c.card_urls || [], desc: c.description || "" })}` : (c.description || null),
            content_type: ((c.source === "package" || c.source === "images") ? "media_package" : c.content_type),
            video_url: c.source === "card" ? (c.card_urls?.[0] || c.video_url || null) : (c.video_url || null),
            video_provider: c.video_provider || null,
            duration_minutes: isKoRow ? c.duration_minutes : (koContent?.duration_minutes ?? c.duration_minutes),
            order_index: idx,
            is_preview: isKoRow ? c.is_preview : (koContent?.is_preview ?? c.is_preview),
            is_published: isKoRow ? c.is_published : (koContent?.is_published ?? c.is_published),
            language_code: c.language_code,
          };
        });
        const { data: insertedContents, error: contentError } = await supabase
          .from("course_contents")
          .insert(contentRows)
          .select("id");
        if (contentError) throw contentError;

        // Save content i18n
        if (insertedContents?.length) {
          const i18nRows = insertedContents.map((ic: any, idx: number) => ({
            content_id: ic.id,
            language_code: "en",
            title: contents[idx].enTitle || contents[idx].title,
            description: contents[idx].enDescription || contents[idx].description || null,
          })).filter((r: any) => r.title);
          if (i18nRows.length) {
            await supabase.from("course_content_i18n").insert(i18nRows);
          }

          // Save media package items
          const pkgRows: any[] = [];
          insertedContents.forEach((ic: any, idx: number) => {
            const c = contents[idx];
            if ((c.source === "package" || c.source === "images") && c.package_items?.length) {
              c.package_items.forEach((it, itIdx) => {
                if (!it.media_url) return;
                pkgRows.push({
                  content_id: ic.id,
                  item_type: it.item_type,
                  media_url: it.media_url,
                  caption: it.caption || null,
                  order_index: itIdx,
                });
              });
            }
          });
          if (pkgRows.length) {
            await (supabase as any).from("media_package_items").insert(pkgRows);
          }
        }
      }

      return course;
    },
    onSuccess: async (course) => {
      await deleteDraft();
      queryClient.invalidateQueries({ queryKey: ["teacher-courses"] });
      toast({ title: t("createCourse.courseCreated"), description: t("createCourse.courseCreatedDesc", { title: course.title }) });
      navigate(`/courses/${course.id}`);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: t("common.error"), description: t("createCourse.titleRequired2"), variant: "destructive" });
      return;
    }
    // 차시 title은 비어 있으면 자동으로 "Lesson N"으로 저장되므로 강제하지 않음.
    // 망고보드 슬롯이 URL 없이 비어 있어도 OK — 빈 슬롯은 학생 화면에서 "준비 중" 처리됨.
    if (isEditMode) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const dateLocale = isEn ? enUS : ko;
  const formatDeadline = (d: string) => {
    const parsed = parse(d, "yyyy-MM-dd", new Date());
    return isEn ? format(parsed, "MMM d, yyyy") : format(parsed, "yyyy년 M월 d일");
  };

  return (
    <DashboardLayout role={layoutRole}>
      <form onSubmit={handleSubmit} className="space-y-8">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t("createCourse.backButton")}
        </button>

        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {isEditMode ? t("createCourse.editTitle", "강의 수정") : t("createCourse.title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditMode ? t("createCourse.editSubtitle", "강의 정보와 차시를 수정할 수 있습니다.") : t("createCourse.subtitle")}
          </p>
        </div>

        {/* Course Info */}
        <div className="stat-card space-y-3.5">
          <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2">{t("createCourse.courseInfo")}</h2>

          {/* Thumbnail Upload */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("createCourse.thumbnailLabel")}</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleThumbnailChange} className="hidden" />
            {thumbnailPreview ? (
              <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
                <img src={thumbnailPreview} alt={t("createCourse.thumbnailAlt")} className="w-full h-full object-cover" />
                <button type="button" onClick={removeThumbnail} className="absolute top-2 right-2 h-7 w-7 rounded-md bg-background/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} onPaste={handlePaste} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
                className="w-full h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 focus:border-primary/50 focus:outline-none flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors" tabIndex={0}>
                <ImagePlus className="h-5 w-5" />
                <span className="text-[11px]">{t("createCourse.thumbnailDropHint")}</span>
              </button>
            )}
          </div>

          <Tabs defaultValue="ko" className="w-full">
            <TabsList className="w-full h-9">
              <TabsTrigger value="ko" className="flex-1 text-xs">{t("course.koTab", "한국어")}</TabsTrigger>
              <TabsTrigger value="en" className="flex-1 text-xs">{t("course.enTab", "English")}</TabsTrigger>
            </TabsList>

            <TabsContent value="ko" className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("createCourse.courseTitleRequired")}</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("createCourse.courseTitleExample")} className="h-9 rounded-lg border-border text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("createCourse.descriptionLabel")}</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("createCourse.descriptionPlaceholder2")} className="min-h-[68px] rounded-lg border-border resize-none text-sm" />
              </div>
            </TabsContent>

            <TabsContent value="en" className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">{t("course.enOptional", "영어 버전 (선택)")}</p>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleTranslateCourse} disabled={translatingCourse || (!title && !description)}>
                  <Languages className="h-3 w-3" />
                  {t("course.autoTranslate", "자동 번역")}
                </Button>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("course.enTitle", "영어 제목")}</label>
                <Input value={enTitle} onChange={(e) => setEnTitle(e.target.value)} placeholder="English title" className="h-9 rounded-lg border-border text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("course.enDescription", "영어 설명")}</label>
                <Textarea value={enDescription} onChange={(e) => setEnDescription(e.target.value)} placeholder="English description" className="min-h-[68px] rounded-lg border-border resize-none text-sm" />
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("createCourse.categoryLabel2")}</label>
              <CategorySelect value={categoryId} onValueChange={setCategoryId} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("createCourse.difficultyLabel2")}</label>
              <Select value={difficultyLevel} onValueChange={setDifficultyLevel}>
                <SelectTrigger className="h-9 rounded-lg border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">{t("createCourse.beginnerLevel")}</SelectItem>
                  <SelectItem value="intermediate">{t("createCourse.intermediateLevel")}</SelectItem>
                  <SelectItem value="advanced">{t("createCourse.advancedLevel")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("createCourse.estimatedDurationLabel")}</label>
              <Input type="number" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} placeholder={t("createCourse.estimatedDurationExample")} className="h-9 rounded-lg border-border text-sm" min="0" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("createCourse.maxStudentsLabel")}</label>
              <Input type="number" value={maxStudents} onChange={(e) => setMaxStudents(e.target.value)} placeholder={t("createCourse.maxStudentsPlaceholder")} className="h-9 rounded-lg border-border text-sm" min="1" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("createCourse.deadlineLabelCreate")}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={`h-9 w-full rounded-lg border-border justify-start text-left font-normal text-sm ${!deadline ? "text-muted-foreground" : ""}`}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deadline ? formatDeadline(deadline) : t("createCourse.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl shadow-lg border-border" align="start">
                  <Calendar mode="single" locale={dateLocale} selected={deadline ? parse(deadline, "yyyy-MM-dd", new Date()) : undefined} onSelect={(date) => setDeadline(date ? format(date, "yyyy-MM-dd") : "")} initialFocus className="rounded-2xl" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("createCourse.publishStatusLabel")}</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 rounded-lg border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t("createCourse.draftPrivate")}</SelectItem>
                  <SelectItem value="published">{t("createCourse.publishedOpen")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-xs font-medium text-foreground">{t("createCourse.mandatoryLabel")}</p>
              <p className="text-[11px] text-muted-foreground">{t("createCourse.mandatoryDesc2")}</p>
            </div>
            <Switch checked={isMandatory} onCheckedChange={setIsMandatory} />
          </div>
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-xs font-medium text-foreground">{t("course.sequentialToggle")}</p>
              <p className="text-[11px] text-muted-foreground">{t("course.sequentialToggleDesc")}</p>
            </div>
            <Switch checked={isSequential} onCheckedChange={setIsSequential} />
          </div>
        </div>

        {/* Contents — 1 강의 = 4 차시 (KO/EN/ZH-CN/JA) 고정 */}
        <div className="bg-accent/50 border border-accent rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {t("createCourse.lessonSectionTitle", "차시 (4개 언어 고정)")}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "createCourse.lessonSectionHint",
                "1차시 한국어 · 2차시 영어 · 3차시 중국어 간체 · 4차시 일본어로 자동 구성됩니다. 각 언어별로 망고보드 또는 미디어 패키지 콘텐츠를 등록하세요."
              )}
            </p>
          </div>

          <div className="space-y-3">
            {contents.map((content, idx) => (
              <UnifiedContentEditor
                key={content.tempId}
                content={content}
                index={idx}
                onChange={(field, value) => updateContent(content.tempId, field, value)}
                onRemove={() => { /* fixed 4 slots — removal disabled */ }}
                contentTypeOptions={contentTypeOptions}
                videoProviderOptions={videoProviderOptions}
                t={t}
                isAutoTranslating={!!autoTranslating[content.language_code]}
              />
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-4 border-t border-border">
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate(-1)}>
            {t("createCourse.cancel")}
          </Button>
          {!isEditMode && (
            <Button type="button" variant="outline" className="rounded-xl gap-2" onClick={saveDraft} disabled={savingDraft}>
              <Save className="h-4 w-4" />
              {savingDraft ? t("createCourse.savingBtn") : t("createCourse.saveDraftBtn")}
            </Button>
          )}
          <Button type="submit" variant="login" size="xl" disabled={isEditMode ? updateMutation.isPending : createMutation.isPending}>
            {isEditMode
              ? (updateMutation.isPending ? t("createCourse.updatingBtn", "수정 중...") : t("createCourse.updateBtn", "수정하기"))
              : (createMutation.isPending ? t("createCourse.creatingBtn") : t("createCourse.createBtn"))
            }
          </Button>
          {!isEditMode && lastSaved && (
            <span className="text-xs text-muted-foreground ml-auto">
              {t("createCourse.lastSaved", { time: format(lastSaved, "HH:mm:ss") })}
            </span>
          )}
        </div>
      </form>
    </DashboardLayout>
  );
};

/* ───── Unified Content Editor ───── */

const UnifiedContentEditor = ({
  content, index, onChange, onRemove, contentTypeOptions, videoProviderOptions, t, isAutoTranslating,
}: {
  content: ContentItem;
  index: number;
  onChange: (field: keyof ContentItem, value: any) => void;
  onRemove: () => void;
  contentTypeOptions: { value: ContentType; label: string; icon: React.ElementType }[];
  videoProviderOptions: { value: VideoProvider; label: string }[];
  t: any;
  isAutoTranslating?: boolean;
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const isMango = content.source === "mangoboard";
  const isCard = content.source === "card";
  const isPackage = content.source === "package";
  const isImages = content.source === "images";
  const isValidMangoboard = isMango && content.video_url.includes("mangoboard.net");
  const Icon = isImages ? ImageIcon : isPackage ? Package : isCard ? LayoutGrid : isMango ? BookOpen : (contentTypeOptions.find((o) => o.value === content.content_type)?.icon || Video);

  // Real-time sync KO → EN
  useEffect(() => {
    if (!content.enTitle && content.title) onChange("enTitle", content.title);
    if (!content.enDescription && content.description) onChange("enDescription", content.description);
  }, [content.title, content.description]);

  const handleTranslateContent = async () => {
    const texts = [content.title, content.description].filter(Boolean);
    if (!texts.length) return;
    setTranslating(true);
    try {
      const results = await translateKoToEn(texts);
      let idx = 0;
      if (content.title) onChange("enTitle", results[idx++] || "");
      if (content.description) onChange("enDescription", results[idx++] || "");
    } catch { /* silent */ }
    finally { setTranslating(false); }
  };

  const handlePreview = () => {
    if (!isValidMangoboard) return;
    setPreviewError(false);
    setPreviewLoading(true);
    setShowPreview(true);
  };

  const lessonLang = (content.language_code || LESSON_LANGS[index] || "ko") as LessonLang;
  const langLabel = LESSON_LANG_LABELS[lessonLang];
  const isKo = lessonLang === "ko";

  return (
    <div className="stat-card !p-4 space-y-4">
      {/* Header row — language slot is fixed; deletion disabled */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs font-medium">{String(index + 1).padStart(2, "0")}</span>
        </div>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isPackage ? "bg-primary/10" : "bg-accent"}`}>
          <Icon className={`h-4 w-4 ${isPackage ? "text-primary" : "text-accent-foreground"}`} />
        </div>
        <Badge variant="secondary" className="rounded-md text-[10px] font-medium shrink-0 whitespace-nowrap">
          {langLabel}
        </Badge>
        <Input
          value={content.title}
          onChange={(e) => {
            if (isKo) {
              onChange("title", e.target.value);
            } else if (content.manual_translation_override) {
              onChange("title", e.target.value);
            }
          }}
          readOnly={!isKo && !content.manual_translation_override}
          placeholder={isKo ? `${langLabel} 차시 제목` : (isAutoTranslating ? "번역 중..." : "한국어 제목 입력 시 자동 번역")}
          className={`flex-1 h-9 rounded-lg border-border text-sm ${!isKo && !content.manual_translation_override ? "bg-muted/40 cursor-not-allowed" : ""}`}
          title={!isKo && !content.manual_translation_override ? "자동 번역됨 — 수정하려면 잠금을 해제하세요" : undefined}
        />
        {!isKo && isAutoTranslating && (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 inline-flex items-center gap-1">
            <Languages className="h-3 w-3 animate-pulse" /> 번역 중
          </span>
        )}
      </div>

      {!isKo && (
        <div className="pl-14 -mt-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5">
            {content.manual_translation_override ? (
              <Badge variant="outline" className="rounded-md text-[10px] font-medium gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                <Pencil className="h-2.5 w-2.5" /> 직접 수정됨
              </Badge>
            ) : isAutoTranslating ? (
              <Badge variant="outline" className="rounded-md text-[10px] font-medium gap-1 border-border bg-muted/40">
                <Languages className="h-2.5 w-2.5 animate-pulse" /> 자동 번역 중…
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-md text-[10px] font-medium gap-1 border-border bg-muted/40 text-muted-foreground">
                <Lock className="h-2.5 w-2.5" /> 자동 번역됨 (읽기 전용)
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              한국어(1차시) 제목·설명을 자동 번역합니다.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange("manual_translation_override", !content.manual_translation_override)}
            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            {content.manual_translation_override ? (
              <><RotateCcw className="h-3 w-3" /> 자동번역으로 되돌리기</>
            ) : (
              <><Pencil className="h-3 w-3" /> 직접 수정</>
            )}
          </button>
        </div>
      )}

      <div className="pl-14 space-y-3">
        {/* Source selector: 망고보드 / 미디어 패키지 only */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase">{t("createCourse.contentSourceLabel")}</label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onChange("source", "mangoboard")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all border ${
                isMango
                  ? "bg-accent text-foreground border-border"
                  : "bg-transparent text-muted-foreground border-transparent hover:bg-accent/50"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t("createCourse.sourceMangoboard")}
            </button>
            <button
              type="button"
              onClick={() => onChange("source", "package")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all border ${
                isPackage
                  ? "bg-accent text-foreground border-border"
                  : "bg-transparent text-muted-foreground border-transparent hover:bg-accent/50"
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              미디어 패키지
            </button>
            <button
              type="button"
              onClick={() => onChange("source", "images")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all border ${
                isImages
                  ? "bg-accent text-foreground border-border"
                  : "bg-transparent text-muted-foreground border-transparent hover:bg-accent/50"
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              이미지
            </button>
          </div>
        </div>

        {isPackage || isImages ? (
          <PackageItemsEditor
            items={content.package_items || []}
            onChange={(items) => onChange("package_items", items)}
            imagesOnly={isImages}
          />
        ) : isMango ? (
          /* ── Mangoboard fields ── */
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase flex items-center gap-1">
                <Link2 className="h-3 w-3" /> {t("createCourse.mangoLinkLabel")}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input value={content.video_url} onChange={(e) => { onChange("video_url", e.target.value); setShowPreview(false); setPreviewError(false); }} placeholder="https://www.mangoboard.net/publish/52632315" className="h-9 rounded-lg border-border text-xs pr-8" />
                  {isValidMangoboard && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <div className="h-4 w-4 rounded-full bg-green-500/20 flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                      </div>
                    </div>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-lg gap-1.5 text-xs shrink-0 h-9" disabled={!isValidMangoboard} onClick={handlePreview}>
                  <Eye className="h-3.5 w-3.5" /> {t("createCourse.preview")}
                </Button>
                {isValidMangoboard && (
                  <a href={normalizeMangoboardUrl(content.video_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0" title={t("createCourse.openNewTab")}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{t("createCourse.mangoHint")}</p>
            </div>

            {isKo && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">{t("createCourse.durationLabel")}</label>
                <Input type="number" value={content.duration_minutes ?? ""} onChange={(e) => onChange("duration_minutes", e.target.value ? parseInt(e.target.value) : null)} placeholder={t("createCourse.durationPlaceholder")} className="h-9 rounded-lg border-border text-xs" min="0" />
              </div>
            )}

            {showPreview && isValidMangoboard && (
              <div className="rounded-xl border border-border overflow-hidden bg-muted/30">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-[10px] text-muted-foreground truncate">{content.video_url}</span>
                  </div>
                  <button type="button" onClick={() => setShowPreview(false)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2">
                    {t("createCourse.closePreview")}
                  </button>
                </div>
                <div className="relative aspect-video">
                  {previewLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
                      <div className="w-full px-4 space-y-2 text-center" role="status" aria-live="polite">
                        <Skeleton className="h-4 w-28 mx-auto" />
                        <Skeleton className="h-2 w-40 mx-auto" />
                        <span className="text-xs text-muted-foreground">{t("createCourse.loadingText")}</span>
                      </div>
                    </div>
                  )}
                  {previewError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
                      <div className="flex flex-col items-center gap-2 text-center px-4">
                        <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                          <ExternalLink className="h-5 w-5 text-destructive" />
                        </div>
                        <p className="text-xs text-muted-foreground">{t("createCourse.previewFailed")}</p>
                        <a href={normalizeMangoboardUrl(content.video_url)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          {t("createCourse.openDirectly")}
                        </a>
                      </div>
                    </div>
                  )}
                  <iframe src={normalizeMangoboardUrl(content.video_url)} className="w-full h-full" title={t("createCourse.mangoPreviewTitle")} allowFullScreen onLoad={() => setPreviewLoading(false)} onError={() => { setPreviewLoading(false); setPreviewError(true); }} />
                </div>
              </div>
            )}
          </>
        ) : isCard ? (
          /* ── Card fields (multiple cards, 9:16) ── */
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-medium text-muted-foreground uppercase flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> 카드 이미지/영상 URL 목록
              </label>
              <p className="text-[10px] text-muted-foreground">
                세로형 카드 (1080×1920) 사이즈의 이미지 또는 영상 링크를 여러 장 등록할 수 있습니다.
              </p>

              {/* Existing card URLs */}
              {(content.card_urls || []).map((url, cardIdx) => (
                <div key={cardIdx} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">{cardIdx + 1}</span>
                  <Input
                    value={url}
                    onChange={(e) => {
                      const newUrls = [...(content.card_urls || [])];
                      newUrls[cardIdx] = e.target.value;
                      onChange("card_urls", newUrls);
                    }}
                    placeholder="이미지 URL 또는 영상 URL"
                    className="h-8 rounded-lg border-border text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newUrls = (content.card_urls || []).filter((_, i) => i !== cardIdx);
                      onChange("card_urls", newUrls);
                    }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {cardIdx > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newUrls = [...(content.card_urls || [])];
                        [newUrls[cardIdx - 1], newUrls[cardIdx]] = [newUrls[cardIdx], newUrls[cardIdx - 1]];
                        onChange("card_urls", newUrls);
                      }}
                      className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors shrink-0"
                      title="위로 이동"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add new card URL */}
              <button
                type="button"
                onClick={() => {
                  const newUrls = [...(content.card_urls || []), ""];
                  onChange("card_urls", newUrls);
                }}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors py-1"
              >
                <Plus className="h-3.5 w-3.5" />
                카드 추가
              </button>
            </div>

            {isKo && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">{t("createCourse.durationLabel")}</label>
                <Input type="number" value={content.duration_minutes ?? ""} onChange={(e) => onChange("duration_minutes", e.target.value ? parseInt(e.target.value) : null)} placeholder={t("createCourse.durationPlaceholder")} className="h-9 rounded-lg border-border text-xs" min="0" />
              </div>
            )}

            {/* Card previews */}
            {(content.card_urls || []).filter(u => u).length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">미리보기 ({(content.card_urls || []).filter(u => u).length}장)</label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {(content.card_urls || []).filter(u => u).map((url, i) => (
                    <div key={i} className="w-24 rounded-lg border border-border overflow-hidden bg-muted/30 shrink-0" style={{ aspectRatio: "9/16" }}>
                      {url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i) ? (
                        <img src={url} alt={`카드 ${i + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <iframe src={url} className="w-full h-full pointer-events-none" title={`카드 ${i + 1}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── Video fields ── */
          <>
            <div className={isKo ? "grid grid-cols-2 gap-3" : ""}>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">{t("createCourse.typeLabel")}</label>
                <Select value={content.content_type} onValueChange={(v) => onChange("content_type", v as ContentType)}>
                  <SelectTrigger className="h-9 rounded-lg border-border text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {contentTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isKo && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">{t("createCourse.durationLabel")}</label>
                  <Input type="number" value={content.duration_minutes ?? ""} onChange={(e) => onChange("duration_minutes", e.target.value ? parseInt(e.target.value) : null)} placeholder={t("createCourse.durationPlaceholder")} className="h-9 rounded-lg border-border text-xs" min="0" />
                </div>
              )}
            </div>

            {(content.content_type === "video" || content.content_type === "live") && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">{t("createCourse.videoUrlLabel")}</label>
                  <Input value={content.video_url} onChange={(e) => onChange("video_url", e.target.value)} placeholder="https://youtube.com/watch?v=..." className="h-9 rounded-lg border-border text-xs" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">{t("createCourse.providerLabel")}</label>
                  <Select value={content.video_provider || ""} onValueChange={(v) => onChange("video_provider", v)}>
                    <SelectTrigger className="h-9 rounded-lg border-border text-xs">
                      <SelectValue placeholder={t("createCourse.providerPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {videoProviderOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </>
        )}

        {/* Description: KO 입력 → 자동번역. 비-KO는 잠금/수정 가능 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-muted-foreground uppercase">{t("createCourse.descLabel")}</label>
            {!isKo && (
              content.manual_translation_override ? (
                <Badge variant="outline" className="rounded-md text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                  <Pencil className="h-2.5 w-2.5" /> 직접 수정됨
                </Badge>
              ) : isAutoTranslating ? (
                <Badge variant="outline" className="rounded-md text-[10px] gap-1">
                  <Languages className="h-2.5 w-2.5 animate-pulse" /> 자동 번역 중…
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-md text-[10px] gap-1 text-muted-foreground">
                  <Lock className="h-2.5 w-2.5" /> 자동 번역됨
                </Badge>
              )
            )}
          </div>
          <Textarea
            value={content.description}
            onChange={(e) => {
              if (isKo || content.manual_translation_override) onChange("description", e.target.value);
            }}
            readOnly={!isKo && !content.manual_translation_override}
            placeholder={
              isKo
                ? t("createCourse.contentDescPlaceholder")
                : (isAutoTranslating ? "번역 중..." : "한국어 설명 입력 시 자동 번역됩니다")
            }
            className={`min-h-[60px] rounded-lg border-border text-xs resize-none ${!isKo && !content.manual_translation_override ? "bg-muted/40 cursor-not-allowed" : ""}`}
          />
        </div>

        {isKo && (
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={content.is_preview} onCheckedChange={(v) => onChange("is_preview", v)} className="scale-75" />
              {t("createCourse.allowPreview")}
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={content.is_published} onCheckedChange={(v) => onChange("is_published", v)} className="scale-75" />
              {t("createCourse.publishToggle")}
            </label>
            <button type="button" onClick={() => setShowEn(!showEn)} className="ml-auto flex items-center gap-1 text-[10px] text-primary hover:underline">
              <Languages className="h-3 w-3" />
              {showEn ? t("course.koTab", "한국어") : "English"}
            </button>
          </div>
        )}

        {isKo && showEn && (
          <div className="space-y-3 p-3 rounded-lg bg-accent/50 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground uppercase">English</span>
              <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={handleTranslateContent} disabled={translating || (!content.title && !content.description)}>
                <Languages className="h-2.5 w-2.5" />
                {t("course.autoTranslate", "자동 번역")}
              </Button>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">{t("course.enTitle", "영어 제목")}</label>
              <Input value={content.enTitle} onChange={(e) => onChange("enTitle", e.target.value)} placeholder="English title" className="h-8 rounded-lg border-border text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">{t("course.enDescription", "영어 설명")}</label>
              <Textarea value={content.enDescription} onChange={(e) => onChange("enDescription", e.target.value)} placeholder="English description" className="min-h-[40px] rounded-lg border-border text-xs resize-none" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ───── Helpers ───── */

function normalizeMangoboardUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith("http")) {
    normalized = "https://" + normalized;
  }
  return normalized;
}

/* ───── Media Package Items Editor ───── */

const PackageItemsEditor = ({
  items,
  onChange,
  imagesOnly = false,
}: {
  items: PackageItemDraft[];
  onChange: (items: PackageItemDraft[]) => void;
  imagesOnly?: boolean;
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const guessType = (url: string): "image" | "video" => {
    if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url)) return "video";
    if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(url)) return "image";
    return "image";
  };

  const uploadOneImage = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "media-package");
    const { data, error } = await supabase.functions.invoke("bunny-upload-image", { body: fd });
    if (error || !data?.url) throw new Error(error?.message || data?.error || "upload failed");
    return data.url as string;
  };

  const uploadOneVideo = (file: File, onProgress: (pct: number) => void): Promise<string> =>
    new Promise(async (resolve, reject) => {
      try {
        const { data: token, error: tokenErr } = await supabase.functions.invoke(
          "bunny-create-video",
          { body: { title: file.name } }
        );
        if (tokenErr || !token?.uploadUrl) {
          throw new Error(tokenErr?.message || token?.error || "token failed");
        }
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", token.uploadUrl, true);
        xhr.setRequestHeader("AccessKey", token.accessKey);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.max(2, Math.round((e.loaded / e.total) * 95)));
          }
        };
        xhr.onload = async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const cdn = token.cdnHostname as string | null;
            const playUrl = cdn
              ? `https://${cdn}/${token.videoId}/playlist.m3u8`
              : `https://iframe.mediadelivery.net/play/${token.libraryId}/${token.videoId}`;
            const thumb = cdn ? `https://${cdn}/${token.videoId}/thumbnail.jpg` : null;
            // Best-effort registration to video_assets (non-blocking)
            try {
              await supabase.from("video_assets").insert({
                title: file.name,
                video_url: playUrl,
                video_provider: "bunny",
                file_size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
                thumbnail_url: thumb,
              } as any);
            } catch {}
            resolve(playUrl);
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

  const handleBulkFiles = async (
    fileList: FileList | null,
    mode: "image" | "video" | "auto" = "auto"
  ) => {
    if (!fileList || fileList.length === 0) return;
    const allowed = Array.from(fileList).filter((f) => {
      if (mode === "image") return f.type.startsWith("image/");
      if (mode === "video") return f.type.startsWith("video/");
      return f.type.startsWith("image/") || f.type.startsWith("video/");
    });
    if (allowed.length === 0) {
      toast({
        title:
          mode === "video"
            ? "동영상 파일만 업로드할 수 있습니다."
            : mode === "image"
            ? "이미지 파일만 업로드할 수 있습니다."
            : "이미지 또는 동영상 파일만 업로드할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    // ── Duplicate detection (filename + size) ──
    const sigOf = (name: string, size: number) => `${name}::${size}`;
    const existingSigs = new Set(
      items.map((it: any) => it._sig).filter(Boolean) as string[]
    );
    const seenInBatch = new Set<string>();
    const duplicates: string[] = [];
    const unique: File[] = [];
    for (const f of allowed) {
      const sig = sigOf(f.name, f.size);
      if (existingSigs.has(sig) || seenInBatch.has(sig)) {
        duplicates.push(f.name);
        continue;
      }
      seenInBatch.add(sig);
      unique.push(f);
    }

    if (duplicates.length > 0) {
      toast({
        title: `중복 파일 ${duplicates.length}개를 자동 제외했습니다.`,
        description: `이미 추가된 파일과 동일(파일명+용량): ${duplicates.slice(0, 5).join(", ")}${duplicates.length > 5 ? ` 외 ${duplicates.length - 5}개` : ""}`,
        variant: "destructive",
      });
    }

    if (unique.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }

    setBulkUploading(true);
    setBulkProgress({ done: 0, total: unique.length });

    // Pre-create placeholders so user sees order immediately
    const placeholders: PackageItemDraft[] = unique.map((f) => ({
      tempId: crypto.randomUUID(),
      item_type: f.type.startsWith("video/") ? "video" : "image",
      media_url: "",
      caption: "",
      _uploadingName: f.name,
      _sig: sigOf(f.name, f.size),
    } as any));
    let working = [...items, ...placeholders];
    onChange(working);

    let done = 0;
    const failed: string[] = [];

    // Sequential to preserve selection order
    for (let i = 0; i < unique.length; i++) {
      const file = unique[i];
      const ph = placeholders[i];
      const isVideo = file.type.startsWith("video/");
      try {
        let url: string;
        if (isVideo) {
          url = await uploadOneVideo(file, (pct) => {
            // Update placeholder caption-area name with progress
            working = working.map((it) =>
              it.tempId === ph.tempId
                ? ({ ...it, _uploadingName: `${file.name} (${pct}%)` } as any)
                : it
            );
            onChange(working);
          });
        } else {
          url = await uploadOneImage(file);
        }
        working = working.map((it) =>
          it.tempId === ph.tempId
            ? ({
                ...it,
                media_url: url,
                item_type: isVideo ? ("video" as const) : ("image" as const),
                _uploadingName: undefined,
                _sig: (ph as any)._sig, // preserve for future duplicate checks
              } as any)
            : it
        );
        onChange(working);
      } catch (e: any) {
        failed.push(file.name);
        working = working.filter((it) => it.tempId !== ph.tempId);
        onChange(working);
      } finally {
        done += 1;
        setBulkProgress({ done, total: unique.length });
      }
    }

    setBulkUploading(false);
    if (failed.length > 0) {
      toast({
        title: `${unique.length - failed.length}개 업로드 완료, ${failed.length}개 실패`,
        description: failed.join(", "),
        variant: "destructive",
      });
    } else {
      toast({ title: `${unique.length}개 미디어를 업로드했습니다.` });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  };


  const updateItem = (idx: number, patch: Partial<PackageItemDraft>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };

  const addItem = (type: "image" | "video") => {
    onChange([
      ...items,
      { tempId: crypto.randomUUID(), item_type: type, media_url: "", caption: "" },
    ]);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const moveItem = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          {imagesOnly
            ? `이미지를 순서대로 배치하면 학습자가 좌우로 스와이프하여 한 장씩 넘겨봅니다. (${items.length}개)`
            : `이미지와 영상을 순서대로 배치하면 학습자가 [다음] 버튼으로 한 장씩 진행합니다. (${items.length}개)`}
        </p>
        {bulkUploading && (
          <p className="text-[10px] text-muted-foreground">
            업로드 중... {bulkProgress.done}/{bulkProgress.total}
          </p>
        )}
      </div>

      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 py-6 text-center text-xs text-muted-foreground">
          항목을 추가하여 패키지를 구성하세요.
        </div>
      )}

      <div className="space-y-2">
        {items.map((it, idx) => {
          const isImage = it.item_type === "image";
          const showPreview = !!it.media_url;
          return (
            <div
              key={it.tempId}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveItem(dragIndex, idx);
                setDragIndex(null);
              }}
              className={`rounded-xl border border-border bg-background p-3 space-y-2 transition-opacity ${
                dragIndex === idx ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="cursor-grab text-muted-foreground hover:text-foreground"
                  title="드래그하여 순서 변경"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-medium text-muted-foreground w-6 text-center">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {imagesOnly ? (
                  <span className="inline-flex items-center gap-1 px-2 h-8 rounded-lg border border-border text-[11px] text-muted-foreground">
                    <ImageIcon className="h-3 w-3" /> 이미지
                  </span>
                ) : (
                  <Select
                    value={it.item_type}
                    onValueChange={(v) => updateItem(idx, { item_type: v as "image" | "video" })}
                  >
                    <SelectTrigger className="h-8 w-[100px] rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">이미지</SelectItem>
                      <SelectItem value="video">영상</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Input
                  value={it.media_url}
                  onChange={(e) => {
                    const url = e.target.value;
                    updateItem(idx, {
                      media_url: url,
                      item_type: url ? guessType(url) : it.item_type,
                    });
                  }}
                  placeholder={
                    (it as any)._uploadingName
                      ? `업로드 중: ${(it as any)._uploadingName}`
                      : "https://... (이미지 또는 영상 URL)"
                  }
                  className="h-8 rounded-lg border-border text-xs flex-1"
                />
                <button
                  type="button"
                  onClick={() => moveItem(idx, idx - 1)}
                  disabled={idx === 0}
                  className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30"
                  title="위로"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(idx, idx + 1)}
                  disabled={idx === items.length - 1}
                  className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30"
                  title="아래로"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex gap-3">
                {showPreview && (
                  <div className="w-28 shrink-0 rounded-lg border border-border overflow-hidden bg-muted/30 aspect-video">
                    {isImage ? (
                      <img
                        src={it.media_url}
                        alt={`항목 ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <video src={it.media_url} className="w-full h-full object-cover" muted />
                    )}
                  </div>
                )}
                <Textarea
                  value={it.caption}
                  onChange={(e) => updateItem(idx, { caption: e.target.value })}
                  placeholder="캡션 (선택)"
                  className="min-h-[60px] rounded-lg border-border text-xs flex-1 resize-none"
                  rows={2}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleBulkFiles(e.target.files, "image")}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => handleBulkFiles(e.target.files, "video")}
        />
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={bulkUploading}
          className="gap-1.5 h-8 text-xs"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {bulkUploading ? `업로드 중 (${bulkProgress.done}/${bulkProgress.total})` : "이미지 일괄 업로드"}
        </Button>
        {!imagesOnly && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => videoInputRef.current?.click()}
            disabled={bulkUploading}
            className="gap-1.5 h-8 text-xs"
          >
            <Video className="h-3.5 w-3.5" />
            {bulkUploading ? `업로드 중 (${bulkProgress.done}/${bulkProgress.total})` : "동영상 일괄 업로드"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addItem("image")}
          className="gap-1.5 h-8 text-xs"
        >
          <ImageIcon className="h-3.5 w-3.5" /> URL로 이미지 추가
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addItem("video")}
          className="gap-1.5 h-8 text-xs"
        >
          <Video className="h-3.5 w-3.5" /> URL로 영상 추가
        </Button>
      </div>
    </div>
  );
};

export default CreateCourse;
