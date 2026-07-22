import { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type QuestionType = "multiple_choice_4" | "multiple_choice_5" | "short_answer" | "essay" | "ox";

type LangCode = "en" | "ja" | "zh-CN" | "yue";
const EXTRA_LANGS: { code: LangCode; suffix: string; label: string }[] = [
  { code: "en", suffix: "EN", label: "English" },
  { code: "ja", suffix: "JA", label: "日本語" },
  { code: "zh-CN", suffix: "ZH", label: "简体中文" },
];

interface I18nFields {
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  hint: string | null;
}

interface ParsedQuestion {
  question_type: QuestionType;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  points: number;
  explanation: string | null;
  hint: string | null;
  i18n: Partial<Record<LangCode, I18nFields>>;
  _rowIndex: number;
  _error?: string;
  _langInfo: string;
}

const TYPE_MAP: Record<string, QuestionType> = {
  "4지선다": "multiple_choice_4",
  "사지선다": "multiple_choice_4",
  "객관식4": "multiple_choice_4",
  "객관식": "multiple_choice_4",
  "multiple_choice_4": "multiple_choice_4",
  "5지선다": "multiple_choice_5",
  "오지선다": "multiple_choice_5",
  "객관식5": "multiple_choice_5",
  "multiple_choice_5": "multiple_choice_5",
  "ox": "ox",
  "OX": "ox",
  "O/X": "ox",
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

function s(v: any): string {
  return String(v ?? "").trim();
}

function downloadTemplate() {
  const headers = [
    "문항유형", "문제", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "배점", "해설", "힌트",
  ];
  for (const lang of EXTRA_LANGS) {
    headers.push(
      `문제_${lang.suffix}`,
      `보기1_${lang.suffix}`, `보기2_${lang.suffix}`, `보기3_${lang.suffix}`, `보기4_${lang.suffix}`, `보기5_${lang.suffix}`,
      `정답_${lang.suffix}`, `해설_${lang.suffix}`, `힌트_${lang.suffix}`,
    );
  }
  const examples = [
    [
      "4지선다", "대한민국의 수도는?", "서울", "부산", "대구", "인천", "", "서울", 10, "대한민국의 수도는 서울입니다.", "",
      "What is the capital of South Korea?", "Seoul", "Busan", "Daegu", "Incheon", "", "Seoul", "The capital of South Korea is Seoul.", "",
      "韓国の首都はどこですか?", "ソウル", "釜山", "大邱", "仁川", "", "ソウル", "韓国の首都はソウルです。", "",
      "韩国的首都是?", "首尔", "釜山", "大邱", "仁川", "", "首尔", "韩国的首都是首尔。", "",
    ],
    [
      "OX", "지구는 둥글다.", "", "", "", "", "", "O", 10, "", "",
      "The Earth is round.", "", "", "", "", "", "O", "", "",
      "地球は丸い。", "", "", "", "", "", "O", "", "",
      "地球是圆的。", "", "", "", "", "", "O", "", "",
    ],
    [
      "단답형", "한국의 수도는?", "", "", "", "", "", "서울", 10, "", "",
      "Capital of Korea?", "", "", "", "", "", "Seoul", "", "",
      "韓国の首都は?", "", "", "", "", "", "ソウル", "", "",
      "韩国的首都?", "", "", "", "", "", "首尔", "", "",
    ],
  ];
  const guide = [
    ["[작성 가이드 - 다국어 평가 문항 일괄 등록]"],
    [""],
    ["■ 한국어(기본)"],
    ["문항유형: 4지선다 / 5지선다 / OX / 단답형 / 서술형"],
    ["보기1~5: 객관식(4지선다/5지선다)일 때만 입력. OX/단답형/서술형은 비워두세요."],
    ["정답: 객관식은 보기 텍스트와 정확히 일치, OX는 O 또는 X, 단답형은 정답 텍스트, 서술형은 비워두세요."],
    ["배점: 숫자(기본 10)"],
    ["해설/힌트: 선택사항"],
    [""],
    ["■ 다국어 (EN / JA / ZH)"],
    ["문제_EN, 보기1_EN ~ 보기5_EN, 정답_EN, 해설_EN, 힌트_EN  (영어)"],
    ["문제_JA, 보기1_JA ~ 보기5_JA, 정답_JA, 해설_JA, 힌트_JA  (일본어)"],
    ["문제_ZH, 보기1_ZH ~ 보기5_ZH, 정답_ZH, 해설_ZH, 힌트_ZH  (간체중문)"],
    [""],
    ["■ 규칙"],
    ["1. 문항유형/배점은 한국어 기준으로 1개만 입력합니다 (다국어 공통)."],
    ["2. 다국어 컬럼이 비어 있으면 해당 언어 번역은 생성되지 않습니다 (등록 후 개별 편집 또는 자동 번역으로 채울 수 있음)."],
    ["3. 객관식 정답은 해당 언어의 보기 텍스트와 정확히 일치해야 합니다."],
    ["4. OX 정답은 모든 언어에서 O 또는 X (대문자) 로 입력하세요."],
  ];

  // Build sheet
  const aoa = [headers, ...examples];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map(() => ({ wch: 18 }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as any;
  ws["!rows"] = [{ hpt: 28 }];

  // Color groups: KO (charcoal), EN (blue), JA (rose), ZH (amber)
  // Light fill for body rows, darker fill + white text for header row
  const GROUPS = [
    { name: "KO", start: 0, end: 10, header: "2D2D2D", body: "F4F1EC" }, // charcoal / cream
    { name: "EN", start: 11, end: 19, header: "1E40AF", body: "E0E7FF" }, // blue
    { name: "JA", start: 20, end: 28, header: "BE185D", body: "FCE7F3" }, // rose
    { name: "ZH", start: 29, end: 37, header: "B45309", body: "FEF3C7" }, // amber
  ];

  const headerBase = {
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "맑은 고딕" },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "FFFFFF" } },
      bottom: { style: "thin", color: { rgb: "FFFFFF" } },
      left: { style: "thin", color: { rgb: "FFFFFF" } },
      right: { style: "thin", color: { rgb: "FFFFFF" } },
    },
  } as any;

  const bodyBase = {
    alignment: { vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "E5E7EB" } },
      bottom: { style: "thin", color: { rgb: "E5E7EB" } },
      left: { style: "thin", color: { rgb: "E5E7EB" } },
      right: { style: "thin", color: { rgb: "E5E7EB" } },
    },
    font: { name: "맑은 고딕", sz: 10 },
  } as any;

  const totalRows = aoa.length;
  for (const g of GROUPS) {
    for (let c = g.start; c <= g.end; c++) {
      for (let r = 0; r < totalRows; r++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        if (r === 0) {
          ws[addr].s = { ...headerBase, fill: { patternType: "solid", fgColor: { rgb: g.header } } };
        } else {
          ws[addr].s = { ...bodyBase, fill: { patternType: "solid", fgColor: { rgb: g.body } } };
        }
      }
    }
  }

  // Guide sheet with section styling
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide["!cols"] = [{ wch: 95 }];
  const guideSectionFills: Record<number, string> = {
    0: "2D2D2D", // title
    2: "F4F1EC", // KO heading
    10: "E0E7FF", // EN/JA/ZH heading area marker
    14: "FFF7ED", // Rules heading
  };
  guide.forEach((_, idx) => {
    const addr = XLSX.utils.encode_cell({ r: idx, c: 0 });
    if (!wsGuide[addr]) return;
    const isTitle = idx === 0;
    wsGuide[addr].s = {
      font: {
        name: "맑은 고딕",
        sz: isTitle ? 13 : 10,
        bold: isTitle || guideSectionFills[idx] !== undefined,
        color: { rgb: isTitle ? "FFFFFF" : "1F2937" },
      },
      alignment: { vertical: "center", wrapText: true },
      ...(guideSectionFills[idx]
        ? { fill: { patternType: "solid", fgColor: { rgb: guideSectionFills[idx] } } }
        : {}),
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "문항");
  XLSX.utils.book_append_sheet(wb, wsGuide, "작성가이드");
  XLSX.writeFile(wb, "평가문항_다국어_업로드_템플릿.xlsx");
}

function parseLangFields(row: any, suffix: string, type: QuestionType): I18nFields | null {
  const qt = s(row[`문제_${suffix}`]);
  const ca = s(row[`정답_${suffix}`]);
  const exp = s(row[`해설_${suffix}`]) || null;
  const hint = s(row[`힌트_${suffix}`]) || null;
  const opts: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const v = s(row[`보기${i}_${suffix}`]);
    if (v) opts.push(v);
  }
  // Only create i18n row if at least the question text is provided
  if (!qt) return null;

  let options: string[] | null = null;
  if (type === "multiple_choice_4" || type === "multiple_choice_5") {
    options = opts.length > 0 ? opts : null;
  } else if (type === "ox") {
    options = ["O", "X"];
  }

  return {
    question_text: qt,
    options,
    correct_answer: type === "ox" ? ca.toUpperCase() : ca,
    explanation: exp,
    hint,
  };
}

function parseRow(row: any, rowIndex: number): ParsedQuestion {
  const type = normalizeType(row["문항유형"] ?? row["유형"] ?? row["question_type"]);
  const question_text = s(row["문제"] ?? row["question_text"]);
  const correct_answer_raw = row["정답"] ?? row["correct_answer"] ?? "";
  const correct_answer = s(correct_answer_raw);
  const pointsRaw = row["배점"] ?? row["points"] ?? 10;
  const points = Number(pointsRaw) || 10;
  const explanation = s(row["해설"] ?? row["explanation"]) || null;
  const hint = s(row["힌트"] ?? row["hint"]) || null;

  const base: ParsedQuestion = {
    question_type: (type || "short_answer") as QuestionType,
    question_text,
    options: null,
    correct_answer,
    points,
    explanation,
    hint,
    i18n: {},
    _rowIndex: rowIndex,
    _langInfo: "KO",
  };

  if (!type) return { ...base, _error: "문항유형이 올바르지 않습니다" };
  if (!question_text) return { ...base, _error: "문제가 비어있습니다" };

  if (type === "multiple_choice_4" || type === "multiple_choice_5") {
    const count = type === "multiple_choice_4" ? 4 : 5;
    const opts: string[] = [];
    for (let i = 1; i <= count; i++) {
      const v = s(row[`보기${i}`] ?? row[`option${i}`]);
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

  // Parse extra languages
  const found: string[] = ["KO"];
  for (const lang of EXTRA_LANGS) {
    const fields = parseLangFields(row, lang.suffix, type);
    if (fields) {
      // Validate options for MCQ
      if ((type === "multiple_choice_4" || type === "multiple_choice_5")) {
        const need = type === "multiple_choice_4" ? 4 : 5;
        if (!fields.options || fields.options.length !== need) {
          return { ...base, _error: `[${lang.suffix}] 보기 ${need}개가 모두 필요합니다` };
        }
        if (!fields.correct_answer) {
          return { ...base, _error: `[${lang.suffix}] 정답이 비어있습니다` };
        }
        if (!fields.options.includes(fields.correct_answer)) {
          return { ...base, _error: `[${lang.suffix}] 정답이 보기 목록에 없습니다` };
        }
      } else if (type === "ox") {
        if (fields.correct_answer !== "O" && fields.correct_answer !== "X") {
          return { ...base, _error: `[${lang.suffix}] OX 정답은 O 또는 X여야 합니다` };
        }
      } else if (type === "short_answer") {
        if (!fields.correct_answer) {
          return { ...base, _error: `[${lang.suffix}] 단답형 정답이 비어있습니다` };
        }
      }
      base.i18n[lang.code] = fields;
      found.push(lang.suffix);
    }
  }
  base._langInfo = found.join("/");

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
        .map((r, i) => parseRow(r, i + 2));
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
  const i18nCount = validRows.reduce((sum, p) => sum + Object.keys(p.i18n).length, 0);

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
      const { data: inserted, error } = await supabase
        .from("assessment_questions")
        .insert(payload)
        .select("id, order_index");
      if (error) throw error;

      // Build i18n rows. Map by order_index to find the matching inserted row.
      const orderToId = new Map<number, string>();
      (inserted || []).forEach((r: any) => orderToId.set(r.order_index, r.id));

      // Also write KO i18n row so all four languages are populated by default
      const i18nRows: any[] = [];
      validRows.forEach((q, i) => {
        const oi = startOrderIndex + i;
        const qid = orderToId.get(oi);
        if (!qid) return;
        // KO base row
        i18nRows.push({
          question_id: qid,
          language_code: "ko",
          question_text: q.question_text,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
          hint: q.hint,
        });
        for (const lang of EXTRA_LANGS) {
          const f = q.i18n[lang.code];
          if (!f) continue;
          i18nRows.push({
            question_id: qid,
            language_code: lang.code,
            question_text: f.question_text,
            options: f.options,
            correct_answer: f.correct_answer,
            explanation: f.explanation,
            hint: f.hint,
          });
        }
      });

      if (i18nRows.length > 0) {
        for (let i = 0; i < i18nRows.length; i += 100) {
          const chunk = i18nRows.slice(i, i + 100);
          const { error: ie } = await supabase
            .from("assessment_question_i18n" as any)
            .upsert(chunk, { onConflict: "question_id,language_code" });
          if (ie) console.error("i18n upsert error", ie);
        }
      }

      toast({
        title: "등록 완료",
        description: `${validRows.length}개 문항 / 다국어 ${i18nCount}건이 추가되었습니다.`,
      });
      queryClient.invalidateQueries({ queryKey: ["assessment-questions", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assessment-question-i18n-all"] });
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
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            엑셀 일괄 등록 (다국어 지원)
          </DialogTitle>
          <DialogDescription className="text-xs">
            하나의 엑셀로 한국어 + 영어(EN) + 일본어(JA) + 간체중문(ZH) 문항을 동시에 등록할 수 있습니다.
            다국어 컬럼이 비어 있으면 해당 언어는 건너뜁니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-4 flex items-center justify-between gap-2">
            <div className="text-sm">
              <p className="font-medium">1단계. 다국어 템플릿 다운로드</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                문제/보기/정답/해설/힌트 컬럼에 _EN, _JA, _ZH 접미사로 다국어 입력
              </p>
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

          {parsed.length > 0 && (
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
                <span className="text-muted-foreground">다국어 번역 {i18nCount}건</span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">행</th>
                      <th className="px-2 py-1.5 text-left">유형</th>
                      <th className="px-2 py-1.5 text-left">문제(KO)</th>
                      <th className="px-2 py-1.5 text-left">정답</th>
                      <th className="px-2 py-1.5 text-left">언어</th>
                      <th className="px-2 py-1.5 text-left">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((p, i) => (
                      <tr key={i} className={`border-t ${p._error ? "bg-destructive/5" : ""}`}>
                        <td className="px-2 py-1.5">{p._rowIndex}</td>
                        <td className="px-2 py-1.5">{p.question_type}</td>
                        <td className="px-2 py-1.5 max-w-[220px] truncate">{p.question_text || "-"}</td>
                        <td className="px-2 py-1.5 max-w-[100px] truncate">{p.correct_answer || "-"}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{p._langInfo}</td>
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
