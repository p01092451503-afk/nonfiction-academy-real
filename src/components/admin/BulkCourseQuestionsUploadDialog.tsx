import { useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type QuestionType =
  | "multiple_choice_4"
  | "multiple_choice_5"
  | "short_answer"
  | "essay"
  | "ox";

interface ParsedRow {
  rowIndex: number;
  courseName: string;
  typeRaw: string;
  question_type: QuestionType | null;
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string | null;
  points: number;
  error?: string;
}

const TYPE_MAP: Record<string, QuestionType> = {
  "o/x": "ox",
  ox: "ox",
  "OX": "ox",
  "참거짓": "ox",
  true_false: "ox",
  "객관식": "multiple_choice_4",
  "객관식4": "multiple_choice_4",
  "4지선다": "multiple_choice_4",
  "객관식5": "multiple_choice_5",
  "5지선다": "multiple_choice_5",
  "단답형": "short_answer",
  "단답": "short_answer",
  short_answer: "short_answer",
  "서술형": "essay",
  "서술": "essay",
  essay: "essay",
};

function normalizeType(raw: any): QuestionType | null {
  if (!raw) return null;
  const key = String(raw).trim();
  return TYPE_MAP[key] || TYPE_MAP[key.toLowerCase()] || null;
}

function stripHtml(s: string): string {
  if (!s) return "";
  return String(s).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

function downloadTemplate() {
  const headers = [
    "강의명",
    "퀴즈 형식",
    "문제",
    "보기1",
    "보기2",
    "보기3",
    "보기4",
    "보기5",
    "정답",
    "해설",
  ];
  const examples = [
    ["샘플 강의 A", "O/X", "지구는 둥글다.", "", "", "", "", "", "O", "지구는 둥글다는 것이 정답입니다."],
    ["샘플 강의 A", "객관식", "다음 중 과일이 아닌 것은?", "사과", "감자", "포도", "배", "", "2", "감자는 채소입니다."],
    ["샘플 강의 B", "객관식", "한국의 수도는?", "서울", "부산", "대구", "광주", "인천", "1", ""],
  ];
  const guide = [
    ["[작성 가이드]"],
    ["강의명: 시스템에 등록된 강의 제목과 정확히 일치해야 합니다(한/영/일/중 어느 언어든 가능)."],
    ["퀴즈 형식: O/X / 객관식 / 단답형 / 서술형"],
    ["보기1~5: 객관식일 때만 입력(보기 수에 따라 4지선다/5지선다 자동 분류)."],
    ["정답: O/X는 O 또는 X, 객관식은 보기 번호(1~5) 또는 보기 텍스트, 단답형은 정답 텍스트, 서술형은 비워두세요."],
    ["해설: 선택사항. HTML 태그는 자동으로 제거됩니다."],
    ["같은 강의에 평가가 없으면 자동으로 '평가' 라는 기본 평가가 생성됩니다."],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws["!cols"] = [
    { wch: 28 }, { wch: 10 }, { wch: 40 }, { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 30 },
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide["!cols"] = [{ wch: 80 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "문항");
  XLSX.utils.book_append_sheet(wb, wsGuide, "작성가이드");
  XLSX.writeFile(wb, "강의별_평가문항_일괄등록_템플릿.xlsx");
}

function parseRow(row: any, rowIndex: number): ParsedRow {
  const courseName = String(row["강의명"] ?? row["course"] ?? "").trim();
  const typeRaw = String(row["퀴즈 형식"] ?? row["문항유형"] ?? row["유형"] ?? "").trim();
  const question_text = stripHtml(String(row["문제"] ?? ""));
  const explanation = stripHtml(String(row["해설"] ?? "")) || null;
  const correctRaw = String(row["정답"] ?? "").trim();
  const opts: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const v = stripHtml(String(row[`보기${i}`] ?? ""));
    if (v) opts.push(v);
  }

  const base: ParsedRow = {
    rowIndex,
    courseName,
    typeRaw,
    question_type: null,
    question_text,
    options: opts,
    correct_answer: correctRaw,
    explanation,
    points: 10,
  };

  if (!courseName) return { ...base, error: "강의명이 비어있습니다" };
  if (!question_text) return { ...base, error: "문제가 비어있습니다" };

  let type = normalizeType(typeRaw);
  if (!type) return { ...base, error: `퀴즈 형식 인식 불가: ${typeRaw || "(빈값)"}` };

  if (type === "ox") {
    base.question_type = "ox";
    base.options = ["O", "X"];
    const a = correctRaw.toUpperCase();
    if (a !== "O" && a !== "X") return { ...base, error: "OX 정답은 O 또는 X여야 합니다" };
    base.correct_answer = a;
    return base;
  }

  if (type === "multiple_choice_4" || type === "multiple_choice_5") {
    if (opts.length < 2) return { ...base, error: "객관식 보기가 부족합니다(최소 2개)" };
    base.question_type = opts.length >= 5 ? "multiple_choice_5" : "multiple_choice_4";
    if (opts.length === 3) base.options = [...opts, ""];
    let answer = correctRaw;
    const asNum = Number(correctRaw);
    if (Number.isInteger(asNum) && asNum >= 1 && asNum <= opts.length) {
      answer = opts[asNum - 1];
    }
    if (!answer) return { ...base, error: "정답이 비어있습니다" };
    if (!base.options.includes(answer)) {
      return { ...base, error: "정답이 보기 목록과 일치하지 않습니다" };
    }
    base.correct_answer = answer;
    return base;
  }

  if (type === "short_answer") {
    base.question_type = "short_answer";
    if (!correctRaw) return { ...base, error: "단답형 정답이 비어있습니다" };
    return base;
  }

  base.question_type = "essay";
  base.correct_answer = "";
  return base;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function BulkCourseQuestionsUploadDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; failed: number; missingCourses: string[] } | null>(null);

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const parsed = raw
        .filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""))
        .map((r, i) => parseRow(r, i + 2));
      setRows(parsed);
      if (parsed.length === 0) {
        toast({ title: "빈 파일", description: "유효한 데이터가 없습니다.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "파일 읽기 실패", description: err.message, variant: "destructive" });
    } finally {
      e.target.value = "";
    }
  };

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => r.error);
  const uniqueCourseNames = Array.from(new Set(validRows.map((r) => r.courseName)));

  const handleUpload = async () => {
    if (validRows.length === 0) return;
    setUploading(true);
    setResult(null);
    try {
      const courseIdByName = new Map<string, string>();
      const missing: string[] = [];

      const { data: baseMatches, error: e1 } = await supabase
        .from("courses")
        .select("id, title")
        .in("title", uniqueCourseNames);
      if (e1) throw e1;
      baseMatches?.forEach((c: any) => courseIdByName.set(c.title, c.id));

      const stillMissing = uniqueCourseNames.filter((n) => !courseIdByName.has(n));
      if (stillMissing.length > 0) {
        const { data: i18nMatches, error: e2 } = await supabase
          .from("course_i18n")
          .select("course_id, title")
          .in("title", stillMissing);
        if (e2) throw e2;
        i18nMatches?.forEach((c: any) => {
          if (!courseIdByName.has(c.title)) courseIdByName.set(c.title, c.course_id);
        });
      }

      uniqueCourseNames.forEach((n) => {
        if (!courseIdByName.has(n)) missing.push(n);
      });

      const userResp = await supabase.auth.getUser();
      const userId = userResp.data.user?.id ?? null;
      const assessmentInfo = new Map<string, { assessmentId: string; nextOrder: number }>();

      for (const [name, courseId] of courseIdByName.entries()) {
        const { data: existing, error: ae } = await supabase
          .from("assessments")
          .select("id")
          .eq("course_id", courseId)
          .order("order_index", { ascending: true })
          .limit(1);
        if (ae) throw ae;
        let assessmentId = existing?.[0]?.id;
        if (!assessmentId) {
          const { data: created, error: ce } = await supabase
            .from("assessments")
            .insert({
              course_id: courseId,
              title: "평가",
              description: null,
              passing_score: 60,
              max_attempts: 3,
              completion_threshold: 80,
              require_assessment_for_completion: false,
              randomize_questions: true,
              is_published: false,
              created_by: userId,
            })
            .select("id")
            .single();
          if (ce) throw ce;
          assessmentId = created!.id;
        }
        const { data: qs, error: qe } = await supabase
          .from("assessment_questions")
          .select("order_index")
          .eq("assessment_id", assessmentId)
          .order("order_index", { ascending: false })
          .limit(1);
        if (qe) throw qe;
        const nextOrder = (qs?.[0]?.order_index ?? -1) + 1;
        assessmentInfo.set(courseId, { assessmentId, nextOrder });
        void name;
      }

      const payload: any[] = [];
      let failed = 0;
      for (const r of validRows) {
        const courseId = courseIdByName.get(r.courseName);
        if (!courseId) {
          failed++;
          continue;
        }
        const info = assessmentInfo.get(courseId)!;
        payload.push({
          assessment_id: info.assessmentId,
          question_type: r.question_type!,
          question_text: r.question_text,
          options: r.question_type === "short_answer" || r.question_type === "essay" ? null : r.options,
          correct_answer: r.correct_answer,
          points: r.points,
          explanation: r.explanation,
          hint: null,
          order_index: info.nextOrder,
        });
        info.nextOrder += 1;
      }

      let inserted = 0;
      if (payload.length > 0) {
        for (let i = 0; i < payload.length; i += 100) {
          const chunk = payload.slice(i, i + 100);
          const { error: ie } = await supabase.from("assessment_questions").insert(chunk);
          if (ie) throw ie;
          inserted += chunk.length;
        }
      }

      setResult({ inserted, failed, missingCourses: missing });
      toast({
        title: "업로드 완료",
        description: `${inserted}개 문항 등록 / 매칭 실패 강의 ${missing.length}개`,
      });
      queryClient.invalidateQueries({ queryKey: ["assessment-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
    } catch (err: any) {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            강의별 평가 문항 일괄 등록
          </DialogTitle>
          <DialogDescription className="text-xs">
            엑셀의 강의명 컬럼을 기준으로 여러 강의의 평가 문항을 한 번에 등록합니다. 강의에 평가가 없으면 기본 평가가 자동 생성됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-4 flex items-center justify-between gap-2">
            <div className="text-sm">
              <p className="font-medium">1단계. 템플릿 다운로드</p>
              <p className="text-xs text-muted-foreground mt-0.5">엑셀 양식에 문항을 작성하세요</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1">
              <Download className="h-3.5 w-3.5" /> 템플릿
            </Button>
          </div>

          <div className="rounded-lg border border-dashed p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <p className="font-medium">2단계. 작성된 엑셀 업로드</p>
                <p className="text-xs text-muted-foreground mt-0.5">.xlsx 파일을 선택하세요</p>
              </div>
              <label className="cursor-pointer">
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
                <span className="inline-flex items-center gap-1 rounded-md border bg-background px-3 h-8 text-xs hover:bg-accent">
                  <Upload className="h-3.5 w-3.5" /> 파일 선택
                </span>
              </label>
            </div>
            {fileName && <p className="text-xs text-muted-foreground truncate">📄 {fileName}</p>}
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <span className="inline-flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 유효 {validRows.length}개
                </span>
                {errorRows.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" /> 오류 {errorRows.length}개
                  </span>
                )}
                <span className="text-muted-foreground">강의 수 {uniqueCourseNames.length}개</span>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">행</th>
                      <th className="px-2 py-1.5 text-left">강의명</th>
                      <th className="px-2 py-1.5 text-left">유형</th>
                      <th className="px-2 py-1.5 text-left">문제</th>
                      <th className="px-2 py-1.5 text-left">정답</th>
                      <th className="px-2 py-1.5 text-left">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p, i) => (
                      <tr key={i} className={`border-t ${p.error ? "bg-destructive/5" : ""}`}>
                        <td className="px-2 py-1.5 align-top">{p.rowIndex}</td>
                        <td className="px-2 py-1.5 align-top max-w-[160px] truncate">{p.courseName || "-"}</td>
                        <td className="px-2 py-1.5 align-top">{p.question_type || p.typeRaw || "-"}</td>
                        <td className="px-2 py-1.5 align-top max-w-[260px] truncate">{p.question_text || "-"}</td>
                        <td className="px-2 py-1.5 align-top max-w-[100px] truncate">{p.correct_answer || "-"}</td>
                        <td className="px-2 py-1.5 align-top">
                          {p.error ? <span className="text-destructive">{p.error}</span> : <span className="text-green-600">OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-lg border p-3 text-xs space-y-1 bg-muted/30">
              <p>✅ 등록 완료: <b>{result.inserted}</b>개 문항</p>
              {result.failed > 0 && <p className="text-destructive">⚠️ 강의 매칭 실패로 건너뜀: {result.failed}개</p>}
              {result.missingCourses.length > 0 && (
                <div>
                  <p className="text-destructive font-medium">매칭되지 않은 강의명:</p>
                  <ul className="list-disc pl-4 mt-1 text-destructive">
                    {result.missingCourses.map((n) => (
                      <li key={n} className="truncate">{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
          <Button onClick={handleUpload} disabled={validRows.length === 0 || uploading}>
            {uploading ? "등록 중..." : `${validRows.length}개 문항 등록`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
