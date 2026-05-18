import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

type RowResult = { row: number; email: string; status: "created" | "skipped" | "error"; message?: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

const HEADERS = ["email", "password", "full_name", "role", "department_code", "department_name", "position"];

const StaffBulkUploadDialog = ({ open, onOpenChange, onComplete }: Props) => {
  const { t } = useTranslation();
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setParsedRows([]);
    setFileName("");
    setResults(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadTemplate = () => {
    const a = document.createElement("a");
    a.href = "/templates/staff_upload_template.xlsx";
    a.download = "staff_upload_template.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setResults(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      // Normalize keys to lowercase trimmed
      const normalized = json
        .map((r) => {
          const out: any = {};
          for (const k of Object.keys(r)) {
            out[String(k).trim().toLowerCase()] = typeof r[k] === "string" ? r[k].trim() : r[k];
          }
          return out;
        })
        .filter((r) => r.email);
      if (normalized.length === 0) {
        toast.error("유효한 행이 없습니다. email 컬럼을 확인하세요.");
        return;
      }
      if (normalized.length > 500) {
        toast.error("최대 500행까지 업로드 가능합니다.");
        return;
      }
      setParsedRows(normalized);
      toast.success(`${normalized.length}개 행을 읽었습니다. 검토 후 업로드하세요.`);
    } catch (e: any) {
      toast.error("파일을 읽지 못했습니다: " + (e?.message || e));
    }
  };

  const submit = async () => {
    if (parsedRows.length === 0) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-create-users", {
        body: { rows: parsedRows },
      });
      if (error) throw error;
      const res = data as { summary: any; results: RowResult[] };
      setResults(res.results);
      toast.success(
        `완료 — 생성 ${res.summary.created} · 건너뜀 ${res.summary.skipped} · 실패 ${res.summary.errors}`,
      );
      onComplete?.();
    } catch (e: any) {
      toast.error("업로드 실패: " + (e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const downloadResults = () => {
    if (!results) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "results");
    XLSX.writeFile(wb, "staff_upload_results.xlsx");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> 직원 일괄 업로드
          </DialogTitle>
          <DialogDescription>
            엑셀 양식(.xlsx)을 다운로드하여 작성한 뒤 업로드하면 한 번에 여러 직원 계정을 생성합니다. (1회 최대 500행)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="rounded-xl gap-2">
              <Download className="h-4 w-4" /> 양식 다운로드
            </Button>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="rounded-xl gap-2"
            >
              <Upload className="h-4 w-4" /> 엑셀 파일 선택
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {fileName && (
            <p className="text-xs text-muted-foreground">
              파일: <span className="font-medium text-foreground">{fileName}</span> · 읽은 행: {parsedRows.length}
            </p>
          )}

          {parsedRows.length > 0 && !results && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-accent/30 sticky top-0">
                    <tr>
                      {HEADERS.map((h) => (
                        <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {HEADERS.map((h) => (
                          <td key={h} className="px-2 py-1.5 text-muted-foreground">
                            {h === "password" ? "••••" : String(r[h] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 50 && (
                <p className="text-[11px] text-muted-foreground p-2 border-t border-border">
                  미리보기는 처음 50행만 표시합니다. 실제 업로드는 전체 {parsedRows.length}행이 처리됩니다.
                </p>
              )}
            </div>
          )}

          {results && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">처리 결과</p>
                <Button variant="outline" size="sm" onClick={downloadResults} className="rounded-full gap-1.5">
                  <Download className="h-3.5 w-3.5" /> 결과 다운로드
                </Button>
              </div>
              <div className="border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-accent/30 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">행</th>
                      <th className="px-2 py-2 text-left">이메일</th>
                      <th className="px-2 py-2 text-left">상태</th>
                      <th className="px-2 py-2 text-left">메시지</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5">{r.row}</td>
                        <td className="px-2 py-1.5">{r.email}</td>
                        <td className="px-2 py-1.5">
                          {r.status === "created" && (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" /> 생성
                            </span>
                          )}
                          {r.status === "skipped" && (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <AlertCircle className="h-3 w-3" /> 건너뜀
                            </span>
                          )}
                          {r.status === "error" && (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <XCircle className="h-3 w-3" /> 실패
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.message || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
              닫기
            </Button>
            {!results && (
              <Button
                onClick={submit}
                disabled={parsedRows.length === 0 || submitting}
                className="rounded-xl"
              >
                {submitting ? "업로드 중..." : `${parsedRows.length}개 업로드`}
              </Button>
            )}
            {results && (
              <Button onClick={reset} className="rounded-xl">
                새로 업로드
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StaffBulkUploadDialog;
