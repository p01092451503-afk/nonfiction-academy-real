import { useEffect, useState } from "react";
import { Smartphone, CheckCircle2, XCircle, RefreshCw, Database, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type CacheInfo = { name: string; entries: number; bytes: number };

const formatBytes = (b: number) => {
  if (!b) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
};

const formatDate = (ts: number | null) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const hostname = typeof window !== "undefined" ? window.location.hostname : "";
const isPreviewHost = hostname.includes("id-preview--") || hostname.includes("lovableproject.com");

const PWAStatusCard = () => {
  const [isStandalone, setIsStandalone] = useState(false);
  const [hasSW, setHasSW] = useState(false);
  const [swState, setSwState] = useState<string>("—");
  const [swScope, setSwScope] = useState<string>("—");
  const [lastUpdateCheck, setLastUpdateCheck] = useState<number | null>(null);
  const [caches, setCaches] = useState<CacheInfo[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [storageQuota, setStorageQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [loading, setLoading] = useState(true);
  const [iosBannerStatus, setIosBannerStatus] = useState<string>("—");

  const refresh = async () => {
    setLoading(true);
    try {
      // standalone detection
      // @ts-ignore
      const standalone = (window.navigator.standalone === true) ||
        window.matchMedia?.("(display-mode: standalone)")?.matches || false;
      setIsStandalone(standalone);

      // Service worker
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        const reg = regs[0];
        if (reg) {
          setHasSW(true);
          const w = reg.active || reg.waiting || reg.installing;
          setSwState(w?.state || "unknown");
          setSwScope(reg.scope.replace(window.location.origin, "") || "/");
        } else {
          setHasSW(false);
          setSwState("—");
          setSwScope("—");
        }
      }

      // Cache storage
      if ("caches" in window) {
        const names = await window.caches.keys();
        const infos: CacheInfo[] = [];
        let total = 0;
        for (const name of names) {
          const cache = await window.caches.open(name);
          const reqs = await cache.keys();
          let bytes = 0;
          // Estimate by sampling (don't read all bodies — too heavy)
          for (const r of reqs.slice(0, 50)) {
            try {
              const res = await cache.match(r);
              const len = res?.headers.get("content-length");
              if (len) bytes += parseInt(len, 10);
            } catch {}
          }
          // scale up estimate
          const factor = reqs.length > 50 ? reqs.length / 50 : 1;
          bytes = Math.round(bytes * factor);
          infos.push({ name, entries: reqs.length, bytes });
          total += bytes;
        }
        setCaches(infos);
        setTotalBytes(total);
      }

      // Storage quota (more accurate aggregate)
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        setStorageQuota({ usage: est.usage || 0, quota: est.quota || 0 });
      }

      // Last update check (set by PWAUpdatePrompt periodic polling)
      const last = Number(localStorage.getItem("pwa-last-update-check") || 0);
      setLastUpdateCheck(last || null);

      // iOS banner state
      if (localStorage.getItem("pwa-ios-never") === "1") {
        setIosBannerStatus("영구 숨김");
      } else {
        const defer = Number(localStorage.getItem("pwa-ios-defer-until") || 0);
        if (defer > Date.now()) {
          setIosBannerStatus(`${formatDate(defer)} 까지 보류`);
        } else {
          setIosBannerStatus("표시 가능");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const onlineHandler = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", onlineHandler);
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", onlineHandler);
    };
  }, []);

  const checkForUpdate = async () => {
    if (!("serviceWorker" in navigator)) {
      toast.error("이 브라우저는 Service Worker를 지원하지 않습니다");
      return;
    }
    if (isInIframe || isPreviewHost) {
      toast.error("미리보기 환경에서는 동작하지 않습니다. 배포된 도메인에서 시도하세요.");
      return;
    }
    const loadingToast = toast.loading("업데이트 확인 중...");
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length === 0) {
        toast.dismiss(loadingToast);
        toast.error("등록된 Service Worker가 없습니다 (배포 환경에서만 동작)");
        return;
      }

      // Trigger update check on all registrations
      await Promise.all(regs.map((r) => r.update()));
      const now = Date.now();
      localStorage.setItem("pwa-last-update-check", String(now));
      setLastUpdateCheck(now);

      // If a new worker is waiting, activate it and reload
      const waitingReg = regs.find((r) => r.waiting);
      const installingReg = regs.find((r) => r.installing);

      if (waitingReg?.waiting) {
        toast.dismiss(loadingToast);
        toast.success("새 버전을 적용합니다. 페이지를 새로고침합니다...");
        waitingReg.waiting.postMessage({ type: "SKIP_WAITING" });
        // Reload once the new SW takes control
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
        // Safety fallback
        setTimeout(() => {
          if (!reloaded) window.location.reload();
        }, 1500);
        return;
      }

      if (installingReg?.installing) {
        toast.dismiss(loadingToast);
        toast.message("새 버전 다운로드 중...", {
          description: "설치가 완료되면 자동으로 업데이트 알림이 표시됩니다.",
        });
        refresh();
        return;
      }

      toast.dismiss(loadingToast);
      toast.success("이미 최신 버전입니다");
      refresh();
    } catch (e) {
      toast.dismiss(loadingToast);
      toast.error("업데이트 확인 실패");
    }
  };

  const clearCaches = async () => {
    if (!confirm("모든 오프라인 캐시를 삭제하시겠습니까? 다음 접속 시 다시 다운로드됩니다.")) return;
    try {
      if ("caches" in window) {
        const names = await window.caches.keys();
        await Promise.all(names.map((n) => window.caches.delete(n)));
      }
      toast.success("캐시 삭제 완료");
      refresh();
    } catch {
      toast.error("캐시 삭제 실패");
    }
  };

  const unregisterSW = async () => {
    if (!confirm("Service Worker 등록을 해제하시겠습니까? 오프라인 기능과 자동 업데이트 알림이 비활성화됩니다.")) return;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      toast.success("Service Worker 등록 해제 완료");
      refresh();
    } catch {
      toast.error("등록 해제 실패");
    }
  };

  const StatusRow = ({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean | null }) => (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-1 md:gap-6 px-5 py-4 border-b-2 border-border/80 last:border-b-0">
      <div className="text-base font-medium text-foreground flex items-center gap-2">
        {ok === true && <CheckCircle2 className="h-4 w-4 text-foreground" aria-hidden="true" />}
        {ok === false && <XCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        {label}
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed break-all">{value}</div>
    </div>
  );

  return (
    <div className="stat-card !p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-5 py-3 border-b-2 border-border/80 bg-muted/30">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-foreground" aria-hidden="true" />
          <h3 className="text-base font-semibold text-foreground">PWA 상태</h3>
        </div>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {(isInIframe || isPreviewHost) && (
        <div className="flex items-start gap-2 px-5 py-3 bg-muted/40 border-b-2 border-border/80">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            현재 미리보기(iframe) 환경입니다. PWA Service Worker는 배포된 도메인(<span className="font-medium">nonfiction.webheads.co.kr</span>)에서만 동작합니다.
          </p>
        </div>
      )}

      <StatusRow
        label="설치 여부"
        ok={isStandalone}
        value={isStandalone ? "홈화면 설치됨 (Standalone 모드)" : "브라우저에서 실행 중 (미설치)"}
      />
      <StatusRow
        label="네트워크 상태"
        ok={isOnline}
        value={isOnline ? "온라인" : "오프라인 (캐시로 동작)"}
      />
      <StatusRow
        label="Service Worker"
        ok={hasSW}
        value={hasSW ? `등록됨 · 상태: ${swState} · scope: ${swScope}` : "미등록"}
      />
      <StatusRow
        label="마지막 업데이트 확인"
        value={formatDate(lastUpdateCheck)}
      />
      <StatusRow
        label="iOS 설치 안내 배너"
        value={iosBannerStatus}
      />
      <StatusRow
        label="오프라인 캐시"
        value={
          caches.length === 0 ? (
            "캐시 없음"
          ) : (
            <div className="space-y-1.5">
              <div className="font-medium text-foreground">
                {caches.length}개 캐시 · 총 {formatBytes(totalBytes)} (추정)
              </div>
              <ul className="space-y-1 text-xs">
                {caches.map((c) => (
                  <li key={c.name} className="flex justify-between gap-3 border-l-2 border-border/80 pl-2">
                    <span className="font-mono truncate">{c.name}</span>
                    <span className="shrink-0 text-muted-foreground whitespace-nowrap">
                      {c.entries}개 · {formatBytes(c.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        }
      />
      {storageQuota && (
        <StatusRow
          label="브라우저 저장소 사용량"
          value={
            <>
              <Database className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
              {formatBytes(storageQuota.usage)} / {formatBytes(storageQuota.quota)}
              <span className="text-xs text-muted-foreground ml-2">
                ({storageQuota.quota ? ((storageQuota.usage / storageQuota.quota) * 100).toFixed(2) : 0}% 사용)
              </span>
            </>
          }
        />
      )}

      <div className="flex flex-wrap gap-2 px-5 py-4 bg-muted/20">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={checkForUpdate}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          업데이트 확인
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={clearCaches} disabled={caches.length === 0}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          캐시 삭제
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={unregisterSW} disabled={!hasSW}>
          <XCircle className="h-3.5 w-3.5 mr-1.5" />
          SW 등록 해제
        </Button>
      </div>
    </div>
  );
};

export default PWAStatusCard;
