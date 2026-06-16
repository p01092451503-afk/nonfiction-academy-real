// One-off maintenance function: re-translate assessment_question_i18n rows
// whose translated fields still contain Korean (Hangul) characters.
// Usage: POST { langs?: ["ja","en","zh-CN"], limit?: 200, dry?: false }
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

const HANGUL_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const hasHangul = (s: unknown) =>
  typeof s === "string" ? HANGUL_RE.test(s)
  : Array.isArray(s) ? s.some((x) => typeof x === "string" && HANGUL_RE.test(x))
  : false;

async function translate(texts: string[], targetLang: string, apiKey: string): Promise<string[]> {
  const items = texts.map((t, i) => ({ i, t: (t ?? "").toString() }))
    .filter((x) => x.t.trim() && HANGUL_RE.test(x.t));
  if (items.length === 0) return texts.map(() => "");
  const keyed = Object.fromEntries(items.map((x) => [String(x.i), x.t]));
  const prompt = `Translate each Korean text to ${LANG_LABEL[targetLang]}.
Return ONLY a JSON object whose keys exactly match the input keys and whose values are translated strings.
Do NOT keep Korean characters in the output. Translate everything fully.
If an input is a product name, keep meaning.

${JSON.stringify(keyed)}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: `You are a professional Korean to ${LANG_LABEL[targetLang]} translator for an LMS. Translate accurately and naturally. Never output Korean.` },
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
    const body = await req.json().catch(() => ({}));
    const langs: string[] = body.langs || ["ja", "en", "zh-CN"];
    const limit: number = body.limit || 500;
    const dry: boolean = !!body.dry;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const report: Record<string, { scanned: number; fixed: number; failed: number; sample?: any }> = {};
    for (const lang of langs) {
      report[lang] = { scanned: 0, fixed: 0, failed: 0 };
      const { data: rows, error } = await sb
        .from("assessment_question_i18n")
        .select("question_id,language_code,question_text,options,correct_answer,hint,explanation")
        .eq("language_code", lang)
        .limit(limit);
      if (error) throw error;
      const bad = (rows || []).filter((r: any) =>
        hasHangul(r.question_text) || hasHangul(r.options) || hasHangul(r.correct_answer) ||
        hasHangul(r.hint) || hasHangul(r.explanation)
      );
      report[lang].scanned = bad.length;
      if (dry) { report[lang].sample = bad.slice(0, 3); continue; }

      for (const r of bad as any[]) {
        try {
          // Need original Korean source from assessment_questions to translate from KO.
          const { data: orig } = await sb.from("assessment_questions")
            .select("question_text,options,correct_answer,hint,explanation,question_type")
            .eq("id", r.question_id).single();
          if (!orig) { report[lang].failed++; continue; }
          const opts: string[] = Array.isArray(orig.options) ? orig.options : [];
          const inputs: string[] = [orig.question_text || ""];
          const optStart = inputs.length;
          opts.forEach((o) => inputs.push(o || ""));
          const optEnd = inputs.length;
          inputs.push(orig.correct_answer || "");
          inputs.push(orig.hint || "");
          inputs.push(orig.explanation || "");

          const out = await translate(inputs, lang, apiKey);
          const tQ = (out[0] || "").trim();
          const tOpts = out.slice(optStart, optEnd).map((s) => (s || "").trim());
          const tCorrect = (out[optEnd] || "").trim();
          const tHint = (out[optEnd + 1] || "").trim();
          const tExp = (out[optEnd + 2] || "").trim();

          const payload: any = {
            question_id: r.question_id,
            language_code: lang,
            question_text: tQ || r.question_text,
            options: tOpts.length ? tOpts : r.options,
            correct_answer: tCorrect || r.correct_answer,
            hint: tHint || r.hint || null,
            explanation: tExp || r.explanation || null,
          };
          const { error: ue } = await sb.from("assessment_question_i18n")
            .upsert(payload, { onConflict: "question_id,language_code" });
          if (ue) { report[lang].failed++; console.error("upsert", r.question_id, lang, ue.message); }
          else report[lang].fixed++;
        } catch (e) {
          report[lang].failed++;
          console.error("row", r.question_id, lang, (e as Error).message);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, report }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
