#!/usr/bin/env node
/**
 * i18n Sync — 한 번에 누락/빈 키를 KO 원문에서 자동 번역해 EN/JA/ZH-CN에 채워 넣습니다.
 *
 * 동작 흐름:
 *   1. ko.json을 기준으로 각 로케일의 누락(없음) + 빈 문자열 키를 수집
 *   2. KO 값과 동일(미번역)한 키도 포함(--no-untranslated 로 끌 수 있음)
 *   3. translate 엣지 함수로 30개씩 배치 번역
 *   4. 결과를 각 로케일 JSON에 그대로 기록
 *
 * 옵션:
 *   --locale <en|ja|zh-CN>   특정 로케일만
 *   --dry                    실제 번역/저장 없이 누락만 보고
 *   --no-untranslated        KO와 동일한 값은 건드리지 않음
 *
 * 환경 변수:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (필수)
 *
 * 사용:
 *   npm run i18n:sync
 *   npm run i18n:sync -- --locale en
 *   npm run i18n:sync -- --dry
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../src/i18n/locales");
const SOURCE = "ko";
const TARGETS = ["en", "ja", "zh-CN"];

const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
};
const localeFilter = typeof argVal("--locale") === "string" ? argVal("--locale") : null;
const dry = args.includes("--dry");
const includeUntranslated = !args.includes("--no-untranslated");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry && (!SUPABASE_URL || !SRV)) {
  console.error("환경변수 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (--dry 모드는 예외).");
  process.exit(1);
}

const HANGUL_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const hasHangul = (s) => typeof s === "string" && HANGUL_RE.test(s);

const loadJson = (file) => JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), "utf8"));
const writeJson = (file, data) =>
  fs.writeFileSync(path.join(LOCALES_DIR, file), JSON.stringify(data, null, 2) + "\n", "utf8");

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}
function setByPath(obj, p, val) {
  const parts = p.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
}

async function translate(texts, targetLang) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/translate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SRV}`, apikey: SRV, "Content-Type": "application/json" },
    body: JSON.stringify({
      texts,
      targetLang,
      // 보간 변수({{name}}, {count}) 및 HTML 태그 보존을 위한 힌트 — 엣지 함수가 무시해도 안전
      preserveTokens: ["{{*}}", "{*}", "<*>"],
    }),
  });
  if (!res.ok) throw new Error(`translate ${targetLang} ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.translations || texts.map(() => "");
}

const BATCH = 30;
const source = flatten(loadJson(`${SOURCE}.json`));
const sourceKeys = Object.keys(source);
const locales = localeFilter ? [localeFilter] : TARGETS;

let totalFilled = 0;
let totalGap = 0;

for (const locale of locales) {
  const target = loadJson(`${locale}.json`);
  const flat = flatten(target);

  const todo = [];
  for (const key of sourceKeys) {
    const src = source[key];
    if (typeof src !== "string" || !src.trim()) continue;
    const cur = flat[key];
    const missing = !(key in flat);
    const empty = typeof cur === "string" && cur.trim() === "";
    const untranslated =
      includeUntranslated && typeof cur === "string" && cur.trim() === src.trim() && hasHangul(src);
    if (missing || empty || untranslated) todo.push({ key, src, reason: missing ? "missing" : empty ? "empty" : "untranslated" });
  }

  totalGap += todo.length;
  console.log(`\n[${locale}] 보완 대상 ${todo.length}개 (missing/empty/untranslated)`);
  if (todo.length === 0) continue;
  if (dry) {
    todo.slice(0, 10).forEach((t) => console.log(`  - ${t.reason.padEnd(13)} ${t.key}  →  ${t.src.slice(0, 60)}`));
    if (todo.length > 10) console.log(`  ... 외 ${todo.length - 10}건`);
    continue;
  }

  let filled = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const out = await translate(slice.map((t) => t.src), locale);
    slice.forEach((t, k) => {
      const v = (out[k] || "").trim();
      if (v) {
        setByPath(target, t.key, v);
        filled++;
      }
    });
    process.stdout.write(".");
  }
  writeJson(`${locale}.json`, target);
  totalFilled += filled;
  console.log(`\n[${locale}] ${filled}개 키 저장 → src/i18n/locales/${locale}.json`);
}

console.log(
  dry
    ? `\n[DRY] 총 ${totalGap}개 키가 보완 대상입니다. 실제 적용하려면 --dry 옵션을 빼고 실행하세요.`
    : `\n완료: ${totalFilled}/${totalGap} 키 채움.`,
);
process.exit(0);
