import { Search, BookOpen, Info, RefreshCw, Clock, Star, ChevronRight } from "lucide-react";
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
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguageSwitching } from "@/hooks/useLanguageSwitching";
import { normalizeLang } from "@/lib/i18nLang";

const StudentCourses = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  const syncProgressMutation = useMutation({
    mutationFn: async () => {
      for (const enrollment of enrollments) {
        const courseId = (enrollment as any).course_id;
        const { data: contents } = await supabase.from("course_contents").select("id").eq("course_id", courseId).eq("is_published", true);
        if (!contents || contents.length === 0) continue;
        const { data: progress } = await supabase.from("content_progress").select("content_id, completed").eq("user_id", user!.id).in("content_id", contents.map(c => c.id));
        const completedCount = (progress || []).filter(p => p.completed).length;
        const percentage = Math.round((completedCount / contents.length) * 100);
        await supabase.from("enrollments").update({ progress: percentage, completed_at: percentage >= 100 ? new Date().toISOString() : null }).eq("id", enrollment.id);
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

    return (
      <Link
        key={enrollment.id}
        to={`/student/courses/${course.id}?view=learn`}
        className={`group flex items-center gap-4 p-4 hover:shadow-md transition-all border-b-2 border-border/80 last:border-b-0`}
      >
        {/* Thumbnail - small */}
        {course.thumbnail_url ? (
          <img src={course.thumbnail_url} alt={course.title} className="h-14 w-14 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="h-14 w-14 rounded-lg bg-accent flex items-center justify-center shrink-0" aria-hidden="true">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">{course.title}</h3>
            {course.is_mandatory && <Badge variant="destructive" className="text-[10px] h-5">{t("common.required")}</Badge>}
            {cat && <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">{cat.name}</span>}
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

        {/* Duration */}
        {course.estimated_duration_hours != null && course.estimated_duration_hours > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0" aria-label={`${t("course.duration", { hours: course.estimated_duration_hours })}`}>
            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {course.estimated_duration_hours}h
          </span>
        )}

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
          <div className="space-y-8">
            {/* 수강중인 강의 */}
            <section className="space-y-3">
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
            <section className="space-y-3">
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
