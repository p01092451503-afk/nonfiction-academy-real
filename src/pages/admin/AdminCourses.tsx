import { Plus, Search, MoreHorizontal, Eye, Edit, Trash2, Users, BookOpen, Clock, LayoutGrid, List, AlertTriangle, CalendarClock, ArrowUpDown, CheckCircle2, FileEdit, FileSpreadsheet, ClipboardCheck, ClipboardX } from "lucide-react";
import BulkCourseQuestionsUploadDialog from "@/components/admin/BulkCourseQuestionsUploadDialog";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
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
import CourseCard from "@/components/CourseCard";
import CourseThumbnail from "@/components/CourseThumbnail";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { fetchAllPaged } from "@/lib/fetchAllPaged";
import StatCard from "@/components/ui/stat-card";

const statusLabel: Record<string, string> = {
  draft: "초안",
  published: "공개",
  archived: "보관",
};

const statusColor: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  archived: "bg-secondary text-muted-foreground",
};

const difficultyLabel: Record<string, string> = {
  beginner: "초급",
  intermediate: "중급",
  advanced: "고급",
};

const AdminCourses = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title" | "students">("newest");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [bulkQuestionsOpen, setBulkQuestionsOpen] = useState(false);
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const { error } = await supabase.from("courses").delete().eq("id", deleteTarget.id);
    setIsDeleting(false);
    if (error) {
      toast({ title: t("common.error", "오류"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("admin.courseDeleted", "강의가 삭제되었습니다") });
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
  };

  const { data: courses = [] } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "admin-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: enrollmentData = { counts: {}, uniqueStudents: 0 } } = useQuery({
    queryKey: ["admin-enrollment-counts", courses.map((c: any) => c.id)],
    queryFn: async () => {
      const ids = courses.map((c: any) => c.id);
      if (ids.length === 0) return { counts: {}, uniqueStudents: 0 };
      const data = await fetchAllPaged<any>((from, to) =>
        supabase
          .from("enrollments")
          .select("course_id, user_id")
          .in("course_id", ids)
          .range(from, to),
      );
      const counts: Record<string, number> = {};
      const userIds = new Set<string>();
      data.forEach((e: any) => {
        counts[e.course_id] = (counts[e.course_id] || 0) + 1;
        if (e.user_id) userIds.add(e.user_id);
      });
      return { counts, uniqueStudents: userIds.size };
    },
    enabled: courses.length > 0,
  });
  const enrollmentCounts = enrollmentData.counts;

  const { data: contentCounts = {} } = useQuery({
    queryKey: ["admin-content-counts", courses.map((c: any) => c.id)],
    queryFn: async () => {
      const ids = courses.map((c: any) => c.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from("course_contents")
        .select("course_id")
        .in("course_id", ids)
        .eq("language_code", "ko");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((e: any) => { counts[e.course_id] = (counts[e.course_id] || 0) + 1; });
      return counts;
    },
    enabled: courses.length > 0,
  });

  const { data: assessmentInfo = {} } = useQuery({
    queryKey: ["admin-course-assessments", courses.map((c: any) => c.id)],
    queryFn: async () => {
      const ids = courses.map((c: any) => c.id);
      if (ids.length === 0) return {};
      const { data: assessments, error } = await supabase
        .from("assessments")
        .select("id, course_id, is_published")
        .in("course_id", ids);
      if (error) throw error;
      const aIds = (assessments || []).map((a: any) => a.id);
      let qCountByAssessment: Record<string, number> = {};
      if (aIds.length > 0) {
        const { data: qs } = await supabase
          .from("assessment_questions")
          .select("assessment_id")
          .in("assessment_id", aIds);
        (qs || []).forEach((q: any) => {
          qCountByAssessment[q.assessment_id] = (qCountByAssessment[q.assessment_id] || 0) + 1;
        });
      }
      const info: Record<string, { assessments: number; published: number; questions: number }> = {};
      (assessments || []).forEach((a: any) => {
        const cur = info[a.course_id] || { assessments: 0, published: 0, questions: 0 };
        cur.assessments += 1;
        if (a.is_published) cur.published += 1;
        cur.questions += qCountByAssessment[a.id] || 0;
        info[a.course_id] = cur;
      });
      return info;
    },
    enabled: courses.length > 0,
  });

  const { data: instructorProfiles = [] } = useQuery({
    queryKey: ["instructor-profiles", courses.map((c: any) => c.instructor_id).filter(Boolean)],
    queryFn: async () => {
      const ids = [...new Set(courses.map((c: any) => c.instructor_id).filter(Boolean))];
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      if (error) throw error;
      return data;
    },
    enabled: courses.length > 0,
  });

  const categoryMap = new Map(categories.map((c: any) => [c.id, c]));
  const instructorMap = new Map(instructorProfiles.map((p: any) => [p.user_id, p.full_name]));

  const filtered = courses
    .filter((c: any) => {
      const matchSearch = c.title.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      const matchCategory = categoryFilter === "all" || c.category_id === categoryFilter;
      return matchSearch && matchStatus && matchCategory;
    })
    .sort((a: any, b: any) => {
      switch (sortBy) {
        case "oldest": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "title": return a.title.localeCompare(b.title);
        case "students": return ((enrollmentCounts as any)[b.id] || 0) - ((enrollmentCounts as any)[a.id] || 0);
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const stats = {
    total: courses.length,
    published: courses.filter((c: any) => c.status === "published").length,
    draft: courses.filter((c: any) => c.status === "draft").length,
    totalStudents: enrollmentData.uniqueStudents,
  };

  const goToCourse = (courseId: string) => navigate(`/admin/courses/${courseId}`);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2"><BookOpen className="h-6 w-6" aria-hidden="true" />{t("admin.courseManagement")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("admin.courseManagementDesc")}</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              className="rounded-xl gap-2 flex-1 sm:flex-none"
              onClick={() => setBulkQuestionsOpen(true)}
            >
              <FileSpreadsheet className="h-4 w-4" /> 평가문항 일괄등록
            </Button>
            <Link to="/admin/courses/new" className="flex-1 sm:flex-none">
              <Button className="rounded-xl gap-2 w-full">
                <Plus className="h-4 w-4" /> {t("admin.newCourse")}
              </Button>
            </Link>
          </div>
        </div>
        <BulkCourseQuestionsUploadDialog open={bulkQuestionsOpen} onOpenChange={setBulkQuestionsOpen} />

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t("admin.totalCoursesLabel")} value={stats.total} icon={BookOpen} tone="primary" />
          <StatCard label={t("admin.publishedCourses")} value={stats.published} icon={CheckCircle2} tone="success" />
          <StatCard label={t("teacher.draft")} value={stats.draft} icon={FileEdit} tone="warning" />
          <StatCard label={t("admin.totalStudents")} value={stats.totalStudents} icon={Users} tone="info" />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("course.searchCourse")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl border-border"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 rounded-xl h-10">
              <SelectValue placeholder={t("common.filter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all") || "전체"}</SelectItem>
              <SelectItem value="published">{t("teacher.published")}</SelectItem>
              <SelectItem value="draft">{t("teacher.draft")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36 rounded-xl h-10">
              <SelectValue placeholder={t("course.category") || "카테고리"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all") || "전체"}</SelectItem>
              {categories.map((cat: any) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-32 rounded-xl h-10">
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("common.newest") || "최신순"}</SelectItem>
              <SelectItem value="oldest">{t("common.oldest") || "오래된순"}</SelectItem>
              <SelectItem value="title">{t("common.nameOrder") || "이름순"}</SelectItem>
              <SelectItem value="students">{t("common.popularOrder") || "수강생순"}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2.5 transition-colors ${viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {filtered.length === 0 ? (
          <div className="stat-card text-center py-16">
            <div className="space-y-3">
              <BookOpen className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">{t("admin.noCoursesFound")}</p>
              <Link to="/admin/courses/new">
                <Button size="sm" className="rounded-xl gap-2 mt-2">
                  <Plus className="h-3.5 w-3.5" /> {t("admin.newCourse")}
                </Button>
              </Link>
            </div>
          </div>
        ) : viewMode === "list" ? (
          <div className="stat-card !p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t("course.course") || "강의"}</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">{t("course.category") || "카테고리"}</th>
                  
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">{t("teacher.status") || "상태"}</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">{t("common.required") || "필수"}</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">{t("admin.totalStudents") || "수강생"}</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">{t("course.content") || "차시"}</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">평가</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">{t("common.manage") || "관리"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((course: any) => {
                  const cat = categoryMap.get(course.category_id);
                  const students = (enrollmentCounts as any)[course.id] || 0;
                  const contents = (contentCounts as any)[course.id] || 0;
                  const assess = (assessmentInfo as any)[course.id] as { assessments: number; published: number; questions: number } | undefined;
                  const instructor = instructorMap.get(course.instructor_id);
                  const daysLeft = course.deadline ? Math.ceil((new Date(course.deadline).getTime() - Date.now()) / 86400000) : null;

                  return (
                    <tr
                      key={course.id}
                      className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors cursor-pointer"
                      onClick={() => goToCourse(course.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <CourseThumbnail
                            src={course.thumbnail_url}
                            alt=""
                            className="max-h-20 max-w-[4rem] shrink-0 rounded-lg"
                            fallbackClassName="h-12 w-16 shrink-0 rounded-lg"
                            iconClassName="h-4 w-4"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate max-w-[180px] lg:max-w-[280px]">
                              {course.title}
                            </p>
                            {course.description && (
                              <p className="text-[11px] text-muted-foreground truncate max-w-[180px] lg:max-w-[280px] mt-0.5">
                                {course.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {cat?.name && <span className="text-xs text-muted-foreground">{cat.name}</span>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-center">
                        <span className={`inline-flex text-[10px] font-semibold px-2.5 py-1 rounded-lg ${statusColor[course.status || "draft"]}`}>
                          {statusLabel[course.status || "draft"] || course.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-center">
                        {course.is_mandatory ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <Badge variant="destructive" className="text-[10px] h-5 gap-0.5 whitespace-nowrap">
                              <AlertTriangle className="h-2.5 w-2.5" /> {t("common.required")}
                            </Badge>
                            {daysLeft !== null && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <CalendarClock className="h-2.5 w-2.5" />
                                {daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? "D-Day" : t("student.overdue")}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-center">
                        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" /> {students}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-center">
                        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                          <BookOpen className="h-3 w-3" /> {contents}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); goToCourse(course.id); }}>
                              <Eye className="h-3.5 w-3.5 mr-2" /> {t("common.preview") || "미리보기"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); goToCourse(course.id); }}>
                              <Edit className="h-3.5 w-3.5 mr-2" /> {t("common.edit") || "수정"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: course.id, title: course.title }); }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> {t("common.delete") || "삭제"}
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
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((course: any) => {
              const cat = categoryMap.get(course.category_id);
              const enrollment = (enrollmentCounts as any)[course.id] || 0;
              return (
                <CourseCard
                  key={course.id}
                  course={course}
                  categorySlug={cat?.slug}
                  categoryName={cat?.name}
                  studentCount={enrollment}
                  instructorName={instructorMap.get(course.instructor_id)}
                  variant="admin"
                  href={`/admin/courses/${course.id}`}
                />
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.deleteCourseTitle", "강의를 삭제하시겠습니까?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.deleteCourseDesc", "이 작업은 되돌릴 수 없습니다. 관련 차시, 수강신청, 평가, 과제 등 연관된 모든 데이터가 함께 삭제됩니다.")}
              {deleteTarget && (
                <span className="block mt-2 font-medium text-foreground">"{deleteTarget.title}"</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel", "취소")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t("common.deleting", "삭제 중...") : t("common.delete", "삭제")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AdminCourses;
