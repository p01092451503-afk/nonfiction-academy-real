import { supabase } from "@/integrations/supabase/client";
import { translateKoTo, type TargetLang } from "@/lib/translate";
import type { MultilingualValue, MlLang } from "@/components/admin/MultilingualTextFields";

const TARGET_LANGS: TargetLang[] = ["en", "ja", "zh-CN"];

/**
 * Saves Korean + English/Japanese/Chinese translations for a record into an i18n table.
 * Auto-translates KO→{en,ja,zh-CN} for any language with empty title/content.
 */
export async function saveContentTranslations(params: {
  table: "announcement_i18n" | "board_post_i18n";
  fkColumn: "announcement_id" | "post_id";
  recordId: string;
  value: MultilingualValue;
}) {
  const { table, fkColumn, recordId, value } = params;

  // For each target lang, translate any empty field
  const filled: Record<MlLang, { title: string; content: string }> = {
    ko: { title: value.ko.title, content: value.ko.content },
    en: { title: value.en.title.trim(), content: value.en.content.trim() },
    ja: { title: value.ja.title.trim(), content: value.ja.content.trim() },
    "zh-CN": { title: value["zh-CN"].title.trim(), content: value["zh-CN"].content.trim() },
  };

  await Promise.all(
    TARGET_LANGS.map(async (lc) => {
      const cur = filled[lc];
      const needsTitle = !cur.title;
      const needsContent = !cur.content;
      if (!needsTitle && !needsContent) return;
      try {
        const [tt, tc] = await translateKoTo(lc, [
          needsTitle ? value.ko.title : "",
          needsContent ? value.ko.content : "",
        ]);
        if (needsTitle) cur.title = tt || value.ko.title;
        if (needsContent) cur.content = tc || value.ko.content;
      } catch {
        if (needsTitle) cur.title = value.ko.title;
        if (needsContent) cur.content = value.ko.content;
      }
    })
  );

  // Delete existing translations for clean insert
  await (supabase as any).from(table).delete().eq(fkColumn, recordId);

  const rows = (Object.keys(filled) as MlLang[]).map((lc) => ({
    [fkColumn]: recordId,
    language_code: lc,
    title: filled[lc].title,
    content: filled[lc].content,
  }));
  const { error } = await (supabase as any).from(table).insert(rows);
  if (error) throw error;
}

/**
 * Loads existing translations for editing.
 * Falls back to base record fields if no translations exist.
 */
export async function loadContentTranslations(params: {
  table: "announcement_i18n" | "board_post_i18n";
  fkColumn: "announcement_id" | "post_id";
  recordId: string;
  fallbackTitle: string;
  fallbackContent: string;
}): Promise<MultilingualValue> {
  const { table, fkColumn, recordId, fallbackTitle, fallbackContent } = params;
  const { data } = await (supabase as any)
    .from(table)
    .select("language_code, title, content")
    .eq(fkColumn, recordId);
  const pick = (lc: string) => (data || []).find((r: any) => r.language_code === lc);
  const ko = pick("ko");
  return {
    ko: { title: ko?.title ?? fallbackTitle, content: ko?.content ?? fallbackContent },
    en: { title: pick("en")?.title ?? "", content: pick("en")?.content ?? "" },
    ja: { title: pick("ja")?.title ?? "", content: pick("ja")?.content ?? "" },
    "zh-CN": { title: pick("zh-CN")?.title ?? "", content: pick("zh-CN")?.content ?? "" },
  };
}

/**
 * Picks the best translation for a given language, falling back to KO then base.
 */
export function pickTranslation<T extends { language_code: string; title: string; content: string }>(
  translations: T[] | undefined | null,
  lang: string,
  fallback: { title: string; content: string }
): { title: string; content: string } {
  if (!translations?.length) return fallback;
  const match = translations.find((t) => t.language_code === lang);
  if (match) return { title: match.title, content: match.content };
  const ko = translations.find((t) => t.language_code === "ko");
  if (ko) return { title: ko.title, content: ko.content };
  return fallback;
}
