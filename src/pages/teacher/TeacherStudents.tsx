import { Users, Search, TrendingUp, BookOpen, Award, MoreVertical, Send } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useLeaderScope } from "@/hooks/useLeaderScope";
import { formatDistanceToNow } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const TeacherStudents = () => {
  const { user } = useUser();
  const { scopeIds, branch, hasDepartment } = useLeaderScope();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.language === "ko" ? ko : enUS;
  const [search, setSearch] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("all");
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgTarget, setMsgTarget] = useState<{ userId: string; name: string } | null>(null);
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const queryClient = useQueryClient();

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!msgTarget) throw new Error("No target");
      const finalTitle = msgTitle || t("students.defaultMessageTitle");
      const { buildNotificationI18n } = await import("@/lib/notificationI18n");
      const { title_i18n, message_i18n } = await buildNotificationI18n(finalTitle, msgBody);
      const { error } = await supabase.from("notifications").insert({
        user_id: msgTarget.userId,
        title: finalTitle,
        message: msgBody,
        type: "message",
        title_i18n,
        message_i18n,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("students.messageSent"));
      setMsgOpen(false);
      setMsgTitle("");
      setMsgBody("");
      setMsgTarget(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openMessage = (userId: string, name: string) => {
    setMsgTarget({ userId, name });
    setMsgTitle("");
    setMsgBody("");
    setMsgOpen(true);
  };

  // My own courses (used only for course filter dropdown)
  const { data: myCourses = [] } = useQuery({
    queryKey: ["teacher-course-ids", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title")
        .eq("instructor_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Students = all profiles in the leader's department scope (branch + sub-teams)
  // who have the 'student' role.
  const { data: profiles = [] } = useQuery({
    queryKey: ["dept-student-profiles", scopeIds],
    queryFn: async () => {
      if (scopeIds.length === 0) return [];
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");
      const studentIdSet = new Set((roleRows ?? []).map((r: any) => r.user_id));

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("department_id", scopeIds);
      if (error) throw error;
      return (data ?? []).filter((p: any) => studentIdSet.has(p.user_id));
    },
    enabled: scopeIds.length > 0,
  });

  const studentIds = profiles.map((p: any) => p.user_id);

  // ALL enrollments for those students (regardless of who teaches the course)
  const { data: enrollments = [] } = useQuery({
    queryKey: ["dept-enrollments", studentIds],
    queryFn: async () => {
      if (studentIds.length === 0) return [];
      const { data, error } = await supabase
        .from("enrollments")
        .select("*")
        .in("user_id", studentIds);
      if (error) throw error;
      return data;
    },
    enabled: studentIds.length > 0,
  });

  const enrolledCourseIds = [...new Set(enrollments.map((e: any) => e.course_id))];

  const { data: allCourses = [] } = useQuery({
    queryKey: ["dept-courses", enrolledCourseIds],
    queryFn: async () => {
      if (enrolledCourseIds.length === 0) return [];
      const { data, error } = await supabase
        .from("courses")
        .select("id, title")
        .in("id", enrolledCourseIds);
      if (error) throw error;
      return data;
    },
    enabled: enrolledCourseIds.length > 0,
  });

  const { data: allProgress = [] } = useQuery({
    queryKey: ["dept-student-progress", enrolledCourseIds, studentIds],
    queryFn: async () => {
      if (enrolledCourseIds.length === 0 || studentIds.length === 0) return [];
      const { data: contents } = await supabase
        .from("course_contents")
        .select("id, course_id")
        .in("course_id", enrolledCourseIds)
        .eq("is_published", true);
      if (!contents || contents.length === 0) return [];
      const { data, error } = await supabase
        .from("content_progress")
        .select("*")
        .in("user_id", studentIds)
        .in("content_id", contents.map(c => c.id));
      if (error) throw error;
      return data || [];
    },
    enabled: enrolledCourseIds.length > 0 && studentIds.length > 0,
  });

  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));
  const courseMap = new Map(allCourses.map((c: any) => [c.id, c.title]));

  const filteredEnrollments = selectedCourseId === "all"
    ? enrollments
    : enrollments.filter((e: any) => e.course_id === selectedCourseId);

  // When viewing all courses, show every staff member in the leader's scope
  // (even those with no enrollments). When filtering by course, only show
  // students enrolled in that course.
  const filteredStudentIds = selectedCourseId === "all"
    ? studentIds
    : [...new Set(filteredEnrollments.map((e: any) => e.user_id))];

  const studentData = filteredStudentIds.map((id) => {
    const profile = profileMap.get(id);
    const studentEnrollments = filteredEnrollments.filter((e: any) => e.user_id === id);
    const avgProgress = studentEnrollments.length > 0
      ? Math.round(studentEnrollments.reduce((sum: number, e: any) => sum + (Number(e.progress) || 0), 0) / studentEnrollments.length)
      : 0;
    const completedCourses = studentEnrollments.filter((e: any) => !!e.completed_at).length;
    const completionRate = studentEnrollments.length > 0
      ? Math.round((completedCourses / studentEnrollments.length) * 100)
      : 0;

    const courseNames = studentEnrollments.map((e: any) => courseMap.get(e.course_id) || "").filter(Boolean);

    const studentProgress = allProgress.filter((p: any) => p.user_id === id);
    const lastActivity = studentProgress.length > 0
      ? studentProgress.reduce((latest: string, p: any) => {
          const d = p.last_accessed_at || p.completed_at;
          return d && d > latest ? d : latest;
        }, "")
      : null;

    const isActive = lastActivity
      ? (Date.now() - new Date(lastActivity).getTime()) < 7 * 24 * 60 * 60 * 1000
      : false;

    return {
      userId: id,
      name: profile?.full_name || t("common.user"),
      department: profile?.department || "-",
      position: profile?.position || "",
      courseCount: studentEnrollments.length,
      courseNames,
      avgProgress,
      completionRate,
      lastActivity,
      isActive,
    };
  });

  const totalStudents = studentData.length;
  const activeStudents = studentData.filter(s => s.isActive).length;
  const avgProgressAll = totalStudents > 0
    ? Math.round(studentData.reduce((sum, s) => sum + s.avgProgress, 0) / totalStudents)
    : 0;
  const excellentStudents = studentData.filter(s => s.completionRate >= 90).length;

  const filtered = studentData.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.department.toLowerCase().includes(search.toLowerCase())
  );

  const branchLabel = branch
    ? (i18n.language?.startsWith("en") && branch.name_en ? branch.name_en : branch.name) +
      (branch.code ? ` (${branch.code})` : "")
    : "";

  const stats = [
    { label: t("students.totalStudents"), value: totalStudents, sub: branchLabel || t("students.studentManagement"), icon: Users },
    { label: t("students.activeStudents"), value: activeStudents, sub: totalStudents > 0 ? t("students.activityRate", { percent: Math.round((activeStudents / totalStudents) * 100) }) : "0%", icon: TrendingUp },
    { label: t("students.averageProgress"), value: `${avgProgressAll}%`, sub: selectedCourseId === "all" ? t("students.allCoursesBasis") : t("students.selectedCourseBasis"), icon: BookOpen },
    { label: t("students.excellentStudents"), value: excellentStudents, sub: t("students.above90"), icon: Award },
  ];

  return (
    <>
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" aria-hidden="true" /> {t("students.studentManagement")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {branchLabel ? `${branchLabel} · ` : ""}{t("students.monitorStudents")}
            </p>
          </div>
          <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
            <SelectTrigger className="w-full sm:w-52 h-9 text-xs">
              <SelectValue placeholder={t("students.selectCourse")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("students.allCourses")}</SelectItem>
              {allCourses.map((c: any) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stat cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3" aria-label={t("students.studentManagement")}>
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-3 sm:p-4" role="group" aria-label={stat.label}>
              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                <span className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/50" aria-hidden="true" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </section>

        {/* Student list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-1">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-foreground">{t("students.studentList")}</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{t("students.detailedStatus")}</p>
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <label htmlFor="student-search" className="sr-only">{t("students.searchStudent")}</label>
                <Input
                  id="student-search"
                  placeholder={t("students.searchStudent")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-8 text-xs rounded-lg"
                />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {search ? t("students.noSearchResult") : t("students.noStudents")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/20">
                    <th scope="col" className="text-left text-[11px] font-medium text-muted-foreground px-5 py-2.5">{t("teacher.student")}</th>
                    <th scope="col" className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5">{t("students.enrolledCourses")}</th>
                    <th scope="col" className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5 hidden sm:table-cell">{t("students.avgProgress")}</th>
                    <th scope="col" className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5">{t("students.completionRate")}</th>
                    <th scope="col" className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5 hidden md:table-cell">{t("students.recentActivity")}</th>
                    <th scope="col" className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5">{t("students.statusLabel")}</th>
                    <th scope="col" className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5 w-10">{t("students.manageLabel")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((student) => (
                    <tr key={student.userId} className="hover:bg-accent/20 transition-colors cursor-pointer" onClick={() => navigate(`/teacher/students/${student.userId}`)}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                            {student.name.slice(0, 1)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{student.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{student.department}{student.position ? ` · ${student.position}` : ""}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-center">
                        <span className="text-sm text-foreground">{student.courseCount}</span>
                      </td>

                      <td className="px-3 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-2 justify-center">
                          <Progress value={student.avgProgress} className="w-16 h-1.5" aria-label={`${t("students.avgProgress")}: ${student.avgProgress}%`} />
                          <span className="text-xs text-muted-foreground w-8">{student.avgProgress}%</span>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-center">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-semibold ${
                            student.completionRate >= 90
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : student.completionRate >= 50
                              ? "bg-primary/10 text-primary"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {student.completionRate}%
                        </Badge>
                      </td>

                      <td className="px-3 py-3 text-center hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {student.lastActivity
                            ? formatDistanceToNow(new Date(student.lastActivity), { addSuffix: true, locale: dateFnsLocale })
                            : "-"}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-center">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-semibold ${
                            student.isActive
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {student.isActive ? t("common.active") : t("common.inactive")}
                        </Badge>
                      </td>

                      <td className="px-3 py-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" aria-label={t("students.manageLabel")} onClick={(e) => e.stopPropagation()}>
                              <MoreVertical className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/teacher/students/${student.userId}`); }}>{t("students.viewStatus")}</DropdownMenuItem>
                            <DropdownMenuItem className="text-xs" onClick={(e) => { e.stopPropagation(); openMessage(student.userId, student.name); }}>{t("students.sendMessage")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>

      {/* Send Message Dialog */}
      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4" aria-hidden="true" /> {t("students.messageDialogTitle")}</DialogTitle>
            <DialogDescription>{t("students.messageDialogDesc", { name: msgTarget?.name })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("students.messageSubject")}</Label>
              <Input value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} placeholder={t("students.messageSubjectPlaceholder")} className="mt-1" />
            </div>
            <div>
              <Label>{t("students.messageBody")}</Label>
              <Textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder={t("students.messageBodyPlaceholder")} className="mt-1" rows={4} />
            </div>
            <Button className="w-full rounded-xl gap-2" onClick={() => sendMessageMutation.mutate()} disabled={!msgBody.trim() || sendMessageMutation.isPending}>
              <Send className="h-4 w-4" />
              {sendMessageMutation.isPending ? t("students.sending") : t("students.sendButton")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TeacherStudents;