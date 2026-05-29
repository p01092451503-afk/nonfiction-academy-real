/**
 * Pick the localized title/description for a course based on current language.
 * Falls back to the base (Korean) value if no translation exists.
 *
 * Works with any row that has a `course_i18n` joined array like
 * `course_i18n(language_code, title, description)`.
 */
export type I18nRow = { language_code: string; title?: string | null; description?: string | null };
export type CourseContentFallbackRow = {
  language_code?: string | null;
  title?: string | null;
  is_published?: boolean | null;
  order_index?: number | null;
};

const HANGUL_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

const isUnsafeTranslation = (value: string | null | undefined, koSource: string | null | undefined) => {
  const translated = (value || "").trim();
  const source = (koSource || "").trim();
  if (!translated) return false;
  return HANGUL_RE.test(translated) || (!!source && translated === source);
};

const pickContentTitleFallback = (
  contents: CourseContentFallbackRow[] | null | undefined,
  lang: string,
): string => {
  if (!contents || !lang || lang === "ko") return "";
  const sameLang = contents
    .filter((content) => (content.language_code || "ko") === lang && content.is_published !== false)
    .sort((a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999));
  return sameLang.find((content) => content.title?.trim() && !HANGUL_RE.test(content.title))?.title?.trim() || "";
};

export const pickLocalizedField = <T extends { title?: string | null; description?: string | null; course_i18n?: I18nRow[] | null; course_contents?: CourseContentFallbackRow[] | null }>(
  course: T | null | undefined,
  lang: string,
  field: "title" | "description" = "title"
): string => {
  if (!course) return "";
  const base = (course as any)[field] || "";
  if (!lang || lang === "ko") return base;
  const rows: I18nRow[] = (course as any).course_i18n || [];
  const match = rows.find((r) => r.language_code === lang);
  const translated = (match && (match as any)[field]) || "";
  if (translated && !isUnsafeTranslation(translated, base)) return translated;
  if (field === "title") return pickContentTitleFallback((course as any).course_contents, lang) || base;
  return base;
};

/** Returns a new object with `title` (and `description` if present) overridden by the active locale. */
export const localizeCourse = <T extends { title?: string | null; description?: string | null; course_i18n?: I18nRow[] | null; course_contents?: CourseContentFallbackRow[] | null }>(
  course: T,
  lang: string
): T => ({
  ...course,
  title: pickLocalizedField(course, lang, "title"),
  description: pickLocalizedField(course, lang, "description"),
});
