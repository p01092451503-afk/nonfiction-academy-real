import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, Loader2,
  RefreshCcw, ShieldAlert, Wrench, Eye, History,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Severity = "ok" | "warning" | "error";
type Category = "data" | "media" | "i18n" | "security" | "ops";

interface Finding {
  rowId?: string;
  label: string;
  detail?: string;
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

interface FixPreview {
  action: string;
  mode: "preview" | "apply";
  affectedCount: number;
  preview: Array<{ id?: string; label: string; detail?: string }>;
  sqlPreview?: string;
  appliedAt?: string;
  message?: string;
}

interface TrendPoint {
  scanned_at: string;
  ok_count: number;
  warning_count: number;
  error_count: number;
  total_findings: number;
}

interface FixAudit {
  id: string;
  applied_at: string;
  check_id: string;
  affected_count: number;
  success: boolean;
  error_message: string | null;
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

// Maps a check id → the fix action key in the platform-scan-fix function.
const CHECK_TO_FIX: Record<string, { action: string; label: string; description: string }> = {
  video_source_mismatch: {
    action: "video_clear_orphan_provider",
    label: "Provider 정리",
    description: "video_url이 비어있는데 provider만 남아있는 차시들의 provider를 NULL로 비웁니다. (멱등 · 안전)",
  },
  media_package_health: {
    action: "media_unpublish_empty_packages",
    label: "빈 패키지 게시 해제",
    description: "image_package / video_package인데 항목이 0개인 게시 차시를 비공개로 전환합니다. (멱등 · 안전)",
  },
  empty_published_courses: {
    action: "course_unpublish_empty",
    label: "빈 강의 비공개",
    description: "차시가 0개인 게시 강의를 draft로 전환합니다. (멱등 · 안전)",
  },
  empty_published_assessments: {
    action: "assessment_unpublish_empty",
    label: "빈 평가 비공개",
    description: "문항이 0개인 게시 평가를 is_published=false로 전환합니다. (멱등 · 안전)",
  },
};

const AdminPlatformHealth = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [audit, setAudit] = useState<FixAudit[]>([]);
  const [fixDialog, setFixDialog] = useState<{ open: boolean; checkId: string; preview: FixPreview | null; applying: boolean }>(
    { open: false, checkId: "", preview: null, applying: false }
  );

  const runScan = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke<ScanResponse>("platform-scan", { body: {} });
      if (error) throw error;
      if (!res) throw new Error("응답 없음");
      setData(res);
      toast({ title: "스캔 완료", description: `총 ${res.summary.totalFindings}건의 점검 결과가 있습니다.` });
      await Promise.all([loadTrend(), loadAudit()]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "스캔 실패", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadTrend = async () => {
    const { data: rows } = await supabase
      .from("scan_results")
      .select("scanned_at, ok_count, warning_count, error_count, total_findings")
      .order("scanned_at", { ascending: false })
      .limit(30);
    setTrend((rows ?? []).reverse() as TrendPoint[]);
  };

  const loadAudit = async () => {
    const { data: rows } = await supabase
      .from("scan_fix_audit")
      .select("id, applied_at, check_id, affected_count, success, error_message")
      .order("applied_at", { ascending: false })
      .limit(20);
    setAudit((rows ?? []) as FixAudit[]);
  };

  useEffect(() => {
    runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const openPreview = async (checkId: string) => {
    const fix = CHECK_TO_FIX[checkId];
    if (!fix) return;
    setFixDialog({ open: true, checkId, preview: null, applying: false });
    try {
      const { data: res, error } = await supabase.functions.invoke<FixPreview>("platform-scan-fix", {
        body: { action: fix.action, mode: "preview" },
      });
      if (error) throw error;
      setFixDialog((p) => ({ ...p, preview: res ?? null }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "미리보기 실패", description: msg, variant: "destructive" });
      setFixDialog({ open: false, checkId: "", preview: null, applying: false });
    }
  };

  const applyFix = async () => {
    const fix = CHECK_TO_FIX[fixDialog.checkId];
    if (!fix) return;
    setFixDialog((p) => ({ ...p, applying: true }));
    try {
      const { data: res, error } = await supabase.functions.invoke<FixPreview>("platform-scan-fix", {
        body: { action: fix.action, mode: "apply" },
      });
      if (error) throw error;
      toast({ title: "자동 수정 완료", description: `${res?.affectedCount ?? 0}건 적용됨` });
      setFixDialog({ open: false, checkId: "", preview: null, applying: false });
      await runScan();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "적용 실패", description: msg, variant: "destructive" });
      setFixDialog((p) => ({ ...p, applying: false }));
    }
  };

  const trendData = useMemo(
    () =>
      trend.map((t) => ({
        time: new Date(t.scanned_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        오류: t.error_count,
        경고: t.warning_count,
        총발견: t.total_findings,
      })),
    [trend]
  );

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
              데이터 무결성·미디어·다국어·보안 항목을 한 번에 점검하고, 안전한 자동 수정을 적용합니다.
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

        {/* Trend chart */}
        {trendData.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                최근 스캔 추세 (최대 30회)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="오류" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="경고" stroke="hsl(var(--warning, 38 92% 50%))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="총발견" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
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
                const fix = CHECK_TO_FIX[c.id];
                const canFix = !!fix && c.count > 0;
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
                        <div className="flex items-center gap-2 shrink-0">
                          {canFix && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={(e) => { e.stopPropagation(); openPreview(c.id); }}
                            >
                              <Wrench className="h-3 w-3 mr-1" />
                              자동 수정
                            </Button>
                          )}
                          {hasDetails && (
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                          )}
                        </div>
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

        {/* Audit history */}
        {audit.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                자동 수정 이력 (최근 20건)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border/60">
                {audit.map((a) => (
                  <li key={a.id} className="px-4 py-2 text-sm flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs font-mono">{a.check_id}</code>
                        <Badge variant="outline" className={cn("text-[10px]", a.success ? "text-success" : "text-destructive")}>
                          {a.success ? "성공" : "실패"} · {a.affected_count}건
                        </Badge>
                      </div>
                      {a.error_message && (
                        <div className="text-[11px] text-destructive mt-0.5">{a.error_message}</div>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {new Date(a.applied_at).toLocaleString("ko-KR")}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Fix preview dialog */}
      <AlertDialog open={fixDialog.open} onOpenChange={(open) => !open && setFixDialog({ open: false, checkId: "", preview: null, applying: false })}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              자동 수정 미리보기
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {CHECK_TO_FIX[fixDialog.checkId] && (
                  <p className="text-muted-foreground">{CHECK_TO_FIX[fixDialog.checkId].description}</p>
                )}
                {!fixDialog.preview ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> 영향받는 행을 분석 중...
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">영향 받는 행: {fixDialog.preview.affectedCount}건</span>
                    </div>
                    {fixDialog.preview.sqlPreview && (
                      <pre className="bg-muted/60 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap">
                        {fixDialog.preview.sqlPreview}
                      </pre>
                    )}
                    {fixDialog.preview.preview.length > 0 && (
                      <ul className="max-h-48 overflow-auto border rounded text-xs divide-y divide-border/60">
                        {fixDialog.preview.preview.slice(0, 20).map((p, i) => (
                          <li key={i} className="px-2 py-1.5">
                            <div className="font-medium truncate">{p.label}</div>
                            {p.detail && <div className="text-muted-foreground">{p.detail}</div>}
                          </li>
                        ))}
                        {fixDialog.preview.preview.length > 20 && (
                          <li className="px-2 py-1.5 text-muted-foreground">…외 {fixDialog.preview.preview.length - 20}건</li>
                        )}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={fixDialog.applying}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); applyFix(); }}
              disabled={!fixDialog.preview || fixDialog.preview.affectedCount === 0 || fixDialog.applying}
            >
              {fixDialog.applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              지금 적용
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AdminPlatformHealth;
