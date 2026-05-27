import { supabase } from "@/integrations/supabase/client";

export type TargetLang = "en" | "zh-CN" | "ja";

export async function translateKoTo(targetLang: TargetLang, texts: string[]): Promise<string[]> {
  const sourceTexts = texts.map((text) => (typeof text === "string" ? text : ""));
  if (sourceTexts.every((text) => !text.trim())) return sourceTexts.map(() => "");

  const { data, error } = await supabase.functions.invoke("translate", {
    body: { texts: sourceTexts, targetLang },
  });

  if (error) {
    console.error(`Translation error (${targetLang}):`, error);
    throw new Error("Translation failed");
  }

  const translations = Array.isArray(data?.translations) ? data.translations : [];
  if (translations.length === sourceTexts.length) {
    return translations.map((text) => (typeof text === "string" ? text : ""));
  }

  const aligned = sourceTexts.map(() => "");
  let idx = 0;
  sourceTexts.forEach((text, sourceIndex) => {
    if (text.trim()) aligned[sourceIndex] = typeof translations[idx] === "string" ? translations[idx] : "";
    if (text.trim()) idx += 1;
  });
  return aligned;
}

// Backwards-compatible helper used elsewhere in the codebase.
export async function translateKoToEn(texts: string[]): Promise<string[]> {
  return translateKoTo("en", texts);
}
