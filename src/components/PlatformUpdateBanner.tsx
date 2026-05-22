import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, Info, X, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

type Update = {
  id: string;
  version: string;
  title: string;
  message: string;
  severity: "info" | "important" | "critical";
  require_reload: boolean;
  target_audience: "all" | "admin" | "student" | "teacher";
  active: boolean;
  expires_at: string | null;
  created_at: string;
  pwa_only?: boolean;
};

const isStandalone = () =>
  // @ts-ignore
  window.navigator.standalone === true ||
  window.matchMedia?.("(display-mode: standalone)")?.matches === true;

const DISMISS_KEY = "platform-update-dismissed";

const severityStyle = {
  info: { bg: "bg-sky-600", border: "border-sky-700", text: "text-white", icon: Info },
  important: { bg: "bg-amber-500", border: "border-amber-600", text: "text-white", icon: Megaphone },
  critical: { bg: "bg-red-600", border: "border-red-700", text: "text-white", icon: AlertTriangle },
};

export default function PlatformUpdateBanner() {
  const { user, roles } = useUser();
  const [update, setUpdate] = useState<Update | null>(null);

  const matchesAudience = (u: Update) => {
    if (u.target_audience === "all") return true;
    return roles?.includes(u.target_audience as any);
  };

  const dismissedIds = (): string[] => {
    try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); } catch { return []; }
  };

  const fetchLatest = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("platform_updates")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(5);
    if (!data) return;
    const dismissed = dismissedIds();
    const standalone = isStandalone();
    const candidate = (data as Update[]).find(
      (u) =>
        !dismissed.includes(u.id) &&
        matchesAudience(u) &&
        (!u.pwa_only || standalone) &&
        (!u.expires_at || new Date(u.expires_at) > new Date()),
    );
    setUpdate(candidate || null);
  };

  useEffect(() => {
    if (!user) return;
    fetchLatest();
    // Realtime
    const ch = supabase
      .channel("platform_updates_global")
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_updates" }, () => fetchLatest())
      .subscribe();
    // Re-check every 60s as a fallback
    const t = setInterval(fetchLatest, 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, roles?.join(",")]);

  const handleDismiss = () => {
    if (!update) return;
    const list = dismissedIds();
    list.push(update.id);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-50)));
    setUpdate(null);
  };

  const getReloadHref = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("pwa-refresh", Date.now().toString());
    return url.toString();
  };

  const cleanupPwaCaches = async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys().catch(() => [] as string[]);
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      }
    } catch {
      // Reload must never be blocked by cache cleanup failures.
    }
  };

  const handleReload = () => {
    // Mark as dismissed so banner doesn't reappear after reload
    if (update) {
      const list = dismissedIds();
      list.push(update.id);
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-50))); } catch {}
    }

    const href = getReloadHref();
    void cleanupPwaCaches();

    // Do not wait for async cleanup: navigate synchronously while the click is still trusted.
    window.location.assign(href);
    window.setTimeout(() => window.location.replace(href), 250);
    window.setTimeout(() => window.location.reload(), 750);
  };

  if (!update) return null;
  const s = severityStyle[update.severity];
  const Icon = s.icon;

  return (
    <div className={`fixed top-0 inset-x-0 z-[100] ${s.bg} border-b-4 ${s.border} shadow-lg animate-in slide-in-from-top-2`}>
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 flex items-start sm:items-center gap-3 flex-wrap sm:flex-nowrap">
        <Icon className={`h-5 w-5 ${s.text} shrink-0 mt-0.5 sm:mt-0`} />
        <div className={`flex-1 min-w-0 ${s.text}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{update.title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-background/60 font-mono">v{update.version}</span>
          </div>
          <p className="text-xs mt-0.5 opacity-90 line-clamp-2 sm:line-clamp-1">{update.message}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {update.require_reload && (
            <Button size="sm" asChild className="h-8">
              <a href={getReloadHref()} onClick={handleReload} target="_self">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              지금 새로고침
              </a>
            </Button>
          )}
          {update.severity !== "critical" && (
            <Button size="sm" variant="ghost" onClick={handleDismiss} className={`h-8 w-8 p-0 ${s.text}`}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
