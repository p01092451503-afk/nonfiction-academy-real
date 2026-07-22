# 광동어(Cantonese, `yue`) 다국어 확장 계획

기존 4개 언어(`ko`, `en`, `ja`, `zh-CN`) 시스템에 **`yue`(광동어, 粵語 / 廣東話)** 를 5번째 언어로 추가합니다. 학습자·관리자·강사 모든 화면과 콘텐츠 편집기, 그리고 데이터베이스·번역 엣지 함수까지 완전히 확장합니다.

> 참고: 광동어 표준 언어 코드는 ISO 639‑3의 **`yue`** 입니다. UI 라벨은 **粵語**로 노출하며, 자동번역 프롬프트에서는 "Cantonese (traditional Chinese script, Hong Kong style, 粵語 spoken form)"으로 지시합니다.

---

## 1. 프론트엔드 i18n 인프라

- `src/i18n/locales/yue.json` 신규 생성 (약 1,506개 키를 한국어 소스 기반으로 자동 번역 → 광동어). 관용어/UI 톤은 홍콩 스타일로 통일.
- `src/i18n/index.ts`
  - `resources`, `supportedLngs`, `fallbackLng`에 `yue` 추가.
  - detector `convertDetectedLanguage`: 브라우저 `yue`, `zh-HK`, `zh-Hant-HK`, `zh-MO` → `yue` 로 매핑. (기존 `zh` → `zh-CN` 로직은 유지.)
- `src/i18n/uiOverrides.ts`의 `UI_LANGS` 배열 및 `UiLang` 타입에 `yue` 추가.
- `src/lib/i18nLang.ts`
  - `SupportedLang` 타입 = `"ko" | "en" | "ja" | "zh-CN" | "yue"`.
  - `normalizeLang`에 `yue` / `zh-HK` / `zh-MO` / `zh-Hant` 처리 추가.

## 2. 학습자 언어 스위처

- `src/components/LanguageToggle.tsx`
  - `LANGS`에 **일본어 바로 다음에** `{ code: "yue", label: "粵語" }` 삽입.
  - `resolveCurrent`에 `yue` / `zh-HK` 매핑 추가.

## 3. 콘텐츠 다국어 편집 UI (관리자·강사)

기존에 3~4개 언어 탭을 하드코딩한 화면을 5개 언어로 확장:
- `src/pages/teacher/CreateCourse.tsx` — `LESSON_LANGS`, 언어 라벨, 자동번역 타깃, 강의/차시 i18n 저장 배열, 탭 UI (`ko / en / ja / zh-CN / yue`).
- `src/pages/CourseDetail.tsx` — `COURSE_TRANSLATION_LANGS`, `CONTENT_I18N_LANGS`, `emptyI18n`, `currentLang` 판정, 강의·차시 편집 다이얼로그 탭.
- `src/pages/admin/AdminTracks.tsx` — `I18N_LANGS`, `TARGET_LANGS`, `emptyLangMap`, `clearTranslations`, 저장 로직.
- `src/pages/teacher/TeacherNotifications.tsx` — 공지 다국어 저장 맵.
- `src/components/admin/MultilingualTextFields.tsx` — 언어 목록 및 자동번역 트리거.
- `src/components/BulkQuestionUploadDialog.tsx` — 대량 업로드 시 지원 언어.
- `src/components/AssessmentManager.tsx` — 평가 다국어 관리.

각 파일에서 언어 라벨, 상태(state) 필드, 저장/불러오기 배열, "자동 번역" 대상, 수동 편집 플래그를 `yue`까지 확장합니다.

## 4. 평가 페이지 (`src/pages/AssessmentPage.tsx`)

- `TargetLang` 유니온 타입: `"en" | "ja" | "zh-CN" | "yue"`.
- `countryToAssessmentLang`: `HK`, `MO` → `yue` (기존 `HK` → `zh-CN` 매핑은 `yue`로 이동, `CN` / `TW` 만 `zh-CN` 유지).
- `repairKeyFor`, `invokeQuestionTranslation`, `needsTranslationRepair`, 언어 라벨 맵, 수동 번역 버튼 텍스트에 `yue` 추가.
- `uiLang` 판정에 `zh-HK` / `yue` 브랜치 추가.

## 5. 학습자·강사·관리자 기타 페이지

`normalizeLang` 를 이미 쓰는 파일들은 자동 확장되지만, 아래는 로컬 판정을 별도로 갖고 있어 개별 수정 필요:
- `src/pages/student/StudentTracks.tsx`, `StudentCourses.tsx`, `StudentAssignments.tsx`, `CourseCatalog.tsx`
- `src/pages/UserManual.tsx`
- `src/hooks/useLanguageSwitching.ts` 및 테스트
- `src/lib/i18nQueryCache.ts`, `src/lib/courseContentI18n.ts` (및 테스트)

각 파일의 언어 리터럴/조건문에 `yue` 추가.

## 6. 데이터베이스 마이그레이션

기존 마이그레이션에 `CHECK (language_code IN ('ko','en','zh-CN','ja'))` 제약이 걸린 테이블들의 제약을 확장합니다. 신규 마이그레이션 1건으로 처리:

```sql
-- 각 테이블별 CHECK 제약 재정의 (ko/en/zh-CN/ja/yue 허용)
ALTER TABLE public.course_contents  DROP CONSTRAINT IF EXISTS course_contents_language_code_chk;
ALTER TABLE public.course_contents  ADD  CONSTRAINT course_contents_language_code_chk
  CHECK (language_code IN ('ko','en','zh-CN','ja','yue'));
-- content_i18n / courses_i18n / assessment_i18n / announcements_i18n /
-- board_posts_i18n / tracks_i18n / assessment_questions_i18n 등 동일 패턴 반복
```

`language_code` 컬럼이 TEXT로 열려 있고 CHECK 제약만 있는 구조라 새 코드 추가는 안전합니다. 기존 데이터에 영향 없음.

## 7. 자동번역 엣지 함수

- `supabase/functions/translate/index.ts`
- `supabase/functions/translate-comment/index.ts`
- `supabase/functions/translate-question-now/index.ts`
- (그리고 `fix-question-i18n` 계열)

각 함수의 `SUPPORTED_LANGS` / `LANG_LABEL` / 프롬프트에 `yue`를 추가하고, Gemini 프롬프트에서 **"Translate into Cantonese (粵語), using traditional Chinese script and Hong Kong colloquial style. Do not use Mandarin phrasing."** 로 명시. 응답 후처리(수동 편집 플래그 존중)는 기존 로직 그대로.

## 8. 검증

- `bunx vitest run src/i18n/locales.test.ts` — 5개 로케일 키 정합성 확인.
- `tsgo` 타입 체크 — 유니온 타입 확장 후 컴파일 오류 잡기.
- Playwright로 학습자 화면에서 언어 스위처 → 粵語 선택 → 학습·평가·마이페이지 UI가 광동어로 전환되는지 스크린샷 검증.

## 기술 세부

- 자동번역 프롬프트에는 홍콩 표기(繁體) + 광동어 구어체를 강제. 서면중국어(zh-CN 간체)와 명확히 구분.
- `yue.json`은 KO fallback이 이미 걸려 있어 초기 배포 시 누락 키가 있어도 UI가 깨지지 않음. 정식 릴리스 전 자동번역으로 전량 채웁니다.
- 관리자 화면의 "수동 편집 시 자동번역 중단" 규칙은 `yue`에도 동일 적용.

## 파일 변경 요약

- 신규: `src/i18n/locales/yue.json`, DB 마이그레이션 1건.
- 수정: 프론트엔드 약 25~30개 파일, 엣지 함수 3~4개.

---

승인해 주시면 위 순서대로 한 번에 배포하겠습니다.
