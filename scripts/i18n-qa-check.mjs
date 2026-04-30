#!/usr/bin/env node
/**
 * i18n Translation QA Checker
 *
 * Detects suspicious auto-translation issues across locale files:
 *   - Length anomalies vs source (KO)
 *   - Placeholder integrity ({{var}}, {0}, %s)
 *   - Untranslated strings (identical to source)
 *   - Script mismatch (JA missing kana, ZH missing Han chars)
 *   - Source-language leakage (KO chars in EN/JA/ZH; EN words in JA/ZH)
 *   - Repeated tokens / machine-translation tells
 *   - HTML/markup divergence
 *
 * Usage:
 *   node scripts/i18n-qa-check.mjs                # human-readable report
 *   node scripts/i18n-qa-check.mjs --json         # JSON output
 *   node scripts/i18n-qa-check.mjs --locale ja    # filter one locale
 *   node scripts/i18n-qa-check.mjs --severity high
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../src/i18n/locales");
const SOURCE_LOCALE = "ko";
const TARGET_LOCALES = ["en", "ja", "zh-CN"];
const GLOSSARY_PATH = path.resolve(__dirname, "i18n-glossary.json");

// --- Glossary rules ({alias, canonical, koTerm, re}) per locale ---
const GLOSSARY_RULES = (() => {
  const out = {};
  if (!fs.existsSync(GLOSSARY_PATH)) return out;
  const gloss = JSON.parse(fs.readFileSync(GLOSSARY_PATH, "utf8"));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isLatin = (s) => /^[\x20-\x7E]+$/.test(s);
  for (const locale of TARGET_LOCALES) {
    const rules = [];
    for (const [koTerm, entry] of Object.entries(gloss.terms || {})) {
      const canonical = entry[locale];
      if (!canonical) continue;
      for (const a of (entry.aliases && entry.aliases[locale]) || []) {
        const obj = typeof a === "string" ? { from: a } : a;
        if (!obj.from || obj.from === canonical) continue;
        let pattern = esc(obj.from);
        if (isLatin(obj.from)) pattern = `\\b${pattern}\\b`;
        if (obj.forbidContext?.before) pattern = `(?<!${esc(obj.forbidContext.before)})` + pattern;
        if (obj.forbidContext?.after) pattern = pattern + `(?!${esc(obj.forbidContext.after)})`;
        try {
          rules.push({ alias: obj.from, canonical, koTerm, re: new RegExp(pattern) });
        } catch { /* skip invalid */ }
      }
    }
    out[locale] = rules;
  }
  return out;
})();

// --- CLI args ---
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const localeFilter = (() => {
  const i = args.indexOf("--locale");
  return i >= 0 ? args[i + 1] : null;
})();
const severityFilter = (() => {
  const i = args.indexOf("--severity");
  return i >= 0 ? args[i + 1] : null; // high | medium | low
})();

// --- Heuristics config ---
const LENGTH_RATIOS = {
  // expected target/source character-length range (rough)
  en: { min: 0.6, max: 3.5 },
  ja: { min: 0.5, max: 2.5 },
  "zh-CN": { min: 0.4, max: 2.0 },
};
const ABSOLUTE_LONG = 400; // any translation longer than this chars is flagged

const RE_KO = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const RE_KANA = /[\u3040-\u309F\u30A0-\u30FF]/; // hiragana + katakana
const RE_HAN = /[\u4E00-\u9FFF]/;
const RE_LATIN_WORD = /[A-Za-z]{4,}/;
const RE_PLACEHOLDER = /\{\{?\s*[\w.]+\s*\}?\}|%[sd@]|\{\d+\}/g;
const RE_HTML = /<\/?[a-zA-Z][^>]*>/g;

// machine-translation tells (rough; tuned for Gemini output)
const MT_TELLS = {
  en: [
    /\bthe the\b/i,
    /\bof of\b/i,
    /\bplease please\b/i,
    /\b(\w+) \1 \1\b/i, // 3x same word in a row
  ],
  ja: [
    /です。です。/,
    /ますます。/,
    /([ぁ-んァ-ン])\1\1\1/, // 4x same kana
  ],
  "zh-CN": [
    /的的/,
    /了了/,
    /([\u4E00-\u9FFF])\1\1\1/, // 4x same Han
  ],
};

// --- Helpers ---
function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), "utf8"));
}

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, key, out);
    } else if (typeof v === "string") {
      out[key] = v;
    }
  }
  return out;
}

function extractMatches(re, str) {
  const out = [];
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m;
  while ((m = r.exec(str))) out.push(m[0]);
  return out.sort();
}

function check(locale, key, src, tgt) {
  const issues = [];
  if (!tgt || !tgt.trim()) {
    issues.push({ severity: "high", code: "empty", msg: "Translation is empty" });
    return issues;
  }

  // 1. Identical to source (untranslated) — only flag if source has letters
  if (tgt === src && /[A-Za-z\uAC00-\uD7AF\u4E00-\u9FFF]/.test(src) && src.length > 2) {
    issues.push({ severity: "medium", code: "untranslated", msg: "Identical to source (likely untranslated)" });
  }

  // 2. Length ratio
  const ratio = tgt.length / Math.max(src.length, 1);
  const bounds = LENGTH_RATIOS[locale];
  if (src.length >= 8) {
    if (ratio < bounds.min) {
      issues.push({
        severity: "medium",
        code: "too-short",
        msg: `Length ratio ${ratio.toFixed(2)} < ${bounds.min} (src=${src.length}, tgt=${tgt.length})`,
      });
    } else if (ratio > bounds.max) {
      issues.push({
        severity: "medium",
        code: "too-long",
        msg: `Length ratio ${ratio.toFixed(2)} > ${bounds.max} (src=${src.length}, tgt=${tgt.length})`,
      });
    }
  }
  if (tgt.length > ABSOLUTE_LONG && tgt.length > src.length * 1.5) {
    issues.push({
      severity: "high",
      code: "absolute-long",
      msg: `Translation is ${tgt.length} chars (likely runaway/explanatory output)`,
    });
  }

  // 3. Placeholder integrity
  const srcPh = extractMatches(RE_PLACEHOLDER, src);
  const tgtPh = extractMatches(RE_PLACEHOLDER, tgt);
  if (srcPh.join("|") !== tgtPh.join("|")) {
    issues.push({
      severity: "high",
      code: "placeholder-mismatch",
      msg: `Placeholders differ: src=[${srcPh.join(", ")}] tgt=[${tgtPh.join(", ")}]`,
    });
  }

  // 4. HTML/markup integrity
  const srcHtml = extractMatches(RE_HTML, src);
  const tgtHtml = extractMatches(RE_HTML, tgt);
  if (srcHtml.join("|") !== tgtHtml.join("|")) {
    issues.push({
      severity: "medium",
      code: "html-mismatch",
      msg: `HTML tags differ: src=[${srcHtml.join(", ")}] tgt=[${tgtHtml.join(", ")}]`,
    });
  }

  // 5. Script checks per locale
  const hasKO = RE_KO.test(tgt);
  if (locale !== SOURCE_LOCALE && hasKO) {
    issues.push({ severity: "high", code: "korean-leak", msg: "Korean characters present in non-KO translation" });
  }

  if (locale === "ja") {
    // Only flag when source is long enough that natural Japanese would require kana.
    // Short Han-only labels (e.g. 受講生管理) are valid Japanese.
    if (
      !RE_KANA.test(tgt) &&
      RE_HAN.test(tgt) === false && // pure Han is acceptable for short labels
      tgt.length > 4 &&
      /[\uAC00-\uD7AF]/.test(src)
    ) {
      issues.push({ severity: "medium", code: "ja-no-kana", msg: "JA translation has no Japanese script" });
    } else if (!RE_KANA.test(tgt) && RE_HAN.test(tgt) && src.length > 10) {
      // Long source but translation is Han-only → suspicious (likely Chinese-style output)
      issues.push({ severity: "low", code: "ja-han-only", msg: "Long JA translation is Han-only (verify it's not Chinese)" });
    }
    // English leakage in JA when source has none
    if (!RE_LATIN_WORD.test(src) && RE_LATIN_WORD.test(tgt)) {
      const words = tgt.match(RE_LATIN_WORD) || [];
      const filtered = words.filter((w) => !/^(URL|ID|API|PDF|CSV|AI|YouTube|Vimeo|Lovable|NONFICTION|CDN|JWT|HTTP|HTTPS|HTML|CSS|OK|NG)$/i.test(w));
      if (filtered.length) {
        issues.push({ severity: "low", code: "en-leak-ja", msg: `English words in JA: ${filtered.slice(0, 3).join(", ")}` });
      }
    }
  }

  if (locale === "zh-CN") {
    if (!RE_HAN.test(tgt) && tgt.length > 4 && /[A-Za-z\uAC00-\uD7AF\u4E00-\u9FFF]/.test(src)) {
      issues.push({ severity: "medium", code: "zh-no-han", msg: "ZH translation has no Han characters" });
    }
    if (RE_KANA.test(tgt)) {
      issues.push({ severity: "high", code: "kana-in-zh", msg: "Japanese kana found in ZH translation" });
    }
    if (!RE_LATIN_WORD.test(src) && RE_LATIN_WORD.test(tgt)) {
      const words = tgt.match(RE_LATIN_WORD) || [];
      const filtered = words.filter((w) => !/^(URL|ID|API|PDF|CSV|AI|YouTube|Vimeo|Lovable|NONFICTION|CDN|JWT|HTTP|HTTPS|HTML|CSS|OK|NG)$/i.test(w));
      if (filtered.length) {
        issues.push({ severity: "low", code: "en-leak-zh", msg: `English words in ZH: ${filtered.slice(0, 3).join(", ")}` });
      }
    }
  }

  // 6. MT tells
  for (const re of MT_TELLS[locale] || []) {
    if (re.test(tgt)) {
      issues.push({ severity: "medium", code: "mt-tell", msg: `Suspicious pattern: ${re}` });
      break;
    }
  }

  // 7. Glossary consistency — flag aliases that should be the canonical term
  for (const r of GLOSSARY_RULES[locale] || []) {
    if (r.re.test(tgt)) {
      issues.push({
        severity: "medium",
        code: "glossary-violation",
        msg: `Use canonical "${r.canonical}" instead of "${r.alias}" (${r.koTerm})`,
      });
    }
  }

  return issues;
}

function severityRank(s) {
  return { high: 3, medium: 2, low: 1 }[s] || 0;
}

// --- Run ---
const source = flatten(loadJson(`${SOURCE_LOCALE}.json`));
const report = {};

const locales = localeFilter ? [localeFilter] : TARGET_LOCALES;

for (const locale of locales) {
  const target = flatten(loadJson(`${locale}.json`));
  const findings = [];
  const missing = [];
  for (const key of Object.keys(source)) {
    if (!(key in target)) {
      missing.push(key);
      continue;
    }
    const issues = check(locale, key, source[key], target[key]);
    for (const issue of issues) {
      if (severityFilter && severityRank(issue.severity) < severityRank(severityFilter)) continue;
      findings.push({ key, src: source[key], tgt: target[key], ...issue });
    }
  }
  report[locale] = {
    totalKeys: Object.keys(source).length,
    missingKeys: missing,
    findings,
    summary: findings.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      acc.byCode = acc.byCode || {};
      acc.byCode[f.code] = (acc.byCode[f.code] || 0) + 1;
      return acc;
    }, {}),
  };
}

// --- Output ---
if (asJson) {
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

const RESET = "\x1b[0m";
const COL = { high: "\x1b[31m", medium: "\x1b[33m", low: "\x1b[36m" };

let totalHigh = 0;
for (const [locale, data] of Object.entries(report)) {
  console.log(`\n=== ${locale.toUpperCase()} ===`);
  console.log(`Keys: ${data.totalKeys} | Missing: ${data.missingKeys.length} | Findings: ${data.findings.length}`);
  console.log(`  high=${data.summary.high || 0}  medium=${data.summary.medium || 0}  low=${data.summary.low || 0}`);
  if (data.summary.byCode) {
    console.log("  by code:", Object.entries(data.summary.byCode).map(([k, v]) => `${k}=${v}`).join(", "));
  }
  totalHigh += data.summary.high || 0;

  if (data.missingKeys.length) {
    console.log(`\n  Missing keys (first 10):`);
    data.missingKeys.slice(0, 10).forEach((k) => console.log(`    - ${k}`));
  }

  // Show top 25 findings, high first
  const sorted = [...data.findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  console.log(`\n  Top findings (showing ${Math.min(25, sorted.length)} of ${sorted.length}):`);
  for (const f of sorted.slice(0, 25)) {
    const c = COL[f.severity] || "";
    console.log(`    ${c}[${f.severity.toUpperCase()}]${RESET} ${f.code} :: ${f.key}`);
    console.log(`      ${f.msg}`);
    console.log(`      src: ${truncate(f.src, 120)}`);
    console.log(`      tgt: ${truncate(f.tgt, 120)}`);
  }
}

console.log(`\nDone. High-severity issues: ${totalHigh}`);
process.exit(totalHigh > 0 ? 1 : 0);

function truncate(s, n) {
  s = String(s).replace(/\s+/g, " ");
  return s.length > n ? s.slice(0, n) + "…" : s;
}
