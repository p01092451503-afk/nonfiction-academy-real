import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LANG_LABEL: Record<string, string> = {
  en: "English",
  "zh-CN": "Simplified Chinese (简体中文)",
  ja: "Japanese (日本語)",
  yue: "Cantonese (廣東話, Traditional Chinese script, Hong Kong colloquial style)",
  ko: "Korean (한국어)",
};

const TERM_TRANSLATION_HINT: Record<string, string> = {
  ja: "For English action keywords, translate them into Japanese too: Uncover → 明らかにする, Listen → 聞く, Clarify → 明確にする, Engage → 関与する. Keep acronyms such as IDENTIFY or S.T.Y.L.E only when they are framework names.",
  "zh-CN": "For English action keywords, translate them into Simplified Chinese too: Uncover → 发现, Listen → 倾听, Clarify → 澄清, Engage → 参与. Keep acronyms such as IDENTIFY or S.T.Y.L.E only when they are framework names.",
  yue: "Use Traditional Chinese script and Hong Kong Cantonese colloquial style. For English action keywords: Uncover → 揭示, Listen → 聆聽, Clarify → 釐清, Engage → 投入. Keep acronyms such as IDENTIFY or S.T.Y.L.E only when they are framework names.",
  en: "Translate Korean text into English while preserving official framework acronyms such as IDENTIFY or S.T.Y.L.E.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { texts, targetLang = "en" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const sourceTexts = Array.isArray(texts) ? texts.map((text) => (typeof text === "string" ? text : "")) : [];
    const items = sourceTexts.map((text, index) => ({ index, text })).filter((item) => item.text.trim());
    if (items.length === 0) {
      return new Response(JSON.stringify({ translations: sourceTexts.map(() => "") }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetLabel = LANG_LABEL[targetLang] || "English";

    const keyedItems = Object.fromEntries(items.map((item) => [String(item.index), item.text]));
    const prompt = `Translate each input text to ${targetLabel}.
Return ONLY a JSON object whose keys exactly match the input keys and whose values are translated strings.
Translate Korean, English, and mixed-language text fully and naturally for the target language.
Do NOT leave English action words unchanged just because they look like keywords; translate them unless they are official brand/product names or framework acronyms.
If an input item is already a product name, keep the meaning and do not invent a different product.
${TERM_TRANSLATION_HINT[targetLang] || ""}

${JSON.stringify(keyedItems)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a professional LMS translator into ${targetLabel}. Translate Korean, English, and mixed-language input accurately and naturally. For course/content titles, keep them concise. For descriptions, maintain the original tone and meaning.`,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim() || "";

    const translatedByIndex: Record<string, string> = {};
    try {
      const cleaned = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        items.forEach((item) => {
          const translated = parsed[String(item.index)];
          translatedByIndex[String(item.index)] = typeof translated === "string" ? translated : "";
        });
      } else if (Array.isArray(parsed)) {
        parsed.forEach((item, translatedIndex) => {
          const source = items[translatedIndex];
          if (source) translatedByIndex[String(source.index)] = typeof item === "string" ? item : "";
        });
      }
    } catch {
      if (items.length === 1) translatedByIndex[String(items[0].index)] = content;
    }

    const translations = sourceTexts.map(() => "");
    items.forEach((item) => {
      translations[item.index] = translatedByIndex[String(item.index)] || "";
    });

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
