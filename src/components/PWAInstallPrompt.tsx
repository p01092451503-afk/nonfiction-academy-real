import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const LAST_SHOWN_KEY = "pwa-install-last-shown";
const DISMISSED_KEY = "pwa-install-dismissed-forever";

const isStandalone = () =>
  // @ts-ignore
  window.navigator.standalone === true ||
  window.matchMedia?.("(display-mode: standalone)")?.matches === true;

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

const isMobileOrTablet = () => {
  const ua = navigator.userAgent;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    (/Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1)
  );
};

const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

export default function PWAInstallPrompt() {
  const { user } = useUser();
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (!user || isStandalone() || isInIframe) return;
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;
    const mobileOrTablet = isMobileOrTablet();

    const checkInterval = async () => {
      const { data } = await supabase
        .from("pwa_settings")
        .select("install_prompt_enabled, install_prompt_interval_days")
        .limit(1)
        .maybeSingle();
      if (!data?.install_prompt_enabled) return false;

      const last = Number(localStorage.getItem(LAST_SHOWN_KEY) || 0);
      const intervalMs = (data.install_prompt_interval_days || 7) * 24 * 3600 * 1000;
      return Date.now() - last >= intervalMs;
    };

    const onBIP = (e: Event) => {
      e.preventDefault();
      if (!mobileOrTablet) return;
      checkInterval().then((ok) => {
        if (!ok) return;
        setDeferred(e as BIPEvent);
        setShow(true);
      });
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS Safari doesn't fire beforeinstallprompt — show manual hint
    if (mobileOrTablet && isIOS()) {
      checkInterval().then((ok) => { if (ok) { setIosHint(true); setShow(true); } });
    }

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, [user?.id]);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const res = await deferred.userChoice;
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
    if (res.outcome === "accepted") localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
    setShow(false);
  };

  const handleNeverShow = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2rem)] max-w-md bg-background border-2 border-foreground/80 shadow-xl rounded-lg animate-in slide-in-from-bottom-4">
      <div className="p-4 flex items-start gap-3">
        <Smartphone className="h-5 w-5 text-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">앱으로 설치하기</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {iosHint
              ? "Safari 하단 공유 버튼을 누른 뒤 '홈 화면에 추가'를 선택하세요."
              : "홈 화면에서 빠르게 학습하고 오프라인에서도 일부 콘텐츠를 이용하세요."}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {!iosHint && (
              <Button size="sm" onClick={handleInstall} className="h-8">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                설치
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleDismiss} className="h-8">
              나중에
            </Button>
            <Button size="sm" variant="ghost" onClick={handleNeverShow} className="h-8 text-xs text-muted-foreground">
              다시 보지 않기
            </Button>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 w-8 p-0 shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
