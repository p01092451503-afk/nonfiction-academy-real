import { Trophy, Download, Settings, FileImage, Award, ChevronDown, ChevronUp, Layers } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import CompletionCriteriaDialog from "@/components/admin/CompletionCriteriaDialog";
import CertificateTemplateDialog from "@/components/admin/CertificateTemplateDialog";
import BulkCompletionSettingsDialog from "@/components/admin/BulkCompletionSettingsDialog";
import { generateCertificateImage, downloadBlob } from "@/lib/certificateGenerator";
import { fetchAllPaged } from "@/lib/fetchAllPaged";

const AdminCompletion = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [criteriaDialog, setCriteriaDialog] = useState<{ open: boolean; courseId: string; courseName: string }>({ open: false, courseId: "", courseName: "" });
  const [templateDialog, setTemplateDialog] = useState<{ open: boolean; courseId: string; courseName: string }>({ open: false, courseId: "", courseName: "" });
  const [issuingCert, setIssuingCert] = useState<string | null>(null);
  const [bulkDialog, setBulkDialog] = useState(false);

  const { data: courses = [] } = useQuery({
    queryKey: ["admin-comp-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, title, status, is_mandatory").order("title");
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["admin-comp-enrollments"],
    queryFn: async () =>
      fetchAllPaged<any>((from, to) =>
        supabase
          .from("enrollments")
          .select("id, user_id, course_id, progress, completed_at")
          .order("enrolled_at", { ascending: false })
          .range(from, to),
      ),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-comp-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["admin-comp-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance").select("user_id, course_id, status");
      if (error) throw error;
      return data;
    },
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["admin-comp-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assignment_submissions").select("student_id, score, status, assignment_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: criteriaList = [] } = useQuery({
    queryKey: ["admin-comp-criteria"],
    queryFn: async () => {
      const { data, error } = await supabase.from("completion_criteria").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: certificates = [] } = useQuery({
    queryKey: ["admin-comp-certificates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("certificates").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["admin-comp-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("certificate_templates").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: assessmentAttempts = [] } = useQuery({
    queryKey: ["admin-comp-assessment-attempts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessment_attempts").select("user_id, assessment_id, score, passed, completed_at");
      if (error) throw error;
      return data;
    },
  });

  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p.full_name]));
  const emailMap = new Map(profiles.map((p: any) => [p.user_id, p.email || ""]));
  const criteriaMap = new Map(criteriaList.map((c: any) => [c.course_id, c]));
  const templateMap = new Map(templates.map((t: any) => [t.course_id, t]));
  const certSet = new Set(certificates.map((c: any) => `${c.user_id}_${c.course_id}`));

  const bestScoreByUser = new Map<string, number>();
  assessmentAttempts.forEach((a: any) => {
    if (a.score != null && a.completed_at) {
      const cur = bestScoreByUser.get(a.user_id) || 0;
      if (Number(a.score) > cur) bestScoreByUser.set(a.user_id, Number(a.score));
    }
  });

  const enrollmentsByCourse = new Map<string, any[]>();
  enrollments.forEach((e: any) => {
    if (!enrollmentsByCourse.has(e.course_id)) enrollmentsByCourse.set(e.course_id, []);
    enrollmentsByCourse.get(e.course_id)!.push(e);
  });

  const attendanceByUserCourse = new Map<string, { total: number; present: number }>();
  attendance.forEach((a: any) => {
    const key = `${a.user_id}_${a.course_id}`;
    if (!attendanceByUserCourse.has(key)) attendanceByUserCourse.set(key, { total: 0, present: 0 });
    const value = attendanceByUserCourse.get(key)!;
    value.total++;
    if (a.status === "present" || a.status === "late") value.present++;
  });

  const scoreByStudent = new Map<string, { total: number; count: number }>();
  submissions.forEach((s: any) => {
    if (s.score == null) return;
    if (!scoreByStudent.has(s.student_id)) scoreByStudent.set(s.student_id, { total: 0, count: 0 });
    const value = scoreByStudent.get(s.student_id)!;
    value.total += s.score;
    value.count++;
  });

  const getCompletionStatus = (e: any) => {
    const criteria = criteriaMap.get(e.course_id);
    const progress = Number(e.progress) || 0;
    const minProgress = criteria ? Number(criteria.min_progress_pct) : 80;
    const minScore = criteria?.min_assessment_score != null ? Number(criteria.min_assessment_score) : null;
    if (progress < minProgress) return false;
    if (minScore != null) {
      const userScore = bestScoreByUser.get(e.user_id);
      if (userScore == null || userScore < minScore) return false;
    }
    if (e.completed_at) return true;
    return progress >= minProgress;
  };

  const getReqText = (courseId: string) => {
    const criteria = criteriaMap.get(courseId);
    if (!criteria) return t("admin.progress80");
    const parts = [t("admin.progressReq", { pct: criteria.min_progress_pct })];
    if (criteria.min_assessment_score != null) parts.push(t("admin.assessmentReq", { score: criteria.min_assessment_score }));
    return parts.join(" + ");
  };

  const hasCert = (userId: string, courseId: string) => certSet.has(`${userId}_${courseId}`);

  const handleIssueCert = async (enrollment: any) => {
    const key = `${enrollment.user_id}_${enrollment.course_id}`;
    setIssuingCert(key);
    try {
      const certNumber = `CERT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const course = courses.find((c: any) => c.id === enrollment.course_id);
      const template = templateMap.get(enrollment.course_id);
      const blob = await generateCertificateImage({
        studentName: profileMap.get(enrollment.user_id) || "-",
        studentEmail: emailMap.get(enrollment.user_id) || "-",
        courseName: course?.title || "-",
        issuedDate: new Date().toLocaleDateString("ko-KR"),
        certificateNumber: certNumber,
        titleText: template?.title_text || "수료증",
        descText: template?.description_text || "위 사람은 본 교육과정을 성실히 이수하였기에 이 증서를 수여합니다.",
        issuerName: template?.issuer_name || "",
        backgroundImageUrl: template?.background_image_url || null,
      });
      const { error } = await supabase.from("certificates").insert({
        user_id: enrollment.user_id,
        course_id: enrollment.course_id,
        certificate_number: certNumber,
      });
      if (error) throw error;
      downloadBlob(blob, `certificate_${certNumber}.png`);
      queryClient.invalidateQueries({ queryKey: ["admin-comp-certificates"] });
      toast.success(t("admin.certIssued", "이수증이 발급되었습니다"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
    setIssuingCert(null);
  };

  const exportCSV = () => {
    const header = [t("admin.courseLabel"), t("admin.nameColumn"), t("admin.attendanceRate"), t("admin.avgScore"), t("admin.completionReq"), t("admin.completionStatus")];
    const rows = enrollments.map((e: any) => {
      const attKey = `${e.user_id}_${e.course_id}`;
      const att = attendanceByUserCourse.get(attKey);
      const attRate = att ? Math.round((att.present / att.total) * 100) : 0;
      const sc = scoreByStudent.get(e.user_id);
      const avgScore = sc ? Math.round(sc.total / sc.count) : 0;
      const isComplete = getCompletionStatus(e);
      const course = courses.find((c: any) => c.id === e.course_id);
      return [course?.title || "-", profileMap.get(e.user_id) || "-", `${attRate}%`, `${avgScore}`, getReqText(e.course_id), isComplete ? t("admin.completedLabel") : t("admin.incompletedLabel")];
    });
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "completion_report.csv";
    a.click();
  };

  const getCourseStats = (courseId: string) => {
    const courseEnrollments = enrollmentsByCourse.get(courseId) || [];
    const total = courseEnrollments.length;
    const completed = courseEnrollments.filter((e: any) => getCompletionStatus(e)).length;
    const certCount = courseEnrollments.filter((e: any) => hasCert(e.user_id, e.course_id)).length;
    return { total, completed, certCount };
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
              <Trophy className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              {t("admin.completionManagement")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("admin.completionManagementDesc")}</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={() => setBulkDialog(true)} variant="default" className="rounded-xl gap-2 text-sm flex-1 sm:flex-initial justify-center">
              <Layers className="h-4 w-4" aria-hidden="true" /> {t("admin.bulkSettings")}
            </Button>
            <Button onClick={exportCSV} variant="outline" className="rounded-xl gap-2 text-sm flex-1 sm:flex-initial justify-center">
              <Download className="h-4 w-4" aria-hidden="true" /> {t("admin.completionDownload")}
            </Button>
          </div>
        </div>

        {/* Course list with inline settings */}
        <div className="space-y-3">
          {courses.length === 0 ? (
            <div className="stat-card !p-8 text-center text-sm text-muted-foreground">
              {t("admin.noCourses", "등록된 강좌가 없습니다")}
            </div>
          ) : (
            courses.map((course: any) => {
              const stats = getCourseStats(course.id);
              const criteria = criteriaMap.get(course.id);
              const isExpanded = expandedCourse === course.id;

              return (
                <div key={course.id} className="stat-card !p-0 overflow-hidden">
                  {/* Course header row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-4">
                    <button
                      className="flex items-center gap-2 text-left min-w-0 flex-1"
                      onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground truncate">{course.title}</h3>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{t("admin.enrolledCount", { count: stats.total })}</span>
                          <span>{t("admin.completedCount", { count: stats.completed })}</span>
                          <span>{t("admin.issuedCount", { count: stats.certCount })}</span>
                          <span className="hidden sm:inline">{t("admin.reqLabel")} {getReqText(course.id)}</span>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                      <Badge variant={criteria ? "default" : "secondary"} className="text-[10px]">
                        {criteria ? t("admin.configured") : t("admin.notConfigured")}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCriteriaDialog({ open: true, courseId: course.id, courseName: course.title });
                        }}
                      >
                        <Settings className="h-3 w-3" /> {t("admin.completionReq")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTemplateDialog({ open: true, courseId: course.id, courseName: course.title });
                        }}
                      >
                        <FileImage className="h-3 w-3" /> {t("admin.certTemplateTitle")}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded student list */}
                  {isExpanded && (
                    <div className="border-t border-border">
                      {/* Mobile cards */}
                      <div className="sm:hidden p-3 space-y-2">
                        {(enrollmentsByCourse.get(course.id) || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">{t("admin.noStudentData")}</p>
                        ) : (
                          (enrollmentsByCourse.get(course.id) || []).map((e: any) => {
                            const attKey = `${e.user_id}_${e.course_id}`;
                            const att = attendanceByUserCourse.get(attKey);
                            const attRate = att ? Math.round((att.present / att.total) * 100) : 0;
                            const sc = scoreByStudent.get(e.user_id);
                            const avgScore = sc ? Math.round(sc.total / sc.count) : 0;
                            const isComplete = getCompletionStatus(e);
                            const certKey = `${e.user_id}_${e.course_id}`;
                            const issued = hasCert(e.user_id, e.course_id);
                            const certEnabled = criteria?.certificate_enabled;

                            return (
                              <div key={e.id} className="rounded-lg border border-border bg-background p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-foreground">{profileMap.get(e.user_id) || "-"}</span>
                                  <div className="flex items-center gap-1.5">
                                    <Badge variant={isComplete ? "default" : "destructive"} className="text-[10px]">
                                      {isComplete ? t("admin.completedLabel") : t("admin.incompletedLabel")}
                                    </Badge>
                                    {issued && <Badge variant="secondary" className="text-[10px]">{t("admin.certIssuedLabel")}</Badge>}
                                    {isComplete && certEnabled && !issued && (
                                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={() => handleIssueCert(e)} disabled={issuingCert === certKey}>
                                        <Award className="h-3 w-3" /> {t("admin.issueCert")}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                                   <span>{t("admin.attendanceLabel")} {attRate}%</span>
                                   <span>{t("admin.scoreLabel")} {avgScore}</span>
                                   <span>{t("admin.progressColumn")} {Math.round(Number(e.progress) || 0)}%</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Desktop table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("admin.nameColumn")}</TableHead>
                              <TableHead>{t("admin.progressColumn")}</TableHead>
                              <TableHead>{t("admin.attendanceRate")}</TableHead>
                              <TableHead>{t("admin.avgScore")}</TableHead>
                              <TableHead>{t("admin.completionStatus")}</TableHead>
                              <TableHead>{t("admin.certColumn")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(enrollmentsByCourse.get(course.id) || []).length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">{t("admin.noStudentData")}</TableCell>
                              </TableRow>
                            ) : (
                              (enrollmentsByCourse.get(course.id) || []).map((e: any) => {
                                const attKey = `${e.user_id}_${e.course_id}`;
                                const att = attendanceByUserCourse.get(attKey);
                                const attRate = att ? Math.round((att.present / att.total) * 100) : 0;
                                const sc = scoreByStudent.get(e.user_id);
                                const avgScore = sc ? Math.round(sc.total / sc.count) : 0;
                                const isComplete = getCompletionStatus(e);
                                const certKey = `${e.user_id}_${e.course_id}`;
                                const issued = hasCert(e.user_id, e.course_id);
                                const certEnabled = criteria?.certificate_enabled;

                                return (
                                  <TableRow key={e.id}>
                                    <TableCell className="font-medium text-sm">{profileMap.get(e.user_id) || "-"}</TableCell>
                                    <TableCell className="text-sm">{Math.round(Number(e.progress) || 0)}%</TableCell>
                                    <TableCell className="text-sm">{attRate}%</TableCell>
                                    <TableCell className="text-sm">{avgScore}</TableCell>
                                    <TableCell>
                                      <Badge variant={isComplete ? "default" : "destructive"} className="text-[10px]">
                                        {isComplete ? t("admin.completedLabel") : t("admin.incompletedLabel")}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      {issued ? (
                                        <Badge variant="secondary" className="text-[10px]">{t("admin.certIssuedLabel")}</Badge>
                                      ) : isComplete && certEnabled ? (
                                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => handleIssueCert(e)} disabled={issuingCert === certKey}>
                                          <Award className="h-3.5 w-3.5" /> {t("admin.issueCert")}
                                        </Button>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <CompletionCriteriaDialog
        courseId={criteriaDialog.courseId}
        courseName={criteriaDialog.courseName}
        open={criteriaDialog.open}
        onOpenChange={(open) => setCriteriaDialog((prev) => ({ ...prev, open }))}
      />
      <CertificateTemplateDialog
        courseId={templateDialog.courseId}
        courseName={templateDialog.courseName}
        open={templateDialog.open}
        onOpenChange={(open) => setTemplateDialog((prev) => ({ ...prev, open }))}
      />
      <BulkCompletionSettingsDialog
        open={bulkDialog}
        onOpenChange={setBulkDialog}
        courseIds={courses.map((c: any) => c.id)}
      />
    </DashboardLayout>
  );
};

export default AdminCompletion;
