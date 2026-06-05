import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Layers, BookOpen, ChevronRight, Lock, CheckCircle2, Circle } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguageSwitching } from "@/hooks/useLanguageSwitching";

type Lang = "ko" | "en" | "ja" | "zh-CN";

const resolveLang = (l: string | undefined): Lang => {
  const lower = (l || "ko").toLowerCase();
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("zh")) return "zh-CN";
  return "ko";
};

const StudentTracks = () => {
  const { user } = useUser();
  const { t, i18n } = useTranslation();
  const lang: Lang = resolveLang(i18n.language);
  const isLangSwitching = useLanguageSwitching();

  const { data: tracks = [], isLoading, isFetching } = useQuery({
    queryKey: ["my-tracks", user?.id, lang],
    queryFn: async () => {
      const { data: enrolls, error: e1 } = await supabase
        .from("track_enrollments")
        .select("track_id, assigned_at, learning_tracks(*)")
        .eq("user_id", user!.id);
      if (e1) throw e1;

      const trackIds = (enrolls || []).map((e: any) => e.track_id);
      if (trackIds.length === 0) return [];

      const [
        { data: stages },
        { data: stageCourses },
        { data: myEnrollments },
        { data: tracksI18n },
      ] = await Promise.all([
        supabase.from("track_stages").select("*").in("track_id", trackIds).order("order_index"),
        supabase
          .from("track_stage_courses")
          .select("*, courses(id, title, thumbnail_url, status)")
          .order("order_index"),
        supabase.from("enrollments").select("course_id, progress, completed_at").eq("user_id", user!.id),
        supabase.from("learning_tracks_i18n").select("*").in("track_id", trackIds),
      ]);

      const stageIds = (stages || []).map((s: any) => s.id);
      const courseIds = Array.from(
        new Set((stageCourses || []).map((sc: any) => sc.course_id).filter(Boolean))
      );

      const [{ data: stagesI18n }, { data: courseI18n }] = await Promise.all([
        stageIds.length
          ? supabase.from("track_stages_i18n").select("*").in("stage_id", stageIds)
          : Promise.resolve({ data: [] as any[] }),
        courseIds.length
          ? supabase.from("course_i18n").select("course_id, language_code, title").in("course_id", courseIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const enrollMap = new Map((myEnrollments || []).map((e: any) => [e.course_id, e]));
      const stageCoursesByStage = new Map<string, any[]>();
      (stageCourses || []).forEach((sc: any) => {
        if (!stageCoursesByStage.has(sc.stage_id)) stageCoursesByStage.set(sc.stage_id, []);
        stageCoursesByStage.get(sc.stage_id)!.push(sc);
      });

      const trackI18nByTrack = new Map<string, any[]>();
      (tracksI18n || []).forEach((row: any) => {
        if (!trackI18nByTrack.has(row.track_id)) trackI18nByTrack.set(row.track_id, []);
        trackI18nByTrack.get(row.track_id)!.push(row);
      });

      const stageI18nByStage = new Map<string, any[]>();
      (stagesI18n || []).forEach((row: any) => {
        if (!stageI18nByStage.has(row.stage_id)) stageI18nByStage.set(row.stage_id, []);
        stageI18nByStage.get(row.stage_id)!.push(row);
      });

      const courseI18nByCourse = new Map<string, any[]>();
      (courseI18n || []).forEach((row: any) => {
        if (!courseI18nByCourse.has(row.course_id)) courseI18nByCourse.set(row.course_id, []);
        courseI18nByCourse.get(row.course_id)!.push(row);
      });

      const pickCourseTitle = (course: any) => {
        if (lang === "ko") return course.title;
        const tr = (courseI18nByCourse.get(course.id) || []).find(
          (r: any) => r.language_code === lang
        );
        return tr?.title || course.title;
      };

      return (enrolls || []).map((te: any) => {
        const track = te.learning_tracks;
        const trackTr = (trackI18nByTrack.get(track.id) || []).find(
          (r: any) => r.language_code === lang
        );

        const trackStages = (stages || []).filter((s: any) => s.track_id === track.id);
        const stagesWithCourses = trackStages.map((s: any) => {
          const stageTr = (stageI18nByStage.get(s.id) || []).find(
            (r: any) => r.language_code === lang
          );
          return {
            ...s,
            localizedName:
              (stageTr?.source_name === s.name ? stageTr?.name : "") ||
              s.name,
            courses: (stageCoursesByStage.get(s.id) || []).map((sc: any) => ({
              ...sc.courses,
              localizedTitle: pickCourseTitle(sc.courses),
              enrollment: enrollMap.get(sc.course_id),
            })),
          };
        });
        const allCourses = stagesWithCourses.flatMap((s: any) => s.courses);
        const completedCount = allCourses.filter((c: any) => c.enrollment?.completed_at).length;
        const totalCount = allCourses.length;
        const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        return {
          ...track,
          localizedTitle:
            trackTr?.title ||
            track.title,
          localizedDescription:
            track.description ? (trackTr?.source_description === track.description ? trackTr?.description : "") || track.description : null,
          assigned_at: te.assigned_at,
          stages: stagesWithCourses,
          progress,
          completedCount,
          totalCount,
        };
      });
    },
    enabled: !!user?.id,
  });

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-6 w-6" aria-hidden="true" />
              {t("track.myTracks", "내 학습 트랙")}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("track.myTracksDesc", "배정받은 학습 경로를 단계별로 진행하세요.")}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-lg">
            <Link to="/dashboard/courses">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {t("track.viewAllMyCourses", "전체 내 강의 보기")}
            </Link>
          </Button>
        </div>

        {isLoading || isLangSwitching || isFetching ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6 space-y-4 border border-border rounded-xl">
            <div className="h-14 w-14 rounded-full bg-accent flex items-center justify-center">
              <Layers className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h2 className="text-base font-semibold text-foreground">
                {t("track.noTracksTitle", "아직 시작된 학습 트랙이 없습니다")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  "track.noTracksDesc",
                  "관리자가 학습 트랙을 배정할 때까지, 강의 카탈로그에서 관심 있는 강의를 둘러보고 먼저 수강해 보세요."
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button asChild size="sm">
                <Link to="/student/catalog">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  {t("track.browseCourses", "강의 둘러보기")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/student">
                  {t("track.goToDashboard", "대시보드로 이동")}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {tracks.map((track: any) => (
              <article key={track.id} className="border border-border rounded-xl overflow-hidden bg-background">
                {/* Track header */}
                <div className="p-5 border-b-2 border-border/80 space-y-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-foreground">{track.localizedTitle}</h2>
                      {track.localizedDescription && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{track.localizedDescription}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {track.is_sequential ? (
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {t("track.sequential", "순차 진행")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs whitespace-nowrap">
                          {t("track.free", "자유 진행")}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Progress value={track.progress} className="flex-1 h-1.5" />
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {track.completedCount}/{track.totalCount} · {track.progress}%
                    </span>
                  </div>
                </div>

                {/* Stages */}
                <div className="divide-y-2 divide-border/80">
                  {track.stages.map((stage: any, stageIdx: number) => {
                    const prevStage = stageIdx > 0 ? track.stages[stageIdx - 1] : null;
                    const prevAllDone =
                      !prevStage ||
                      (prevStage.courses.length > 0 &&
                        prevStage.courses.every((c: any) => c.enrollment?.completed_at));
                    const stageLocked = track.is_sequential && stageIdx > 0 && !prevAllDone;

                    return (
                      <div key={stage.id} className="p-5 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {t("track.stage", "단계")} {stageIdx + 1}
                          </Badge>
                          <h3 className="text-sm font-semibold text-foreground">
                            {stage.localizedName}
                          </h3>
                          {stageLocked && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="h-3 w-3" />
                              {t("track.locked", "잠김")}
                            </span>
                          )}
                        </div>

                        {stage.courses.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">
                            {t("track.noCoursesInStage", "이 단계에 강의가 없습니다.")}
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {stage.courses.map((course: any) => {
                              const completed = !!course.enrollment?.completed_at;
                              const progress = Number(course.enrollment?.progress) || 0;
                              const Wrapper: any = stageLocked ? "div" : Link;
                              const wrapperProps = stageLocked
                                ? { className: "opacity-50 cursor-not-allowed" }
                                : { to: `/student/courses/${course.id}?view=learn` };

                              return (
                                <Wrapper
                                  key={course.id}
                                  {...wrapperProps}
                                  className={`group flex items-center gap-3 p-3 rounded-lg ${
                                    stageLocked
                                      ? "opacity-50 cursor-not-allowed"
                                      : "hover:bg-accent/50 transition-colors"
                                  }`}
                                >
                                  {completed ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                                  ) : (
                                    <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                                  )}
                                  {course.thumbnail_url ? (
                                    <img
                                      src={course.thumbnail_url}
                                      alt=""
                                      className="h-10 w-10 rounded object-cover shrink-0"
                                    />
                                  ) : (
                                    <div className="h-10 w-10 rounded bg-accent flex items-center justify-center shrink-0">
                                      <BookOpen className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {course.localizedTitle}
                                    </p>
                                    {!completed && course.enrollment && (
                                      <div className="flex items-center gap-2 mt-1">
                                        <Progress value={progress} className="h-1 flex-1" />
                                        <span className="text-[10px] text-muted-foreground">
                                          {Math.round(progress)}%
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {!stageLocked && (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground" />
                                  )}
                                </Wrapper>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default StudentTracks;
