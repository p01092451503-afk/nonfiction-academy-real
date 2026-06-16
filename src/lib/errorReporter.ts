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
];

// RLS / auth errors that are expected and noisy for ops alerts
const RLS_PATTERNS = [
  /The object can not be found here/i,
  /JWT/i,
  /row-level security/i,
];

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
    reportError({ message: msg, stack, source: "window.onerror" });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason: any = e.reason;
    const msg =
      typeof reason === "string"
        ? reason
        : reason?.message || "Unhandled promise rejection";
    const stack = reason?.stack || "";
    reportError({ message: msg, stack, source: "unhandledrejection" });
  });
};
