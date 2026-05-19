import { useState, useRef } from "react";
import { Search, BookOpen, Users, Clock, Sparkles, ChevronRight, ChevronLeft, Hourglass, Compass } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguageSwitching } from "@/hooks/useLanguageSwitching";
import CourseThumbnail from "@/components/CourseThumbnail";

const categoryGradients: Record<string, string> = {
  marketing: "from-orange-500 to-pink-500",
  sales: "from-blue-500 to-cyan-500",
  "product-development": "from-purple-500 to-indigo-500",
  "skin-science": "from-rose-400 to-pink-600",
  "beauty-trends": "from-fuchsia-500 to-violet-500",
  "design-creative": "from-amber-400 to-orange-500",
  "quality-regulation": "from-emerald-500 to-teal-500",
  "scm-logistics": "from-sky-500 to-blue-600",
  "management-leadership": "from-slate-500 to-zinc-600",
  "finance-accounting": "from-green-500 to-emerald-600",
  "hr-culture": "from-pink-400 to-rose-500",
  "it-digital": "from-violet-500 to-purple-600",
  "customer-service": "from-cyan-400 to-blue-500",
  "legal-compliance": "from-gray-500 to-slate-600",
  "self-development": "from-yellow-400 to-amber-500",
  "safety-environment": "from-lime-500 to-green-600",
};

const ScrollArrow = ({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-md transition-all hover:text-foreground hover:shadow-lg sm:flex"
      style={{ [direction]: -12 }}
      aria-label={direction === "left" ? t("common.prev", "이전") : t("common.next", "다음")}
    >
      {direction === "left" ? <ChevronLeft className="h-5 w-5" aria-hidden="true" /> : <ChevronRight className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
};

const CatalogCourseCard = ({
  course,
  cat,
  gradient,
  enrollmentStatus,
  studentCount,
  lessons,
  onEnroll,
  isPending,
  t,
  isGridItem,
}: any) => (
  <article
    className={`group min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
      isGridItem ? "w-full" : "w-[280px] shrink-0"
    }`}
    aria-label={course.title}
  >
    <Link to={`/student/courses/${course.id}`} className="block">
      <div className={`relative overflow-hidden bg-gradient-to-br ${gradient}`}>
        <CourseThumbnail
          src={course.thumbnail_url}
          alt={course.title}
          className="w-full rounded-none"
          fallbackClassName="flex aspect-[16/10] w-full items-center justify-center rounded-none bg-transparent"
          iconClassName="h-12 w-12 text-primary-foreground/30"
        />

        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          {course.is_mandatory && (
            <span className="rounded-lg bg-destructive px-2.5 py-1 text-[10px] font-semibold text-destructive-foreground">
              {t("common.required")}
            </span>
          )}
        </div>

        {course.difficulty_level && (
          <div className="absolute right-3 top-3">
            <span className="rounded-lg bg-white/90 px-2 py-1 text-[10px] font-bold text-foreground backdrop-blur-sm">
              {t(`teacher.${course.difficulty_level}`)}
            </span>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          {cat && (
            <span className="mb-1.5 inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
              <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
              {cat.name}
            </span>
          )}
          <h3 className="line-clamp-2 break-words text-sm font-bold leading-snug text-white">{course.title}</h3>
        </div>
      </div>
    </Link>

    <div className="space-y-3 p-4">
      {course.description && <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">{course.description}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Users className="h-3 w-3" aria-hidden="true" />
          {studentCount}
          {t("common.people")}
        </span>

        {lessons > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <BookOpen className="h-3 w-3" aria-hidden="true" />
            {t("course.lessonsCount", { count: lessons })}
          </span>
        )}
      </div>

      <div className="pt-1">
        {enrollmentStatus === "approved" ? (
          <Link to={`/student/courses/${course.id}?view=learn`}>
            <Button variant="outline" size="sm" className="w-full gap-1.5 rounded-xl text-xs">
              {t("catalog.continueLearning")}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </Link>
        ) : (
          <Button
            size="sm"
            className="w-full gap-1.5 rounded-xl text-xs"
            onClick={(e) => {
              e.preventDefault();
              onEnroll(course.id);
            }}
            disabled={isPending}
          >
            {t("catalog.startLearning", "학습 시작")}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>

    </div>
  </article>
);

const CategoryCarousel = ({ category, courses, helpers }: { category: any; courses: any[]; helpers: any }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  };

  if (courses.length === 0) return null;

  return (
    <section className="min-w-0 space-y-4" aria-label={category.name}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-lg font-semibold text-foreground">{category.name}</h2>
        <button
          type="button"
          onClick={() => helpers.setActiveCategory(category.id)}
          className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`${category.name} ${helpers.t("common.viewAll")}`}
        >
          + {helpers.t("common.viewAll")}
        </button>
      </div>

      <div className="w-full min-w-0 space-y-3 sm:hidden" role="list" aria-label={category.name}>
        {courses.map((course: any) => {
          const cat = helpers.categoryMap.get(course.category_id);
          const gradient = categoryGradients[cat?.slug || ""] || "from-primary to-primary/80";

          return (
            <div key={course.id} role="listitem" className="w-full min-w-0">
              <CatalogCourseCard
                course={course}
                cat={cat}
                gradient={gradient}
                enrollmentStatus={helpers.enrollmentStatusMap.get(course.id)}
                studentCount={helpers.countMap.get(course.id) || 0}
                lessons={helpers.contentCountMap.get(course.id) || 0}
                onEnroll={helpers.onEnroll}
                isPending={helpers.isPending}
                t={helpers.t}
                isGridItem={true}
              />
            </div>
          );
        })}
      </div>

      <div className="relative hidden min-w-0 sm:block">
        {courses.length > 3 && <ScrollArrow direction="left" onClick={() => scroll("left")} />}
        <div ref={scrollRef} className="flex min-w-0 snap-x snap-mandatory gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {courses.map((course: any) => {
            const cat = helpers.categoryMap.get(course.category_id);
            const gradient = categoryGradients[cat?.slug || ""] || "from-primary to-primary/80";

            return (
              <div key={course.id} className="snap-start">
                <CatalogCourseCard
                  course={course}
                  cat={cat}
                  gradient={gradient}
                  enrollmentStatus={helpers.enrollmentStatusMap.get(course.id)}
                  studentCount={helpers.countMap.get(course.id) || 0}
                  lessons={helpers.contentCountMap.get(course.id) || 0}
                  onEnroll={helpers.onEnroll}
                  isPending={helpers.isPending}
                  t={helpers.t}
                  isGridItem={false}
                />
              </div>
            );
          })}
        </div>
        {courses.length > 3 && <ScrollArrow direction="right" onClick={() => scroll("right")} />}
      </div>
    </section>
  );
};

const CourseCatalog = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const normalizeLang = (l?: string): string => {
    if (!l) return "ko";
    if (l.startsWith("ko")) return "ko";
    if (l.startsWith("en")) return "en";
    if (l.startsWith("ja")) return "ja";
    if (l.startsWith("zh")) return "zh-CN";
    return "ko";
  };
  const lang = normalizeLang(i18n.language);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const isLangSwitching = useLanguageSwitching();

  const { data: courses = [], isLoading, isFetching } = useQuery({
    queryKey: ["catalog-courses", lang],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*, course_i18n(language_code, title, description)")
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (lang === "ko") return data;
      return (data || []).map((c: any) => {
        const tr = (c.course_i18n || []).find((x: any) => x.language_code === lang);
        return {
          ...c,
          title: tr?.title || c.title,
          description: tr?.description || c.description,
        };
      });
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", lang],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      if (lang === "ko") return data;
      // categories only has KO + name_en; for JA/ZH fall back to EN, then KO
      return (data || []).map((c: any) => ({ ...c, name: c.name_en || c.name }));
    },
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["my-enrollment-status", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("enrollments").select("course_id, status").eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: enrollmentCounts = [] } = useQuery({
    queryKey: ["catalog-enrollment-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("enrollments").select("course_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: contentCounts = [] } = useQuery({
    queryKey: ["catalog-content-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_contents").select("course_id").eq("is_published", true);
      if (error) throw error;
      return data;
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async (courseId: string) => {
      // Auto-approve every enrollment from the student catalog.
      const { error } = await supabase
        .from("enrollments")
        .insert({ course_id: courseId, user_id: user!.id, status: "approved" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-enrollment-status"] });
      queryClient.invalidateQueries({ queryKey: ["catalog-enrollment-counts"] });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });


  const enrollmentStatusMap = new Map(enrollments.map((e: any) => [e.course_id, e.status]));
  const countMap = new Map<string, number>();
  enrollmentCounts.forEach((e: any) => countMap.set(e.course_id, (countMap.get(e.course_id) || 0) + 1));
  const contentCountMap = new Map<string, number>();
  contentCounts.forEach((c: any) => contentCountMap.set(c.course_id, (contentCountMap.get(c.course_id) || 0) + 1));
  const categoryMap = new Map(categories.map((c: any) => [c.id, c]));

  const filtered = courses.filter((c: any) => {
    const matchSearch = c.title?.toLowerCase().includes(search.toLowerCase()) || c.description?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = activeCategory === "all" || c.category_id === activeCategory;
    return matchSearch && matchCategory;
  });

  const coursesByCategory = new Map<string, any[]>();
  courses.forEach((c: any) => {
    if (!c.category_id) return;
    const arr = coursesByCategory.get(c.category_id) || [];
    arr.push(c);
    coursesByCategory.set(c.category_id, arr);
  });

  const isCarouselView = activeCategory === "all" && !search;

  const carouselHelpers = {
    categoryMap,
    enrollmentStatusMap,
    countMap,
    contentCountMap,
    t,
    onEnroll: (id: string) => enrollMutation.mutate(id),
    isPending: enrollMutation.isPending,
    setActiveCategory,
  };

  return (
    <DashboardLayout role="student" contentClassName="flex-1 min-w-0 overflow-x-hidden px-5 py-6 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="min-w-0 space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground sm:text-2xl">
            <Compass className="h-5 w-5 text-primary sm:h-6 sm:w-6" aria-hidden="true" />
            {t("catalog.title")}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {t("catalog.totalCourses")}: {courses.length} · {t("catalog.totalCategories")}: {categories.length} · {t("catalog.myEnrolled")}: {enrollments.filter((e: any) => e.status === "approved").length}
          </p>
        </header>

        <nav className="w-full min-w-0 max-w-full overflow-x-auto border-b border-border scrollbar-hide" role="tablist" aria-label={t("catalog.title")}>
          <div className="flex w-max min-w-full items-center gap-1 pb-2">
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === "all"}
              tabIndex={activeCategory === "all" ? 0 : -1}
              onClick={() => {
                setActiveCategory("all");
                setSearch("");
              }}
              className={`-mb-[2px] shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                activeCategory === "all" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("catalog.allCourses")}
            </button>
            {categories.map((cat: any) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat.id}
                tabIndex={activeCategory === cat.id ? 0 : -1}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setSearch("");
                }}
                className={`-mb-[2px] shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  activeCategory === cat.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </nav>

        <div className="w-full min-w-0 sm:flex sm:justify-center">
          <div className="relative w-full min-w-0 max-w-full sm:max-w-lg">
            <label htmlFor="catalog-search" className="sr-only">
              {t("catalog.searchPlaceholder")}
            </label>
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="catalog-search"
              placeholder={t("catalog.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-xl border-border bg-card pl-11 text-sm"
            />
          </div>
        </div>

        {isLoading || isLangSwitching || isFetching ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-live="polite" aria-label="Loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : isCarouselView ? (
          <div className="min-w-0 space-y-8 sm:space-y-10">
            {categories.map((cat: any) => {
              const catCourses = coursesByCategory.get(cat.id) || [];
              return <CategoryCarousel key={cat.id} category={cat} courses={catCourses} helpers={carouselHelpers} />;
            })}
            {courses.filter((c: any) => !c.category_id).length > 0 && (
              <CategoryCarousel
                category={{ id: "uncategorized", name: t("common.all") }}
                courses={courses.filter((c: any) => !c.category_id)}
                helpers={carouselHelpers}
              />
            )}
          </div>
        ) : (
          <section className="min-w-0" aria-live="polite">
            <p className="mb-4 text-sm text-muted-foreground">{t("catalog.resultCount", { count: filtered.length })}</p>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center space-y-3 py-20">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                  <BookOpen className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-sm text-muted-foreground">{t("catalog.noCourses")}</p>
              </div>
            ) : (
              <div className="grid min-w-0 grid-cols-1 gap-4 min-[640px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((course: any) => {
                  const cat = categoryMap.get(course.category_id);
                  const gradient = categoryGradients[cat?.slug || ""] || "from-primary to-primary/80";

                  return (
                    <CatalogCourseCard
                      key={course.id}
                      course={course}
                      cat={cat}
                      gradient={gradient}
                      enrollmentStatus={enrollmentStatusMap.get(course.id)}
                      studentCount={countMap.get(course.id) || 0}
                      lessons={contentCountMap.get(course.id) || 0}
                      onEnroll={(id: string) => enrollMutation.mutate(id)}
                      isPending={enrollMutation.isPending}
                      t={t}
                      isGridItem={true}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CourseCatalog;
