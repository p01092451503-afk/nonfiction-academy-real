import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LANG_LABEL: Record<string, string> = {
  en: "English",
  "zh-CN": "Simplified Chinese (简体中文)",
  ja: "Japanese (日本語)",
  ko: "Korean (한국어)",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { texts, targetLang = "en" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const filtered = (texts as string[]).filter((t: string) => t.trim());
    if (filtered.length === 0) {
      return new Response(JSON.stringify({ translations: texts.map(() => "") }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetLabel = LANG_LABEL[targetLang] || "English";

    const prompt = filtered.length === 1
      ? `Translate the following Korean text to ${targetLabel}. Return ONLY the translated text, nothing else.\n\n${filtered[0]}`
      : `Translate each of the following Korean texts to ${targetLabel}. Return a JSON array of translated strings in the same order. Return ONLY the JSON array, nothing else.\n\n${JSON.stringify(filtered)}`;

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
            content: `You are a professional Korean to ${targetLabel} translator for an LMS (Learning Management System). Translate accurately and naturally. For course/content titles, keep them concise. For descriptions, maintain the original tone and meaning.`,
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

    let translations: string[];
    if (filtered.length === 1) {
      translations = [content];
    } else {
      try {
        const cleaned = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
        translations = JSON.parse(cleaned);
      } catch {
        translations = [content];
      }
    }

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
