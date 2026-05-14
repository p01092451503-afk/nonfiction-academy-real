import { useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type QuestionType = "multiple_choice_4" | "multiple_choice_5" | "short_answer" | "essay" | "ox";

interface ParsedQuestion {
  question_type: QuestionType;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  points: number;
  explanation: string | null;
  hint: string | null;
  _rowIndex: number;
  _error?: string;
}

const TYPE_MAP: Record<string, QuestionType> = {
  "4지선다": "multiple_choice_4",
  "사지선다": "multiple_choice_4",
  "객관식4": "multiple_choice_4",
  "multiple_choice_4": "multiple_choice_4",
  "5지선다": "multiple_choice_5",
  "오지선다": "multiple_choice_5",
  "객관식5": "multiple_choice_5",
  "multiple_choice_5": "multiple_choice_5",
  "ox": "ox",
  "OX": "ox",
  "참거짓": "ox",
  "true_false": "ox",
  "단답형": "short_answer",
  "단답": "short_answer",
  "short_answer": "short_answer",
  "서술형": "essay",
  "서술": "essay",
  "essay": "essay",
};

function normalizeType(raw: any): QuestionType | null {
  if (!raw) return null;
  const key = String(raw).trim();
  return TYPE_MAP[key] || TYPE_MAP[key.toLowerCase()] || null;
}

function downloadTemplate() {
  const headers = ["문항유형", "문제", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "배점", "해설", "힌트"];
  const examples = [
    ["4지선다", "대한민국의 수도는?", "서울", "부산", "대구", "인천", "", "서울", 10, "대한민국의 수도는 서울입니다.", ""],
    ["5지선다", "다음 중 과일이 아닌 것은?", "사과", "배", "감자", "포도", "딸기", "감자", 10, "감자는 채소입니다.", ""],
    ["OX", "지구는 둥글다.", "", "", "", "", "", "O", 10, "", ""],
    ["단답형", "한국의 수도는?", "", "", "", "", "", "서울", 10, "", ""],
    ["서술형", "학습 후 느낀 점을 서술하시오.", "", "", "", "", "", "", 20, "", ""],
  ];
  const guide = [
    ["[작성 가이드]"],
    ["문항유형: 4지선다 / 5지선다 / OX / 단답형 / 서술형"],
    ["보기1~5: 객관식(4지선다/5지선다)일 때만 입력. OX/단답형/서술형은 비워두세요."],
    ["정답: 객관식은 보기 텍스트와 정확히 일치, OX는 O 또는 X, 단답형은 정답 텍스트, 서술형은 비워두세요."],
    ["배점: 숫자(기본 10)"],
    ["해설/힌트: 선택사항"],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws["!cols"] = [
    { wch: 10 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 6 }, { wch: 24 }, { wch: 20 },
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide["!cols"] = [{ wch: 80 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "문항");
  XLSX.utils.book_append_sheet(wb, wsGuide, "작성가이드");
  XLSX.writeFile(wb, "평가문항_업로드_템플릿.xlsx");
}

function parseRow(row: any, rowIndex: number): ParsedQuestion {
  const type = normalizeType(row["문항유형"] ?? row["유형"] ?? row["question_type"]);
  const question_text = String(row["문제"] ?? row["question_text"] ?? "").trim();
  const correct_answer_raw = row["정답"] ?? row["correct_answer"] ?? "";
  const correct_answer = String(correct_answer_raw).trim();
  const pointsRaw = row["배점"] ?? row["points"] ?? 10;
  const points = Number(pointsRaw) || 10;
  const explanation = String(row["해설"] ?? row["explanation"] ?? "").trim() || null;
  const hint = String(row["힌트"] ?? row["hint"] ?? "").trim() || null;

  const base: ParsedQuestion = {
    question_type: (type || "short_answer") as QuestionType,
    question_text,
    options: null,
    correct_answer,
    points,
    explanation,
    hint,
    _rowIndex: rowIndex,
  };

  if (!type) return { ...base, _error: "문항유형이 올바르지 않습니다" };
  if (!question_text) return { ...base, _error: "문제가 비어있습니다" };

  if (type === "multiple_choice_4" || type === "multiple_choice_5") {
    const count = type === "multiple_choice_4" ? 4 : 5;
    const opts: string[] = [];
    for (let i = 1; i <= count; i++) {
      const v = String(row[`보기${i}`] ?? row[`option${i}`] ?? "").trim();
      if (!v) return { ...base, _error: `보기${i}이(가) 비어있습니다` };
      opts.push(v);
    }
    base.options = opts;
    if (!correct_answer) return { ...base, _error: "정답이 비어있습니다" };
    if (!opts.includes(correct_answer)) return { ...base, _error: "정답이 보기 목록에 없습니다" };
  } else if (type === "ox") {
    base.options = ["O", "X"];
    const ans = correct_answer.toUpperCase();
    if (ans !== "O" && ans !== "X") return { ...base, _error: "OX 정답은 O 또는 X여야 합니다" };
    base.correct_answer = ans;
  } else if (type === "short_answer") {
    if (!correct_answer) return { ...base, _error: "단답형 정답이 비어있습니다" };
  }
  // essay: no validation needed for answer

  return base;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assessmentId: string;
  startOrderIndex: number;
}

export default function BulkQuestionUploadDialog({ open, onOpenChange, assessmentId, startOrderIndex }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [parsed, setParsed] = useState<ParsedQuestion[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setParsed([]);
    setFileName("");
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const result = rows
        .filter(r => Object.values(r).some(v => String(v ?? "").trim() !== ""))
        .map((r, i) => parseRow(r, i + 2)); // +2: header row + 1-index
      setParsed(result);
      if (result.length === 0) {
        toast({ title: "빈 파일", description: "유효한 데이터가 없습니다.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "파일 읽기 실패", description: err.message, variant: "destructive" });
    } finally {
      e.target.value = "";
    }
  };

  const validRows = parsed.filter(p => !p._error);
  const errorRows = parsed.filter(p => p._error);

  const handleUpload = async () => {
    if (validRows.length === 0) return;
    setUploading(true);
    try {
      const payload = validRows.map((q, i) => ({
        assessment_id: assessmentId,
        question_type: q.question_type,
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        points: q.points,
        explanation: q.explanation,
        hint: q.hint,
        order_index: startOrderIndex + i,
      }));
      const { error } = await supabase.from("assessment_questions").insert(payload);
      if (error) throw error;
      toast({ title: "등록 완료", description: `${validRows.length}개 문항이 추가되었습니다.` });
      queryClient.invalidateQueries({ queryKey: ["assessment-questions", assessmentId] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            엑셀 일괄 등록
          </DialogTitle>
          <DialogDescription className="text-xs">
            템플릿을 다운로드하여 작성한 후 업로드하세요. 한국어 기준으로 등록되며, 다국어 번역은 등록 후 개별 문항에서 가능합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <p className="font-medium">1단계. 템플릿 다운로드</p>
                <p className="text-xs text-muted-foreground mt-0.5">엑셀 양식에 문항을 작성하세요</p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1">
                <Download className="h-3.5 w-3.5" />
                템플릿
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-dashed p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <p className="font-medium">2단계. 작성된 엑셀 업로드</p>
                <p className="text-xs text-muted-foreground mt-0.5">.xlsx 파일을 선택하세요</p>
              </div>
              <label className="cursor-pointer">
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
                <span className="inline-flex items-center gap-1 rounded-md border bg-background px-3 h-8 text-xs hover:bg-accent">
                  <Upload className="h-3.5 w-3.5" />
                  파일 선택
                </span>
              </label>
            </div>
            {fileName && (
              <p className="text-xs text-muted-foreground truncate">📄 {fileName}</p>
            )}
          </div>

          {parsed.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  유효 {validRows.length}개
                </span>
                {errorRows.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    오류 {errorRows.length}개
                  </span>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">행</th>
                      <th className="px-2 py-1.5 text-left">유형</th>
                      <th className="px-2 py-1.5 text-left">문제</th>
                      <th className="px-2 py-1.5 text-left">정답</th>
                      <th className="px-2 py-1.5 text-left">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((p, i) => (
                      <tr key={i} className={`border-t ${p._error ? "bg-destructive/5" : ""}`}>
                        <td className="px-2 py-1.5">{p._rowIndex}</td>
                        <td className="px-2 py-1.5">{p.question_type}</td>
                        <td className="px-2 py-1.5 max-w-[200px] truncate">{p.question_text || "-"}</td>
                        <td className="px-2 py-1.5 max-w-[120px] truncate">{p.correct_answer || "-"}</td>
                        <td className="px-2 py-1.5">
                          {p._error ? (
                            <span className="text-destructive">{p._error}</span>
                          ) : (
                            <span className="text-green-600">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleUpload} disabled={validRows.length === 0 || uploading}>
            {uploading ? "등록 중..." : `${validRows.length}개 문항 등록`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
