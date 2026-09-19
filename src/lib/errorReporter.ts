// Client-side runtime error reporter — sends to report-error edge function
// with local 5-minute debounce so we don't hammer the network if the same
// error fires repeatedly inside a single tab.
import { supabase } from "@/integrations/supabase/client";

const SENT_KEY = "ops_error_sent_v1";
const DEBOUNCE_MS = 5 * 60 * 1000;

const getSentMap = (): Record<string, number> => {
  try {
    return JSON.parse(sessionStorage.getItem(SENT_KEY) || "{}");
  } catch {
    return {};
  }
};

const setSentMap = (m: Record<string, number>) => {
  try {
    sessionStorage.setItem(SENT_KEY, JSON.stringify(m));
  } catch {
    /* ignore quota */
  }
};

const fingerprint = (message: string, stack: string): string => {
  const stackHead = (stack.split("\n").find((l) => l.trim().startsWith("at ")) || "").trim();
  // Normalize dynamic segments (UUIDs, numeric IDs) so same-class errors on
  // different resources collapse into a single fingerprint and don't bypass debounce.
  const normalizedPath = location.pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
  return `${message.split("\n")[0]}|${normalizedPath}|${stackHead}`;
};

const IGNORE_PATTERNS = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /Script error\.?$/i,
  /Load failed/i,
  /NetworkError when attempting to fetch resource/i,
  /AbortError/i,
  // 사용자가 영상/페이지를 벗어나거나 재생을 중단할 때 브라우저가 던지는 취소 신호 — 실제 장애 아님
  /The operation was aborted/i,
  /The user aborted a request/i,
  /operation was aborted/i,
  /signal is aborted without reason/i,
  /The play\(\) request was interrupted/i,
  /AbortError: The play/i,
  /cancell?ed/i,
  // 신규 배포 직후 구버전 청크 요청 실패 — 앱이 자동 새로고침으로 복구하므로 알림 불필요
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Failed to fetch dynamically imported module/i,
  /Unable to preload CSS/i,
  // 외부 플레이어/SDK 가 던지는 난독화된 값(예: "Ba", "e") — 진단 가치가 없고 알림만 유발
  /^[A-Za-z$_][A-Za-z0-9$_]{0,3}$/,
  /^\[object [A-Za-z]+\]$/,
];


// 던져진 값이 Error 가 아닐 때 사람이 읽을 수 있는 메시지로 직렬화
const describeReason = (reason: unknown): string => {
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object") {
    const anyReason = reason as Record<string, unknown>;
    const msg = anyReason.message ?? anyReason.error ?? anyReason.name;
    if (typeof msg === "string" && msg.trim()) return msg;
    try {
      const json = JSON.stringify(reason);
      if (json && json !== "{}") return `Non-Error rejection: ${json.slice(0, 300)}`;
    } catch {
      /* circular */
    }
  }
  return "Unhandled promise rejection";
};

// RLS / auth errors that are expected and noisy for ops alerts
const RLS_PATTERNS = [
  /The object can not be found here/i,
  /JWT/i,
  /row-level security/i,
];

const ASSESSMENT_STACK_RECOVERY_PREFIX = "assessment_stack_recovered_v1:";

const clearCachesAndReloadOnce = () => {
  if (typeof window === "undefined") return;
  const key = `${ASSESSMENT_STACK_RECOVERY_PREFIX}${location.pathname}`;
  try {
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
  } catch {
    return;
  }

  setTimeout(() => {
    (async () => {
      try {
        if (typeof caches !== "undefined") {
          const names = await caches.keys();
          await Promise.all(names.map((name) => caches.delete(name).catch(() => false)));
        }
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
        }
      } catch {
        // Best-effort recovery only.
      } finally {
        window.location.reload();
      }
    })();
  }, 100);
};

const recoverKnownAssessmentStackError = (message: string) => {
  if (!/Maximum call stack size exceeded/i.test(message)) return;
  if (!location.pathname.includes("/assessment/")) return;
  clearCachesAndReloadOnce();
};

export const reportError = async (params: {
  message: string;
  stack?: string;
  source?: string;
  severity?: "error" | "warning" | "critical";
}) => {
  const message = (params.message || "").trim();
  if (!message) return;
  if (IGNORE_PATTERNS.some((re) => re.test(message))) return;
  if (RLS_PATTERNS.some((re) => re.test(message))) return;

  const stack = params.stack || "";
  const fp = fingerprint(message, stack);

  const sent = getSentMap();
  const now = Date.now();
  // GC old entries
  for (const k of Object.keys(sent)) {
    if (now - sent[k] > DEBOUNCE_MS) delete sent[k];
  }
  if (sent[fp] && now - sent[fp] < DEBOUNCE_MS) return;
  sent[fp] = now;
  setSentMap(sent);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // skip unauthenticated errors
    await supabase.functions.invoke("report-error", {
      body: {
        message,
        stack,
        source: params.source || "frontend",
        severity: params.severity || "error",
        url: location.href,
        userAgent: navigator.userAgent,
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
      },
    });
  } catch {
    // Swallow — never let the reporter throw
  }
};

let installed = false;
export const installGlobalErrorReporter = () => {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    const msg = e.message || (e.error && e.error.message) || "Unknown window error";
    const stack = (e.error && e.error.stack) || `${msg}\n  at ${e.filename}:${e.lineno}:${e.colno}`;
    recoverKnownAssessmentStackError(msg);
    reportError({ message: msg, stack, source: "window.onerror" });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason: any = e.reason;
    const msg = describeReason(reason);
    const stack = reason?.stack || "";
    recoverKnownAssessmentStackError(msg);
    reportError({ message: msg, stack, source: "unhandledrejection" });
  });
};
