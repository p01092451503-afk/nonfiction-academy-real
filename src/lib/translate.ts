import { supabase } from "@/integrations/supabase/client";

export type TargetLang = "en" | "zh-CN" | "ja";

export async function translateKoTo(targetLang: TargetLang, texts: string[]): Promise<string[]> {
  const filtered = texts.filter((t) => t.trim());
  if (filtered.length === 0) return texts.map(() => "");

  const { data, error } = await supabase.functions.invoke("translate", {
    body: { texts: filtered, targetLang },
  });

  if (error) {
    console.error(`Translation error (${targetLang}):`, error);
    throw new Error("Translation failed");
  }

  return data.translations || [];
}

// Backwards-compatible helper used elsewhere in the codebase.
export async function translateKoToEn(texts: string[]): Promise<string[]> {
  return translateKoTo("en", texts);
}
