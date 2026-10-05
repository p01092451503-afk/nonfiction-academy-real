import { ClipboardList, Clock, CheckCircle2, AlertCircle, ArrowRight, Send, Paperclip, X, FileIcon, Download } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg", "image/png", "image/webp", "text/plain",
];

const StudentAssignments = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const [submitTarget, setSubmitTarget] = useState<any>(null);
  const [submissionText, setSubmissionText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewTarget, setViewTarget] = useState<any>(null);

  const statusConfig = {
    submitted: { label: t("assignments.submitted"), icon: Clock, color: "text-info" },
    graded: { label: t("assignments.gradedComplete"), icon: CheckCircle2, color: "text-success" },
    returned: { label: t("assignments.returnedLabel"), icon: AlertCircle, color: "text-warning" },
  };

  const { data: submissions = [] } = useQuery({
    queryKey: ["my-submissions", user?.id, i18n.language],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*, assignments(title, title_en, due_date, max_score, instructions, instructions_en, courses(title, course_i18n(language_code, title)))")
        .eq("student_id", user!.id)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      const lang = (i18n.language || "ko").startsWith("en") ? "en"
        : (i18n.language || "ko").startsWith("ja") ? "ja"
        : (i18n.language || "ko").startsWith("zh") ? "zh-CN" : "ko";
      const isEn = lang === "en";
      if (lang === "ko") return data;
      return (data || []).map((s: any) => {
        if (!s.assignments) return s;
        const a = s.assignments;
        const courseTr = (a.courses?.course_i18n || []).find((x: any) => x.language_code === lang);
        return {
          ...s,
          assignments: {
            ...a,
            // assignments table only has *_en translations; for ja/zh fall back to KO
            title: isEn ? (a.title_en || a.title) : a.title,
            instructions: isEn ? (a.instructions_en || a.instructions) : a.instructions,
            courses: a.courses ? { ...a.courses, title: courseTr?.title || a.courses.title } : a.courses,
          },
        };
      });

    },
    enabled: !!user?.id,
  });

  const { data: myAssignments = [] } = useQuery({
    queryKey: ["my-assignments", user?.id, i18n.language],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*, courses(title, course_i18n(language_code, title))")
        .eq("status", "published")
        .order("due_date", { ascending: true });
      if (error) throw error;
      const lang = (i18n.language || "ko").startsWith("en") ? "en"
        : (i18n.language || "ko").startsWith("ja") ? "ja"
        : (i18n.language || "ko").startsWith("zh") ? "zh-CN" : "ko";
      const isEn = lang === "en";
      if (lang === "ko") return data;
      return (data || []).map((a: any) => {
        const courseTr = (a.courses?.course_i18n || []).find((x: any) => x.language_code === lang);
        return {
          ...a,
          title: isEn ? (a.title_en || a.title) : a.title,
          instructions: isEn ? (a.instructions_en || a.instructions) : a.instructions,
          courses: a.courses ? { ...a.courses, title: courseTr?.title || a.courses.title } : a.courses,
        };
      });

    },
    enabled: !!user?.id,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: t("assignments.fileTooLarge", { name: f.name }), variant: "destructive" });
        return false;
      }
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast({ title: t("assignments.fileTypeInvalid", { name: f.name }), variant: "destructive" });
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...valid].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const uploadFiles = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const filePath = `${user!.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("assignment-files").upload(filePath, file);
      if (error) throw error;
      const { data } = supabase.storage.from("assignment-files").getPublicUrl(filePath);
      urls.push(data.publicUrl);
    }
    return urls;
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      let fileUrls: string[] = [];
      if (files.length > 0) {
        fileUrls = await uploadFiles();
      }
      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: submitTarget.id,
        student_id: user!.id,
        submission_text: submissionText,
        file_urls: fileUrls.length > 0 ? fileUrls : null,
        status: "submitted" as any,
        submitted_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["my-assignments"] });
      toast({ title: t("assignments.submitSuccess") });
      setSubmitTarget(null);
      setSubmissionText("");
      setFiles([]);
      setUploading(false);
    },
    onError: (e: any) => {
      setUploading(false);
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const submittedIds = new Set(submissions.map((s: any) => s.assignment_id));
  const pending = myAssignments.filter((a: any) => !submittedIds.has(a.id));
  const submitted = submissions.filter((s: any) => s.status === "submitted");
  const graded = submissions.filter((s: any) => s.status === "graded" || s.status === "returned");

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return i18n.language?.startsWith("en")
      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : d.toLocaleDateString("ko-KR");
  };

  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2"><ClipboardList className="h-6 w-6" aria-hidden="true" />{t("assignments.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("assignments.subtitle")}</p>
        </div>

        <section className="grid grid-cols-3 gap-2 sm:gap-3" aria-label={t("assignments.title")}>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 sm:px-4 sm:py-3" role="group" aria-label={t("assignments.unsubmitted")}>
            <span className="text-lg sm:text-xl font-bold text-warning leading-none">{pending.length}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{t("assignments.unsubmitted")}</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 sm:px-4 sm:py-3" role="group" aria-label={t("assignments.waitingGrade")}>
            <span className="text-lg sm:text-xl font-bold text-info leading-none">{submitted.length}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{t("assignments.waitingGrade")}</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 sm:px-4 sm:py-3" role="group" aria-label={t("assignments.graded")}>
            <span className="text-lg sm:text-xl font-bold text-success leading-none">{graded.length}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{t("assignments.graded")}</span>
          </div>
        </section>

        {/* Pending assignments */}
        {pending.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{t("assignments.unsubmittedAssignments")}</h2>
            {pending.map((assignment: any) => (
              <div
                key={assignment.id}
                className="stat-card flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 cursor-pointer group !p-3 sm:!p-4 hover:shadow-md transition-all"
                onClick={() => { setSubmitTarget(assignment); setSubmissionText(""); setFiles([]); }}
                role="button"
                tabIndex={0}
                aria-label={`${assignment.title} - ${t("common.submit")}`}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSubmitTarget(assignment); setSubmissionText(""); setFiles([]); } }}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center shrink-0" aria-hidden="true">
                    <ClipboardList className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-foreground truncate">{assignment.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{assignment.courses?.title}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <div className="text-left sm:text-right shrink-0 space-y-1">
                    <div className="flex items-center gap-1 text-xs font-medium text-warning" role="status">
                      <AlertCircle className="h-3 w-3" aria-hidden="true" /> {t("assignments.unsubmitted")}
                    </div>
                    {assignment.due_date && (
                      <p className="text-[10px] text-muted-foreground">
                        {t("assignments.dueDate", { date: formatDate(assignment.due_date) })}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="rounded-xl text-xs shrink-0 gap-1.5" tabIndex={-1} aria-hidden="true">
                    <Send className="h-3 w-3" /> {t("common.submit")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submitted assignments */}
        {submissions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{t("assignments.submittedAssignments")}</h2>
            {submissions.map((sub: any) => {
              const config = statusConfig[sub.status as keyof typeof statusConfig] || statusConfig.submitted;
              const StatusIcon = config.icon;
              return (
                <div
                  key={sub.id}
                  className="stat-card flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 cursor-pointer group !p-3 sm:!p-4 hover:shadow-md transition-all"
                  onClick={() => setViewTarget(sub)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${sub.assignments?.title} - ${config.label}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewTarget(sub); } }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center shrink-0" aria-hidden="true">
                      <ClipboardList className="h-4 w-4 text-accent-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-foreground truncate">{sub.assignments?.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{sub.assignments?.courses?.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="text-left sm:text-right shrink-0 space-y-1">
                      <div className={`flex items-center gap-1 text-xs font-medium ${config.color}`} role="status">
                        <StatusIcon className="h-3 w-3" aria-hidden="true" />
                        {config.label}
                        {sub.status === "graded" && sub.score != null && (
                          <span className="ml-1">{sub.score}/{sub.assignments?.max_score || 100}{t("common.points")}</span>
                        )}
                      </div>
                      {sub.submitted_at && (
                        <p className="text-[10px] text-muted-foreground"><time dateTime={sub.submitted_at}>{formatDate(sub.submitted_at)}</time></p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" aria-hidden="true" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pending.length === 0 && submissions.length === 0 && (
          <div className="stat-card text-center py-10">
            <p className="text-sm text-muted-foreground">{t("assignments.noAssignments")}</p>
          </div>
        )}
      </div>

      {/* Submit Dialog */}
      <Dialog open={!!submitTarget} onOpenChange={(v) => !v && setSubmitTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("assignments.submitDialogTitle")}</DialogTitle>
            <DialogDescription>{t("assignments.submitDialogDesc")}</DialogDescription>
          </DialogHeader>
          {submitTarget && (
            <div className="space-y-4 py-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{submitTarget.title}</h3>
                <p className="text-xs text-muted-foreground">{submitTarget.courses?.title}</p>
                {submitTarget.due_date && (
                  <p className="text-xs text-muted-foreground mt-1">{t("assignments.dueDate", { date: formatDate(submitTarget.due_date) })}</p>
                )}
              </div>
              {submitTarget.instructions && (
                <div className="p-3 bg-secondary/30 rounded-xl text-xs text-muted-foreground whitespace-pre-wrap">
                  {submitTarget.instructions}
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("assignments.submissionText")} *</Label>
                <Textarea
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  placeholder={t("assignments.submissionPlaceholder")}
                  className="rounded-xl resize-none min-h-[120px]"
                />
              </div>
              {/* File Upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" /> {t("assignments.attachFiles", "파일 첨부")}
                  <span className="text-muted-foreground font-normal">{t("assignments.attachFilesHint", "(최대 5개, 10MB)")}</span>
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={files.length >= 5}
                >
                  <Paperclip className="h-3 w-3" /> {t("assignments.selectFiles", "파일 선택")}
                </Button>
                {files.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg text-xs">
                        <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate text-foreground">{f.name}</span>
                        <span className="text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                        <button onClick={() => removeFile(i)} className="p-0.5 rounded hover:bg-accent shrink-0">
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitTarget(null)} className="rounded-xl">{t("common.cancel")}</Button>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || uploading || (!submissionText.trim() && files.length === 0)}
              className="rounded-xl gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {uploading ? t("common.uploading", "업로드 중...") : submitMutation.isPending ? t("assignments.submitting") : t("common.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Submission Detail Dialog */}
      <Dialog open={!!viewTarget} onOpenChange={(v) => !v && setViewTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("assignments.submissionDetail")}</DialogTitle>
            <DialogDescription>{viewTarget?.assignments?.title} · {viewTarget?.assignments?.courses?.title}</DialogDescription>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("assignments.submissionContent")}</Label>
                <div className="p-3 bg-secondary/30 rounded-xl text-sm text-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {viewTarget.submission_text || t("assignments.noSubmissionText")}
                </div>
              </div>
              {/* Attached files */}
              {viewTarget.file_urls && viewTarget.file_urls.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> {t("assignments.attachments", "첨부 파일")}
                  </Label>
                  {viewTarget.file_urls.map((url: string, i: number) => {
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
              )}
              {viewTarget.submitted_at && (
                <p className="text-xs text-muted-foreground">{t("assignments.submitted")}: {formatDate(viewTarget.submitted_at)}</p>
              )}
              {viewTarget.score != null && (
                <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-xl space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {t("assignments.scoreLabel")}: {viewTarget.score}/{viewTarget.assignments?.max_score || 100}{t("common.points")}
                  </p>
                </div>
              )}
              {viewTarget.feedback && (
                <div className="space-y-1">
                  <Label className="text-sm font-medium">{t("assignments.feedbackLabel")}</Label>
                  <div className="p-3 bg-secondary/30 rounded-xl text-sm text-foreground whitespace-pre-wrap">
                    {viewTarget.feedback}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTarget(null)} className="rounded-xl">{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StudentAssignments;
