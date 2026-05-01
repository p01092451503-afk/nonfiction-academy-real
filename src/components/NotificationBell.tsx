import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, AlertTriangle, BookOpen, CheckCircle2, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { pickNotificationText } from "@/lib/notificationI18n";

const typeIcon: Record<string, React.ElementType> = {
  deadline: AlertTriangle,
  mandatory: BookOpen,
  completion: CheckCircle2,
  info: Bell,
};

const NotificationBell = () => {
  const { user } = useUser();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const locale = i18n.language?.startsWith("en") ? enUS : ko;
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,   // 2min stale — reduces polling pressure
    refetchInterval: 120_000,     // Poll every 2min instead of 1min
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Batch mark-all-read into a single query using .in()
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
      if (unreadIds.length === 0) return;
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", unreadIds);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const closePanel = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closePanel]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        const firstFocusable = panelRef.current?.querySelector<HTMLElement>("button");
        firstFocusable?.focus();
      });
    }
  }, [open]);

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen(!open)}
        aria-label={
          unreadCount > 0
            ? `${t("notification.title")} - ${t("notification.unreadCount", { count: unreadCount })}`
            : t("notification.title")
        }
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground"
            aria-hidden="true"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={closePanel} />
          <div
            ref={panelRef}
            className="fixed inset-x-0 top-14 z-50 mx-3 overflow-hidden rounded-xl border border-border bg-popover shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mx-0 sm:mt-2 sm:w-96"
            role="dialog"
            aria-modal="true"
            aria-label={t("notification.title")}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground" id="notification-panel-title">
                {t("notification.title")}
              </h2>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllReadMutation.mutate()}
                    className="text-[11px] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={t("notification.markAllRead")}
                  >
                    {t("notification.markAllRead")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={t("common.close", "닫기")}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              </div>
            </div>

            <ul
              className="max-h-80 divide-y divide-border overflow-y-auto"
              role="list"
              aria-label={t("notification.title")}
            >
              {notifications.length === 0 ? (
                <li className="py-8 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
                  {t("notification.empty")}
                </li>
              ) : (
                notifications.map((n) => {
                  const Icon = typeIcon[n.type || "info"] || Bell;
                  const timeAgo = formatDistanceToNow(new Date(n.created_at!), { addSuffix: true, locale });
                  const displayTitle = pickNotificationText(n.title_i18n as any, i18n.language, n.title);
                  const displayMessage = pickNotificationText(n.message_i18n as any, i18n.language, n.message);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${!n.is_read ? "bg-primary/5" : ""}`}
                        onClick={() => {
                          if (!n.is_read) markReadMutation.mutate(n.id);
                          if (n.action_url) {
                            closePanel();
                            window.location.href = n.action_url;
                          }
                        }}
                        aria-label={`${!n.is_read ? `(${t("notification.unread", "읽지 않음")}) ` : ""}${displayTitle}. ${displayMessage}. ${timeAgo}`}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            n.type === "deadline"
                              ? "bg-destructive/10 text-destructive"
                              : n.type === "mandatory"
                              ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                              : "bg-accent text-muted-foreground"
                          }`}
                          aria-hidden="true"
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs leading-relaxed ${!n.is_read ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                            {displayTitle}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{displayMessage}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground/60">{timeAgo}</p>
                        </div>
                        {!n.is_read && (
                          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
