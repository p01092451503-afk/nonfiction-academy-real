import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCcw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Severity = "ok" | "warning" | "error";
type Category = "data" | "media" | "i18n" | "security" | "ops";

interface Finding {
  rowId?: string;
  label: string;
  detail?: string;
  meta?: Record<string, unknown>;
}

interface CheckResult {
  id: string;
  category: Category;
  title: string;
  description: string;
  severity: Severity;
  count: number;
  findings: Finding[];
  durationMs: number;
  error?: string;
  suggestion?: string;
}

interface ScanResponse {
  summary: {
    ok: number; warning: number; error: number;
    totalFindings: number; scannedAt: string; durationMs: number;
  };
  results: CheckResult[];
}

const CATEGORY_LABEL: Record<Category, string> = {
  data: "데이터 무결성",
  media: "미디어/콘텐츠",
  i18n: "다국어",
  security: "보안",
  ops: "운영",
};

const severityStyles: Record<Severity, { bg: string; text: string; icon: typeof CheckCircle2; label: string }> = {
  ok: { bg: "bg-success/10", text: "text-success", icon: CheckCircle2, label: "정상" },
  warning: { bg: "bg-warning/10", text: "text-warning", icon: AlertTriangle, label: "경고" },
  error: { bg: "bg-destructive/10", text: "text-destructive", icon: ShieldAlert, label: "오류" },
};

const AdminPlatformHealth = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const runScan = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke<ScanResponse>("platform-scan", { body: {} });
      if (error) throw error;
      if (!res) throw new Error("응답 없음");
      setData(res);
      toast({ title: "스캔 완료", description: `총 ${res.summary.totalFindings}건의 점검 결과가 있습니다.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "스캔 실패", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runScan(); /* initial */ /* eslint-disable-next-line */ }, []);

  const grouped = useMemo(() => {
    const map = new Map<Category, CheckResult[]>();
    for (const r of data?.results ?? []) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return map;
  }, [data]);

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              플랫폼 자가진단
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              데이터 무결성·미디어·다국어·보안 항목을 한 번에 점검합니다. (읽기 전용)
            </p>
          </div>
          <Button onClick={runScan} disabled={loading} className="shrink-0">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
            다시 스캔
          </Button>
        </div>

        {/* Summary */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["ok", "warning", "error"] as Severity[]).map((s) => {
              const st = severityStyles[s];
              const Icon = st.icon;
              return (
                <Card key={s}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <span className={cn("rounded-lg p-2", st.bg)}>
                      <Icon className={cn("h-5 w-5", st.text)} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{st.label} 항목</div>
                      <div className="text-2xl font-bold tabular-nums">{data.summary[s]}</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">전체 발견</div>
                <div className="text-2xl font-bold tabular-nums">{data.summary.totalFindings}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {new Date(data.summary.scannedAt).toLocaleString("ko-KR")} · {data.summary.durationMs}ms
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Loading state */}
        {loading && !data && (
          <Card><CardContent className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 스캔 실행 중...
          </CardContent></Card>
        )}

        {/* Results by category */}
        {data && Array.from(grouped.entries()).map(([cat, checks]) => (
          <div key={cat} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {CATEGORY_LABEL[cat]}
            </h2>
            <div className="space-y-2">
              {checks.map((c) => {
                const st = severityStyles[c.severity];
                const Icon = st.icon;
                const isOpen = expanded[c.id];
                const hasDetails = c.count > 0 || !!c.error;
                return (
                  <Card key={c.id}>
                    <CardHeader className="p-4 cursor-pointer" onClick={() => hasDetails && toggle(c.id)}>
                      <div className="flex items-start gap-3">
                        <span className={cn("rounded-md p-1.5 shrink-0", st.bg)}>
                          <Icon className={cn("h-4 w-4", st.text)} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-base">{c.title}</CardTitle>
                            <Badge variant="outline" className={cn("text-[10px]", st.text)}>
                              {st.label} · {c.count}건
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">{c.durationMs}ms</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                        </div>
                        {hasDetails && (
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")} />
                        )}
                      </div>
                    </CardHeader>
                    {isOpen && hasDetails && (
                      <CardContent className="px-4 pb-4 pt-0">
                        {c.error && (
                          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2 mb-2">
                            오류: {c.error}
                          </div>
                        )}
                        {c.suggestion && (
                          <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 mb-2">
                            💡 권장 조치: {c.suggestion}
                          </div>
                        )}
                        {c.findings.length > 0 && (
                          <ul className="divide-y divide-border/60 border border-border rounded-md max-h-80 overflow-auto">
                            {c.findings.map((f, i) => (
                              <li key={i} className="px-3 py-2 text-sm flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">{f.label}</div>
                                  {f.detail && <div className="text-xs text-muted-foreground mt-0.5">{f.detail}</div>}
                                </div>
                                {f.rowId && (
                                  <code className="text-[10px] text-muted-foreground shrink-0 font-mono">
                                    {f.rowId.slice(0, 8)}
                                  </code>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {c.count > c.findings.length && (
                          <p className="text-[11px] text-muted-foreground mt-2">
                            ※ 처음 {c.findings.length}건만 표시됩니다 (총 {c.count}건).
                          </p>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default AdminPlatformHealth;
