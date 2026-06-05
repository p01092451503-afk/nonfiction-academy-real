import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layers, Plus, Pencil, Trash2, UserPlus, Users, Building2, GripVertical, ChevronDown, ChevronRight, BookOpen, Sparkles, AlertCircle, Languages, Loader2 } from "lucide-react";
import TrackMembersDialog from "@/components/admin/tracks/TrackMembersDialog";
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
  const [membersTrack, setMembersTrack] = useState<Track | null>(null);
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
    return track.title;
  };
  const trackDescription = (track: Track) => {
    if (lang === "ko") return track.description;
    if (!(track.description || "").trim()) return null;
    const tr = (tracksI18n as any[]).find(
      (r) => r.track_id === track.id && r.language_code === lang
    );
    if (tr?.description) return tr.description;
    return track.description;
  };
  const stageName = (stage: Stage) => {
    if (lang === "ko") return stage.name;
    const tr = (stagesI18n as any[]).find(
      (r) => r.stage_id === stage.id && r.language_code === lang
    );
    if (tr?.name) return tr.name;
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
                      <Button variant="outline" size="sm" className="rounded-lg gap-1 h-8 text-xs" onClick={() => setMembersTrack(track)}>
                        <Users className="h-3.5 w-3.5" /> {t("track.members", "인원")}
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
                                <span className="text-sm font-semibold text-foreground">{stageName(stage)}</span>
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
                                        <span className="truncate">{c ? courseTitleLocalized(c) : sc.course_id}</span>
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
            qc.invalidateQueries({ queryKey: ["admin-tracks-i18n"] });
            qc.invalidateQueries({ queryKey: ["admin-track-stages-i18n"] });
          }}
        />
      )}

      {assignOpen && assignTrack && (
        <AssignDialog
          track={assignTrack}
          onClose={() => setAssignOpen(false)}
        />
      )}

      {membersTrack && (
        <TrackMembersDialog
          trackId={membersTrack.id}
          trackTitle={trackTitle(membersTrack)}
          onClose={() => setMembersTrack(null)}
        />
      )}
    </DashboardLayout>
  );
};

/* ────────────── Track Editor ────────────── */

type LangMap = Partial<Record<I18nLang, string>>;
const emptyLangMap = (): LangMap => ({ ko: "", en: "", ja: "", "zh-CN": "" });
const TARGET_LANGS: TargetLang[] = ["en", "ja", "zh-CN"];
const clearTranslations = (values: LangMap): LangMap => ({ ...values, en: "", ja: "", "zh-CN": "" });

const translateSingleKoText = async (target: TargetLang, text: string) => {
  const source = text.trim();
  if (!source) return "";
  const [translated] = await translateKoTo(target, [source]);
  const result = (translated || "").trim();
  if (!result) throw new Error("자동 번역 결과를 확인할 수 없습니다. 다시 시도해주세요.");
  return result;
};

type DraftStage = {
  id: string; // local or db id
  names: LangMap;
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

  const [titles, setTitles] = useState<LangMap>(emptyLangMap());
  const [descriptions, setDescriptions] = useState<LangMap>(emptyLangMap());
  const [isSequential, setIsSequential] = useState(true);
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [activeLang, setActiveLang] = useState<I18nLang>("ko");
  const [translating, setTranslating] = useState(false);
  const [draftStages, setDraftStages] = useState<DraftStage[]>([
    { id: crypto.randomUUID(), names: emptyLangMap(), description: "", order_index: 0, course_ids: [], _isNew: true },
    { id: crypto.randomUUID(), names: emptyLangMap(), description: "", order_index: 1, course_ids: [], _isNew: true },
    { id: crypto.randomUUID(), names: emptyLangMap(), description: "", order_index: 2, course_ids: [], _isNew: true },
  ]);
  const [saving, setSaving] = useState(false);

  // Load existing track on mount / when trackId changes.
  // NOTE: previously this used useQuery which cached the result; on second open
  // the queryFn (which contains setState side-effects) was skipped, leaving
  // the form at default values. useEffect guarantees a fresh load every time.
  useEffect(() => {
    if (!trackId) return;
    let cancelled = false;
    (async () => {
      const [
        { data: trk },
        { data: sts },
        { data: tsc },
        { data: trackI18nRows },
        { data: stageI18nRows },
      ] = await Promise.all([
        supabase.from("learning_tracks" as any).select("*").eq("id", trackId).single(),
        supabase.from("track_stages" as any).select("*").eq("track_id", trackId).order("order_index"),
        supabase.from("track_stage_courses" as any).select("*").order("order_index"),
        supabase.from("learning_tracks_i18n" as any).select("*").eq("track_id", trackId),
        supabase.from("track_stages_i18n" as any).select("*"),
      ]);
      if (cancelled) return;
      const track = trk as any;
      const trackI18nByLang = new Map<string, any>();
      ((trackI18nRows as any[]) || []).forEach((row) => {
        if ((I18N_LANGS as readonly string[]).includes(row.language_code)) {
          trackI18nByLang.set(row.language_code, row);
        }
      });
      if (track) {
        const nextTitles: LangMap = { ...emptyLangMap(), ko: track.title || "" };
        const nextDescs: LangMap = { ...emptyLangMap(), ko: track.description || "" };
        (["en", "ja", "zh-CN"] as I18nLang[]).forEach((lc) => {
          const row = trackI18nByLang.get(lc);
          if (row) {
            nextTitles[lc] = row.title || "";
            nextDescs[lc] = nextDescs.ko ? row.description || "" : "";
          }
        });
        setTitles(nextTitles);
        setDescriptions(nextDescs);
        setIsSequential(!!track.is_sequential);
        setStatus(track.status || "draft");
      }
      const stageList = (sts as any[]) || [];
      const courseList = (tsc as any[]) || [];
      const stageI18nByStage = new Map<string, any[]>();
      ((stageI18nRows as any[]) || []).forEach((row) => {
        if (!stageI18nByStage.has(row.stage_id)) stageI18nByStage.set(row.stage_id, []);
        stageI18nByStage.get(row.stage_id)!.push(row);
      });
      const stagesWithCourses: DraftStage[] = stageList.map((s) => {
        const names: LangMap = { ...emptyLangMap(), ko: s.name || "" };
        const i18nRows = stageI18nByStage.get(s.id) || [];
        i18nRows.forEach((row) => {
          if ((I18N_LANGS as readonly string[]).includes(row.language_code)) {
            names[row.language_code as I18nLang] = row.name || "";
          }
        });
        return {
          id: s.id,
          names,
          description: s.description || "",
          order_index: s.order_index ?? 0,
          course_ids: courseList.filter((c) => c.stage_id === s.id).map((c) => c.course_id),
        };
      });
      if (stagesWithCourses.length) setDraftStages(stagesWithCourses);
    })();
    return () => { cancelled = true; };
  }, [trackId]);

  const addStage = () => {
    setDraftStages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), names: emptyLangMap(), description: "", order_index: prev.length, course_ids: [], _isNew: true },
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

  const autoTranslateAll = async () => {
    const koTitle = (titles.ko || "").trim();
    if (!koTitle) {
      toast({ title: t("track.titleRequired", "트랙 이름을 입력해주세요"), variant: "destructive" });
      return;
    }
    setTranslating(true);
    try {
      const koDesc = (descriptions.ko || "").trim();
      const stageSources = draftStages.map((s) => ({ id: s.id, text: (s.names.ko || "").trim() }));
      // Never bundle title/description/stage names into one translation array.
      // A model response that reorders even once can put a stage name into the
      // description field. Translate each source independently and map stages
      // back by stable draft ID, not by array position.
      const translatedByTarget = await Promise.all(
        TARGET_LANGS.map(async (target) => {
          const [title, description, stagePairs] = await Promise.all([
            translateSingleKoText(target, koTitle),
            translateSingleKoText(target, koDesc),
            Promise.all(
              stageSources.map(async (stage) => ({
                id: stage.id,
                name: await translateSingleKoText(target, stage.text),
              }))
            ),
          ]);
          return { target, title, description, stageNameById: new Map(stagePairs.map((stage) => [stage.id, stage.name])) };
        })
      );

      const nextTitles = { ...titles };
      const nextDescriptions = { ...descriptions };
      translatedByTarget.forEach(({ target, title, description }) => {
        nextTitles[target] = title;
        nextDescriptions[target] = koDesc ? description : "";
      });
      setTitles(nextTitles);
      setDescriptions(nextDescriptions);
      setDraftStages((prev) =>
        prev.map((stage) => {
          const koName = (stage.names.ko || "").trim();
          const names = { ...stage.names };
          translatedByTarget.forEach(({ target, stageNameById }) => {
            names[target] = koName ? stageNameById.get(stage.id) || "" : "";
          });
          return { ...stage, names };
        })
      );
      toast({ title: t("track.translated", "자동 번역이 완료되었습니다") });
    } catch (e: any) {
      toast({ title: t("common.error", "오류"), description: e.message, variant: "destructive" });
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async () => {
    const koTitle = (titles.ko || "").trim();
    if (!koTitle) {
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
      const koDescription = (descriptions.ko || "").trim();
      const trackPayload = {
        title: koTitle,
        title_en: (titles.en || "").trim() || null,
        description: koDescription || null,
        description_en: koDescription ? (descriptions.en || "").trim() || null : null,
        is_sequential: isSequential,
        status,
        ...(trackId ? {} : { created_by: userId }),
      };

      if (trackId) {
        const { error } = await supabase.from("learning_tracks" as any).update(trackPayload).eq("id", trackId);
        if (error) throw error;
        const { error: deleteStagesError } = await supabase.from("track_stages" as any).delete().eq("track_id", trackId);
        if (deleteStagesError) throw deleteStagesError;
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

      // Track i18n: replace
      await supabase.from("learning_tracks_i18n" as any).delete().eq("track_id", savedTrackId);
      const trackI18nRows = (["en", "ja", "zh-CN"] as I18nLang[])
        .map((lc) => ({
          track_id: savedTrackId!,
          language_code: lc,
          title: (titles[lc] || "").trim(),
          description: koDescription ? (descriptions[lc] || "").trim() || null : null,
        }))
        .filter((r) => r.title);
      if (trackI18nRows.length) {
        const { error: tiErr } = await supabase.from("learning_tracks_i18n" as any).insert(trackI18nRows);
        if (tiErr) throw tiErr;
      }

      const stagesToInsert = draftStages.map((s, i) => ({
        id: s.id,
        track_id: savedTrackId!,
        name: (s.names.ko || "").trim() || `Stage ${i + 1}`,
        name_en: (s.names.en || "").trim() || null,
        description: s.description.trim() || null,
        order_index: i,
      }));
      const { error: stageErr } = await supabase
        .from("track_stages" as any)
        .insert(stagesToInsert);
      if (stageErr) throw stageErr;

      const stageRows: any[] = [];
      const stageI18nRows: any[] = [];
      draftStages.forEach((draft) => {
        draft.course_ids.forEach((cid, j) => {
          stageRows.push({ stage_id: draft.id, course_id: cid, order_index: j });
        });
        (["en", "ja", "zh-CN"] as I18nLang[]).forEach((lc) => {
          const name = (draft.names[lc] || "").trim();
          if (name) stageI18nRows.push({ stage_id: draft.id, language_code: lc, name });
        });
      });
      if (stageRows.length) {
        const { error: scErr } = await supabase.from("track_stage_courses" as any).insert(stageRows);
        if (scErr) throw scErr;
      }
      if (stageI18nRows.length) {
        const { error: siErr } = await supabase.from("track_stages_i18n" as any).insert(stageI18nRows);
        if (siErr) throw siErr;
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
          {/* Track basics — 4 language tabs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                {t("track.multilingualLabel", "트랙 이름 / 설명 (다국어)")}
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 rounded-lg"
                onClick={autoTranslateAll}
                disabled={translating || !(titles.ko || "").trim()}
              >
                {translating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
                {t("track.autoTranslate", "한국어 → EN/JA/ZH 자동 번역")}
              </Button>
            </div>
            <Tabs value={activeLang} onValueChange={(v) => setActiveLang(v as I18nLang)}>
              <TabsList className="h-8">
                {I18N_LANGS.map((lc) => (
                  <TabsTrigger key={lc} value={lc} className="text-xs h-6">
                    {LANG_LABEL[lc]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {I18N_LANGS.map((lc) => (
                <TabsContent key={lc} value={lc} className="space-y-2 mt-3">
                  <Input
                    value={titles[lc] || ""}
                    onChange={(e) => setTitles((prev) => ({ ...prev, [lc]: e.target.value }))}
                    className="h-9 rounded-lg text-sm"
                    placeholder={
                      lc === "ko"
                        ? "트랙 이름 (예: 강남점 신입 온보딩 트랙)"
                        : `Track name (${LANG_LABEL[lc]})`
                    }
                  />
                  <Textarea
                    value={descriptions[lc] || ""}
                    onChange={(e) => setDescriptions((prev) => ({ ...prev, [lc]: e.target.value }))}
                    className="min-h-[60px] rounded-lg text-xs"
                    placeholder={
                      lc === "ko"
                        ? "설명 (선택)"
                        : `Description (${LANG_LABEL[lc]}, optional)`
                    }
                  />
                  {lc !== "ko" && (
                    <p className="text-[11px] text-muted-foreground">
                      {t("track.fallbackHint", "비워두면 한국어로 표시됩니다.")}
                    </p>
                  )}
                </TabsContent>
              ))}
            </Tabs>
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
                    value={stage.names[activeLang] || ""}
                    onChange={(e) =>
                      updateStage(stage.id, {
                        names: { ...stage.names, [activeLang]: e.target.value },
                      })
                    }
                    placeholder={
                      activeLang === "ko"
                        ? "단계명 (KO)"
                        : `Stage name (${LANG_LABEL[activeLang]})`
                    }
                    className="h-8 rounded-lg text-xs flex-1"
                  />
                  {activeLang !== "ko" && (stage.names.ko || "").trim() && (
                    <span className="text-[10px] text-muted-foreground shrink-0 max-w-[120px] truncate">
                      KO: {stage.names.ko}
                    </span>
                  )}
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

type AssignMode = "users" | "branch" | "country" | "role" | "all";

const ROLE_OPTIONS: { value: "student" | "teacher" | "admin" | "super_admin"; labelKo: string }[] = [
  { value: "student", labelKo: "학생" },
  { value: "teacher", labelKo: "강사" },
  { value: "admin", labelKo: "관리자" },
  { value: "super_admin", labelKo: "최고 관리자" },
];

const AssignDialog = ({ track, onClose }: { track: Track; onClose: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<AssignMode>("users");
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("student");
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
      const { data, error } = await supabase.from("departments").select("id, name, team_name, country").eq("is_active", true).order("display_order");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const countries = useMemo(() => {
    const set = new Set<string>();
    (branches as any[]).forEach((b) => { if (b.country) set.add(b.country); });
    return Array.from(set).sort();
  }, [branches]);

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

  const resolveTargetUserIds = async (): Promise<string[]> => {
    if (mode === "users") return Array.from(selectedUsers);

    if (mode === "branch") {
      if (!selectedBranch) return [];
      const { data, error } = await supabase.from("profiles").select("user_id").eq("department_id", selectedBranch);
      if (error) throw error;
      return (data as any[]).map((r) => r.user_id);
    }

    if (mode === "country") {
      if (!selectedCountry) return [];
      const deptIds = (branches as any[]).filter((b) => b.country === selectedCountry).map((b) => b.id);
      if (deptIds.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("user_id").in("department_id", deptIds);
      if (error) throw error;
      return (data as any[]).map((r) => r.user_id);
    }

    if (mode === "role") {
      const { data, error } = await supabase.from("user_roles").select("user_id").eq("role", selectedRole as any);
      if (error) throw error;
      return Array.from(new Set((data as any[]).map((r) => r.user_id)));
    }

    // all
    const { data, error } = await supabase.from("profiles").select("user_id");
    if (error) throw error;
    return (data as any[]).map((r) => r.user_id);
  };

  const handleAssign = async () => {
    setAssigning(true);
    try {
      // Branch mode keeps the optimized RPC
      if (mode === "branch") {
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
        toast({
          title: t("track.assignedSuccess", "트랙이 배정되었습니다"),
          description: `학생 ${result?.users_assigned ?? 0}명에게 배정 완료`,
        });
      } else {
        const targetIds = await resolveTargetUserIds();
        if (targetIds.length === 0) {
          toast({ title: t("track.noTargets", "배정 대상이 없습니다"), variant: "destructive" });
          setAssigning(false);
          return;
        }
        const toAssign = targetIds.filter((id) => !existingAssignments.includes(id));
        let totalUsers = 0;
        let totalCourses = 0;
        let failed = 0;
        for (const uid of toAssign) {
          try {
            const { data, error } = await supabase.rpc("assign_track_to_user" as any, {
              p_track_id: track.id,
              p_user_id: uid,
            });
            if (error) throw error;
            totalUsers += 1;
            const result = data as { courses_enrolled?: number } | null;
            totalCourses += result?.courses_enrolled ?? 0;
          } catch {
            failed += 1;
          }
        }
        toast({
          title: t("track.assignedSuccess", "트랙이 배정되었습니다"),
          description: `학생 ${totalUsers}명에게 배정 완료${totalCourses ? ` · 강의 ${totalCourses}건 수강 처리` : ""}${failed ? ` (실패 ${failed}건)` : ""}`,
        });
      }

      qc.invalidateQueries({ queryKey: ["existing-track-enrollments", track.id] });
      qc.invalidateQueries({ queryKey: ["admin-tracks"] });
      onClose();
    } catch (e: any) {
      toast({ title: t("common.error", "오류"), description: e.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const filteredUsers = users;

  const modeButtons: { key: AssignMode; icon: any; label: string }[] = [
    { key: "users", icon: UserPlus, label: t("track.byUser", "직원 개별") },
    { key: "branch", icon: Building2, label: t("track.byBranch", "지점/팀") },
    { key: "country", icon: Building2, label: t("track.byCountry", "국가") },
    { key: "role", icon: UserPlus, label: t("track.byRole", "역할") },
    { key: "all", icon: Sparkles, label: t("track.byAll", "전체") },
  ];

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
          <div className="grid grid-cols-5 gap-1.5">
            {modeButtons.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`px-2 py-2 rounded-lg text-[11px] font-medium border transition-all min-w-0 ${mode === key ? "bg-accent text-foreground border-border" : "border-border text-muted-foreground hover:bg-accent/50"}`}
              >
                <Icon className="h-3.5 w-3.5 inline mr-1" />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            ))}
          </div>

          {mode === "users" && (
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
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer min-w-0 ${already ? "opacity-60" : "hover:bg-accent/40"}`}
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
                        <span className="font-medium truncate flex-1 min-w-0">{u.full_name || u.email}</span>
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
                <p className="text-xs text-muted-foreground">{selectedUsers.size}명 선택됨</p>
              )}
            </div>
          )}

          {mode === "branch" && (
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
              <NoteBox text={t("track.branchAssignNote", "선택한 지점/팀에 소속된 모든 학생에게 트랙이 배정되며, 포함 강의가 자동 수강 승인 처리됩니다.")} />
            </div>
          )}

          {mode === "country" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("track.selectCountryLabel", "배정 대상 국가")}</label>
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue placeholder={t("track.selectCountryPlaceholder", "국가 선택")} />
                </SelectTrigger>
                <SelectContent>
                  {countries.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">국가 정보가 등록된 지점이 없습니다</div>
                  ) : countries.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <NoteBox text={t("track.countryAssignNote", "선택한 국가의 모든 지점/팀 소속 인원에게 트랙이 배정됩니다.")} />
            </div>
          )}

          {mode === "role" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("track.selectRoleLabel", "배정 대상 역할")}</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.labelKo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <NoteBox text={t("track.roleAssignNote", "선택한 역할을 가진 모든 사용자에게 트랙이 배정됩니다.")} />
            </div>
          )}

          {mode === "all" && (
            <div className="space-y-2">
              <NoteBox text={t("track.allAssignNote", "모든 사용자에게 트랙이 일괄 배정됩니다. 신중히 진행해 주세요.")} />
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

const NoteBox = ({ text }: { text: string }) => (
  <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-2">
    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
    <span>{text}</span>
  </div>
);

export default AdminTracks;
