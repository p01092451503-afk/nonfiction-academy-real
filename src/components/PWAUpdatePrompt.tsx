import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  Download,
  X,
  Share,
  Plus,
  Smartphone,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

const hostname = typeof window !== "undefined" ? window.location.hostname : "";
const isPreviewHost = hostname.includes("id-preview--") || hostname.includes("lovableproject.com");

const isStandalone = (() => {
  if (typeof window === "undefined") return false;
  // @ts-ignore
  if (window.navigator.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
})();

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isIOS = /iphone|ipad|ipod/i.test(ua);
const isIPad = /ipad/i.test(ua) || (/Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1);
// On iOS Safari ≥16, share menu is in the bottom toolbar on iPhone but
// in the top-right on iPad / iOS in landscape. Keep guidance accurate.
const sharePosition: "bottom" | "top" = isIPad ? "top" : "bottom";

const IOS_DEFER_KEY = "pwa-ios-defer-until";
const IOS_NEVER_KEY = "pwa-ios-never";
const IOS_FIRST_SEEN_KEY = "pwa-ios-first-seen-at";

// Show the small bottom banner first; user opens full guide from there.
const PWAUpdatePrompt = () => {
  const { t } = useTranslation();
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);
  const [installEvent, setInstallEvent] = useState<BIPEvent | null>(null);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // ------- Service Worker registration -------
  useEffect(() => {
    if (isInIframe || isPreviewHost) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      }
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        // @ts-ignore - virtual module from vite-plugin-pwa
        const { registerSW } = await import("virtual:pwa-register");
        const update = registerSW({
          onNeedRefresh() { if (!cancelled) setNeedRefresh(true); },
          onRegisteredSW(_url: string, registration: ServiceWorkerRegistration | undefined) {
            if (registration) {
              // Initial check timestamp
              localStorage.setItem("pwa-last-update-check", String(Date.now()));
              setInterval(() => {
                registration.update()
                  .then(() => localStorage.setItem("pwa-last-update-check", String(Date.now())))
                  .catch(() => {});
              }, 60 * 60 * 1000);
            }
          },
        });
        if (!cancelled) setUpdateSW(() => update);
      } catch (err) {
        console.debug("[PWA] SW registration skipped:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ------- Chromium install prompt -------
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallEvent(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // ------- iOS banner visibility logic -------
  useEffect(() => {
    if (!isIOS || isStandalone) return;
    if (isInIframe || isPreviewHost) return;
    if (localStorage.getItem(IOS_NEVER_KEY) === "1") return;
    const deferUntil = Number(localStorage.getItem(IOS_DEFER_KEY) || 0);
    if (Date.now() < deferUntil) return;
    if (!localStorage.getItem(IOS_FIRST_SEEN_KEY)) {
      localStorage.setItem(IOS_FIRST_SEEN_KEY, String(Date.now()));
    }
    const timer = setTimeout(() => setShowIOSBanner(true), 3500);
    return () => clearTimeout(timer);
  }, []);

  // Wipe all Cache Storage entries (workbox precache, runtime caches, etc.)
  const clearAllCaches = async () => {
    try {
      if (typeof caches === "undefined") return;
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n).catch(() => false)));
    } catch (err) {
      console.debug("[PWA] cache clear failed", err);
    }
  };

  const handleUpdate = async () => {
    // Hide the toast immediately to give visual feedback
    setNeedRefresh(false);

    let reloaded = false;
    const doReload = () => {
      if (reloaded) return;
      reloaded = true;
      // Final safety net: clear caches synchronously-ish before reload.
      // (clearAllCaches was already called above; this is a best-effort second pass.)
      clearAllCaches().finally(() => window.location.reload());
    };

    try {
      // 0) Wipe Cache Storage so the next load fetches fresh assets/HTML.
      await clearAllCaches();

      // 1) Listen for controller change (new SW took over) → reload
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener("controllerchange", doReload, { once: true });
      }

      // 2) Ask vite-plugin-pwa to activate the waiting worker
      if (updateSW) {
        // Don't await — some browsers never resolve until reload
        updateSW(true).catch(() => {});
      }

      // 3) Belt-and-suspenders: directly post SKIP_WAITING to any waiting worker
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.update().catch(() => {});
          const waiting = reg.waiting || reg.installing;
          waiting?.postMessage({ type: "SKIP_WAITING" });
        }
      }

      // 4) Hard fallback: if controllerchange never fires (e.g. no SW listening),
      //    force a reload after a short delay so the user isn't stuck.
      setTimeout(doReload, 1500);
    } catch (err) {
      console.error("[PWA] update failed, forcing reload", err);
      doReload();
    }
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  const deferIOS = (days: number) => {
    localStorage.setItem(IOS_DEFER_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
    setShowIOSBanner(false);
    setShowIOSGuide(false);
  };

  const neverShowIOS = () => {
    localStorage.setItem(IOS_NEVER_KEY, "1");
    setShowIOSBanner(false);
    setShowIOSGuide(false);
  };

  const openIOSGuide = () => {
    setShowIOSBanner(false);
    setShowIOSGuide(true);
  };

  if (isInIframe || isPreviewHost) return null;

  return (
    <>
      {/* SW update toast */}
      {needRefresh && (
        <div role="status" aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[min(92vw,420px)] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-foreground text-background rounded-xl shadow-2xl p-4 flex items-start gap-3 border border-border/20">
            <RefreshCw className="h-5 w-5 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{t("pwa.updateTitle", "새 버전이 있습니다")}</p>
              <p className="text-xs opacity-80 mt-0.5">{t("pwa.updateDesc", "최신 기능과 보안 패치를 받으려면 새로고침하세요.")}</p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="secondary" className="h-8 text-xs font-semibold" onClick={handleUpdate}>
                  {t("pwa.updateNow", "지금 업데이트")}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs text-background/70 hover:text-background hover:bg-background/10" onClick={() => setNeedRefresh(false)}>
                  {t("pwa.later", "나중에")}
                </Button>
              </div>
            </div>
            <button type="button" onClick={() => setNeedRefresh(false)} className="text-background/60 hover:text-background shrink-0" aria-label={t("common.close", "닫기")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Chromium install card */}
      {installEvent && !isStandalone && (
        <div role="dialog" aria-label={t("pwa.installTitle", "앱 설치")}
          className="fixed bottom-4 right-4 z-[9998] w-[min(92vw,360px)] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-background border-2 border-border rounded-xl shadow-xl p-4 flex items-start gap-3">
            <Download className="h-5 w-5 mt-0.5 text-foreground shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">{t("pwa.installTitle", "홈화면에 NONFICTION 설치")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("pwa.installDesc", "앱처럼 빠르게 실행하고 오프라인에서도 일부 기능을 사용할 수 있습니다.")}</p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="h-8 text-xs font-semibold" onClick={handleInstall}>
                  {t("pwa.install", "설치")}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setInstallEvent(null)}>
                  {t("pwa.notNow", "다음에")}
                </Button>
              </div>
            </div>
            <button type="button" onClick={() => setInstallEvent(null)} className="text-muted-foreground hover:text-foreground shrink-0" aria-label={t("common.close", "닫기")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* iOS bottom banner — minimal CTA, opens full guide */}
      {showIOSBanner && (
        <div role="dialog" aria-label={t("pwa.iosBannerTitle", "iOS 홈화면 설치")}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998] w-[min(92vw,420px)] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-background border-2 border-border rounded-xl shadow-xl p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-foreground/5 p-2 shrink-0">
                <Smartphone className="h-5 w-5 text-foreground" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">
                  {t("pwa.iosBannerTitle", "홈화면에 앱처럼 추가하기")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("pwa.iosBannerDesc", "Safari에서 한번만 설정하면 다음부터 앱처럼 바로 실행됩니다.")}
                </p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="h-8 text-xs font-semibold" onClick={openIOSGuide}>
                    {t("pwa.iosBannerCta", "설치 방법 보기")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => deferIOS(7)}>
                    {t("pwa.iosLater", "일주일 뒤")}
                  </Button>
                </div>
              </div>
              <button type="button" onClick={() => deferIOS(3)} className="text-muted-foreground hover:text-foreground shrink-0" aria-label={t("common.close", "닫기")}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS step-by-step guide modal */}
      <Dialog open={showIOSGuide} onOpenChange={setShowIOSGuide}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-foreground/5 p-2">
                <Smartphone className="h-5 w-5 text-foreground" aria-hidden="true" />
              </div>
              <DialogTitle className="text-lg">
                {t("pwa.iosGuideTitle", "홈화면에 NONFICTION 추가하기")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm pt-1">
              {t(
                "pwa.iosGuideIntro",
                "Safari에서만 설치할 수 있어요. Chrome·네이버 앱이라면 우측 상단 메뉴에서 'Safari로 열기'를 먼저 눌러 주세요."
              )}
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-3 py-2">
            {/* Step 1 */}
            <li className="flex items-start gap-3 rounded-lg border-2 border-border/80 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-xs font-bold">
                1
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground flex items-center flex-wrap gap-1.5">
                  {sharePosition === "bottom" ? (
                    <>
                      {t("pwa.iosStep1Bottom", "화면 하단의")}
                      <ArrowDown className="h-3.5 w-3.5 inline" aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      {t("pwa.iosStep1Top", "화면 우측 상단의")}
                      <ArrowUp className="h-3.5 w-3.5 inline" aria-hidden="true" />
                    </>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-foreground">
                    <Share className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-xs">{t("pwa.iosShareBtn", "공유")}</span>
                  </span>
                  {t("pwa.iosStep1Tail", "버튼을 누릅니다.")}
                </p>
              </div>
            </li>

            {/* Step 2 */}
            <li className="flex items-start gap-3 rounded-lg border-2 border-border/80 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-xs font-bold">
                2
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground flex items-center flex-wrap gap-1.5">
                  {t("pwa.iosStep2Pre", "메뉴를 아래로 스크롤하여")}
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-foreground">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-xs">{t("pwa.iosAddHome", "홈 화면에 추가")}</span>
                  </span>
                  {t("pwa.iosStep2Tail", "를 선택합니다.")}
                </p>
              </div>
            </li>

            {/* Step 3 */}
            <li className="flex items-start gap-3 rounded-lg border-2 border-border/80 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-xs font-bold">
                3
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground flex items-center flex-wrap gap-1.5">
                  {t("pwa.iosStep3Pre", "우측 상단의")}
                  <span className="inline-flex items-center gap-1 rounded-md bg-foreground px-1.5 py-0.5 text-background">
                    <span className="text-xs font-semibold">{t("pwa.iosAddBtn", "추가")}</span>
                  </span>
                  {t("pwa.iosStep3Tail", "를 누르면 완료됩니다.")}
                </p>
              </div>
            </li>

            {/* Done state */}
            <li className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
              <CheckCircle2 className="h-5 w-5 text-foreground shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t(
                  "pwa.iosDoneNote",
                  "홈 화면 아이콘을 누르면 주소창 없이 앱처럼 실행됩니다. 새 버전이 있으면 자동으로 안내드려요."
                )}
              </p>
            </li>
          </ol>

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={neverShowIOS}
            >
              {t("pwa.iosNeverShow", "다시 보지 않기")}
            </Button>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => deferIOS(7)}>
                {t("pwa.iosLater", "일주일 뒤")}
              </Button>
              <Button type="button" size="sm" className="text-xs" onClick={() => setShowIOSGuide(false)}>
                {t("pwa.iosGotIt", "확인했어요")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PWAUpdatePrompt;
