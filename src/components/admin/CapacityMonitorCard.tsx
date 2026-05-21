import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, Wallet, HardDrive, Cloud, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

type Level = "ok" | "notice" | "warning" | "critical";

const levelFromPct = (p: number): Level =>
  p >= 95 ? "critical" : p >= 85 ? "warning" : p >= 70 ? "notice" : "ok";

const levelFromBalance = (b: number, t: { notice: number; warning: number; critical: number }): Level =>
  b <= t.critical ? "critical" : b <= t.warning ? "warning" : b <= t.notice ? "notice" : "ok";

const levelStyles: Record<Level, { bar: string; text: string; bg: string; label: string }> = {
  ok: { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", label: "정상" },
  notice: { bar: "bg-sky-500", text: "text-sky-700 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/30", label: "주의" },
  warning: { bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", label: "경고" },
  critical: { bar: "bg-red-500", text: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", label: "위험" },
};

const UsageRow = ({
  icon: Icon, label, used, limit, percent, level, hint, suffix,
}: {
  icon: any; label: string; used: string; limit: string; percent: number; level: Level; hint?: string; suffix?: string;
}) => {
  const s = levelStyles[level];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.bg} ${s.text} whitespace-nowrap`}>{s.label}</span>
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          <span className={`font-semibold ${s.text}`}>{used}</span>
          <span className="mx-1">/</span>
          <span>{limit}{suffix || ""}</span>
          <span className="ml-2 font-mono">{percent.toFixed(1)}%</span>
        </div>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full transition-all ${s.bar}`} style={{ width: `${Math.max(2, percent)}%` }} />
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
};

export default function CapacityMonitorCard() {
  const { data, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["infra-capacity"],
    queryFn: async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/infra-stats?days=30`;
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error("fetch failed");
      return await res.json();
    },
    staleTime: 60 * 60 * 1000,      // 1h
    refetchInterval: 60 * 60 * 1000, // auto every 1h
    refetchOnWindowFocus: false,
  });

  // Compute metrics
  const balance = data?.bunnyBalance?.balance;
  const balanceError = data?.bunnyBalance?.error;
  const thresholds = data?.bunnyThresholds ?? { notice: 5, warning: 3, critical: 1 };

  const bunnyStorageBytes = Number(data?.bunnyStorage?.bytes || 0);
  const bunnyStreamBytes = Number(data?.bunnyStream?.storageBytes || 0);
  const sbStorageBytes = Number(data?.supabaseStorage?.totalBytes || 0);
  const sbStorageLimit = Number(data?.supabasePlan?.limits?.storageBytes || 100 * 1024 ** 3);
  const sbEgressUsed = Number(data?.supabaseUsage?.egress?.used || 0);
  const sbEgressLimit = Number(data?.supabaseUsage?.egress?.limit || 250 * 1024 ** 3);

  const sbStoragePct = (sbStorageBytes / sbStorageLimit) * 100;
  const sbEgressPct = (sbEgressUsed / sbEgressLimit) * 100;

  const sbStorageLv = levelFromPct(sbStoragePct);
  const sbEgressLv = levelFromPct(sbEgressPct);
  const balanceLv: Level = balance == null ? "notice" : levelFromBalance(balance, thresholds);

  const worst: Level = [sbStorageLv, sbEgressLv, balanceLv].reduce<Level>((acc, l) => {
    const order: Level[] = ["ok", "notice", "warning", "critical"];
    return order.indexOf(l) > order.indexOf(acc) ? l : acc;
  }, "ok");

  // Build advice
  const advice: string[] = [];
  if (balance != null) {
    if (balanceLv === "critical") advice.push(`🔴 Bunny 잔액 $${balance.toFixed(2)} — 즉시 충전하지 않으면 영상 재생/CDN이 중단될 수 있습니다.`);
    else if (balanceLv === "warning") advice.push(`🟠 Bunny 잔액 $${balance.toFixed(2)} — 24~48시간 내 충전을 권장합니다.`);
    else if (balanceLv === "notice") advice.push(`🟡 Bunny 잔액 $${balance.toFixed(2)} — 다음 주 내로 충전 계획을 세우세요.`);
  } else if (balanceError) {
    advice.push(`⚪ Bunny 잔액 조회 불가 (${balanceError}). 환경변수 BUNNY_ACCOUNT_API_KEY를 설정하면 자동 모니터링됩니다.`);
  }
  if (sbStorageLv !== "ok") advice.push(`Supabase Storage ${sbStoragePct.toFixed(1)}% 사용 중 — 오래된 파일/미사용 첨부 정리 또는 Bunny Storage로 이관을 고려하세요.`);
  if (sbEgressLv !== "ok") advice.push(`Supabase 월 전송량 ${sbEgressPct.toFixed(1)}% 사용 중 — 영상/이미지를 Bunny CDN으로 전환하면 Supabase egress를 크게 줄일 수 있습니다.`);
  if (advice.length === 0) advice.push("모든 리소스가 안정 범위 내에 있습니다.");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              인프라 용량 모니터
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Supabase Pro 한도(Storage 100GB / Egress 250GB) 및 Bunny 잔액 실시간 추적 · 1시간마다 자동 갱신
              {dataUpdatedAt > 0 && <> · 최근 갱신 {format(new Date(dataUpdatedAt), "HH:mm:ss")}</>}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Alert banner */}
        {worst !== "ok" && (
          <Alert className={`${levelStyles[worst].bg} border-0`}>
            <AlertTriangle className={`h-4 w-4 ${levelStyles[worst].text}`} />
            <AlertTitle className={`${levelStyles[worst].text} font-semibold`}>
              {worst === "critical" ? "위험: 즉시 조치 필요"
                : worst === "warning" ? "경고: 빠른 조치 권장"
                : "주의: 사용량이 임계치에 근접"}
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-1">
              {advice.map((a, i) => <div key={i} className="text-xs">{a}</div>)}
            </AlertDescription>
          </Alert>
        )}
        {worst === "ok" && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded">
            <CheckCircle2 className="h-4 w-4" />
            모든 리소스가 안정 범위 내에 있습니다.
          </div>
        )}

        {/* Bunny balance */}
        <UsageRow
          icon={Wallet}
          label="Bunny 잔액 (선불 종량제)"
          used={balance != null ? `$${balance.toFixed(2)}` : "조회 불가"}
          limit={`임계 $${thresholds.notice} / $${thresholds.warning} / $${thresholds.critical}`}
          percent={balance != null ? Math.max(0, Math.min(100, (balance / (thresholds.notice * 4)) * 100)) : 0}
          level={balanceLv}
          hint={balanceError ? `오류: ${balanceError}` : "잔액이 0이 되면 CDN/Stream이 즉시 중단됩니다."}
        />

        {/* Supabase Storage */}
        <UsageRow
          icon={HardDrive}
          label="Supabase Storage (Pro 100GB)"
          used={formatBytes(sbStorageBytes)}
          limit={formatBytes(sbStorageLimit)}
          percent={sbStoragePct}
          level={sbStorageLv}
          hint={`${data?.supabaseStorage?.totalObjects ?? 0}개 객체 · ${data?.supabaseStorage?.buckets?.length ?? 0}개 버킷`}
        />

        {/* Supabase Egress */}
        <UsageRow
          icon={Cloud}
          label="Supabase 월 전송량 (Pro 250GB)"
          used={formatBytes(sbEgressUsed)}
          limit={formatBytes(sbEgressLimit)}
          percent={sbEgressPct}
          level={sbEgressLv}
          hint="앱 내부 traffic_logs 추정치 (실측 아님 — 참고용)"
        />

        {/* Bunny breakdown (info only) */}
        <div className="pt-3 border-t border-border/60 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Bunny CDN Storage</p>
            <p className="font-semibold">{formatBytes(bunnyStorageBytes)} · {data?.bunnyStorage?.count ?? 0}파일</p>
          </div>
          <div>
            <p className="text-muted-foreground">Bunny Stream Storage</p>
            <p className="font-semibold">{formatBytes(bunnyStreamBytes)} · {data?.bunnyStream?.videoCount ?? 0}영상</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
