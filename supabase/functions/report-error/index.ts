// Operational error alert dispatcher
// Receives runtime errors from the frontend, debounces by fingerprint (5 min),
// and dispatches to email (via email queue) + Slack DM.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALERT_EMAIL = "p01092451503@gmail.com";
const SLACK_CHANNEL = "C0AK3KDJPU3";
const DEBOUNCE_MINUTES = 5;
const SLACK_GATEWAY = "https://connector-gateway.lovable.dev/slack/api";

// Whitelist: only alert for errors that belong to THIS Supabase project.
// Other projects' Supabase/LockManager noise (foreign project refs) is dropped.
const PROJECT_REF = "jabagvlhgxrwbnxyrmvv";
// Matches any 20-char lowercase Supabase project ref appearing in URLs like
// https://<ref>.supabase.co or sb-<ref>-auth-token localStorage keys.
const SUPABASE_REF_RE = /\b([a-z]{20})\.supabase\.co\b|sb-([a-z]{20})-auth-token/gi;

const containsForeignSupabaseRef = (text: string): boolean => {
  if (!text) return false;
  SUPABASE_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SUPABASE_REF_RE.exec(text)) !== null) {
    const ref = (m[1] || m[2] || "").toLowerCase();
    if (ref && ref !== PROJECT_REF) return true;
  }
  return false;
};

// LockManager errors ("NavigatorLockAcquireTimeoutError", "Acquiring an exclusive
// Navigator LockManager lock ...") originate from the Supabase auth client. When
// they come from a foreign project ref (e.g. a user has multiple Supabase apps
// open), we drop them entirely.
const LOCK_MANAGER_RE = /NavigatorLockAcquireTimeout|Navigator LockManager|@supabase\/auth-js.*lock/i;

const sha1 = async (s: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};

const sendSlackMessage = async (text: string): Promise<{ ok: boolean; error?: string }> => {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const slackKey = Deno.env.get("SLACK_API_KEY");
  if (!lovableKey || !slackKey) return { ok: false, error: "Slack not configured" };

  try {
    const postRes = await fetch(`${SLACK_GATEWAY}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": slackKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: SLACK_CHANNEL, text, mrkdwn: true }),
    });
    const post = await postRes.json();
    if (!post.ok) return { ok: false, error: `chat.postMessage: ${post.error}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const message: string = String(body.message ?? "").slice(0, 1000);
    const source: string = String(body.source ?? "frontend").slice(0, 100);
    const url: string = String(body.url ?? "").slice(0, 500);
    const stack: string = String(body.stack ?? "").slice(0, 4000);
    const userAgent: string = String(body.userAgent ?? "").slice(0, 500);
    const userId: string | null = body.userId ?? null;
    const userEmail: string | null = body.userEmail ?? null;
    const severity: string = String(body.severity ?? "error").slice(0, 20);

    if (!message) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Project whitelist filter ===
    // Combine all fields that might carry a Supabase project ref, then check:
    //   1) If any FOREIGN ref is mentioned → drop (not our project).
    //   2) If it's a LockManager error AND no reference to OUR project → drop.
    const haystack = `${message}\n${stack}\n${url}`;
    const mentionsOurRef =
      haystack.includes(PROJECT_REF) ||
      // Our app is served from these hosts; treat them as our project too.
      /nonfiction-academy\.(lovable\.app|webheads\.co\.kr)/i.test(haystack) ||
      /32613697-36d8-44de-a44f-4b31fe45576b\.lovable\.app/i.test(haystack);

    if (containsForeignSupabaseRef(haystack) && !mentionsOurRef) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "foreign_project_ref" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (LOCK_MANAGER_RE.test(`${message}\n${stack}`) && !mentionsOurRef) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "lockmanager_no_project_ref" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fingerprint = first line of message + URL path + first stack frame
    const stackHead = (stack.split("\n").find((l) => l.trim().startsWith("at ")) || "").trim();
    const pathOnly = (() => { try { return new URL(url).pathname; } catch { return url; } })();
    // Normalize UUIDs and numeric IDs so the same error on different resources
    // (e.g. different assessment IDs) collapses into a single fingerprint.
    const normalizedPath = pathOnly
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid")
      .replace(/\/\d+(?=\/|$)/g, "/:id");
    const fingerprint = await sha1(`${message.split("\n")[0]}|${normalizedPath}|${stackHead}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Debounce: look up last alert for this fingerprint within window
    const since = new Date(Date.now() - DEBOUNCE_MINUTES * 60_000).toISOString();
    const { data: recent } = await supabase
      .from("error_alert_log")
      .select("id, occurrence_count")
      .eq("fingerprint", fingerprint)
      .gte("last_alerted_at", since)
      .order("last_alerted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent) {
      await supabase
        .from("error_alert_log")
        .update({ occurrence_count: recent.occurrence_count + 1 })
        .eq("id", recent.id);
      return new Response(JSON.stringify({ ok: true, debounced: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record this alert
    await supabase.from("error_alert_log").insert({
      fingerprint, message, source, url, user_id: userId, user_email: userEmail,
      user_agent: userAgent, stack, severity,
    });

    const when = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const subject = `🚨 [Nonfiction 운영 알림] ${message.split("\n")[0].slice(0, 80)}`;
    const htmlBody = `
      <div style="font-family:system-ui,sans-serif;max-width:640px">
        <h2 style="color:#b91c1c;margin:0 0 12px">운영 오류 감지</h2>
        <p style="color:#6b7280;margin:0 0 16px">발생 시각: ${when} (KST)</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#6b7280;width:100px">메시지</td><td><strong>${escapeHtml(message)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">유형</td><td>${escapeHtml(source)} / ${escapeHtml(severity)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">URL</td><td>${escapeHtml(url)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">사용자</td><td>${escapeHtml(userEmail || userId || "비로그인")}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;vertical-align:top">스택</td><td><pre style="background:#f3f4f6;padding:10px;border-radius:6px;overflow:auto;white-space:pre-wrap;font-size:12px">${escapeHtml(stack || "(없음)")}</pre></td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px">동일 오류는 ${DEBOUNCE_MINUTES}분간 추가 알림이 발송되지 않습니다.</p>
      </div>
    `;

    const slackText =
      `🚨 *Nonfiction 운영 오류*\n` +
      `*메시지:* ${message.split("\n")[0]}\n` +
      `*URL:* ${url || "-"}\n` +
      `*사용자:* ${userEmail || userId || "비로그인"}\n` +
      `*시각:* ${when} (KST)\n` +
      (stackHead ? `*위치:* \`${stackHead}\`\n` : "") +
      `\n_동일 오류는 ${DEBOUNCE_MINUTES}분간 묶입니다._`;

    // Dispatch (parallel, don't fail the whole request if one channel fails)
    const [emailRes, slackRes] = await Promise.allSettled([
      supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          purpose: "transactional",
          template_name: "ops-error-alert",
          to: ALERT_EMAIL,
          subject,
          html: htmlBody,
          idempotency_key: `ops-error-${fingerprint}-${Date.now()}`,
        },
      }),
      sendSlackMessage(slackText),
    ]);

    const emailOk = emailRes.status === "fulfilled" && !emailRes.value.error;
    const slackOk = slackRes.status === "fulfilled" && slackRes.value.ok;

    return new Response(JSON.stringify({
      ok: true,
      email: emailOk,
      slack: slackOk,
      slack_error: slackRes.status === "fulfilled" ? slackRes.value.error : String(slackRes.reason),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("report-error failed", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}
