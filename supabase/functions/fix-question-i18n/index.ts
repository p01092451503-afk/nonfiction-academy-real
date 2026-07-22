// Maintenance function: translate/fix assessment_question_i18n rows that are
// missing, have the wrong option shape, or still contain Korean (Hangul).
// Usage: POST { langs?: ["ja","en","zh-CN"], limit?: 200, dry?: false, assessment_id?: string }
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
  yue: "Cantonese (廣東話, Traditional Chinese script, Hong Kong colloquial style)",
};

const TERM_TRANSLATION_HINT: Record<string, string> = {
  ja: "For English action keywords, translate them into Japanese too: Uncover → 明らかにする, Listen → 聞く, Clarify → 明確にする, Engage → 関与する. Keep acronyms such as IDENTIFY or S.T.Y.L.E only when they are framework names.",
  "zh-CN": "For English action keywords, translate them into Simplified Chinese too: Uncover → 发现, Listen → 倾听, Clarify → 澄清, Engage → 参与. Keep acronyms such as IDENTIFY or S.T.Y.L.E only when they are framework names.",
  yue: "Use Traditional Chinese script and Hong Kong Cantonese colloquial style. For English action keywords: Uncover → 揭示, Listen → 聆聽, Clarify → 釐清, Engage → 投入. Keep acronyms such as IDENTIFY or S.T.Y.L.E only when they are framework names.",
  en: "Translate Korean text into English while preserving official framework acronyms such as IDENTIFY or S.T.Y.L.E.",
};

const HANGUL_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const hasHangul = (s: unknown) =>
  typeof s === "string" ? HANGUL_RE.test(s)
  : Array.isArray(s) ? s.some((x) => typeof x === "string" && HANGUL_RE.test(x))
  : false;

const isChoiceQuestion = (questionType?: string) => ["multiple_choice_4", "multiple_choice_5", "ox"].includes(questionType || "");
const AI_TIMEOUT_MS = 12_000;

async function translate(texts: string[], targetLang: string, apiKey: string): Promise<string[]> {
  const items = texts.map((t, i) => ({ i, t: (t ?? "").toString() }))
    .filter((x) => x.t.trim());
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: `You are a professional LMS assessment translator into ${LANG_LABEL[targetLang]}. Translate Korean, English, and mixed-language input accurately and naturally. Never output Korean unless it is an official brand/product name.` },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI translation timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
    const langs: string[] = body.langs || ["ja", "en", "zh-CN", "yue"];
    const limit: number = body.limit || 500;
    const dry: boolean = !!body.dry;
    const assessmentId: string | undefined = body.assessment_id;

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
      let questionQuery = sb
        .from("assessment_questions")
        .select("id,assessment_id,question_text,options,correct_answer,hint,explanation,question_type")
        .limit(limit);
      if (assessmentId) questionQuery = questionQuery.eq("assessment_id", assessmentId);
      const { data: questions, error: questionError } = await questionQuery;
      if (questionError) throw questionError;

      const ids = (questions || []).map((q: any) => q.id).filter(Boolean);
      const existingMap = new Map<string, any>();
      if (ids.length > 0) {
        const { data: rows, error } = await sb
          .from("assessment_question_i18n")
          .select("question_id,language_code,question_text,options,correct_answer,hint,explanation")
          .eq("language_code", lang)
          .in("question_id", ids);
        if (error) throw error;
        (rows || []).forEach((r: any) => existingMap.set(r.question_id, r));
      }

      const bad = (questions || []).filter((q: any) => {
        const r = existingMap.get(q.id);
        if (!r) return true;
        if (hasHangul(r.question_text) || hasHangul(r.options) || hasHangul(r.correct_answer) || hasHangul(r.hint) || hasHangul(r.explanation)) return true;
        if (isChoiceQuestion(q.question_type) && Array.isArray(q.options)) {
          return !Array.isArray(r.options) || r.options.length !== q.options.length;
        }
        return false;
      });
      report[lang].scanned = bad.length;
      if (dry) { report[lang].sample = bad.slice(0, 3).map((q: any) => ({ question_id: q.id, assessment_id: q.assessment_id, missing: !existingMap.has(q.id) })); continue; }

      for (const orig of bad as any[]) {
        try {
          const opts: string[] = Array.isArray(orig.options) ? orig.options : [];
          const existing = existingMap.get(orig.id);
          const sourceCorrectIndex = isChoiceQuestion(orig.question_type) && Array.isArray(orig.options)
            ? orig.options.findIndex((option: string) => option === orig.correct_answer)
            : -1;

          // For choice questions the correct answer should stay aligned by option
          // index. If only this hidden answer field is dirty, fix it from the
          // already-translated option instead of calling AI for a long explanation.
          if (
            isChoiceQuestion(orig.question_type) &&
            existing &&
            Array.isArray(existing.options) &&
            existing.options.length === opts.length &&
            !hasHangul(existing.question_text) &&
            !hasHangul(existing.options) &&
            !hasHangul(existing.hint) &&
            !hasHangul(existing.explanation) &&
            sourceCorrectIndex >= 0 &&
            existing.options[sourceCorrectIndex]
          ) {
            const derivedCorrect = String(existing.options[sourceCorrectIndex]).trim();
            if (derivedCorrect && existing.correct_answer !== derivedCorrect) {
              const { error: ue } = await sb.from("assessment_question_i18n")
                .upsert({ ...existing, correct_answer: derivedCorrect }, { onConflict: "question_id,language_code" });
              if (ue) { report[lang].failed++; console.error("upsert", orig.id, lang, ue.message); }
              else report[lang].fixed++;
              continue;
            }
          }

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
          const tCorrect = sourceCorrectIndex >= 0 && tOpts[sourceCorrectIndex]
            ? tOpts[sourceCorrectIndex]
            : (out[optEnd] || "").trim();
          const tHint = (out[optEnd + 1] || "").trim();
          const tExp = (out[optEnd + 2] || "").trim();

          const payload: any = {
            question_id: orig.id,
            language_code: lang,
            question_text: tQ || orig.question_text,
            options: tOpts.length ? tOpts : opts,
            correct_answer: tCorrect || orig.correct_answer,
            hint: tHint || orig.hint || null,
            explanation: tExp || orig.explanation || null,
          };
          const { error: ue } = await sb.from("assessment_question_i18n")
            .upsert(payload, { onConflict: "question_id,language_code" });
          if (ue) { report[lang].failed++; console.error("upsert", orig.id, lang, ue.message); }
          else report[lang].fixed++;
        } catch (e) {
          report[lang].failed++;
          console.error("row", orig.id, lang, (e as Error).message);
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
