import {
  ClipboardList, Clock, CheckCircle2, Plus, MoreHorizontal, FileText, Info, CalendarIcon, Paperclip, Download, FileIcon, Search, CheckSquare,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { formatDistanceToNow } from "date-fns";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const TeacherAssignments = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.language?.startsWith("en") ? enUS : ko;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [gradeTarget, setGradeTarget] = useState<any>(null);
  const [gradeScore, setGradeScore] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchScore, setBatchScore] = useState("");
  const [batchFeedback, setBatchFeedback] = useState("");
  const [filterAssignmentId, setFilterAssignmentId] = useState("all");
  const [searchStudent, setSearchStudent] = useState("");

  // Form state
  const [formCourseId, setFormCourseId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formInstructions, setFormInstructions] = useState("");
  const [formMaxScore, setFormMaxScore] = useState("100");
  const [formDueDate, setFormDueDate] = useState<Date | undefined>();
  const [formStatus, setFormStatus] = useState<"draft" | "published">("draft");
  const [formAllowLate, setFormAllowLate] = useState(false);

  const { data: myCourses = [] } = useQuery({
    queryKey: ["teacher-courses-list", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, title").eq("instructor_id", user!.id).order("title");
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["teacher-all-assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assignments").select("*, courses(title, instructor_id)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((a: any) => a.courses?.instructor_id === user!.id);
    },
    enabled: !!user?.id,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["teacher-submissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assignment_submissions").select("*, assignments(title, max_score, courses(title, instructor_id))").order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((s: any) => s.assignments?.courses?.instructor_id === user!.id);
    },
    enabled: !!user?.id,
  });

  const { data: studentProfiles = [] } = useQuery({
    queryKey: ["submission-profiles", submissions.map((s: any) => s.student_id)],
    queryFn: async () => {
      const ids = [...new Set(submissions.map((s: any) => s.student_id))];
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      if (error) throw error;
      return data;
    },
    enabled: submissions.length > 0,
  });

  const profileMap = new Map(studentProfiles.map((p: any) => [p.user_id, p.full_name]));

  // Create/Edit mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        course_id: formCourseId,
        title: formTitle,
        description: formDescription || null,
        instructions: formInstructions || null,
        max_score: parseInt(formMaxScore) || 100,
        due_date: formDueDate ? formDueDate.toISOString() : null,
        status: formStatus,
        allow_late_submission: formAllowLate,
      };
      if (editingAssignment) {
        const { error } = await supabase.from("assignments").update(payload).eq("id", editingAssignment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("assignments").insert({ ...payload, created_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-all-assignments"] });
      toast({
        title: editingAssignment ? t("assignments.assignmentUpdated") : t("assignments.assignmentCreated"),
        description: editingAssignment ? undefined : t("assignments.assignmentCreatedDesc", { title: formTitle }),
      });
      resetForm();
      setDialogOpen(false);
      setEditingAssignment(null);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-all-assignments"] });
      toast({ title: t("assignments.assignmentDeleted") });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Grade mutation
  const gradeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("assignment_submissions").update({
        score: parseInt(gradeScore),
        feedback: gradeFeedback || null,
        status: "graded" as any,
        graded_at: new Date().toISOString(),
        graded_by: user!.id,
      }).eq("id", gradeTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-submissions"] });
      toast({ title: t("assignments.gradedSuccess") });
      setGradeTarget(null);
      setGradeScore("");
      setGradeFeedback("");
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Batch grade mutation
  const batchGradeMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedSubs);
      for (const id of ids) {
        const { error } = await supabase.from("assignment_submissions").update({
          score: parseInt(batchScore),
          feedback: batchFeedback || null,
          status: "graded" as any,
          graded_at: new Date().toISOString(),
          graded_by: user!.id,
        }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      const count = selectedSubs.size;
      queryClient.invalidateQueries({ queryKey: ["teacher-submissions"] });
      toast({ title: t("assignments.batchGradeSuccess", { count }) });
      setSelectedSubs(new Set());
      setBatchDialogOpen(false);
      setBatchScore("");
      setBatchFeedback("");
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormCourseId("");
    setFormTitle("");
    setFormDescription("");
    setFormInstructions("");
    setFormMaxScore("100");
    setFormDueDate(undefined);
    setFormStatus("draft");
    setFormAllowLate(false);
  };

  const openEdit = (assignment: any) => {
    setEditingAssignment(assignment);
    setFormCourseId(assignment.course_id);
    setFormTitle(assignment.title);
    setFormDescription(assignment.description || "");
    setFormInstructions(assignment.instructions || "");
    setFormMaxScore(String(assignment.max_score || 100));
    setFormDueDate(assignment.due_date ? new Date(assignment.due_date) : undefined);
    setFormStatus(assignment.status || "draft");
    setFormAllowLate(assignment.allow_late_submission || false);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formCourseId) {
      toast({ title: t("common.error"), description: t("assignments.selectCourseError"), variant: "destructive" });
      return;
    }
    if (!formTitle.trim()) {
      toast({ title: t("common.error"), description: t("assignments.titleRequired"), variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  const openGrade = (sub: any) => {
    setGradeTarget(sub);
    setGradeScore(sub.score != null ? String(sub.score) : "");
    setGradeFeedback(sub.feedback || "");
  };

  // Stats
  const totalAssignments = assignments.length;
  const pendingSubmissions = submissions.filter((s: any) => s.status === "submitted");
  const gradedSubmissions = submissions.filter((s: any) => s.status === "graded" || s.status === "returned");

  // Filtered pending submissions
  const filteredPending = pendingSubmissions.filter((s: any) => {
    if (filterAssignmentId !== "all" && s.assignment_id !== filterAssignmentId) return false;
    if (searchStudent.trim()) {
      const name = (profileMap.get(s.student_id) || "").toLowerCase();
      if (!name.includes(searchStudent.toLowerCase())) return false;
    }
    return true;
  });

  const toggleSub = (id: string) => {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedSubs.size === filteredPending.length) {
      setSelectedSubs(new Set());
    } else {
      setSelectedSubs(new Set(filteredPending.map((s: any) => s.id)));
    }
  };
  const avgScore = gradedSubmissions.length > 0
    ? Math.round(gradedSubmissions.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / gradedSubmissions.length)
    : 0;

  const submissionCountMap = new Map<string, { total: number; graded: number }>();
  submissions.forEach((s: any) => {
    const existing = submissionCountMap.get(s.assignment_id) || { total: 0, graded: 0 };
    existing.total++;
    if (s.status === "graded" || s.status === "returned") existing.graded++;
    submissionCountMap.set(s.assignment_id, existing);
  });

  const statusLabel: Record<string, string> = {
    draft: t("assignments.draftStatus"),
    published: t("assignments.publishedStatus"),
    closed: t("assignments.closedStatus"),
  };

  const statusStyle: Record<string, string> = {
    draft: "bg-secondary text-muted-foreground",
    published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    closed: "bg-secondary text-muted-foreground",
  };

  const stats = [
    { label: t("assignments.totalAssignments"), value: totalAssignments, sub: t("assignments.createdAssignments"), icon: FileText },
    { label: t("assignments.waitingGrade"), value: pendingSubmissions.length, sub: t("assignments.waitingReview"), icon: Clock },
    { label: t("assignments.graded"), value: gradedSubmissions.length, sub: t("assignments.totalGraded"), icon: CheckCircle2 },
    { label: t("assignments.avgScore"), value: `${avgScore}${t("common.points")}`, sub: t("assignments.totalAverage"), icon: Info },
  ];

  const formatDate = (d: string) => {
    return i18n.language?.startsWith("en")
      ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : new Date(d).toLocaleDateString("ko-KR");
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-primary" aria-hidden="true" /> {t("assignments.assignmentManagement")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("assignments.createAndGrade")}</p>
          </div>
          <Button className="gap-2 w-full sm:w-auto" onClick={() => { resetForm(); setEditingAssignment(null); setDialogOpen(true); }} aria-label={t("assignments.createAssignment")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("assignments.createAssignment")}
          </Button>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4" aria-label={t("assignments.assignmentManagement")}>
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-3 sm:p-5" role="group" aria-label={stat.label}>
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <span className="text-[11px] sm:text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/50" aria-hidden="true" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{stat.sub}</p>
            </div>
          ))}
        </section>

        {/* Assignment List */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">{t("assignments.assignmentList")}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t("assignments.allCreated")}</p>
          </div>

          {assignments.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{t("assignments.noCreatedAssignments")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("assignments.createFirstAssignment")}</p>
            </div>
          ) : (
            <div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/20">
                    <th scope="col" className="text-left text-xs font-medium text-muted-foreground px-4 sm:px-6 py-3">{t("assignments.assignmentName")}</th>
                    <th scope="col" className="text-left text-xs font-medium text-muted-foreground px-3 sm:px-4 py-3 hidden sm:table-cell">{t("assignments.lecture")}</th>
                    <th scope="col" className="text-center text-xs font-medium text-muted-foreground px-3 sm:px-4 py-3 hidden sm:table-cell">{t("admin.statusLabel")}</th>
                    <th scope="col" className="text-right text-xs font-medium text-muted-foreground px-3 sm:px-4 py-3 w-14"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {assignments.map((assignment: any) => {
                    const counts = submissionCountMap.get(assignment.id);
                    return (
                      <tr key={assignment.id} className="hover:bg-accent/20 transition-colors">
                        <td className="px-4 sm:px-6 py-3 sm:py-4">
                          <p className="text-sm font-medium text-foreground">{assignment.title}</p>
                          {counts && (
                            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                              {t("assignments.submissionCount", { total: counts.total, graded: counts.graded })}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 sm:hidden">
                            <span className="text-[10px] text-muted-foreground">{assignment.courses?.title || "-"}</span>
                            <Badge variant="secondary" className={`text-[9px] font-semibold ${statusStyle[assignment.status || "draft"]}`}>
                              {statusLabel[assignment.status || "draft"]}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3 sm:py-4 hidden sm:table-cell">
                          <span className="text-xs sm:text-sm text-muted-foreground">{assignment.courses?.title || "-"}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 sm:py-4 text-center hidden sm:table-cell">
                          <Badge variant="secondary" className={`text-[10px] font-semibold ${statusStyle[assignment.status || "draft"]}`}>
                            {statusLabel[assignment.status || "draft"]}
                          </Badge>
                        </td>
                        <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" aria-label={t("common.manage")}>
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem className="text-xs" onClick={() => openEdit(assignment)}>
                                {t("assignments.editAssignment")}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs text-destructive" onClick={() => setDeleteTarget(assignment)}>
                                {t("assignments.deleteAssignment")}
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
          )}
        </div>

        {/* Pending Submissions */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-semibold text-foreground">{t("assignments.recentSubmissions")}</h2>
                  <Badge className="bg-primary text-primary-foreground text-[10px] font-semibold">{pendingSubmissions.length}</Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t("assignments.submissionsNeedReview")}</p>
              </div>
              {selectedSubs.size > 0 && (
                <Button size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => setBatchDialogOpen(true)}>
                  <CheckSquare className="h-3.5 w-3.5" />
                  {t("assignments.batchGrade")} ({selectedSubs.size})
                </Button>
              )}
            </div>
            {/* Filter & Search bar */}
            {pendingSubmissions.length > 0 && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
                <Select value={filterAssignmentId} onValueChange={setFilterAssignmentId}>
                  <SelectTrigger className="rounded-xl h-8 text-xs w-full sm:w-48">
                    <SelectValue placeholder={t("assignments.filterByAssignment")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("assignments.allAssignments")}</SelectItem>
                    {assignments.filter((a: any) => a.status === "published").map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchStudent}
                    onChange={(e) => setSearchStudent(e.target.value)}
                    placeholder={t("assignments.searchStudent")}
                    className="rounded-xl h-8 text-xs pl-8"
                  />
                </div>
                <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs shrink-0" onClick={toggleAll}>
                  {selectedSubs.size === filteredPending.length && filteredPending.length > 0 ? t("assignments.deselectAll") : t("assignments.selectAll")}
                </Button>
              </div>
            )}
          </div>

          {filteredPending.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-muted-foreground">{t("assignments.noWaitingSubmissions")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredPending.map((sub: any) => (
                <div key={sub.id} className={`px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-accent/20 transition-colors ${selectedSubs.has(sub.id) ? "bg-accent/10" : ""}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Checkbox
                      checked={selectedSubs.has(sub.id)}
                      onCheckedChange={() => toggleSub(sub.id)}
                      className="shrink-0"
                    />
                    <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                      {(profileMap.get(sub.student_id) || t("assignments.student"))[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{profileMap.get(sub.student_id) || t("assignments.student")}</p>
                      <p className="text-xs text-muted-foreground truncate">{sub.assignments?.title} · {sub.assignments?.courses?.title}</p>
                      {sub.file_urls && sub.file_urls.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{t("assignments.fileCount", { count: sub.file_urls.length })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 pl-12 sm:pl-0">
                    <div className="text-left sm:text-right shrink-0">
                      <Badge variant="secondary" className="text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        {t("assignments.ungraded")}
                      </Badge>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {sub.submitted_at ? formatDistanceToNow(new Date(sub.submitted_at), { addSuffix: true, locale: dateFnsLocale }) : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="rounded-xl text-xs shrink-0" onClick={() => openGrade(sub)}>
                      {t("assignments.grade")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Graded */}
        {gradedSubmissions.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border">
              <h2 className="text-base sm:text-lg font-semibold text-foreground">{t("assignments.gradedSubmissions")}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t("assignments.recentGradedSubmissions")}</p>
            </div>
            <div className="divide-y divide-border">
              {gradedSubmissions.slice(0, 10).map((sub: any) => (
                <div key={sub.id} className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-success/10 flex items-center justify-center text-sm font-semibold text-success shrink-0">
                    {(profileMap.get(sub.student_id) || t("assignments.student"))[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{profileMap.get(sub.student_id) || t("assignments.student")}</p>
                    <p className="text-xs text-muted-foreground truncate">{sub.assignments?.title} · {sub.assignments?.courses?.title}</p>
                    {sub.file_urls && sub.file_urls.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                        {sub.file_urls.map((url: string, i: number) => {
                          const fileName = decodeURIComponent(url.split("/").pop() || "").replace(/^\d+_/, "");
                          return (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary/50 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                              <FileIcon className="h-2.5 w-2.5 shrink-0" />
                              <span className="max-w-[100px] sm:max-w-[120px] truncate">{fileName}</span>
                              <Download className="h-2.5 w-2.5 shrink-0" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs sm:text-sm font-semibold text-foreground">
                      {sub.score != null ? `${sub.score}/${sub.assignments?.max_score || 100}${t("common.points")}` : "-"}
                    </span>
                    <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
                      {sub.graded_at ? formatDistanceToNow(new Date(sub.graded_at), { addSuffix: true, locale: dateFnsLocale }) : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingAssignment(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">{editingAssignment ? t("assignments.editAssignmentTitle") : t("assignments.createAssignmentTitle")}</DialogTitle>
            <DialogDescription>{t("assignments.dialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("assignments.selectCourse")} *</Label>
              <Select value={formCourseId} onValueChange={setFormCourseId}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder={t("assignments.selectCoursePlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {myCourses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("assignments.assignmentTitle")} *</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder={t("assignments.assignmentTitlePlaceholder")} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("assignments.description")}</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder={t("assignments.descriptionPlaceholder")} className="rounded-xl resize-none min-h-[80px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("assignments.instructions")}</Label>
              <Textarea value={formInstructions} onChange={(e) => setFormInstructions(e.target.value)} placeholder={t("assignments.instructionsPlaceholder")} className="rounded-xl resize-none min-h-[80px]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("assignments.maxScore")}</Label>
                <Input type="number" value={formMaxScore} onChange={(e) => setFormMaxScore(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("assignments.dueDateLabel")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full rounded-xl justify-start text-left font-normal h-10">
                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {formDueDate ? format(formDueDate, "yyyy.MM.dd", { locale: dateFnsLocale }) : t("assignments.selectDate")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={formDueDate} onSelect={setFormDueDate} locale={dateFnsLocale} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("assignments.publishStatus")}</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "draft" | "published")}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{t("assignments.draftPrivate")}</SelectItem>
                    <SelectItem value="published">{t("assignments.publishedStatus")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("assignments.lateSub")}</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch checked={formAllowLate} onCheckedChange={setFormAllowLate} />
                  <span className="text-sm text-muted-foreground">{formAllowLate ? t("assignments.allowed") : t("assignments.notAllowed")}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingAssignment(null); }} className="rounded-xl">{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={saveMutation.isPending} className="rounded-xl">
              {saveMutation.isPending ? t("common.processing") : editingAssignment ? t("common.save") : t("assignments.createButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assignments.deleteAssignment")}</AlertDialogTitle>
            <AlertDialogDescription>{t("assignments.deleteConfirm", { title: deleteTarget?.title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grade Dialog */}
      <Dialog open={!!gradeTarget} onOpenChange={(v) => !v && setGradeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("assignments.gradeDialogTitle")}</DialogTitle>
            <DialogDescription>{t("assignments.gradeDialogDesc")}</DialogDescription>
          </DialogHeader>
          {gradeTarget && (
            <div className="space-y-4 py-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{profileMap.get(gradeTarget.student_id) || t("assignments.student")} · {gradeTarget.assignments?.title}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("assignments.submissionContent")}</Label>
                <div className="p-3 bg-secondary/30 rounded-xl text-sm text-foreground max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {gradeTarget.submission_text || t("assignments.noSubmissionText")}
                </div>
              </div>
              {/* Attached Files */}
              {gradeTarget.file_urls && gradeTarget.file_urls.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> {t("assignments.attachmentsWithCount", { count: gradeTarget.file_urls.length })}
                  </Label>
                  <div className="space-y-1.5">
                    {gradeTarget.file_urls.map((url: string, i: number) => {
                      const fileName = decodeURIComponent(url.split("/").pop() || "").replace(/^\d+_/, "");
                      return (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg text-xs hover:bg-secondary/50 transition-colors"
                        >
                          <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate text-foreground">{fileName}</span>
                          <Download className="h-3 w-3 text-muted-foreground shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("assignments.scoreInput")} (/ {gradeTarget.assignments?.max_score || 100})</Label>
                <Input type="number" value={gradeScore} onChange={(e) => setGradeScore(e.target.value)} placeholder="0" className="rounded-xl" min={0} max={gradeTarget.assignments?.max_score || 100} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("assignments.feedback")}</Label>
                <Textarea value={gradeFeedback} onChange={(e) => setGradeFeedback(e.target.value)} placeholder={t("assignments.feedbackPlaceholder")} className="rounded-xl resize-none min-h-[80px]" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeTarget(null)} className="rounded-xl">{t("common.cancel")}</Button>
            <Button onClick={() => gradeMutation.mutate()} disabled={gradeMutation.isPending || !gradeScore} className="rounded-xl">
              {gradeMutation.isPending ? t("assignments.grading") : t("assignments.gradeSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Grade Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={(v) => !v && setBatchDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("assignments.batchGradeTitle")}</DialogTitle>
            <DialogDescription>{t("assignments.batchGradeDesc", { count: selectedSubs.size })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("assignments.scoreInput")}</Label>
              <Input type="number" value={batchScore} onChange={(e) => setBatchScore(e.target.value)} placeholder="0" className="rounded-xl" min={0} max={100} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("assignments.feedback")}</Label>
              <Textarea value={batchFeedback} onChange={(e) => setBatchFeedback(e.target.value)} placeholder={t("assignments.feedbackPlaceholder")} className="rounded-xl resize-none min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)} className="rounded-xl">{t("common.cancel")}</Button>
            <Button onClick={() => batchGradeMutation.mutate()} disabled={batchGradeMutation.isPending || !batchScore} className="rounded-xl gap-1.5">
              <CheckSquare className="h-3.5 w-3.5" />
              {batchGradeMutation.isPending ? t("assignments.grading") : `${t("assignments.batchGrade")} (${selectedSubs.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default TeacherAssignments;
