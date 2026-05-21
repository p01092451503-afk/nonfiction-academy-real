import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Smartphone, CheckCircle2, XCircle, AlertTriangle, Loader2, Play, ExternalLink, RefreshCw,
} from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * 모바일(세로) 영상 풀필 점검
 * - 각 강의 차시를 390px 폭 컨테이너(모바일 세로) + 16:9 비율 박스에 렌더
 * - iframe / video 엘리먼트의 bounding box를 자동 측정해
 *   컨테이너 폭과 동일(>=98%)하면 OK, 그렇지 않으면 FAIL.
 * - Bunny는 bunny-resolve-video로 signed playUrl을 발급받아 사용.
 */

const MOBILE_WIDTH = 390; // iPhone 13/14 width
const TOLERANCE = 0.98;

type Status = "pending" | "ok" | "fail" | "warn";

interface Target {
  key: string;
  courseId: string;
  courseTitle: string;
  contentId: string;
  contentTitle: string;
  contentType: string;
  episodeLabel?: string;
  provider: string | null;
  url: string;
}

interface MeasureResult {
  status: Status;
  message: string;
  containerW?: number;
  containerH?: number;
  innerW?: number;
  innerH?: number;
}

const BUNNY_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const isBunny = (url: string, hint: string | null) =>
  hint?.toLowerCase() === "bunny" ||
  /iframe\.mediadelivery\.net|b-cdn\.net/i.test(url || "");
const isPlaceholder = (url: string) => /placeholder_value_to_be_replaced/i.test(url || "");
const toBunnyEmbedUrl = (url: string) =>
  url.replace("iframe.mediadelivery.net/play/", "iframe.mediadelivery.net/embed/");
const detectProvider = (url: string, hint: string | null): string => {
  if (hint) return hint.toLowerCase();
  const u = (url || "").toLowerCase();
  if (u.includes("iframe.mediadelivery.net") || u.includes("b-cdn.net")) return "bunny";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("vimeo.com")) return "vimeo";
  if (u.includes("mangoboard.net")) return "mangoboard";
  if (u.includes("kollus")) return "kollus";
  return "custom";
};

const StatusBadge = ({ status }: { status: Status }) => {
  if (status === "ok") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1"><CheckCircle2 className="h-3 w-3" />꽉 참</Badge>;
  if (status === "fail") return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1"><XCircle className="h-3 w-3" />여백 있음</Badge>;
  if (status === "warn") return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 gap-1"><AlertTriangle className="h-3 w-3" />확인 필요</Badge>;
  return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />측정 중</Badge>;
};

interface VideoFrameProps {
  target: Target;
  onMeasured: (key: string, r: MeasureResult) => void;
}

const VideoFrame = ({ target, onMeasured }: VideoFrameProps) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLIFrameElement | HTMLVideoElement | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Resolve playable URL (Bunny needs signed URL)
  useEffect(() => {
    const raw = target.url?.trim() || "";
    if (!raw || isPlaceholder(raw)) {
      setError("재생 주소 미설정");
      return;
    }
    if (!isBunny(raw, target.provider)) {
      setPlayUrl(raw);
      return;
    }
    const id = raw.match(BUNNY_ID_RE)?.[1];
    if (!id) {
      setError("Bunny ID 추출 실패");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke("bunny-resolve-video", {
        body: { videoId: id, url: raw },
      });
      if (cancelled) return;
      if (error || !data?.playUrl) {
        setError("signed URL 발급 실패");
        return;
      }
      const resolvedUrl = toBunnyEmbedUrl(data.embedUrl || data.playUrl);
      const sep = resolvedUrl.includes("?") ? "&" : "?";
      const needsPlayerParams = /iframe\.mediadelivery\.net/i.test(resolvedUrl);
      setPlayUrl(needsPlayerParams ? `${resolvedUrl}${sep}preload=true&responsive=true` : resolvedUrl);
    })();
    return () => { cancelled = true; };
  }, [target.url, target.provider]);

  // Measure after load (or after a small delay if cross-origin onload is missed)
  useEffect(() => {
    if (error) {
      onMeasured(target.key, { status: "fail", message: error });
      return;
    }
    if (!playUrl) return;
    const measure = () => {
      const box = boxRef.current;
      const inner = innerRef.current;
      if (!box || !inner) return;
      const br = box.getBoundingClientRect();
      const ir = inner.getBoundingClientRect();
      const ratio = br.width > 0 ? ir.width / br.width : 0;
      const status: Status = ratio >= TOLERANCE ? "ok" : "fail";
      const message =
        status === "ok"
          ? `iframe ${Math.round(ir.width)}×${Math.round(ir.height)} = 컨테이너 ${Math.round(br.width)}×${Math.round(br.height)} (${Math.round(ratio * 100)}%)`
          : `iframe ${Math.round(ir.width)}×${Math.round(ir.height)} < 컨테이너 ${Math.round(br.width)}×${Math.round(br.height)} (${Math.round(ratio * 100)}%)`;
      onMeasured(target.key, {
        status, message,
        containerW: br.width, containerH: br.height,
        innerW: ir.width, innerH: ir.height,
      });
    };
    // Run measurement multiple times to catch late layout for cross-origin iframes
    const t1 = setTimeout(measure, 600);
    const t2 = setTimeout(measure, 1800);
    const t3 = setTimeout(measure, 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [playUrl, error, loaded, target.key, onMeasured]);

  if (error) {
    return (
      <div className="flex items-center justify-center bg-muted text-xs text-muted-foreground rounded-md"
        style={{ width: MOBILE_WIDTH, height: Math.round((MOBILE_WIDTH * 9) / 16) }}>
        {error}
      </div>
    );
  }

  if (!playUrl) {
    return (
      <div className="flex items-center justify-center bg-muted text-xs text-muted-foreground rounded-md"
        style={{ width: MOBILE_WIDTH, height: Math.round((MOBILE_WIDTH * 9) / 16) }}>
        <Loader2 className="h-4 w-4 animate-spin mr-1" /> 준비 중
      </div>
    );
  }

  // Bunny / iframe-style
  const useIframe = /iframe\.mediadelivery\.net|youtube\.com|vimeo\.com|mangoboard/i.test(playUrl);
  return (
    <div
      ref={boxRef}
      className="relative bg-black rounded-md overflow-hidden"
      style={{ width: MOBILE_WIDTH, height: Math.round((MOBILE_WIDTH * 9) / 16) }}
    >
      {useIframe ? (
        <iframe
          ref={innerRef as any}
          src={playUrl}
          width="100%"
          height="100%"
          className="absolute inset-0 h-full w-full border-0 bg-black"
          style={{ aspectRatio: "16 / 9" }}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          title={target.contentTitle}
          onLoad={() => setLoaded(true)}
        />
      ) : (
        <video
          ref={innerRef as any}
          src={playUrl}
          controls
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-contain bg-black"
          onLoadedMetadata={() => setLoaded(true)}
        />
      )}
    </div>
  );
};

const AdminVideoMobileCheck = () => {
  const { toast } = useToast();
  const [results, setResults] = useState<Record<string, MeasureResult>>({});
  const [filter, setFilter] = useState<"all" | "fail" | "ok" | "pending">("all");
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());

  const { data: targets = [], isLoading, refetch } = useQuery({
    queryKey: ["video-mobile-targets"],
    queryFn: async (): Promise<Target[]> => {
      const { data: contents, error } = await (supabase as any)
        .from("course_contents")
        .select("id, title, content_type, video_url, video_provider, course_id, courses!inner(id, title)")
        .in("content_type", ["video", "video_package"])
        .eq("is_published", true)
        .order("course_id");
      if (error) throw error;

      const items: Target[] = [];
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

  const handleMeasured = (key: string, r: MeasureResult) => {
    setResults((prev) => {
      // Only update if status improved or first measurement
      const prevR = prev[key];
      if (prevR?.status === "ok") return prev;
      return { ...prev, [key]: r };
    });
  };

  const summary = useMemo(() => {
    const total = targets.length;
    let ok = 0, fail = 0, pending = 0;
    for (const t of targets) {
      const r = results[t.key];
      if (!r) pending++;
      else if (r.status === "ok") ok++;
      else if (r.status === "fail") fail++;
    }
    return { total, ok, fail, pending };
  }, [targets, results]);

  const filtered = useMemo(() => {
    if (filter === "all") return targets;
    if (filter === "pending") return targets.filter((t) => !results[t.key]);
    return targets.filter((t) => results[t.key]?.status === filter);
  }, [targets, results, filter]);

  // Lazy-mount frames: only activate when in viewport, to avoid hammering 100+ iframes
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-mobile-check-key]");
    if (els.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      setActiveKeys((prev) => {
        const next = new Set(prev);
        for (const e of entries) {
          if (e.isIntersecting) {
            const k = (e.target as HTMLElement).dataset.mobileCheckKey;
            if (k) next.add(k);
          }
        }
        return next;
      });
    }, { rootMargin: "200px 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [filtered]);

  const runAll = () => {
    // Force activation of all currently filtered items at once
    setActiveKeys(new Set(filtered.map((t) => t.key)));
    toast({ title: "전체 점검 시작", description: `${filtered.length}개 항목을 동시에 로드합니다.` });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
              <Smartphone className="h-6 w-6" />
              모바일(세로) 영상 풀필 점검
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {MOBILE_WIDTH}px 폭(iPhone 기준)의 16:9 컨테이너에서 영상이 가로 폭을 꽉 채우는지 자동 측정합니다.
              스크롤 시 항목이 자동으로 로드되며, [전체 점검]을 누르면 보이는 모든 항목을 동시에 측정합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setResults({}); setActiveKeys(new Set()); refetch(); }}>
              <RefreshCw className="h-4 w-4 mr-1" /> 새로고침
            </Button>
            <Button onClick={runAll} disabled={isLoading || filtered.length === 0}>
              <Play className="h-4 w-4 mr-1" /> 전체 점검
            </Button>
          </div>
        </header>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "총 항목", value: summary.total, color: "text-foreground", k: "all" as const },
            { label: "꽉 참 (정상)", value: summary.ok, color: "text-emerald-600", k: "ok" as const },
            { label: "여백 있음", value: summary.fail, color: "text-red-600", k: "fail" as const },
            { label: "미측정", value: summary.pending, color: "text-muted-foreground", k: "pending" as const },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setFilter(s.k)}
              className="text-left rounded-lg border border-border bg-card p-4 hover:bg-accent transition-colors"
            >
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={`text-2xl font-semibold mt-1 ${s.color}`}>{s.value}</div>
            </button>
          ))}
        </div>

        {summary.total > 0 && (
          <div className="space-y-1">
            <Progress value={summary.total === 0 ? 0 : Math.round(((summary.ok + summary.fail) / summary.total) * 100)} className="h-2" />
            <div className="text-xs text-muted-foreground tabular-nums">
              {summary.ok + summary.fail} / {summary.total} 항목 측정 완료
            </div>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "전체"], ["fail", "여백 있음"], ["ok", "꽉 참"], ["pending", "미측정"],
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

        {/* Grid of mobile-sized previews */}
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">표시할 항목이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
            {filtered.map((t) => {
              const r = results[t.key];
              const isActive = activeKeys.has(t.key);
              return (
                <div
                  key={t.key}
                  data-mobile-check-key={t.key}
                  className="rounded-lg border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.courseTitle}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {t.contentTitle}
                        {t.episodeLabel ? ` — ${t.episodeLabel}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={r?.status || "pending"} />
                      <Badge variant="outline" className="text-[10px]">
                        {detectProvider(t.url || "", t.provider)}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    {isActive ? (
                      <VideoFrame target={t} onMeasured={handleMeasured} />
                    ) : (
                      <div
                        className="flex items-center justify-center bg-muted/40 text-xs text-muted-foreground rounded-md border border-dashed border-border"
                        style={{ width: MOBILE_WIDTH, height: Math.round((MOBILE_WIDTH * 9) / 16) }}
                      >
                        스크롤 시 로드됨
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground break-all min-h-[1.25rem]">
                    {r?.message || "측정 대기 중..."}
                  </div>

                  <div className="flex justify-end">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/admin/courses/${t.courseId}/content/${t.contentId}`} target="_blank">
                        <ExternalLink className="h-3 w-3 mr-1" /> 차시 열기
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminVideoMobileCheck;
