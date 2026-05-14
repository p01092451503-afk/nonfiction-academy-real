import { Search, BookOpen, Info, RefreshCw, Clock, Star, ChevronRight, Layers } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguageSwitching } from "@/hooks/useLanguageSwitching";
import { normalizeLang } from "@/lib/i18nLang";
import CourseThumbnail from "@/components/CourseThumbnail";

const StudentCourses = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const isLangSwitching = useLanguageSwitching();

  const { data: enrollments = [], isLoading, isFetching } = useQuery({
    queryKey: ["my-enrollments", user?.id, lang],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*, courses(*, course_i18n(language_code, title, description))")
        .eq("user_id", user!.id)
        .order("enrolled_at", { ascending: false });
      if (error) throw error;
      if (lang === "ko") return data;
      return (data || []).map((e: any) => {
        if (!e.courses) return e;
        const tr = (e.courses.course_i18n || []).find((x: any) => x.language_code === lang);
        return {
          ...e,
          courses: {
            ...e.courses,
            title: tr?.title || e.courses.title,
            description: tr?.description || e.courses.description,
          },
        };
      });
    },
    enabled: !!user?.id,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", lang],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name, name_en, slug");
      if (error) throw error;
      if (lang === "ko") return data;
      return (data || []).map((c: any) => ({ ...c, name: c.name_en || c.name }));
    },
  });

  // 사용자가 배정받은 트랙 + 단계 + 강의 매핑 → 강의별 "어느 트랙의 어느 단계"인지 표시
  const { data: courseTrackMap = new Map() } = useQuery({
    queryKey: ["my-course-track-map", user?.id, lang],
    queryFn: async () => {
      const { data: te } = await supabase
        .from("track_enrollments")
        .select("track_id, learning_tracks(id, title, title_en)")
        .eq("user_id", user!.id);
      const trackIds = (te || []).map((r: any) => r.track_id);
      if (trackIds.length === 0) return new Map();

      const [{ data: stages }, { data: stageCourses }, { data: tracksI18n }, { data: stagesI18n }] = await Promise.all([
        supabase.from("track_stages").select("id, track_id, name, name_en, order_index").in("track_id", trackIds).order("order_index"),
        supabase.from("track_stage_courses").select("stage_id, course_id, order_index"),
        supabase.from("learning_tracks_i18n").select("track_id, language_code, title").in("track_id", trackIds),
        supabase.from("track_stages_i18n").select("stage_id, language_code, name"),
      ]);

      const trackById = new Map((te || []).map((r: any) => [r.track_id, r.learning_tracks]));
      const stageById = new Map((stages || []).map((s: any) => [s.id, s]));
      const stageIdxByTrack = new Map<string, Map<string, number>>();
      (stages || []).forEach((s: any) => {
        if (!stageIdxByTrack.has(s.track_id)) stageIdxByTrack.set(s.track_id, new Map());
        stageIdxByTrack.get(s.track_id)!.set(s.id, s.order_index);
      });

      const trackTitle = (trackId: string) => {
        const tr = (tracksI18n || []).find((r: any) => r.track_id === trackId && r.language_code === lang);
        const base = trackById.get(trackId);
        return tr?.title || (lang === "en" && base?.title_en ? base.title_en : base?.title) || "";
      };
      const stageName = (stage: any) => {
        if (!stage) return "";
        const tr = (stagesI18n || []).find((r: any) => r.stage_id === stage.id && r.language_code === lang);
        return tr?.name || (lang === "en" && stage.name_en ? stage.name_en : stage.name) || "";
      };

      const map = new Map<string, Array<{ trackId: string; trackTitle: string; stageIdx: number; stageName: string }>>();
      (stageCourses || []).forEach((sc: any) => {
        const stage = stageById.get(sc.stage_id);
        if (!stage) return;
        const arr = map.get(sc.course_id) || [];
        arr.push({
          trackId: stage.track_id,
          trackTitle: trackTitle(stage.track_id),
          stageIdx: (stage.order_index ?? 0) + 1,
          stageName: stageName(stage),
        });
        map.set(sc.course_id, arr);
      });
      return map;
    },
    enabled: !!user?.id,
  });

  const syncProgressMutation = useMutation({
    mutationFn: async () => {
      for (const enrollment of enrollments) {
        const courseId = (enrollment as any).course_id;
        const { data: contents } = await supabase.from("course_contents").select("id").eq("course_id", courseId).eq("is_published", true);
        if (!contents || contents.length === 0) continue;
        const { data: progress } = await supabase.from("content_progress").select("content_id, completed").eq("user_id", user!.id).in("content_id", contents.map(c => c.id));
        // 차시 = 동일 콘텐츠의 다국어 버전. 어느 한 차시라도 완료되면 강의 100% 완료.
        const anyCompleted = (progress || []).some(p => p.completed);
        const percentage = anyCompleted ? 100 : 0;
        await supabase.from("enrollments").update({ progress: percentage, completed_at: anyCompleted ? new Date().toISOString() : null }).eq("id", enrollment.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      toast({ title: t("course.syncComplete"), description: t("course.syncCompleteDesc") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const categoryMap = new Map(categories.map((c: any) => [c.id, c]));
  const filtered = enrollments.filter((e: any) => e.courses?.title?.toLowerCase().includes(search.toLowerCase()));
  const inProgress = filtered.filter((e: any) => !e.completed_at);
  const completed = filtered.filter((e: any) => !!e.completed_at);

  const renderEmpty = (isCompleted = false) => (
    <div className="flex flex-col items-center justify-center py-12 space-y-3">
      <div className="h-14 w-14 rounded-full bg-accent flex items-center justify-center" aria-hidden="true">
        <BookOpen className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        {isCompleted ? t("course.noCompletedCourses") : t("course.noInProgressCourses")}
      </p>
    </div>
  );

  const renderListItem = (enrollment: any, isCompleted = false, index = 0) => {
    const course = enrollment.courses;
    if (!course) return null;
    const cat = categoryMap.get(course.category_id);
    const progress = isCompleted ? 100 : Number(enrollment.progress) || 0;
    const trackInfos: Array<{ trackId: string; trackTitle: string; stageIdx: number; stageName: string }> =
      (courseTrackMap as Map<string, any[]>).get(course.id) || [];

    return (
      <Link
        key={enrollment.id}
        to={`/student/courses/${course.id}?view=learn`}
        className={`group flex items-center gap-4 p-4 hover:shadow-md transition-all border-b-2 border-border/80 last:border-b-0`}
      >
        <CourseThumbnail
          src={course.thumbnail_url}
          alt={course.title}
          className="max-h-20 max-w-14 shrink-0 rounded-lg"
          fallbackClassName="h-14 w-14 shrink-0 rounded-lg"
          iconClassName="h-6 w-6"
        />

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">{course.title}</h3>
            {course.is_mandatory && <Badge variant="destructive" className="text-[10px] h-5">{t("common.required")}</Badge>}
            {cat && <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">{cat.name}</span>}
            {trackInfos.map((ti) => (
              <button
                key={`${ti.trackId}-${ti.stageIdx}`}
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/student/tracks"); }}
                className="inline-flex items-center gap-1 text-[10px] text-foreground bg-accent hover:bg-accent/70 transition-colors px-2 py-0.5 rounded-md whitespace-nowrap"
                title={`${ti.trackTitle} · ${t("track.stage", "단계")} ${ti.stageIdx} ${ti.stageName}`}
              >
                <Layers className="h-2.5 w-2.5" aria-hidden="true" />
                {ti.trackTitle} · {t("track.stage", "단계")} {ti.stageIdx}
              </button>
            ))}
          </div>
          {!isCompleted && (
            <div className="flex items-center gap-3">
              <Progress value={progress} className="flex-1 h-1.5" aria-label={`${t("dashboard.progressRate")}: ${Math.round(progress)}%`} />
              <span className="text-xs font-medium text-muted-foreground">{Math.round(progress)}%</span>
            </div>
          )}
          {isCompleted && (
            <div className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" aria-hidden="true" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">{t("course.completionLabel")}</span>
            </div>
          )}
        </div>


        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" aria-hidden="true" />
      </Link>
    );
  };

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2"><BookOpen className="h-6 w-6" aria-hidden="true" />{t("course.myCourseRoom")}</h1>
        </div>

        <div className="bg-secondary/30 rounded-xl p-4 space-y-1.5">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
            <div className="space-y-1 text-sm text-muted-foreground" role="note">
              <p>{t("course.courseInfoGuide")}</p>
              <p>{t("course.courseInfoGuide2")}</p>
              <p>{t("course.courseInfoGuide3")}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-lg text-xs" onClick={() => syncProgressMutation.mutate()} disabled={syncProgressMutation.isPending}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {syncProgressMutation.isPending ? t("course.syncing") : t("course.syncProgress")}
            </Button>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="course-search" className="sr-only">{t("course.searchCourse")}</label>
          <Input id="course-search" placeholder={t("course.searchCourse")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 rounded-xl border-border" />
        </div>

        {isLoading || isLangSwitching || isFetching ? (
          <div className="space-y-8" role="status" aria-live="polite" aria-label={t("common.loading", "로딩 중")}>
            {Array.from({ length: 2 }).map((_, section) => (
              <section key={section} className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <div className="rounded-2xl overflow-hidden border border-border">
                  {Array.from({ length: 3 }).map((__, row) => (
                    <div key={row} className="flex items-center gap-4 p-4 border-b-2 border-border/80 last:border-b-0">
                      <Skeleton className="h-14 w-14 rounded-lg shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-2 w-full" />
                      </div>
                      <Skeleton className="h-4 w-10 shrink-0" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 min-w-0">
            {/* 수강중인 강의 */}
            <section className="space-y-3 min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {t("course.inProgressCourses")} ({inProgress.length})
              </h2>
              {inProgress.length === 0 ? renderEmpty() : (
                <div className="rounded-2xl overflow-hidden border border-border">
                  {inProgress.map((e: any, i: number) => renderListItem(e, false, i))}
                </div>
              )}
            </section>

            {/* 수강종료 강의 */}
            <section className="space-y-3 min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {t("course.completedCourses")} ({completed.length})
              </h2>
              {completed.length === 0 ? renderEmpty(true) : (
                <div className="rounded-2xl overflow-hidden border border-border">
                  {completed.map((e: any, i: number) => renderListItem(e, true, i))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default StudentCourses;
