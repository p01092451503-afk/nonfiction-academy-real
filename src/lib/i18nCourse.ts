/**
 * Pick the localized title/description for a course based on current language.
 * Falls back to the base (Korean) value if no translation exists.
 *
 * Works with any row that has a `course_i18n` joined array like
 * `course_i18n(language_code, title, description)`.
 */
export type I18nRow = { language_code: string; title?: string | null; description?: string | null };

export const pickLocalizedField = <T extends { title?: string | null; description?: string | null; course_i18n?: I18nRow[] | null }>(
  course: T | null | undefined,
  lang: string,
  field: "title" | "description" = "title"
): string => {
  if (!course) return "";
  const base = (course as any)[field] || "";
  if (!lang || lang === "ko") return base;
  const rows: I18nRow[] = (course as any).course_i18n || [];
  const match = rows.find((r) => r.language_code === lang);
  return (match && (match as any)[field]) || base;
};

/** Returns a new object with `title` (and `description` if present) overridden by the active locale. */
export const localizeCourse = <T extends { title?: string | null; description?: string | null; course_i18n?: I18nRow[] | null }>(
  course: T,
  lang: string
): T => ({
  ...course,
  title: pickLocalizedField(course, lang, "title"),
  description: pickLocalizedField(course, lang, "description"),
});
