import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Plus, Pencil, Trash2, Eye, ChevronDown, ChevronUp, Star, MessageSquare, ListChecks, Upload, Download, Copy } from "lucide-react";
import { useRef } from "react";

interface SurveyQuestion {
  id?: string;
  question_type: "multiple_choice" | "text" | "rating";
  question_text: string;
  options: string[];
  order_index: number;
  is_required: boolean;
}

const AdminSurveys = () => {
  const { t } = useTranslation();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [resultsDialog, setResultsDialog] = useState<any>(null);
  const [expandedSurvey, setExpandedSurvey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-for-survey"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, title").order("title");
      if (error) throw error;
      return data;
    },
  });

  const { data: surveys = [], isLoading } = useQuery({
    queryKey: ["admin-surveys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("surveys")
        .select("*, courses(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: responseStats = {} } = useQuery({
    queryKey: ["survey-response-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_responses")
        .select("survey_id");
      if (error) throw error;
      const stats: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        stats[r.survey_id] = (stats[r.survey_id] || 0) + 1;
      });
      return stats;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!title || !courseId) throw new Error("제목과 과정을 선택해주세요.");

      let surveyId: string;

      if (editingSurvey) {
        const { error } = await supabase
          .from("surveys")
          .update({ title, description, course_id: courseId, is_active: isActive, updated_at: new Date().toISOString() })
          .eq("id", editingSurvey.id);
        if (error) throw error;
        surveyId = editingSurvey.id;

        // Delete existing questions and re-insert
        await supabase.from("survey_questions").delete().eq("survey_id", surveyId);
      } else {
        const { data, error } = await supabase
          .from("surveys")
          .insert({ title, description, course_id: courseId, is_active: isActive, created_by: user!.id })
          .select("id")
          .single();
        if (error) throw error;
        surveyId = data.id;
      }

      // Insert questions
      if (questions.length > 0) {
        const qRows = questions.map((q, i) => ({
          survey_id: surveyId,
          question_type: q.question_type,
          question_text: q.question_text,
          options: q.question_type === "multiple_choice" ? q.options : null,
          order_index: i,
          is_required: q.is_required,
        }));
        const { error } = await supabase.from("survey_questions").insert(qRows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-surveys"] });
      toast({ title: editingSurvey ? "설문이 수정되었습니다." : "설문이 생성되었습니다." });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "오류", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("surveys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-surveys"] });
      toast({ title: "설문이 삭제되었습니다." });
    },
  });

  const openCreate = () => {
    setEditingSurvey(null);
    setTitle("");
    setDescription("");
    setCourseId("");
    setIsActive(true);
    setQuestions([]);
    setDialogOpen(true);
  };

  const openEdit = async (survey: any) => {
    setEditingSurvey(survey);
    setTitle(survey.title);
    setDescription(survey.description || "");
    setCourseId(survey.course_id);
    setIsActive(survey.is_active);

    const { data } = await supabase
      .from("survey_questions")
      .select("*")
      .eq("survey_id", survey.id)
      .order("order_index");

    setQuestions(
      (data || []).map((q: any) => ({
        id: q.id,
        question_type: q.question_type,
        question_text: q.question_text,
        options: q.options || [],
        order_index: q.order_index,
        is_required: q.is_required,
      }))
    );
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSurvey(null);
  };

  const addQuestion = () => {
    setQuestions([...questions, {
      question_type: "multiple_choice",
      question_text: "",
      options: ["", ""],
      order_index: questions.length,
      is_required: true,
    }]);
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    const updated = [...questions];
    (updated[index] as any)[field] = value;
    setQuestions(updated);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const moveQuestion = (index: number, dir: -1 | 1) => {
    if (index + dir < 0 || index + dir >= questions.length) return;
    const updated = [...questions];
    [updated[index], updated[index + dir]] = [updated[index + dir], updated[index]];
    setQuestions(updated);
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const updated = [...questions];
    updated[qIndex].options[oIndex] = value;
    setQuestions(updated);
  };

  const addOption = (qIndex: number) => {
    const updated = [...questions];
    updated[qIndex].options.push("");
    setQuestions(updated);
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    const updated = [...questions];
    updated[qIndex].options.splice(oIndex, 1);
    setQuestions(updated);
  };

  const downloadTemplate = () => {
    const header = "질문유형,질문내용,필수여부,선택지1,선택지2,선택지3,선택지4,선택지5";
    const examples = [
      "객관식,교육 내용은 만족스러웠나요?,Y,매우 만족,만족,보통,불만족,매우 불만족",
      "평점,강사의 전달력은 어땠나요?,Y,,,,,",
      "주관식,개선할 점이 있다면 자유롭게 적어주세요.,N,,,,,"
    ];
    const csv = "\uFEFF" + [header, ...examples].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "survey_question_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        toast({ title: "오류", description: "데이터가 없습니다. 헤더 아래에 데이터를 입력해주세요.", variant: "destructive" });
        return;
      }

      const typeMap: Record<string, "multiple_choice" | "text" | "rating"> = {
        "객관식": "multiple_choice",
        "주관식": "text",
        "평점": "rating",
        "multiple_choice": "multiple_choice",
        "text": "text",
        "rating": "rating",
      };

      const newQuestions: SurveyQuestion[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim());
        if (cols.length < 2 || !cols[1]) continue;

        const qType = typeMap[cols[0]] || "text";
        const qText = cols[1];
        const isRequired = cols[2]?.toUpperCase() !== "N";
        const options = cols.slice(3).filter(o => o !== "");

        newQuestions.push({
          question_type: qType,
          question_text: qText,
          options: qType === "multiple_choice" ? (options.length >= 2 ? options : ["", ""]) : [],
          order_index: questions.length + newQuestions.length,
          is_required: isRequired,
        });
      }

      if (newQuestions.length === 0) {
        toast({ title: "오류", description: "유효한 질문이 없습니다.", variant: "destructive" });
        return;
      }

      setQuestions(prev => [...prev, ...newQuestions]);
      toast({ title: `${newQuestions.length}개의 질문이 추가되었습니다.` });
    };
    reader.readAsText(file);
  };

  // Results viewer
  const openResults = async (survey: any) => {
    const { data: responses } = await supabase
      .from("survey_responses")
      .select("*, profiles:user_id(full_name, email)")
      .eq("survey_id", survey.id)
      .order("completed_at", { ascending: false });

    const { data: questionsData } = await supabase
      .from("survey_questions")
      .select("*")
      .eq("survey_id", survey.id)
      .order("order_index");

    const responseIds = (responses || []).map((r: any) => r.id);
    let answers: any[] = [];
    if (responseIds.length > 0) {
      const { data } = await supabase
        .from("survey_answers")
        .select("*")
        .in("response_id", responseIds);
      answers = data || [];
    }

    setResultsDialog({ survey, responses: responses || [], questions: questionsData || [], answers });
  };

  const questionTypeIcon = (type: string) => {
    switch (type) {
      case "multiple_choice": return <ListChecks className="h-4 w-4" />;
      case "text": return <MessageSquare className="h-4 w-4" />;
      case "rating": return <Star className="h-4 w-4" />;
      default: return null;
    }
  };

  const questionTypeLabel = (type: string) => {
    switch (type) {
      case "multiple_choice": return "객관식";
      case "text": return "주관식";
      case "rating": return "평점";
      default: return type;
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" /> 설문 관리
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">강의별 설문을 생성하고 관리합니다.</p>
          </div>
          <Button onClick={openCreate} className="rounded-xl gap-2 w-full sm:w-auto">
            <Plus className="h-4 w-4" aria-hidden="true" /> 설문 만들기
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3" role="status" aria-live="polite">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : surveys.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">등록된 설문이 없습니다.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {surveys.map((s: any) => (
              <Card key={s.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <CardTitle className="text-base truncate">{s.title}</CardTitle>
                      <p className="text-sm text-muted-foreground truncate">
                        과정: {(s as any).courses?.title || "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={s.is_active ? "default" : "secondary"}>
                        {s.is_active ? "활성" : "비활성"}
                      </Badge>
                      <Badge variant="outline">{(responseStats as any)[s.id] || 0}명 응답</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> 수정
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openResults(s)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> 결과 보기
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => {
                      if (confirm("이 설문을 삭제하시겠습니까?")) deleteMutation.mutate(s.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> 삭제
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSurvey ? "설문 수정" : "설문 만들기"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>과정 선택 *</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger><SelectValue placeholder="과정을 선택하세요" /></SelectTrigger>
                <SelectContent>
                  {courses.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>설문 제목 *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="설문 제목을 입력하세요" />
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="설문 설명 (선택)" rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="survey-active" />
              <Label htmlFor="survey-active">활성화</Label>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-semibold">질문 목록</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadTemplate}>
                    <Download className="h-3.5 w-3.5 mr-1" /> 템플릿 다운로드
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> CSV 업로드
                  </Button>
                  <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                  <Button variant="outline" size="sm" onClick={addQuestion}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> 질문 추가
                  </Button>
                </div>
              </div>

              {questions.map((q, qi) => (
                <Card key={qi} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Q{qi + 1}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveQuestion(qi, 1)} disabled={qi === questions.length - 1}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeQuestion(qi)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">질문 유형</Label>
                      <Select value={q.question_type} onValueChange={v => updateQuestion(qi, "question_type", v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="multiple_choice">객관식</SelectItem>
                          <SelectItem value="text">주관식</SelectItem>
                          <SelectItem value="rating">평점 (1-5)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex items-center gap-1.5">
                        <Switch checked={q.is_required} onCheckedChange={v => updateQuestion(qi, "is_required", v)} id={`req-${qi}`} />
                        <Label htmlFor={`req-${qi}`} className="text-xs">필수</Label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">질문 내용</Label>
                    <Input value={q.question_text} onChange={e => updateQuestion(qi, "question_text", e.target.value)} placeholder="질문을 입력하세요" />
                  </div>

                  {q.question_type === "multiple_choice" && (
                    <div className="space-y-2">
                      <Label className="text-xs">선택지</Label>
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex gap-2">
                          <Input value={opt} onChange={e => updateOption(qi, oi, e.target.value)} placeholder={`선택지 ${oi + 1}`} className="h-8 text-sm" />
                          {q.options.length > 2 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeOption(qi, oi)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => addOption(qi)}>
                        <Plus className="h-3 w-3 mr-1" /> 선택지 추가
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>취소</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results Dialog */}
      <Dialog open={!!resultsDialog} onOpenChange={() => setResultsDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>설문 결과: {resultsDialog?.survey?.title}</DialogTitle>
              {resultsDialog && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    const d = resultsDialog;
                    const lines: string[] = [];
                    lines.push("═══════════════════════════════════════");
                    lines.push(`📋 설문 결과 리포트`);
                    lines.push("═══════════════════════════════════════");
                    lines.push(`설문명: ${d.survey.title}`);
                    lines.push(`과정: ${d.survey.courses?.title || "-"}`);
                    lines.push(`총 응답자: ${d.responses.length}명`);
                    lines.push(`작성일: ${new Date().toLocaleDateString("ko-KR")}`);
                    lines.push("───────────────────────────────────────");
                    lines.push("");

                    d.questions.forEach((q: any, qi: number) => {
                      const qAnswers = d.answers.filter((a: any) => a.question_id === q.id);
                      lines.push(`Q${qi + 1}. ${q.question_text}`);

                      if (q.question_type === "multiple_choice") {
                        ((q.options as string[]) || []).forEach((opt: string) => {
                          const count = qAnswers.filter((a: any) => a.answer_text === opt).length;
                          const pct = qAnswers.length > 0 ? Math.round((count / qAnswers.length) * 100) : 0;
                          const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
                          lines.push(`  ${opt}: ${bar} ${count}명 (${pct}%)`);
                        });
                      } else if (q.question_type === "rating") {
                        const avg = qAnswers.length > 0
                          ? (qAnswers.reduce((s: number, a: any) => s + (a.answer_value || 0), 0) / qAnswers.length).toFixed(1)
                          : "-";
                        lines.push(`  평균 평점: ⭐ ${avg} / 5`);
                      } else if (q.question_type === "text") {
                        qAnswers.forEach((a: any, i: number) => {
                          lines.push(`  • ${a.answer_text || "-"}`);
                        });
                        if (qAnswers.length === 0) lines.push(`  (응답 없음)`);
                      }
                      lines.push("");
                    });

                    lines.push("───────────────────────────────────────");
                    lines.push("NONFICTION LMS | 자동 생성 리포트");

                    navigator.clipboard.writeText(lines.join("\n"));
                    toast({ title: "리포트가 클립보드에 복사되었습니다." });
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> 리포트 복사
                </Button>
              )}
            </div>
          </DialogHeader>
          {resultsDialog && (
            <Tabs defaultValue="summary">
              <TabsList>
                <TabsTrigger value="summary">요약</TabsTrigger>
                <TabsTrigger value="individual">개별 응답</TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">총 {resultsDialog.responses.length}명 응답</p>
                {resultsDialog.questions.map((q: any) => {
                  const qAnswers = resultsDialog.answers.filter((a: any) => a.question_id === q.id);
                  return (
                    <Card key={q.id} className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        {questionTypeIcon(q.question_type)}
                        <span className="font-medium text-sm">{q.question_text}</span>
                      </div>
                      {q.question_type === "multiple_choice" && (
                        <div className="space-y-1">
                          {((q.options as string[]) || []).map((opt: string, i: number) => {
                            const count = qAnswers.filter((a: any) => a.answer_text === opt).length;
                            const pct = qAnswers.length > 0 ? Math.round((count / qAnswers.length) * 100) : 0;
                            return (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <span className="w-32 truncate">{opt}</span>
                                <div className="flex-1 bg-secondary rounded-full h-2">
                                  <div className="bg-primary rounded-full h-2" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground w-16 text-right">{count}명 ({pct}%)</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {q.question_type === "rating" && (
                        <div className="text-sm">
                          평균: {qAnswers.length > 0 ? (qAnswers.reduce((s: number, a: any) => s + (a.answer_value || 0), 0) / qAnswers.length).toFixed(1) : "-"} / 5
                        </div>
                      )}
                      {q.question_type === "text" && (
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {qAnswers.map((a: any, i: number) => (
                            <p key={i} className="text-sm text-muted-foreground bg-secondary/50 p-2 rounded">
                              {a.answer_text || "-"}
                            </p>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </TabsContent>
              <TabsContent value="individual" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>이름</TableHead>
                      <TableHead>이메일</TableHead>
                      <TableHead>응답일</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultsDialog.responses.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>{(r as any).profiles?.full_name || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{(r as any).profiles?.email || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(r.completed_at).toLocaleDateString("ko-KR")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminSurveys;
