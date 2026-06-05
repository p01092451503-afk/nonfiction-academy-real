// Generates a plain-language explanation and a Lovable build prompt for a captured runtime error.
// Uses the Lovable AI Gateway (google/gemini-2.5-flash) — no extra secrets required.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

interface ErrorRow {
  id: string;
  message: string;
  source: string | null;
  url: string | null;
  stack: string | null;
  severity: string | null;
  occurrence_count: number | null;
  user_email: string | null;
  user_agent: string | null;
  last_alerted_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // role check via RPC
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isAdmin && !isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const errorId: string | undefined = body?.error_id;
    if (!errorId) {
      return new Response(JSON.stringify({ error: "error_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: row, error: rowErr } = await svc
      .from("error_alert_log")
      .select("id, message, source, url, stack, severity, occurrence_count, user_email, user_agent, last_alerted_at")
      .eq("id", errorId)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) {
      return new Response(JSON.stringify({ error: "Error not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const e = row as ErrorRow;

    const systemPrompt =
      "당신은 React/TypeScript/Supabase 기반 LMS 플랫폼의 시니어 엔지니어입니다. " +
      "운영 중 발생한 런타임 오류 로그를 받아서, (1) 한국어로 원인과 영향 범위를 비기술자도 이해할 수 있도록 간결히 설명하고, " +
      "(2) AI 코드 빌더에 그대로 붙여넣어 수정 작업을 지시할 수 있는 한국어 작업 프롬프트를 작성합니다. " +
      "프롬프트는 명령형으로, 어떤 파일/함수/조건을 확인하고 어떻게 고쳐야 하는지 단계별로 적되 추측은 분명히 표시하세요. " +
      "반드시 아래 JSON 스키마로만 응답하세요. 코드블록/마크다운/설명 금지." +
      ' 스키마: {"explanation": string, "fix_prompt": string}';

    const userPrompt = `다음은 운영 환경에서 캡처된 오류 로그입니다.

[메시지]
${e.message}

[발생 위치 URL]
${e.url ?? "(없음)"}

[심각도/소스]
${e.severity ?? "error"} / ${e.source ?? "frontend"}

[누적 발생 횟수]
${e.occurrence_count ?? 1}회 (최근 알림: ${e.last_alerted_at})

[영향 사용자]
${e.user_email ?? "비로그인 또는 미확인"}

[User Agent]
${e.user_agent ?? "-"}

[스택 트레이스]
${e.stack ?? "(없음)"}

요청:
1. "explanation" 필드에 원인 추정, 영향 범위, 재현 조건, 우선순위를 한국어로 6~10줄 이내로 정리.
2. "fix_prompt" 필드에 AI 코드 빌더에 그대로 붙여넣을 한국어 작업 지시문을 작성. 다음을 포함:
   - 수정해야 할 추정 파일/함수
   - 재현/검증 절차
   - 안전한 가드(예: null 체크, optional chaining, RLS/권한 점검 등)
   - 회귀 방지 체크리스트
   반드시 명령형으로 ("~을 수정해줘", "~을 추가해줘") 작성.`;

    const aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "AI 사용 한도 초과 — 잠시 후 다시 시도하세요." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI 사용 크레딧이 부족합니다. 워크스페이스 설정에서 충전 후 다시 시도하세요." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway ${aiRes.status}: ${text.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { explanation?: string; lovable_prompt?: string } = {};
    try { parsed = JSON.parse(content); } catch { parsed = { explanation: content, lovable_prompt: "" }; }

    const explanation = (parsed.explanation ?? "").toString().slice(0, 8000);
    const lovablePrompt = (parsed.lovable_prompt ?? "").toString().slice(0, 8000);
    const now = new Date().toISOString();

    await svc.from("error_alert_log").update({
      ai_explanation: explanation,
      ai_lovable_prompt: lovablePrompt,
      ai_generated_at: now,
    }).eq("id", errorId);

    return new Response(JSON.stringify({
      ok: true,
      explanation,
      lovable_prompt: lovablePrompt,
      generated_at: now,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("error-analyze failed", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
