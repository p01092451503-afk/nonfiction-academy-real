import { Plus, Search, Filter, MoreHorizontal, Eye, Edit, Trash2, Users, BookOpen, Clock, ChevronDown, LayoutGrid, List } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import CourseThumbnail from "@/components/CourseThumbnail";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useTranslation } from "react-i18next";
import { normalizeLang } from "@/lib/i18nLang";

const statusColor: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  archived: "bg-secondary text-muted-foreground",
};

const TeacherCourses = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const statusLabel: Record<string, string> = {
    draft: t("teacher.draft"), published: t("teacher.open"), archived: t("teacher.archived"),
  };
  const difficultyLabel: Record<string, string> = {
    beginner: t("teacher.beginner"), intermediate: t("teacher.intermediate"), advanced: t("teacher.advanced"),
  };

  const { data: courses = [] } = useQuery({
    queryKey: ["teacher-courses", user?.id, lang],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("instructor_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (lang === "ko" || rows.length === 0) return rows;
      const ids = rows.map((c: any) => c.id);
      const { data: i18nRows } = await supabase
        .from("course_i18n" as any)
        .select("course_id, language_code, title, description")
        .in("course_id", ids)
        .eq("language_code", lang);
      const map = new Map<string, { title: string | null; description: string | null }>();
      (i18nRows as any[] | null)?.forEach((r) => {
        map.set(r.course_id, { title: r.title, description: r.description });
      });
      return rows.map((c: any) => {
        const tr = map.get(c.id);
        return {
          ...c,
          title: tr?.title || c.title,
          description: tr?.description || c.description,
        };
      });
    },
    enabled: !!user?.id,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name, slug");
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollmentCounts = {} } = useQuery({
    queryKey: ["teacher-enrollment-counts", courses.map((c: any) => c.id)],
    queryFn: async () => {
      const ids = courses.map((c: any) => c.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase.from("enrollments").select("course_id").in("course_id", ids);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((e: any) => { counts[e.course_id] = (counts[e.course_id] || 0) + 1; });
      return counts;
    },
    enabled: courses.length > 0,
  });

  const { data: contentCounts = {} } = useQuery({
    queryKey: ["teacher-content-counts", courses.map((c: any) => c.id)],
    queryFn: async () => {
      const ids = courses.map((c: any) => c.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase.from("course_contents").select("course_id").in("course_id", ids);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((e: any) => { counts[e.course_id] = (counts[e.course_id] || 0) + 1; });
      return counts;
    },
    enabled: courses.length > 0,
  });

  const categoryMap = new Map(categories.map((c: any) => [c.id, c]));

  const filtered = courses.filter((c: any) => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: courses.length,
    published: courses.filter((c: any) => c.status === "published").length,
    draft: courses.filter((c: any) => c.status === "draft").length,
    totalStudents: Object.values(enrollmentCounts as Record<string, number>).reduce((a, b) => a + b, 0),
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2"><BookOpen className="h-6 w-6" aria-hidden="true" />{t("teacher.courseManagement")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("teacher.manageCourses")}</p>
          </div>
          <Link to="/teacher/courses/new">
            <Button className="rounded-xl gap-2 w-full sm:w-auto" aria-label={t("teacher.newCourse")}>
              <Plus className="h-4 w-4" aria-hidden="true" /> {t("teacher.newCourse")}
            </Button>
          </Link>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="stat-card !p-3 sm:!p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground">{t("teacher.totalCoursesCount")}</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">{stats.total}</p>
          </div>
          <div className="stat-card !p-3 sm:!p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground">{t("teacher.publishedCourses")}</p>
            <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{stats.published}</p>
          </div>
          <div className="stat-card !p-3 sm:!p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground">{t("teacher.drafts")}</p>
            <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.draft}</p>
          </div>
          <div className="stat-card !p-3 sm:!p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground">{t("teacher.totalStudentsLabel")}</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">{stats.totalStudents}</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="teacher-course-search" className="sr-only">{t("teacher.searchCourse")}</label>
            <Input
              id="teacher-course-search"
              placeholder={t("teacher.searchCourse")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl border-border"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 rounded-xl h-10">
              <SelectValue placeholder={t("teacher.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("teacher.all")}</SelectItem>
              <SelectItem value="published">{t("teacher.open")}</SelectItem>
              <SelectItem value="draft">{t("teacher.draft")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border border-border rounded-xl overflow-hidden" role="group" aria-label={t("teacher.viewMode", "보기 모드")}>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2.5 transition-colors ${viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
              aria-label={t("teacher.listView", "목록 보기")}
              aria-pressed={viewMode === "list"}
            >
              <List className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
              aria-label={t("teacher.gridView", "그리드 보기")}
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content */}
        {filtered.length === 0 ? (
          <div className="stat-card text-center py-16">
            <div className="space-y-3">
              <BookOpen className="h-10 w-10 text-muted-foreground mx-auto" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{t("teacher.noCourseFound")}</p>
              <Link to="/teacher/courses/new">
                <Button size="sm" className="rounded-xl gap-2 mt-2">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {t("teacher.createFirst")}
                </Button>
              </Link>
            </div>
          </div>
        ) : viewMode === "list" ? (
          /* ───── List View ───── */
           <div className="stat-card !p-0 overflow-hidden">
            <div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th scope="col" className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t("teacher.courseName")}</th>
                    <th scope="col" className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-14"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((course: any) => {
                    const cat = categoryMap.get(course.category_id);
                    const students = (enrollmentCounts as any)[course.id] || 0;
                    const contents = (contentCounts as any)[course.id] || 0;

                    return (
                      <tr
                        key={course.id}
                        className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors cursor-pointer"
                        onClick={() => navigate(`/teacher/courses/${course.id}`)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <CourseThumbnail
                              src={course.thumbnail_url}
                              alt={course.title}
                              className="max-h-20 max-w-[4rem] shrink-0 rounded-lg"
                              fallbackClassName="h-12 w-16 shrink-0 rounded-lg"
                              iconClassName="h-4 w-4"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate max-w-[180px] sm:max-w-[300px]">
                                {course.title}
                              </p>
                              {course.description && (
                                <p className="text-[11px] text-muted-foreground truncate max-w-[180px] sm:max-w-[300px] mt-0.5">
                                  {course.description}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1 sm:hidden">
                                <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-lg ${statusColor[course.status || "draft"]}`}>
                                  {statusLabel[course.status || "draft"] || course.status}
                                </span>
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Users className="h-3 w-3" aria-hidden="true" />{students}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" aria-label={t("teacher.actions")}>
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/teacher/courses/${course.id}`); }}>
                                <Eye className="h-3.5 w-3.5 mr-2" /> {t("teacher.preview")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/teacher/courses/${course.id}/edit`); }}>
                                <Edit className="h-3.5 w-3.5 mr-2" /> {t("teacher.editCourse")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ───── Grid View ───── */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((course: any) => {
              const cat = categoryMap.get(course.category_id);
              const students = (enrollmentCounts as any)[course.id] || 0;
              const contents = (contentCounts as any)[course.id] || 0;

              return (
                <div
                  key={course.id}
                  className="stat-card !p-0 overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 group"
                  onClick={() => navigate(`/teacher/courses/${course.id}`)}
                >
                  {/* Thumbnail */}
                  <div className="relative bg-secondary overflow-hidden">
                    <CourseThumbnail
                      src={course.thumbnail_url}
                      alt={course.title}
                      className="w-full rounded-none transition-transform duration-300 group-hover:scale-105"
                      fallbackClassName="flex h-36 w-full items-center justify-center rounded-none"
                      iconClassName="h-8 w-8"
                    />
                    <div className="absolute top-2.5 left-2.5">
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${statusColor[course.status || "draft"]}`}>
                        {statusLabel[course.status || "draft"]}
                      </span>
                    </div>
                    {course.is_mandatory && (
                      <span className="absolute top-2.5 right-2.5 text-[10px] font-semibold bg-destructive text-destructive-foreground px-2 py-1 rounded-lg">
                        {t("common.required")}
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground truncate">{course.title}</h3>
                        {cat?.name && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{cat.name}</p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg shrink-0" aria-label={t("teacher.actions")}>
                            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/teacher/courses/${course.id}`); }}>
                            <Eye className="h-3.5 w-3.5 mr-2" /> {t("teacher.preview")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/teacher/courses/${course.id}/edit`); }}>
                            <Edit className="h-3.5 w-3.5 mr-2" /> {t("teacher.editCourse")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {course.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{course.description}</p>
                    )}

                    <div className="flex items-center gap-3 pt-1 border-t border-border">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" /> {students}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <BookOpen className="h-3 w-3" /> {contents}
                      </span>
                      {course.difficulty_level && (
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {difficultyLabel[course.difficulty_level]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TeacherCourses;
