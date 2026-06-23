// On-demand: translate ONE assessment question into target language
// and upsert into assessment_question_i18n so it's cached for all users.
// Input: { question_id: string, target_lang: "en" | "ja" | "zh-CN" }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LANG_LABEL: Record<string, string> = {
  en: "English",
  "zh-CN": "Simplified Chinese (简体中文)",
  ja: "Japanese (日本語)",
};

const TERM_TRANSLATION_HINT: Record<string, string> = {
  ja: "For English action keywords, translate them into Japanese too: Uncover → 明らかにする, Listen → 聞く, Clarify → 明確にする, Engage → 関与する. Keep acronyms such as IDENTIFY or S.T.Y.L.E only when they are framework names.",
  "zh-CN": "For English action keywords, translate them into Simplified Chinese too: Uncover → 发现, Listen → 倾听, Clarify → 澄清, Engage → 参与. Keep acronyms such as IDENTIFY or S.T.Y.L.E only when they are framework names.",
  en: "Translate Korean text into English while preserving official framework acronyms such as IDENTIFY or S.T.Y.L.E.",
};

async function translateBatch(texts: string[], targetLang: string, apiKey: string): Promise<string[]> {
  const items = texts.map((t, i) => ({ i, t: (t ?? "").toString() })).filter((x) => x.t.trim());
  if (items.length === 0) return texts.map(() => "");
  const keyed = Object.fromEntries(items.map((x) => [String(x.i), x.t]));
  const prompt = `Translate each input text to ${LANG_LABEL[targetLang]}.
Return ONLY a JSON object whose keys exactly match the input keys and whose values are translated strings.
Translate Korean, English, and mixed-language text fully and naturally for the target language.
Do NOT keep Korean characters in the output unless they are part of an official brand/product name.
Do NOT leave English action words unchanged just because they look like keywords; translate them unless they are official brand/product names or framework acronyms.
For assessment choices, keep each option aligned with the same input key and do not merge or split choices.
${TERM_TRANSLATION_HINT[targetLang] || ""}

${JSON.stringify(keyed)}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: `You are a professional LMS assessment translator into ${LANG_LABEL[targetLang]}. Be accurate and natural. Translate Korean, English, and mixed-language input. Do not output Korean unless it is an official brand/product name.` },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const content = (j.choices?.[0]?.message?.content || "").trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(content);
  const out = texts.map((t) => t ?? "");
  items.forEach((x) => {
    const v = parsed[String(x.i)];
    if (typeof v === "string" && v.trim()) out[x.i] = v;
  });
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { question_id, target_lang } = await req.json();
    if (!question_id || !target_lang || !LANG_LABEL[target_lang]) {
      return new Response(JSON.stringify({ error: "question_id and target_lang(en|ja|zh-CN) required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: orig, error: oe } = await sb.from("assessment_questions")
      .select("id,question_text,options,correct_answer,hint,explanation,question_type")
      .eq("id", question_id).single();
    if (oe || !orig) throw new Error(oe?.message || "question not found");

    const opts: string[] = Array.isArray(orig.options) ? orig.options : [];
    const inputs: string[] = [orig.question_text || ""];
    const optStart = inputs.length;
    opts.forEach((o) => inputs.push(o || ""));
    const optEnd = inputs.length;
    inputs.push(orig.correct_answer || "");
    inputs.push(orig.hint || "");
    inputs.push(orig.explanation || "");

    const out = await translateBatch(inputs, target_lang, apiKey);
    const tQ = (out[0] || "").trim();
    const tOpts = out.slice(optStart, optEnd).map((s) => (s || "").trim());
    const tCorrect = (out[optEnd] || "").trim();
    const tHint = (out[optEnd + 1] || "").trim();
    const tExp = (out[optEnd + 2] || "").trim();

    const payload: any = {
      question_id,
      language_code: target_lang,
      question_text: tQ || orig.question_text,
      options: tOpts.length ? tOpts : opts,
      correct_answer: tCorrect || orig.correct_answer,
      hint: tHint || orig.hint || null,
      explanation: tExp || orig.explanation || null,
    };
    const { error: ue } = await sb.from("assessment_question_i18n")
      .upsert(payload, { onConflict: "question_id,language_code" });
    if (ue) throw new Error(`upsert failed: ${ue.message}`);

    return new Response(JSON.stringify({ ok: true, translation: payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-question-now error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
