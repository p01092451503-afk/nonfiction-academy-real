/**
 * Shared helpers for picking the correct multilingual title/description on
 * course content rows.
 *
 * Data model contract (DO NOT regress — see mem://features/course-creation-tools):
 *   - `course_contents` has one row per language (column `language_code`).
 *     The row's own `title` / `description` / `video_url` are the source of truth.
 *   - `course_content_i18n` is LEGACY and only used as a defensive fallback
 *     when the row's native field is empty. It may contain placeholder data
 *     (e.g. "Lesson 2") which must not override a populated native title.
 *   - `courses` uses `course_i18n(language_code, title, description)` to
 *     localize the course-level title.
 *
 * These helpers exist as a single source of truth so the learning screen
 * (ContentPlayer) and the course detail page render identical titles, and
 * so the behaviour is covered by `courseContentI18n.test.ts`.
 */

export type ContentI18nRow = {
  content_id: string;
  language_code: string;
  title?: string | null;
  description?: string | null;
  video_url?: string | null;
  video_provider?: string | null;
};

export type CourseI18nRow = {
  language_code: string;
  title?: string | null;
  description?: string | null;
};

export type CourseContentLike = {
  id: string;
  language_code?: string | null;
  title?: string | null;
  description?: string | null;
  video_url?: string | null;
  video_provider?: string | null;
};

const containsHangul = (value: string | null | undefined) => /[가-힣]/.test(value || "");

/**
 * Remove repetitive "n차시." / "Lesson N." / "第 N 课." / "レッスン N." /
 * "第 N 回." prefixes that some legacy data injects into the title.
 * If stripping leaves an empty string (placeholder-only title) keep the
 * original so the row never renders blank.
 */
export function stripLessonPrefix(title: string | null | undefined): string {
  const s = (title || "")
    .replace(/^\d+\s*차시[\.:：]?\s+/, "")
    .replace(/^Lesson\s*\d+[\.:]?\s+/i, "")
    .replace(/^第\s*\d+\s*课[.:：]?\s+/, "")
    .replace(/^レッスン\s*\d+[.:：]?\s+/, "")
    .replace(/^第\s*\d+\s*回[.:：]?\s+/, "")
    .trim();
  return s || (title || "");
}

/**
 * Localize a lesson prefix according to the given language code.
 * Strips any existing prefix variant first, then prepends the localized form.
 *   ko    → "1차시. <title>"
 *   en    → "Lesson 1. <title>"
 *   ja    → "レッスン 1. <title>"
 *   zh-*  → "第 1 课. <title>"
 */
export function localizeLessonPrefix(
  title: string | null | undefined,
  _lang: string | null | undefined,
  _index: number,
): string {
  // 다국어 차시는 동일 콘텐츠의 언어 변형이므로 "1차시./Lesson 1." 같은 번호 접두사를 표시하지 않는다.
  return stripLessonPrefix(title);
}

/** Find legacy i18n row for a given content + row language. */
export function pickContentI18n(
  rows: ContentI18nRow[] | null | undefined,
  contentId: string,
  rowLang: string | null | undefined,
): ContentI18nRow | undefined {
  if (!rows || !rowLang) return undefined;
  return rows.find((r) => r.content_id === contentId && r.language_code === rowLang);
}

/**
 * Pick the rendered title for a course-content row.
 * Priority: native row title → legacy i18n title → empty string.
 * Always strips lesson-number prefixes.
 */
export function getContentTitle(
  content: CourseContentLike,
  i18nRows: ContentI18nRow[] | null | undefined,
): string {
  const fallback = pickContentI18n(i18nRows, content.id, content.language_code)?.title;
  return stripLessonPrefix(content.title || fallback || "");
}

/** Same priority chain for description. */
export function getContentDescription(
  content: CourseContentLike,
  i18nRows: ContentI18nRow[] | null | undefined,
): string | null {
  const fallback = pickContentI18n(i18nRows, content.id, content.language_code)?.description;
  return content.description || fallback || null;
}

/** Same priority chain for video URL. */
export function getContentVideoUrl(
  content: CourseContentLike,
  i18nRows: ContentI18nRow[] | null | undefined,
): string | null {
  const fallback = pickContentI18n(i18nRows, content.id, content.language_code)?.video_url;
  return content.video_url || fallback || null;
}

/** Same priority chain for video provider. */
export function getContentVideoProvider(
  content: CourseContentLike,
  i18nRows: ContentI18nRow[] | null | undefined,
): string | null {
  const fallback = pickContentI18n(i18nRows, content.id, content.language_code)?.video_provider;
  return content.video_provider || fallback || null;
}

/**
 * Pick the course-level title for the active UI language.
 * Falls back to the base (Korean) title when no translation row matches.
 */
export function getCourseTitleByLang(
  base: { title?: string | null } | null | undefined,
  i18n: CourseI18nRow[] | null | undefined,
  lang: string,
): string {
  const baseTitle = base?.title || "";
  if (!lang || lang === "ko") return baseTitle;
  const tr = i18n?.find((r) => r.language_code === lang);
  return tr?.title || baseTitle;
}

/** Same for course-level description. */
export function getCourseDescByLang(
  base: { description?: string | null } | null | undefined,
  i18n: CourseI18nRow[] | null | undefined,
  lang: string,
): string {
  const baseDesc = base?.description || "";
  if (!lang || lang === "ko") return baseDesc;
  const tr = i18n?.find((r) => r.language_code === lang);
  return tr?.description || baseDesc;
}

/**
 * Same as `getCourseTitleByLang`, but if there is no course-level translation
 * for `lang`, fall back to the title of the first published course-content row
 * that exists in that language (with lesson-number prefix stripped).
 * Only when no such content exists do we fall back to the base Korean title.
 *
 * Used on the student-facing course detail / player so the course header does
 * not stay Korean when the admin only translated the chapters.
 */
export function getCourseTitleByLangWithContentFallback(
  base: { title?: string | null } | null | undefined,
  i18n: CourseI18nRow[] | null | undefined,
  contents: CourseContentLike[] | null | undefined,
  contentI18n: ContentI18nRow[] | null | undefined,
  lang: string,
): string {
  const baseTitle = base?.title || "";
  if (!lang || lang === "ko") return baseTitle;
  const tr = i18n?.find((r) => r.language_code === lang);
  if (tr?.title && tr.title.trim() && !containsHangul(tr.title)) return tr.title;
  const match = (contents || []).find((c) => (c.language_code || "ko") === lang);
  if (match) {
    const t = getContentTitle(match, contentI18n);
    if (t && t.trim()) return t;
  }
  return baseTitle;
}

/**
 * Returns true when a course-content row has uploaded learning material.
 * Rules:
 *   - video / document → requires a non-empty `video_url`
 *   - media_package    → requires the content id to be in `mediaPackageContentIds`
 *   - other types (quiz, assignment, live, etc.) → always considered uploaded
 * Used to hide empty multilingual content rows from the student curriculum list.
 */
export function hasUploadedContent(
  content: { id: string; content_type?: string | null; video_url?: string | null },
  mediaPackageContentIds: Set<string> | null | undefined,
  videoPackageContentIds?: Set<string> | null | undefined,
): boolean {
  const type = (content.content_type || "video").toLowerCase();
  if (type === "video" || type === "document") {
    return !!(content.video_url && content.video_url.trim());
  }
  if (type === "media_package") {
    return !!mediaPackageContentIds && mediaPackageContentIds.has(content.id);
  }
  if (type === "video_package") {
    return !!videoPackageContentIds && videoPackageContentIds.has(content.id);
  }
  return true;
}
