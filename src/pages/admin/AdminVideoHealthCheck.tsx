import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Loader2, Play, ExternalLink, RefreshCw,
} from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Status = "pending" | "ok" | "fail" | "warn";

interface CheckTarget {
  key: string;
  courseId: string;
  courseTitle: string;
  contentId: string;
  contentTitle: string;
  contentType: string;
  episodeLabel?: string; // for video_package items
  provider: string | null;
  url: string;
}

interface CheckResult {
  status: Status;
  message: string;
}

const BUNNY_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/i;

const detectProvider = (url: string, hint: string | null): string => {
  const u = url.toLowerCase();
  if (hint) return hint.toLowerCase();
  if (u.includes("iframe.mediadelivery.net") || u.includes("b-cdn.net")) return "bunny";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("vimeo.com")) return "vimeo";
  if (u.includes("mangoboard.net")) return "mangoboard";
  if (u.includes("kollus")) return "kollus";
  return "custom";
};

const checkBunny = async (url: string): Promise<CheckResult> => {
  const id = url.match(BUNNY_ID_RE)?.[1];
  if (!id) return { status: "fail", message: "Bunny 비디오 ID를 추출할 수 없음" };
  try {
    const { data, error } = await supabase.functions.invoke("bunny-resolve-video", {
      body: { videoId: id, url },
    });
    if (error) return { status: "fail", message: `signed URL 발급 실패: ${error.message}` };
    if (!data?.playUrl) return { status: "fail", message: "playUrl 응답 없음" };
    return { status: "ok", message: "signed URL 발급 성공" };
  } catch (e: any) {
    return { status: "fail", message: `Edge function 오류: ${e?.message || e}` };
  }
};

const checkYoutube = (url: string): CheckResult => {
  const id = url.match(YT_RE)?.[1];
  return id
    ? { status: "ok", message: `YouTube ID: ${id}` }
    : { status: "fail", message: "YouTube 비디오 ID 추출 실패" };
};

const checkVimeo = (url: string): CheckResult => {
  const id = url.match(VIMEO_RE)?.[1];
  return id
    ? { status: "ok", message: `Vimeo ID: ${id}` }
    : { status: "fail", message: "Vimeo 비디오 ID 추출 실패" };
};

const checkCustom = async (url: string): Promise<CheckResult> => {
  try {
    new URL(url);
  } catch {
    return { status: "fail", message: "올바르지 않은 URL 형식" };
  }
  // Try HEAD; CORS may block — treat fetch failure as warning, not fail.
  try {
    const res = await fetch(url, { method: "HEAD", mode: "cors" });
    if (res.ok) return { status: "ok", message: `HTTP ${res.status}` };
    return { status: "fail", message: `HTTP ${res.status}` };
  } catch {
    return { status: "warn", message: "CORS로 자동 확인 불가 — 수동 확인 필요" };
  }
};

const runCheck = async (target: CheckTarget): Promise<CheckResult> => {
  const url = target.url?.trim() || "";
  if (!url) return { status: "fail", message: "재생 주소가 비어있음" };
  if (/placeholder_value_to_be_replaced/i.test(url)) {
    return { status: "fail", message: "Placeholder URL — 설정 필요" };
  }
  const provider = detectProvider(url, target.provider);
  switch (provider) {
    case "bunny": return checkBunny(url);
    case "youtube": return checkYoutube(url);
    case "vimeo": return checkVimeo(url);
    case "mangoboard": return { status: "ok", message: "망고보드 (재생 검증은 수동)" };
    case "kollus": return { status: "warn", message: "Kollus (서버측 검증 필요)" };
    default: return checkCustom(url);
  }
};

const StatusBadge = ({ status }: { status: Status }) => {
  if (status === "ok") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1"><CheckCircle2 className="h-3 w-3" />정상</Badge>;
  if (status === "fail") return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1"><XCircle className="h-3 w-3" />오류</Badge>;
  if (status === "warn") return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 gap-1"><AlertTriangle className="h-3 w-3" />확인 필요</Badge>;
  return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />대기</Badge>;
};

const AdminVideoHealthCheck = () => {
  const { toast } = useToast();
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filter, setFilter] = useState<"all" | "fail" | "warn" | "ok">("all");

  const { data: targets = [], isLoading, refetch } = useQuery({
    queryKey: ["video-health-targets"],
    queryFn: async (): Promise<CheckTarget[]> => {
      const { data: contents, error } = await (supabase as any)
        .from("course_contents")
        .select("id, title, content_type, video_url, video_provider, course_id, courses!inner(id, title)")
        .in("content_type", ["video", "video_package"])
        .eq("is_published", true)
        .order("course_id");
      if (error) throw error;

      const items: CheckTarget[] = [];
      const packageIds: string[] = [];
      for (const c of (contents || []) as any[]) {
        if (c.content_type === "video") {
          items.push({
            key: `c:${c.id}`,
            courseId: c.course_id,
            courseTitle: c.courses?.title || "(제목 없음)",
            contentId: c.id,
            contentTitle: c.title || "(제목 없음)",
            contentType: c.content_type,
            provider: c.video_provider,
            url: c.video_url || "",
          });
        } else if (c.content_type === "video_package") {
          packageIds.push(c.id);
        }
      }

      // Fetch package items (Korean preferred)
      if (packageIds.length > 0) {
        const { data: vpItems } = await (supabase as any)
          .from("video_package_items")
          .select("id, content_id, language_code, order_index, video_url, video_provider, title")
          .in("content_id", packageIds)
          .order("order_index");
        const byContent: Record<string, any[]> = {};
        for (const it of (vpItems || []) as any[]) {
          (byContent[it.content_id] = byContent[it.content_id] || []).push(it);
        }
        for (const c of (contents || []) as any[]) {
          if (c.content_type !== "video_package") continue;
          const all = byContent[c.id] || [];
          // Prefer Korean items, fallback to any
          const ko = all.filter((it: any) => it.language_code === "ko");
          const list = ko.length > 0 ? ko : all;
          list.forEach((it: any, idx: number) => {
            items.push({
              key: `vp:${it.id}`,
              courseId: c.course_id,
              courseTitle: c.courses?.title || "(제목 없음)",
              contentId: c.id,
              contentTitle: c.title || "(제목 없음)",
              contentType: c.content_type,
              episodeLabel: `${idx + 1}차시${it.title ? ` · ${it.title}` : ""}`,
              provider: it.video_provider,
              url: it.video_url || "",
            });
          });
        }
      }
      return items;
    },
  });

  const runScan = async () => {
    if (targets.length === 0) return;
    setScanning(true);
    setResults({});
    setProgress(0);
    let done = 0;
    // Run with limited concurrency (6 at a time)
    const concurrency = 6;
    const queue = [...targets];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const t = queue.shift()!;
        try {
          const r = await runCheck(t);
          setResults((prev) => ({ ...prev, [t.key]: r }));
        } catch (e: any) {
          setResults((prev) => ({ ...prev, [t.key]: { status: "fail", message: e?.message || "알 수 없는 오류" } }));
        }
        done++;
        setProgress(Math.round((done / targets.length) * 100));
      }
    });
    await Promise.all(workers);
    setScanning(false);
    toast({ title: "점검 완료", description: `총 ${targets.length}개 항목 검사 완료` });
  };

  const summary = useMemo(() => {
    const total = targets.length;
    let ok = 0, fail = 0, warn = 0, pending = 0;
    for (const t of targets) {
      const r = results[t.key];
      if (!r) pending++;
      else if (r.status === "ok") ok++;
      else if (r.status === "fail") fail++;
      else if (r.status === "warn") warn++;
    }
    return { total, ok, fail, warn, pending };
  }, [targets, results]);

  const filtered = useMemo(() => {
    if (filter === "all") return targets;
    return targets.filter((t) => results[t.key]?.status === filter);
  }, [targets, results, filter]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
              <Activity className="h-6 w-6" />
              영상 자동 점검
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              모든 강의 차시 영상의 재생 가능 여부를 자동으로 검증합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={scanning}>
              <RefreshCw className="h-4 w-4 mr-1" /> 목록 새로고침
            </Button>
            <Button onClick={runScan} disabled={scanning || isLoading || targets.length === 0}>
              {scanning ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />점검 중...</> : <><Play className="h-4 w-4 mr-1" />전체 점검 시작</>}
            </Button>
          </div>
        </header>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "총 항목", value: summary.total, color: "text-foreground" },
            { label: "정상", value: summary.ok, color: "text-emerald-600" },
            { label: "오류", value: summary.fail, color: "text-red-600" },
            { label: "확인 필요", value: summary.warn, color: "text-amber-600" },
            { label: "미점검", value: summary.pending, color: "text-muted-foreground" },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                if (s.label === "정상") setFilter("ok");
                else if (s.label === "오류") setFilter("fail");
                else if (s.label === "확인 필요") setFilter("warn");
                else setFilter("all");
              }}
              className="text-left rounded-lg border border-border bg-card p-4 hover:bg-accent transition-colors"
            >
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={`text-2xl font-semibold mt-1 ${s.color}`}>{s.value}</div>
            </button>
          ))}
        </div>

        {scanning && (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
            <div className="text-xs text-muted-foreground tabular-nums">{progress}% 진행</div>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "전체"], ["fail", "오류만"], ["warn", "확인 필요만"], ["ok", "정상만"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                filter === k ? "bg-foreground text-background border-foreground" : "bg-background border-border hover:bg-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Results table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">상태</TableHead>
                <TableHead>강의 / 차시</TableHead>
                <TableHead className="w-[100px]">제공자</TableHead>
                <TableHead>메시지</TableHead>
                <TableHead className="w-[80px] text-right">열기</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">불러오는 중...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">표시할 항목이 없습니다.</TableCell></TableRow>
              ) : (
                filtered.map((t) => {
                  const r = results[t.key];
                  return (
                    <TableRow key={t.key} className="border-b-2 border-border/80">
                      <TableCell><StatusBadge status={r?.status || "pending"} /></TableCell>
                      <TableCell className="min-w-0">
                        <div className="font-medium truncate">{t.courseTitle}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.contentTitle}
                          {t.episodeLabel ? ` — ${t.episodeLabel}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {detectProvider(t.url || "", t.provider)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground break-all">
                        {r?.message || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="icon" title="해당 차시 열기">
                          <Link to={`/admin/courses/${t.courseId}/content/${t.contentId}`} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminVideoHealthCheck;
