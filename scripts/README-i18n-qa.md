# i18n Translation Tooling

자동 번역(Gemini) 결과를 점검·정규화하는 두 가지 도구입니다.

## 1. QA 체크 (`i18n-qa-check.mjs`)

번역 품질을 점검합니다. 빈 번역, 길이 이상, placeholder 손상, 한국어 잔존, 가나/한자 누락, 기계번역 의심 패턴, **용어집 위반** 등을 탐지합니다.

```bash
node scripts/i18n-qa-check.mjs                # 전체 리포트
node scripts/i18n-qa-check.mjs --json         # JSON 출력
node scripts/i18n-qa-check.mjs --locale ja    # 특정 로케일
node scripts/i18n-qa-check.mjs --severity high
```

종료 코드: high-severity issue가 있으면 `1`, 없으면 `0` (CI 활용 가능).

### 주요 점검 코드

| 코드 | 심각도 | 설명 |
|---|---|---|
| `empty` | high | 번역이 비어 있음 |
| `placeholder-mismatch` | high | `{{var}}`, `{0}`, `%s` 가 원문과 불일치 |
| `korean-leak` | high | 한국어 외 로케일에 한글 잔존 |
| `kana-in-zh` | high | 중국어에 일본어 가나 포함 |
| `absolute-long` | high | 비정상적으로 긴 출력 |
| `glossary-violation` | medium | 용어집 alias 사용 (canonical 권장) |
| `untranslated` | medium | 원문(KO)과 동일 |
| `too-long` / `too-short` | medium | 길이 비율 이상 |
| `html-mismatch` | medium | HTML 태그 불일치 |
| `ja-no-kana` | medium | 일본어에 일본 문자 없음 |
| `zh-no-han` | medium | 중국어에 한자 없음 |
| `mt-tell` | medium | 기계번역 의심 반복 토큰 |
| `en-leak-ja/zh` | low | 원문엔 없는 영어 단어가 번역에 등장 |
| `ja-han-only` | low | 긴 일본어 번역이 한자만 (중국어 출력 의심) |

## 2. 용어집 적용 (`i18n-glossary-apply.mjs`)

회사·제품 고유 용어를 `scripts/i18n-glossary.json` 의 **canonical 형태**로 일괄 정규화합니다.

```bash
node scripts/i18n-glossary-apply.mjs           # dry-run (변경 없음)
node scripts/i18n-glossary-apply.mjs --apply   # 실제 파일에 반영
node scripts/i18n-glossary-apply.mjs --locale ja --apply
node scripts/i18n-glossary-apply.mjs --json
```

### 용어집 구조 (`scripts/i18n-glossary.json`)

```jsonc
{
  "brands": {
    "NONFICTION": { "ko": "NONFICTION", "en": "NONFICTION", "ja": "NONFICTION", "zh-CN": "NONFICTION" }
  },
  "terms": {
    "강의": {
      "en": "Course", "ja": "コース", "zh-CN": "课程",
      "aliases": {
        "ja": [{ "from": "講義" }, { "from": "レクチャー" }],
        "zh-CN": [{ "from": "讲座" }, { "from": "讲义" }]
      }
    },
    "게시판": {
      "ja": "掲示板",
      "aliases": {
        // forbidContext.before 로 「ダッシュボード」 부분매칭 차단
        "ja": [{ "from": "ボード", "forbidContext": { "before": "ダッシュ" } }]
      }
    }
  }
}
```

- **`from`**: 잘못된/대안 표현 (Gemini가 자주 출력하지만 우리 용어가 아닌 표현)
- **`forbidContext.before/after`**: 해당 문자열이 인접하면 치환 금지 (false positive 방지)
- Latin alias는 자동으로 `\b` 단어 경계 적용
- **연쇄 치환 방지**: sentinel 토큰 기반 1회성 치환 (예: 「サインアップ→新規登録」 후 「登録→受講」 가 다시 발동하지 않음)

### 권장 워크플로우

```bash
# 1) 새 번역 생성/수정 후
# 2) 용어집 정규화
node scripts/i18n-glossary-apply.mjs --apply
# 3) 품질 QA
node scripts/i18n-qa-check.mjs --severity high
```

용어집을 확장하려면 `scripts/i18n-glossary.json` 의 `terms` 섹션에 항목을 추가하면 됩니다.
일반 단어(短い・曖昧)는 alias로 등록하지 말고, 모호한 매칭이 있으면 반드시 `forbidContext` 로 안전장치를 두세요.
