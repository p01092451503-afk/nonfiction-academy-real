import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layers, Plus, Pencil, Trash2, UserPlus, Building2, GripVertical, ChevronDown, ChevronRight, BookOpen, Sparkles, AlertCircle, Languages, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { translateKoTo, type TargetLang } from "@/lib/translate";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const I18N_LANGS = ["ko", "en", "ja", "zh-CN"] as const;
type I18nLang = (typeof I18N_LANGS)[number];
const LANG_LABEL: Record<I18nLang, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  "zh-CN": "中文",
};

const resolveLang = (l: string | undefined): I18nLang => {
  const lower = (l || "ko").toLowerCase();
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("zh")) return "zh-CN";
  return "ko";
};

type Track = {
  id: string;
  title: string;
  title_en: string | null;
  description: string | null;
  is_sequential: boolean;
  status: "draft" | "published" | "archived";
  target_branch_ids: string[] | null;
  thumbnail_url: string | null;
  created_at: string;
};

type Stage = {
  id: string;
  track_id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  order_index: number;
};

type StageCourse = {
  id: string;
  stage_id: string;
  course_id: string;
  order_index: number;
};

const statusBadgeColor: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  archived: "bg-secondary text-muted-foreground",
};

const AdminTracks = () => {
  const { t, i18n } = useTranslation();
  const lang = resolveLang(i18n.language);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTrack, setAssignTrack] = useState<Track | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: tracks = [], isLoading } = useQuery({
    queryKey: ["admin-tracks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_tracks" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Track[]) || [];
    },
  });

  const { data: tracksI18n = [] } = useQuery({
    queryKey: ["admin-tracks-i18n"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_tracks_i18n" as any)
        .select("*");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: stagesI18n = [] } = useQuery({
    queryKey: ["admin-track-stages-i18n"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("track_stages_i18n" as any)
        .select("*");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: coursesI18n = [] } = useQuery({
    queryKey: ["admin-courses-i18n-for-tracks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_i18n")
        .select("course_id, language_code, title");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["admin-track-stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("track_stages" as any)
        .select("*")
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data as unknown as Stage[]) || [];
    },
  });

  const { data: stageCourses = [] } = useQuery({
    queryKey: ["admin-track-stage-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("track_stage_courses" as any)
        .select("*")
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data as unknown as StageCourse[]) || [];
    },
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["admin-courses-for-tracks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, status, thumbnail_url")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as { id: string; title: string; status: string; thumbnail_url: string | null }[];
    },
  });

  const stagesByTrack = useMemo(() => {
    const map = new Map<string, Stage[]>();
    stages.forEach((s) => {
      const arr = map.get(s.track_id) || [];
      arr.push(s);
      map.set(s.track_id, arr);
    });
    return map;
  }, [stages]);

  const coursesByStage = useMemo(() => {
    const map = new Map<string, StageCourse[]>();
    stageCourses.forEach((sc) => {
      const arr = map.get(sc.stage_id) || [];
      arr.push(sc);
      map.set(sc.stage_id, arr);
    });
    return map;
  }, [stageCourses]);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  // Localization helpers (use new i18n tables, fallback to legacy _en columns then base)
  const trackTitle = (track: Track) => {
    if (lang === "ko") return track.title;
    const tr = (tracksI18n as any[]).find(
      (r) => r.track_id === track.id && r.language_code === lang
    );
    if (tr?.title) return tr.title;
    if (lang === "en" && track.title_en) return track.title_en;
    return track.title;
  };
  const trackDescription = (track: Track) => {
    if (lang === "ko") return track.description;
    const tr = (tracksI18n as any[]).find(
      (r) => r.track_id === track.id && r.language_code === lang
    );
    if (tr?.description) return tr.description;
    if (lang === "en" && (track as any).description_en) return (track as any).description_en;
    return track.description;
  };
  const stageName = (stage: Stage) => {
    if (lang === "ko") return stage.name;
    const tr = (stagesI18n as any[]).find(
      (r) => r.stage_id === stage.id && r.language_code === lang
    );
    if (tr?.name) return tr.name;
    if (lang === "en" && stage.name_en) return stage.name_en;
    return stage.name;
  };
  const courseTitleLocalized = (course: { id: string; title: string }) => {
    if (lang === "ko") return course.title;
    const tr = (coursesI18n as any[]).find(
      (r) => r.course_id === course.id && r.language_code === lang
    );
    return tr?.title || course.title;
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_tracks" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tracks"] });
      toast({ title: t("track.deleted", "트랙이 삭제되었습니다") });
    },
    onError: (e: any) => toast({ title: t("common.error", "오류"), description: e.message, variant: "destructive" }),
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = () => {
    setEditingTrackId(null);
    setEditorOpen(true);
  };
  const openEdit = (id: string) => {
    setEditingTrackId(id);
    setEditorOpen(true);
  };
  const openAssign = (track: Track) => {
    setAssignTrack(track);
    setAssignOpen(true);
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-6 w-6" aria-hidden="true" />
              {t("track.title", "학습 트랙 관리")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t("track.subtitle", "단계별 학습 경로를 설계하고 학생/지점에 배정합니다.")}
            </p>
          </div>
          <Button onClick={openCreate} className="rounded-xl gap-2 w-full sm:w-auto">
            <Plus className="h-4 w-4" /> {t("track.createTrack", "트랙 생성")}
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading", "불러오는 중...")}</p>
        ) : tracks.length === 0 ? (
          <div className="stat-card text-center py-16 space-y-3">
            <Layers className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              {t("track.empty", "아직 등록된 학습 트랙이 없습니다")}
            </p>
            <Button onClick={openCreate} size="sm" className="rounded-xl gap-2">
              <Plus className="h-3.5 w-3.5" /> {t("track.createTrack", "트랙 생성")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {tracks.map((track) => {
              const trackStages = stagesByTrack.get(track.id) || [];
              const totalCourses = trackStages.reduce(
                (sum, s) => sum + (coursesByStage.get(s.id)?.length || 0),
                0
              );
              const isOpen = expanded.has(track.id);
              return (
                <div
                  key={track.id}
                  className="stat-card !p-0 overflow-hidden border-b-2 border-border/80"
                >
                  <div className="flex items-start gap-3 p-4">
                    <button
                      type="button"
                      onClick={() => toggleExpand(track.id)}
                      className="mt-0.5 p-1 rounded hover:bg-accent text-muted-foreground"
                      aria-label={isOpen ? "접기" : "펼치기"}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-foreground truncate">{trackTitle(track)}</h3>
                        {lang === "ko" && track.title_en && (
                          <span className="text-xs text-muted-foreground truncate">/ {track.title_en}</span>
                        )}
                        <Badge className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadgeColor[track.status]}`} variant="secondary">
                          {track.status === "published" ? "활성" : track.status === "draft" ? "초안" : "보관"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          {trackStages.length}{t("track.stagesCount", "개 단계")}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <BookOpen className="h-2.5 w-2.5" /> {totalCourses}
                        </Badge>
                        {track.is_sequential ? (
                          <Badge variant="outline" className="text-[10px]">{t("track.sequential", "순차")}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{t("track.free", "자유")}</Badge>
                        )}
                      </div>
                      {trackDescription(track) && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{trackDescription(track)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="outline" size="sm" className="rounded-lg gap-1 h-8 text-xs" onClick={() => openAssign(track)}>
                        <UserPlus className="h-3.5 w-3.5" /> {t("track.assign", "배정")}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(track.id)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm(t("track.confirmDelete", "이 트랙을 삭제하시겠습니까? 학생 배정 기록도 함께 삭제됩니다."))) {
                            deleteMutation.mutate(track.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded stages */}
                  {isOpen && (
                    <div className="border-t border-border bg-muted/20 p-4 space-y-3">
                      {trackStages.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("track.noStages", "등록된 단계가 없습니다")}</p>
                      ) : (
                        trackStages.map((stage, idx) => {
                          const sCourses = coursesByStage.get(stage.id) || [];
                          return (
                            <div key={stage.id} className="bg-background rounded-lg border border-border p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-muted-foreground">
                                  STEP {String(idx + 1).padStart(2, "0")}
                                </span>
                                <span className="text-sm font-semibold text-foreground">{stage.name}</span>
                                {stage.name_en && (
                                  <span className="text-[11px] text-muted-foreground">/ {stage.name_en}</span>
                                )}
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  {sCourses.length}{t("track.coursesCount", "개 강의")}
                                </span>
                              </div>
                              {sCourses.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground pl-1">{t("track.noCourses", "강의 없음")}</p>
                              ) : (
                                <ul className="space-y-1">
                                  {sCourses.map((sc) => {
                                    const c = courseMap.get(sc.course_id);
                                    return (
                                      <li key={sc.id} className="flex items-center gap-2 text-xs text-foreground pl-1">
                                        <BookOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                                        <span className="truncate">{c?.title || sc.course_id}</span>
                                        {c && (
                                          <Badge variant="outline" className="text-[9px] ml-auto shrink-0">
                                            {c.status === "published" ? "공개" : "초안"}
                                          </Badge>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editorOpen && (
        <TrackEditorDialog
          trackId={editingTrackId}
          courses={courses}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-tracks"] });
            qc.invalidateQueries({ queryKey: ["admin-track-stages"] });
            qc.invalidateQueries({ queryKey: ["admin-track-stage-courses"] });
          }}
        />
      )}

      {assignOpen && assignTrack && (
        <AssignDialog
          track={assignTrack}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </DashboardLayout>
  );
};

/* ────────────── Track Editor ────────────── */

type DraftStage = {
  id: string; // local or db id
  name: string;
  name_en: string;
  description: string;
  order_index: number;
  course_ids: string[];
  _isNew?: boolean;
};

const TrackEditorDialog = ({
  trackId,
  courses,
  onClose,
  onSaved,
}: {
  trackId: string | null;
  courses: { id: string; title: string; status: string }[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [description, setDescription] = useState("");
  const [isSequential, setIsSequential] = useState(true);
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [draftStages, setDraftStages] = useState<DraftStage[]>([
    { id: crypto.randomUUID(), name: "Foundation", name_en: "Foundation", description: "", order_index: 0, course_ids: [], _isNew: true },
    { id: crypto.randomUUID(), name: "Basic", name_en: "Basic", description: "", order_index: 1, course_ids: [], _isNew: true },
    { id: crypto.randomUUID(), name: "Advanced", name_en: "Advanced", description: "", order_index: 2, course_ids: [], _isNew: true },
  ]);
  const [saving, setSaving] = useState(false);

  // Load existing
  useQuery({
    queryKey: ["track-editor-load", trackId],
    enabled: !!trackId,
    queryFn: async () => {
      if (!trackId) return null;
      const [{ data: trk }, { data: sts }, { data: tsc }] = await Promise.all([
        supabase.from("learning_tracks" as any).select("*").eq("id", trackId).single(),
        supabase.from("track_stages" as any).select("*").eq("track_id", trackId).order("order_index"),
        supabase.from("track_stage_courses" as any).select("*").order("order_index"),
      ]);
      const track = trk as any;
      if (track) {
        setTitle(track.title || "");
        setTitleEn(track.title_en || "");
        setDescription(track.description || "");
        setIsSequential(!!track.is_sequential);
        setStatus(track.status || "draft");
      }
      const stageList = (sts as any[]) || [];
      const courseList = (tsc as any[]) || [];
      const stagesWithCourses: DraftStage[] = stageList.map((s) => ({
        id: s.id,
        name: s.name || "",
        name_en: s.name_en || "",
        description: s.description || "",
        order_index: s.order_index ?? 0,
        course_ids: courseList.filter((c) => c.stage_id === s.id).map((c) => c.course_id),
      }));
      if (stagesWithCourses.length) setDraftStages(stagesWithCourses);
      return null;
    },
  });

  const addStage = () => {
    setDraftStages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", name_en: "", description: "", order_index: prev.length, course_ids: [], _isNew: true },
    ]);
  };
  const removeStage = (id: string) => {
    setDraftStages((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order_index: i })));
  };
  const moveStage = (index: number, dir: -1 | 1) => {
    setDraftStages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((s, i) => ({ ...s, order_index: i }));
    });
  };
  const updateStage = (id: string, patch: Partial<DraftStage>) => {
    setDraftStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const toggleCourse = (stageId: string, courseId: string) => {
    setDraftStages((prev) =>
      prev.map((s) => {
        if (s.id !== stageId) return s;
        const has = s.course_ids.includes(courseId);
        return { ...s, course_ids: has ? s.course_ids.filter((id) => id !== courseId) : [...s.course_ids, courseId] };
      })
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: t("track.titleRequired", "트랙 이름을 입력해주세요"), variant: "destructive" });
      return;
    }
    if (!draftStages.length) {
      toast({ title: t("track.atLeastOneStage", "최소 1개 단계가 필요합니다"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      let savedTrackId = trackId;
      const trackPayload = {
        title: title.trim(),
        title_en: titleEn.trim() || null,
        description: description.trim() || null,
        is_sequential: isSequential,
        status,
        ...(trackId ? {} : { created_by: userId }),
      };

      if (trackId) {
        const { error } = await supabase.from("learning_tracks" as any).update(trackPayload).eq("id", trackId);
        if (error) throw error;
        // Delete existing stages (cascade removes stage_courses)
        await supabase.from("track_stages" as any).delete().eq("track_id", trackId);
      } else {
        const { data, error } = await supabase
          .from("learning_tracks" as any)
          .insert(trackPayload)
          .select("id")
          .single();
        if (error) throw error;
        savedTrackId = (data as any).id;
      }

      if (!savedTrackId) throw new Error("track id missing");

      // Insert stages
      const stagesToInsert = draftStages.map((s, i) => ({
        track_id: savedTrackId!,
        name: s.name.trim() || `Stage ${i + 1}`,
        name_en: s.name_en.trim() || null,
        description: s.description.trim() || null,
        order_index: i,
      }));
      const { data: insertedStages, error: stageErr } = await supabase
        .from("track_stages" as any)
        .insert(stagesToInsert)
        .select("id");
      if (stageErr) throw stageErr;

      // Insert stage_courses
      const stageRows: any[] = [];
      (insertedStages as any[]).forEach((s, i) => {
        draftStages[i]?.course_ids.forEach((cid, j) => {
          stageRows.push({ stage_id: s.id, course_id: cid, order_index: j });
        });
      });
      if (stageRows.length) {
        const { error: scErr } = await supabase.from("track_stage_courses" as any).insert(stageRows);
        if (scErr) throw scErr;
      }

      toast({ title: trackId ? t("track.updated", "트랙이 수정되었습니다") : t("track.created", "트랙이 생성되었습니다") });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: t("common.error", "오류"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" /> {trackId ? t("track.edit", "트랙 편집") : t("track.create", "트랙 생성")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("track.editorHint", "단계명/개수는 자유롭게 정의할 수 있습니다. 한 강의를 여러 트랙·단계에 재사용 가능합니다.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Track basics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("track.titleLabel", "트랙 이름 (KO)")}</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 rounded-lg text-sm" placeholder="예: 강남점 신입 온보딩 트랙" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("track.titleEnLabel", "Track Name (EN)")}</label>
              <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className="h-9 rounded-lg text-sm" placeholder="e.g. Gangnam Onboarding Track" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("track.descLabel", "설명")}</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[60px] rounded-lg text-xs" />
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={isSequential} onCheckedChange={setIsSequential} className="scale-75" />
              {t("track.sequentialToggle", "순차 진행 (이전 단계 완료 시 다음 단계 잠금 해제)")}
            </label>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t("track.statusLabel", "공개 상태")}</span>
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger className="h-8 w-28 rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t("teacher.draft", "초안")}</SelectItem>
                  <SelectItem value="published">{t("teacher.published", "공개")}</SelectItem>
                  <SelectItem value="archived">{t("track.archived", "보관")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stages */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> {t("track.stagesTitle", "단계 구성")}
              </h4>
              <Button type="button" variant="outline" size="sm" className="rounded-lg gap-1 h-8 text-xs" onClick={addStage}>
                <Plus className="h-3 w-3" /> {t("track.addStage", "단계 추가")}
              </Button>
            </div>

            {draftStages.map((stage, idx) => (
              <div key={stage.id} className="border border-border rounded-lg p-3 space-y-2 bg-muted/10">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                    STEP {String(idx + 1).padStart(2, "0")}
                  </span>
                  <Input
                    value={stage.name}
                    onChange={(e) => updateStage(stage.id, { name: e.target.value })}
                    placeholder="단계명 (KO)"
                    className="h-8 rounded-lg text-xs flex-1"
                  />
                  <Input
                    value={stage.name_en}
                    onChange={(e) => updateStage(stage.id, { name_en: e.target.value })}
                    placeholder="Stage name (EN)"
                    className="h-8 rounded-lg text-xs flex-1"
                  />
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => moveStage(idx, -1)} disabled={idx === 0}>
                      <GripVertical className="h-3.5 w-3.5 rotate-180" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => moveStage(idx, 1)} disabled={idx === draftStages.length - 1}>
                      <GripVertical className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/10" onClick={() => removeStage(stage.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Course matching */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">
                    {t("track.matchCourses", "이 단계의 강의")} ({stage.course_ids.length})
                  </label>
                  <div className="max-h-44 overflow-y-auto border border-border rounded-md p-2 space-y-1 bg-background">
                    {courses.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground py-2 text-center">{t("track.noCoursesAvailable", "등록된 강의가 없습니다")}</p>
                    ) : (
                      courses.map((c) => {
                        const checked = stage.course_ids.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/30 px-1.5 py-1 rounded">
                            <Checkbox checked={checked} onCheckedChange={() => toggleCourse(stage.id, c.id)} />
                            <span className="flex-1 truncate">{c.title}</span>
                            <Badge variant="outline" className="text-[9px] shrink-0">
                              {c.status === "published" ? "공개" : "초안"}
                            </Badge>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" className="rounded-lg" onClick={onClose}>
            {t("common.cancel", "취소")}
          </Button>
          <Button className="rounded-lg gap-2" onClick={handleSave} disabled={saving}>
            {saving ? t("common.processing", "저장 중...") : t("common.save", "저장")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ────────────── Assign Dialog ────────────── */

const AssignDialog = ({ track, onClose }: { track: Track; onClose: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"users" | "branch">("users");
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ["assign-users", search],
    queryFn: async () => {
      let q = supabase.from("profiles").select("user_id, full_name, email, department_id").limit(50);
      if (search.trim()) {
        q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["assign-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, team_name").eq("is_active", true).order("display_order");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: existingAssignments = [] } = useQuery({
    queryKey: ["existing-track-enrollments", track.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("track_enrollments" as any)
        .select("user_id")
        .eq("track_id", track.id);
      if (error) throw error;
      return ((data as any[]) || []).map((d) => d.user_id);
    },
  });

  const handleAssign = async () => {
    setAssigning(true);
    try {
      let totalUsers = 0;
      let totalCourses = 0;

      if (mode === "users") {
        if (selectedUsers.size === 0) {
          toast({ title: t("track.selectUsers", "학생을 선택해주세요"), variant: "destructive" });
          setAssigning(false);
          return;
        }
        for (const uid of selectedUsers) {
          const { data, error } = await supabase.rpc("assign_track_to_user" as any, {
            p_track_id: track.id,
            p_user_id: uid,
          });
          if (error) throw error;
          totalUsers += 1;
          const result = data as { courses_enrolled?: number } | null;
          totalCourses += result?.courses_enrolled ?? 0;
        }
      } else {
        if (!selectedBranch) {
          toast({ title: t("track.selectBranch", "지점/팀을 선택해주세요"), variant: "destructive" });
          setAssigning(false);
          return;
        }
        const { data, error } = await supabase.rpc("assign_track_to_department" as any, {
          p_track_id: track.id,
          p_department_id: selectedBranch,
        });
        if (error) throw error;
        const result = data as { users_assigned?: number } | null;
        totalUsers = result?.users_assigned ?? 0;
      }

      toast({
        title: t("track.assignedSuccess", "트랙이 배정되었습니다"),
        description: t("track.assignedSummary", {
          users: totalUsers,
          courses: totalCourses,
          defaultValue: `학생 ${totalUsers}명에게 배정 완료${totalCourses ? ` · 강의 ${totalCourses}건 수강 처리` : ""}`,
        }),
      });
      qc.invalidateQueries({ queryKey: ["existing-track-enrollments", track.id] });
      qc.invalidateQueries({ queryKey: ["admin-tracks"] });
      onClose();
    } catch (e: any) {
      toast({ title: t("common.error", "오류"), description: e.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const filteredUsers = users.filter((u: any) => !existingAssignments.includes(u.user_id) || true); // show all but mark assigned

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> {t("track.assignDialogTitle", "트랙 배정")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            <span className="font-semibold text-foreground">{track.title}</span>{" "}
            — {t("track.assignNote", "배정 시 트랙 내 모든 강의에 자동 수강 승인됩니다.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("users")}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${mode === "users" ? "bg-accent text-foreground border-border" : "border-border text-muted-foreground hover:bg-accent/50"}`}
            >
              <UserPlus className="h-3.5 w-3.5 inline mr-1.5" />
              {t("track.byUser", "학생 개별 선택")}
            </button>
            <button
              type="button"
              onClick={() => setMode("branch")}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${mode === "branch" ? "bg-accent text-foreground border-border" : "border-border text-muted-foreground hover:bg-accent/50"}`}
            >
              <Building2 className="h-3.5 w-3.5 inline mr-1.5" />
              {t("track.byBranch", "지점/팀 일괄")}
            </button>
          </div>

          {mode === "users" ? (
            <div className="space-y-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("track.searchUser", "이름/이메일로 검색...")}
                className="h-9 rounded-lg text-sm"
              />
              <div className="max-h-72 overflow-y-auto border border-border rounded-md p-2 space-y-0.5">
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">{t("common.noResults", "결과 없음")}</p>
                ) : (
                  filteredUsers.map((u: any) => {
                    const already = existingAssignments.includes(u.user_id);
                    const checked = selectedUsers.has(u.user_id);
                    return (
                      <label
                        key={u.user_id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer ${already ? "opacity-60" : "hover:bg-accent/40"}`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={already}
                          onCheckedChange={(v) => {
                            setSelectedUsers((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(u.user_id);
                              else next.delete(u.user_id);
                              return next;
                            });
                          }}
                        />
                        <span className="font-medium truncate flex-1">{u.full_name || u.email}</span>
                        {u.email && <span className="text-muted-foreground truncate text-[10px]">{u.email}</span>}
                        {already && (
                          <Badge variant="outline" className="text-[9px] shrink-0">{t("track.alreadyAssigned", "배정됨")}</Badge>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
              {selectedUsers.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("track.selectedCount", { count: selectedUsers.size, defaultValue: `${selectedUsers.size}명 선택됨` })}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("track.selectBranchLabel", "배정 대상 지점/팀")}</label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue placeholder={t("track.selectBranchPlaceholder", "지점 또는 팀 선택")} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}{b.team_name ? ` / ${b.team_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{t("track.branchAssignNote", "선택한 지점/팀에 소속된 모든 학생에게 트랙이 배정되며, 포함 강의가 자동 수강 승인 처리됩니다.")}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" className="rounded-lg" onClick={onClose}>
            {t("common.cancel", "취소")}
          </Button>
          <Button className="rounded-lg gap-2" onClick={handleAssign} disabled={assigning}>
            {assigning ? t("common.processing", "처리 중...") : t("track.confirmAssign", "배정하기")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminTracks;
