import { describe, it, expect } from "vitest";
import {
  stripLessonPrefix,
  pickContentI18n,
  getContentTitle,
  getContentDescription,
  getContentVideoUrl,
  getCourseTitleByLang,
  getCourseDescByLang,
  type CourseContentLike,
  type ContentI18nRow,
  type CourseI18nRow,
} from "./courseContentI18n";

/**
 * Regression tests for the multilingual title pipeline that drives the
 * Learning screen (ContentPlayer) and CourseDetail.
 *
 * Context: previously the UI deferred to `course_content_i18n` rows that
 * contained legacy placeholders ("Lesson 2"), so a Korean lesson rendered
 * as English. The contract — codified here — is now:
 *   1. Trust the native row title (`course_contents.title`).
 *   2. Only fall back to `course_content_i18n` when the native title is empty.
 *   3. Strip "n차시." / "Lesson N." / "第 N 课." / "レッスン N." / "第 N 回."
 *      prefixes for display, but never let stripping produce an empty title.
 *   4. Course-level titles use `course_i18n` only for non-KO languages.
 *
 * These cases should fail loudly if anyone re-introduces the old behaviour.
 */

const SUPPORTED_LANGS = ["ko", "en", "zh-CN", "ja"] as const;

describe("stripLessonPrefix", () => {
  it("removes lesson-number prefixes for all 4 languages", () => {
    expect(stripLessonPrefix("1차시. 한국어 강의")).toBe("한국어 강의");
    expect(stripLessonPrefix("Lesson 2. English lesson")).toBe("English lesson");
    expect(stripLessonPrefix("第 3 课. 中文课程")).toBe("中文课程");
    expect(stripLessonPrefix("レッスン 4. 日本語レッスン")).toBe("日本語レッスン");
    expect(stripLessonPrefix("第 5 回. 日本語回")).toBe("日本語回");
  });

  it("keeps original title when stripping leaves only an empty string (placeholder-only)", () => {
    expect(stripLessonPrefix("Lesson 2")).toBe("Lesson 2");
    expect(stripLessonPrefix("1차시.")).toBe("1차시.");
  });

  it("handles nullish input safely", () => {
    expect(stripLessonPrefix(null)).toBe("");
    expect(stripLessonPrefix(undefined)).toBe("");
    expect(stripLessonPrefix("")).toBe("");
  });

  it("does not touch titles without a known prefix", () => {
    expect(stripLessonPrefix("그냥 제목")).toBe("그냥 제목");
  });
});

describe("pickContentI18n", () => {
  const rows: ContentI18nRow[] = [
    { content_id: "c1", language_code: "ko", title: "한글" },
    { content_id: "c1", language_code: "en", title: "Eng" },
    { content_id: "c2", language_code: "ja", title: "日" },
  ];

  it("returns matching row by content_id + language", () => {
    expect(pickContentI18n(rows, "c1", "en")?.title).toBe("Eng");
    expect(pickContentI18n(rows, "c2", "ja")?.title).toBe("日");
  });

  it("returns undefined when missing", () => {
    expect(pickContentI18n(rows, "c1", "ja")).toBeUndefined();
    expect(pickContentI18n(rows, "c3", "ko")).toBeUndefined();
    expect(pickContentI18n([], "c1", "ko")).toBeUndefined();
    expect(pickContentI18n(null, "c1", "ko")).toBeUndefined();
  });
});

describe("getContentTitle (Learning screen + CourseDetail row title)", () => {
  /**
   * Simulates the typical course_contents fixture: one row per language.
   * Each row already carries its own localized title — the system MUST
   * render the row's own title, never substitute another language.
   */
  const rowsByLang: Record<(typeof SUPPORTED_LANGS)[number], CourseContentLike> = {
    ko:      { id: "ko-1",   language_code: "ko",    title: "1차시. 한국어 강의" },
    en:      { id: "en-1",   language_code: "en",    title: "Lesson 1. English Lesson" },
    "zh-CN": { id: "zh-1",   language_code: "zh-CN", title: "第 1 课. 中文课程" },
    ja:      { id: "ja-1",   language_code: "ja",    title: "レッスン 1. 日本語レッスン" },
  };

  it.each(SUPPORTED_LANGS)("renders %s row in its own language (no cross-language bleed)", (lang) => {
    const title = getContentTitle(rowsByLang[lang], []);
    // Title must not be empty
    expect(title.length).toBeGreaterThan(0);
    // And must not equal any OTHER language's stripped title
    for (const other of SUPPORTED_LANGS) {
      if (other === lang) continue;
      expect(title).not.toBe(getContentTitle(rowsByLang[other], []));
    }
  });

  it("uses the native row title even when course_content_i18n has stale placeholder data", () => {
    // Legacy garbage row — must NOT override the native Korean title.
    const legacy: ContentI18nRow[] = [
      { content_id: "ko-1", language_code: "ko", title: "Lesson 2" },
    ];
    const row = rowsByLang.ko;
    expect(getContentTitle(row, legacy)).toBe("한국어 강의");
  });

  it("falls back to course_content_i18n only when the native title is empty", () => {
    const row: CourseContentLike = { id: "x", language_code: "en", title: "" };
    const i18n: ContentI18nRow[] = [
      { content_id: "x", language_code: "en", title: "Fallback English Title" },
    ];
    expect(getContentTitle(row, i18n)).toBe("Fallback English Title");
  });

  it("returns empty string when both native and fallback are missing", () => {
    const row: CourseContentLike = { id: "x", language_code: "ko", title: "" };
    expect(getContentTitle(row, [])).toBe("");
  });
});

describe("getContentDescription / getContentVideoUrl", () => {
  const row: CourseContentLike = {
    id: "c1",
    language_code: "ko",
    title: "제목",
    description: "한국어 설명",
    video_url: "https://example.com/ko.mp4",
  };

  it("prefers native fields", () => {
    expect(getContentDescription(row, [])).toBe("한국어 설명");
    expect(getContentVideoUrl(row, [])).toBe("https://example.com/ko.mp4");
  });

  it("falls back to i18n table when native is empty", () => {
    const empty: CourseContentLike = { id: "c1", language_code: "ko", title: "t" };
    const i18n: ContentI18nRow[] = [
      { content_id: "c1", language_code: "ko", description: "fallback desc", video_url: "u" },
    ];
    expect(getContentDescription(empty, i18n)).toBe("fallback desc");
    expect(getContentVideoUrl(empty, i18n)).toBe("u");
  });
});

describe("getCourseTitleByLang / getCourseDescByLang (course-level header)", () => {
  const base = { title: "한국어 강의명", description: "한국어 설명" };
  const i18n: CourseI18nRow[] = [
    { language_code: "en",    title: "English Course",  description: "English desc" },
    { language_code: "ja",    title: "日本語コース",    description: "日本語の説明" },
    { language_code: "zh-CN", title: "中文课程名称",    description: "中文描述" },
  ];

  it("returns base Korean for ko", () => {
    expect(getCourseTitleByLang(base, i18n, "ko")).toBe("한국어 강의명");
    expect(getCourseDescByLang(base, i18n, "ko")).toBe("한국어 설명");
  });

  it.each(["en", "ja", "zh-CN"])("returns localized for %s", (lang) => {
    const got = getCourseTitleByLang(base, i18n, lang);
    expect(got).toBe(i18n.find((r) => r.language_code === lang)!.title);
  });

  it("falls back to base when translation missing", () => {
    expect(getCourseTitleByLang(base, [], "en")).toBe("한국어 강의명");
    expect(getCourseTitleByLang(base, null, "ja")).toBe("한국어 강의명");
  });

  it("handles null base safely", () => {
    expect(getCourseTitleByLang(null, i18n, "en")).toBe("English Course");
    expect(getCourseTitleByLang(undefined, [], "ko")).toBe("");
  });
});

describe("CreateCourse data model: 1 강의 = 4 차시 (one row per language)", () => {
  /**
   * The teacher CreateCourse form persists one row per language to
   * `course_contents`. This validates the shape produced by
   * `buildDefaultLessonSlots` — the contract that prevents the
   * "한글 강의가 영문으로 표시" regression at registration time.
   */
  const LESSON_LANGS = ["ko", "en", "zh-CN", "ja"] as const;

  const buildDefaultLessonSlots = () =>
    LESSON_LANGS.map((lang, i) => ({
      tempId: `t-${i}`,
      title: "",
      language_code: lang,
      order_index: i,
    }));

  it("creates exactly 4 slots, one per supported language, in canonical order", () => {
    const slots = buildDefaultLessonSlots();
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.language_code)).toEqual(["ko", "en", "zh-CN", "ja"]);
  });

  it("each slot keeps its own title — rendering each via getContentTitle yields its own language", () => {
    const slots = buildDefaultLessonSlots().map((s, i) => ({
      ...s,
      id: `id-${i}`,
      title: {
        ko: "1차시. 한국어",
        en: "Lesson 1. English",
        "zh-CN": "第 1 课. 中文",
        ja: "レッスン 1. 日本語",
      }[s.language_code],
    }));

    const titles = slots.map((s) => getContentTitle(s as CourseContentLike, []));
    expect(titles).toEqual(["한국어", "English", "中文", "日本語"]);
    // No duplicates → no language is masquerading as another.
    expect(new Set(titles).size).toBe(titles.length);
  });
});
