#!/usr/bin/env node
/**
 * i18n Missing Keys Reporter
 *
 * KO(소스)에는 있지만 다른 로케일에 없거나 비어 있는 키 목록을 생성합니다.
 *
 * 출력 형식:
 *   - 콘솔 요약 (기본)
 *   - JSON: --json [경로]
 *   - Markdown: --md [경로]
 *   - CSV: --csv [경로]
 *
 * 옵션:
 *   --locale <code>     특정 로케일만 (en | ja | zh-CN)
 *   --include-empty     빈 문자열도 누락으로 간주 (기본 ON)
 *   --no-include-empty  빈 문자열은 누락에서 제외
 *
 * 예:
 *   node scripts/i18n-missing-report.mjs
 *   node scripts/i18n-missing-report.mjs --md /mnt/documents/i18n-missing.md
 *   node scripts/i18n-missing-report.mjs --json /mnt/documents/i18n-missing.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../src/i18n/locales");
const SOURCE_LOCALE = "ko";
const TARGET_LOCALES = ["en", "ja", "zh-CN"];

const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
};

const localeFilter = typeof argVal("--locale") === "string" ? argVal("--locale") : null;
const includeEmpty = !args.includes("--no-include-empty");
const jsonOut = argVal("--json");
const mdOut = argVal("--md");
const csvOut = argVal("--csv");

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), "utf8"));
}

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}

// Group keys by their top-level namespace (e.g. "auth.login.title" → "auth")
function groupByNamespace(keys) {
  const groups = {};
  for (const k of keys) {
    const ns = k.split(".")[0];
    (groups[ns] ||= []).push(k);
  }
  return Object.fromEntries(
    Object.entries(groups).sort((a, b) => b[1].length - a[1].length),
  );
}

const source = flatten(loadJson(`${SOURCE_LOCALE}.json`));
const sourceKeys = Object.keys(source);
const targets = (localeFilter ? [localeFilter] : TARGET_LOCALES);

const report = {
  generatedAt: new Date().toISOString(),
  source: SOURCE_LOCALE,
  sourceKeyCount: sourceKeys.length,
  includeEmpty,
  locales: {},
};

for (const locale of targets) {
  const target = flatten(loadJson(`${locale}.json`));
  const missing = [];   // key가 아예 없음
  const empty = [];     // 키는 있지만 값이 빈 문자열
  for (const key of sourceKeys) {
    if (!(key in target)) {
      missing.push(key);
    } else if (typeof target[key] === "string" && target[key].trim() === "") {
      if (includeEmpty) empty.push(key);
    }
  }
  const allMissing = [...missing, ...empty].sort();
  report.locales[locale] = {
    totalKeys: Object.keys(target).length,
    missingCount: missing.length,
    emptyCount: empty.length,
    totalGap: allMissing.length,
    coveragePercent: +(((sourceKeys.length - allMissing.length) / sourceKeys.length) * 100).toFixed(2),
    byNamespace: groupByNamespace(allMissing),
    missing,
    empty,
    items: allMissing.map((k) => ({
      key: k,
      reason: missing.includes(k) ? "missing" : "empty",
      sourceText: source[k],
    })),
  };
}

// --- Writers ---
function writeJson(file) {
  fs.writeFileSync(file, JSON.stringify(report, null, 2), "utf8");
}

function writeCsv(file) {
  const rows = [["locale", "reason", "namespace", "key", "source_ko"]];
  for (const [locale, data] of Object.entries(report.locales)) {
    for (const item of data.items) {
      rows.push([
        locale,
        item.reason,
        item.key.split(".")[0],
        item.key,
        (item.sourceText || "").replace(/"/g, '""').replace(/\r?\n/g, " "),
      ]);
    }
  }
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  // Excel-friendly UTF-8 BOM + CRLF
  fs.writeFileSync(file, "\uFEFF" + csv, "utf8");
}

function writeMarkdown(file) {
  const lines = [];
  lines.push(`# i18n Missing Keys Report`);
  lines.push(``);
  lines.push(`- 생성: ${report.generatedAt}`);
  lines.push(`- 기준 로케일: \`${report.source}\` (${report.sourceKeyCount} keys)`);
  lines.push(`- 빈 문자열 포함: ${report.includeEmpty ? "YES" : "NO"}`);
  lines.push(``);
  lines.push(`## 요약`);
  lines.push(``);
  lines.push(`| Locale | 보유 키 | 누락 | 빈 값 | 합계 | 커버리지 |`);
  lines.push(`|---|---:|---:|---:|---:|---:|`);
  for (const [locale, d] of Object.entries(report.locales)) {
    lines.push(`| \`${locale}\` | ${d.totalKeys} | ${d.missingCount} | ${d.emptyCount} | ${d.totalGap} | ${d.coveragePercent}% |`);
  }
  lines.push(``);
  for (const [locale, d] of Object.entries(report.locales)) {
    lines.push(`## ${locale.toUpperCase()}`);
    lines.push(``);
    if (d.totalGap === 0) {
      lines.push(`✅ 누락된 키가 없습니다.`);
      lines.push(``);
      continue;
    }
    lines.push(`### 네임스페이스별 분포`);
    lines.push(``);
    lines.push(`| Namespace | Count |`);
    lines.push(`|---|---:|`);
    for (const [ns, keys] of Object.entries(d.byNamespace)) {
      lines.push(`| \`${ns}\` | ${keys.length} |`);
    }
    lines.push(``);
    lines.push(`### 상세 목록 (${d.totalGap}건)`);
    lines.push(``);
    lines.push(`| Key | Reason | Source (KO) |`);
    lines.push(`|---|---|---|`);
    for (const item of d.items) {
      const src = (item.sourceText || "")
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, " ")
        .slice(0, 200);
      lines.push(`| \`${item.key}\` | ${item.reason} | ${src} |`);
    }
    lines.push(``);
  }
  fs.writeFileSync(file, lines.join("\n"), "utf8");
}

// --- Console summary ---
const HDR = "\x1b[1m";
const RST = "\x1b[0m";
const RED = "\x1b[31m";
const GRN = "\x1b[32m";
const YLW = "\x1b[33m";

console.log(`${HDR}i18n Missing Keys Report${RST}`);
console.log(`Source: ${report.source} (${report.sourceKeyCount} keys)`);
console.log(`Include empty values as missing: ${includeEmpty ? "yes" : "no"}\n`);

let totalGap = 0;
for (const [locale, d] of Object.entries(report.locales)) {
  totalGap += d.totalGap;
  const color = d.totalGap === 0 ? GRN : d.totalGap > 20 ? RED : YLW;
  console.log(
    `${color}${locale.padEnd(6)}${RST}  coverage ${d.coveragePercent.toString().padStart(6)}%  ` +
      `missing=${d.missingCount}  empty=${d.emptyCount}  total=${d.totalGap}`,
  );
  if (d.totalGap > 0) {
    const top = Object.entries(d.byNamespace).slice(0, 5);
    console.log(`        top namespaces: ${top.map(([ns, k]) => `${ns}(${k.length})`).join(", ")}`);
    console.log(`        first 5 keys:   ${d.items.slice(0, 5).map((i) => i.key).join(", ")}`);
  }
}

// --- File outputs ---
const written = [];
if (jsonOut) {
  const file = jsonOut === true ? "/mnt/documents/i18n-missing.json" : jsonOut;
  writeJson(file);
  written.push(file);
}
if (mdOut) {
  const file = mdOut === true ? "/mnt/documents/i18n-missing.md" : mdOut;
  writeMarkdown(file);
  written.push(file);
}
if (csvOut) {
  const file = csvOut === true ? "/mnt/documents/i18n-missing.csv" : csvOut;
  writeCsv(file);
  written.push(file);
}

if (written.length) {
  console.log(`\nWrote: ${written.join(", ")}`);
}

process.exit(totalGap > 0 ? 1 : 0);
