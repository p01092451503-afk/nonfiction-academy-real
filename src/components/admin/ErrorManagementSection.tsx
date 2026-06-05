import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon, Bug, ChevronDown, Copy, Loader2, RefreshCcw, Sparkles, CheckCircle2,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ErrorStatus = "open" | "in_progress" | "resolved" | "ignored";

interface ErrorRow {
  id: string;
  fingerprint: string;
  message: string;
  source: string | null;
  url: string | null;
  stack: string | null;
  severity: string | null;
  occurrence_count: number | null;
  user_email: string | null;
  last_alerted_at: string;
  created_at: string;
  status: ErrorStatus;
  admin_notes: string | null;
  ai_explanation: string | null;
  ai_lovable_prompt: string | null;
  ai_generated_at: string | null;
  resolved_at: string | null;
}

const STATUS_META: Record<ErrorStatus, { label: string; className: string }> = {
  open:        { label: "미해결",   className: "text-destructive border-destructive/40" },
  in_progress: { label: "작업중",   className: "text-warning border-warning/40" },
  resolved:    { label: "해결됨",   className: "text-success border-success/40" },
  ignored:     { label: "무시",     className: "text-muted-foreground border-border" },
};

const STATUS_OPTIONS: ErrorStatus[] = ["open", "in_progress", "resolved", "ignored"];

// 신호등 단계: 긴급(빨강) / 주의(노랑) / 정보(초록)
type Sev = "urgent" | "warning" | "info";
const SEV_META: Record<Sev, { label: string; dot: string; ring: string; text: string }> = {
  urgent:  { label: "긴급", dot: "bg-destructive",                ring: "ring-destructive/30",          text: "text-destructive" },
  warning: { label: "주의", dot: "bg-warning",                    ring: "ring-warning/30",              text: "text-warning" },
  info:    { label: "정보", dot: "bg-success",                    ring: "ring-success/30",              text: "text-success" },
};

const detectSeverity = (row: { severity: string | null; message: string; occurrence_count: number | null; stack: string | null }): Sev => {
  const raw = (row.severity || "").toLowerCase();
  if (["critical", "fatal", "urgent", "high", "error"].includes(raw)) {
    // 'error'는 메시지 분석으로 한 번 더 분류
    if (raw !== "error") return "urgent";
  }
  if (["warning", "warn", "medium"].includes(raw)) return "warning";
  if (["info", "low", "debug"].includes(raw)) return "info";

  const text = `${row.message}\n${row.stack ?? ""}`.toLowerCase();
  const urgentPatterns = [
    "referenceerror", "typeerror", "syntaxerror", "rangeerror",
    "cannot read", "is not defined", "is not a function", "undefined is not",
    "failed to fetch", "network error", "500", "503", "crash", "unhandled",
    "permission denied", "rls", "auth session missing",
  ];
  const warnPatterns = ["warn", "deprecat", "slow", "timeout", "404", "abort", "retry"];
  if (urgentPatterns.some((p) => text.includes(p))) return "urgent";
  if (warnPatterns.some((p) => text.includes(p))) return "warning";
  if ((row.occurrence_count ?? 1) >= 10) return "urgent";
  if ((row.occurrence_count ?? 1) >= 3) return "warning";
  return "info";
};

// 테스트 / 더미 / Slack 테스트 등을 탐지
const TEST_PATTERNS = [
  "\u{1F9EA}",          // 🧪
  "test",
  "dummy",
  "slack test",
  "슬랙 테스트",
  "hello from slack",
  "sample error",
  "에러 테스트",
  "오류 테스트",
];

const isTestRow = (row: ErrorRow): boolean => {
  const hay = `${row.message}\n${row.stack ?? ""}\n${row.source ?? ""}`.toLowerCase();
  return TEST_PATTERNS.some((p) => hay.includes(p.toLowerCase()));
};

const fallbackCopy = (text: string): boolean => {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

const copy = async (text: string, label = "복사됨") => {
  let success = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      success = true;
    }
  } catch {
    success = false;
  }
  if (!success) success = fallbackCopy(text);
  if (success) {
    toast({ title: label, description: `${text.length}자가 클립보드에 복사되었습니다.` });
  } else {
    toast({
      title: "자동 복사 실패",
      description: "아래 텍스트 영역에서 수동으로 복사(Ctrl/Cmd+C)해 주세요.",
      variant: "destructive",
    });
    // 수동 복사 가능하도록 prompt 띄움
    try { window.prompt("아래 내용을 복사하세요 (Ctrl/Cmd+C → Enter):", text); } catch {}
  }
};

const ErrorManagementSection = () => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ErrorStatus | "all">("open");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["error-alert-log", filter],
    queryFn: async () => {
      let q = supabase
        .from("error_alert_log")
        .select("*")
        .order("last_alerted_at", { ascending: false })
        .limit(100);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ErrorRow[];
    },
    staleTime: 30_000,
  });

  // counts for the filter chips
  const { data: counts } = useQuery({
    queryKey: ["error-alert-log-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("error_alert_log")
        .select("status")
        .limit(1000);
      if (error) throw error;
      const c: Record<string, number> = { all: data?.length ?? 0, open: 0, in_progress: 0, resolved: 0, ignored: 0 };
      (data ?? []).forEach((r: any) => { c[r.status] = (c[r.status] ?? 0) + 1; });
      return c;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    // initialize notes drafts from server
    const next: Record<string, string> = {};
    rows.forEach((r) => { next[r.id] = r.admin_notes ?? ""; });
    setNotesDraft((prev) => ({ ...next, ...prev }));
  }, [rows]);

  const updateRow = async (id: string, patch: Partial<ErrorRow>) => {
    const payload: any = { ...patch };
    if (patch.status === "resolved") payload.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("error_alert_log").update(payload).eq("id", id);
    if (error) {
      toast({ title: "업데이트 실패", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["error-alert-log"] });
    qc.invalidateQueries({ queryKey: ["error-alert-log-counts"] });
  };

  const analyze = async (row: ErrorRow) => {
    setAnalyzing((p) => ({ ...p, [row.id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean; explanation: string; lovable_prompt: string; error?: string;
      }>("error-analyze", { body: { error_id: row.id } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "분석 실패");
      toast({ title: "AI 분석 완료", description: "원인 설명과 작업 프롬프트가 생성되었습니다." });
      qc.invalidateQueries({ queryKey: ["error-alert-log"] });
      setExpanded((p) => ({ ...p, [row.id]: true }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "AI 분석 실패", description: msg, variant: "destructive" });
    } finally {
      setAnalyzing((p) => ({ ...p, [row.id]: false }));
    }
  };

  const [bulkIgnoring, setBulkIgnoring] = useState(false);

  const testRows = useMemo(() => rows.filter(isTestRow), [rows]);

  const bulkIgnoreTests = async () => {
    if (testRows.length === 0) return;
    setBulkIgnoring(true);
    try {
      const ids = testRows.map((r) => r.id);
      const { error } = await supabase
        .from("error_alert_log")
        .update({ status: "ignored", resolved_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      toast({ title: "일괄 무시 완료", description: `${ids.length}건의 테스트/더미 오류를 무시 처리했습니다.` });
      qc.invalidateQueries({ queryKey: ["error-alert-log"] });
      qc.invalidateQueries({ queryKey: ["error-alert-log-counts"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "일괄 무시 실패", description: msg, variant: "destructive" });
    } finally {
      setBulkIgnoring(false);
    }
  };

  const buildFallbackPrompt = (row: ErrorRow) =>
    `다음 운영 오류를 추적하고 수정해줘.\n\n` +
    `[메시지]\n${row.message}\n\n` +
    `[URL]\n${row.url ?? "(없음)"}\n\n` +
    `[스택]\n${row.stack ?? "(없음)"}\n\n` +
    `요구사항:\n` +
    `1) 추정 원인 파일/함수를 찾아 안전 가드(null/optional chaining/권한 체크)를 추가해줘.\n` +
    `2) 재현 시나리오와 회귀 방지 체크리스트를 함께 제시해줘.\n` +
    `3) RLS/권한이 관련된다면 정책도 함께 점검해줘.`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-destructive" />
            운영 오류 관리 (Slack 연동)
          </h2>
          <div className="flex items-center gap-1">
            {(["open", "in_progress", "resolved", "ignored", "all"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                  filter === k
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {k === "all" ? "전체" : STATUS_META[k as ErrorStatus].label}
                <span className="ml-1 tabular-nums">{counts?.[k] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="h-7 text-xs">
          {isLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCcw className="h-3 w-3 mr-1" />}
          새로고침
        </Button>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 flex items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> 오류 목록 불러오는 중...
        </CardContent></Card>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          {filter === "open" ? "미해결 오류가 없습니다." : "표시할 오류가 없습니다."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const isOpen = expanded[row.id];
            const meta = STATUS_META[row.status];
            const busy = !!analyzing[row.id];
            const sev = detectSeverity(row);
            const sevMeta = SEV_META[sev];
            return (
              <Card key={row.id}>
                <CardHeader className="p-4 cursor-pointer" onClick={() => setExpanded((p) => ({ ...p, [row.id]: !p[row.id] }))}>
                  <div className="flex items-start gap-3">
                    {/* 신호등 (긴급/주의/정보) */}
                    <span
                      title={`민감도: ${sevMeta.label}`}
                      className={cn(
                        "shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full ring-4",
                        sevMeta.ring
                      )}
                    >
                      <span className={cn("h-3 w-3 rounded-full", sevMeta.dot)} />
                    </span>
                    <span className="rounded-md p-1.5 shrink-0 bg-destructive/10">
                      <Bug className="h-4 w-4 text-destructive" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] font-semibold", sevMeta.text, "border-current")}>
                          {sevMeta.label}
                        </Badge>
                        <CardTitle className="text-sm font-medium truncate max-w-full">
                          {row.message.split("\n")[0]}
                        </CardTitle>
                        <Badge variant="outline" className={cn("text-[10px]", meta.className)}>
                          {meta.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {row.occurrence_count ?? 1}회 발생
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 truncate">
                        {row.url || "-"} · {new Date(row.last_alerted_at).toLocaleString("ko-KR")} · {row.user_email || "비로그인"}
                      </p>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")} />
                  </div>
                </CardHeader>

                {isOpen && (
                  <CardContent className="px-4 pb-4 pt-0 space-y-3">
                    {/* Status + actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">상태</span>
                      <Select value={row.status} onValueChange={(v) => updateRow(row.id, { status: v as ErrorStatus })}>
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => analyze(row)} disabled={busy}
                      >
                        {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                        {row.ai_generated_at ? "AI 재분석" : "AI 분석 실행"}
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => copy(row.ai_lovable_prompt || buildFallbackPrompt(row), "AI 수정 프롬프트 복사됨")}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        AI 수정 프롬프트 복사
                      </Button>
                    </div>

                    {/* AI explanation */}
                    {row.ai_explanation ? (
                      <div className="bg-muted/40 rounded-md p-3 text-xs whitespace-pre-wrap leading-relaxed">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> AI 설명
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {row.ai_generated_at && new Date(row.ai_generated_at).toLocaleString("ko-KR")}
                          </span>
                        </div>
                        {row.ai_explanation}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">
                        AI 분석을 실행하면 오류 원인 설명과 AI 수정 프롬프트가 자동 생성됩니다.
                      </div>
                    )}

                    {/* AI fix prompt */}
                    {row.ai_lovable_prompt && (
                      <div className="border border-border rounded-md p-3 bg-background">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold flex items-center gap-1">
                            <Copy className="h-3 w-3" /> AI 수정 프롬프트
                          </span>
                          <Button
                            size="sm" variant="ghost" className="h-6 text-[11px]"
                            onClick={() => copy(row.ai_lovable_prompt!, "AI 수정 프롬프트 복사됨")}
                          >
                            복사
                          </Button>
                        </div>
                        <pre className="text-[11px] whitespace-pre-wrap leading-relaxed font-mono text-foreground/90">
                          {row.ai_lovable_prompt}
                        </pre>
                      </div>
                    )}

                    {/* Stack */}
                    {row.stack && (
                      <details className="text-[11px]">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">스택 트레이스 보기</summary>
                        <pre className="mt-1.5 bg-muted/60 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono">
                          {row.stack}
                        </pre>
                      </details>
                    )}

                    {/* Admin notes */}
                    <div>
                      <label className="text-[11px] text-muted-foreground">관리자 메모</label>
                      <Textarea
                        rows={2}
                        value={notesDraft[row.id] ?? ""}
                        onChange={(e) => setNotesDraft((p) => ({ ...p, [row.id]: e.target.value }))}
                        onBlur={() => {
                          const v = notesDraft[row.id] ?? "";
                          if (v !== (row.admin_notes ?? "")) updateRow(row.id, { admin_notes: v });
                        }}
                        placeholder="조치 내용·원인·후속 작업 등을 기록하세요."
                        className="mt-1 text-xs"
                      />
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ErrorManagementSection;
