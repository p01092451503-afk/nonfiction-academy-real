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
  info: { bg: "bg-sky-50 dark:bg-sky-950/40", border: "border-sky-500", text: "text-sky-900 dark:text-sky-100", icon: Info },
  important: { bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-500", text: "text-amber-900 dark:text-amber-100", icon: Megaphone },
  critical: { bg: "bg-red-50 dark:bg-red-950/40", border: "border-red-500", text: "text-red-900 dark:text-red-100", icon: AlertTriangle },
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

  const handleReload = () => {
    // Clear caches for PWA + hard reload
    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.update()));
    }
    handleDismiss();
    setTimeout(() => window.location.reload(), 100);
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
            <Button size="sm" onClick={handleReload} className="h-8">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              지금 새로고침
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
