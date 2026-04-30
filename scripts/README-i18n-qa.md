# i18n Translation QA

자동 번역(Gemini) 결과의 품질을 점검하는 스크립트입니다.

## 실행

```bash
# 전체 리포트 (사람이 읽기 좋은 형식)
node scripts/i18n-qa-check.mjs

# JSON 출력 (CI/리포트용)
node scripts/i18n-qa-check.mjs --json > qa-report.json

# 특정 로케일만
node scripts/i18n-qa-check.mjs --locale ja

# 심각도 필터
node scripts/i18n-qa-check.mjs --severity high
```

종료 코드: high-severity issue가 있으면 `1`, 없으면 `0` (CI에서 활용 가능).

## 점검 항목

| 코드 | 심각도 | 설명 |
|---|---|---|
| `empty` | high | 번역이 비어 있음 |
| `placeholder-mismatch` | high | `{{var}}`, `{0}`, `%s` 가 원문과 불일치 |
| `korean-leak` | high | 한국어 외 로케일에 한글 잔존 |
| `kana-in-zh` | high | 중국어에 일본어 가나 포함 |
| `absolute-long` | high | 비정상적으로 긴 출력(설명문 폭주 의심) |
| `untranslated` | medium | 원문과 동일 (KO 그대로) |
| `too-long` / `too-short` | medium | 원문 대비 길이 비율 이상 |
| `html-mismatch` | medium | HTML 태그가 원문과 다름 |
| `ja-no-kana` | medium | 일본어 번역에 가나/한자 모두 없음 |
| `zh-no-han` | medium | 중국어 번역에 한자가 없음 |
| `mt-tell` | medium | 기계번역 의심 패턴(반복 토큰 등) |
| `en-leak-ja` / `en-leak-zh` | low | 한국어 원문엔 없는 영어 단어가 번역에 등장 |
| `ja-han-only` | low | 긴 일본어 번역이 한자만으로 구성 (중국어 출력 의심) |

## 길이 비율 기준 (target / source)

- EN: 0.6 ~ 3.5
- JA: 0.5 ~ 2.5
- ZH-CN: 0.4 ~ 2.0

기준은 `scripts/i18n-qa-check.mjs` 상단 `LENGTH_RATIOS`에서 조정할 수 있습니다.
