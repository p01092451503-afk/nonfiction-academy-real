import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SRV, { auth: { persistSession: false } });

const TARGETS = ["en", "zh-CN", "ja"] as const;
type Lang = typeof TARGETS[number];

async function translate(texts: string[], targetLang: Lang): Promise<string[]> {
  const filtered = texts.map((t) => (t ?? "").toString());
  if (filtered.every((t) => !t.trim())) return filtered.map(() => "");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/translate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SRV}`, apikey: SRV, "Content-Type": "application/json" },
    body: JSON.stringify({ texts: filtered, targetLang }),
  });
  if (!res.ok) throw new Error(`translate ${targetLang} ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.translations || filtered.map(() => "");
}

// Script-based heuristics to detect if text matches expected target language
const HANGUL = /[\uAC00-\uD7AF]/;
const KANA = /[\u3040-\u309F\u30A0-\u30FF]/;
const HAN = /[\u4E00-\u9FFF]/;
const LATIN = /[A-Za-z]/;

function looksLike(text: string, lang: Lang): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  if (lang === "en") return LATIN.test(t) && !HANGUL.test(t) && !KANA.test(t) && !HAN.test(t.replace(/[\s\d\W]/g, "")) || (LATIN.test(t) && !HANGUL.test(t) && !KANA.test(t));
  if (lang === "ja") return KANA.test(t) || (HAN.test(t) && !HANGUL.test(t));
  if (lang === "zh-CN") return HAN.test(t) && !HANGUL.test(t) && !KANA.test(t);
  return true;
}

async function processTable(opts: {
  label: string;
  source: string;
  i18n: string;
  fk: string;
  titleField: string;
  bodyField: string | null;
  i18nTitle: string;
  i18nBody: string | null;
  onConflict: string;
}) {
  console.log(`\n=== ${opts.label} ===`);
  const { data: src } = await sb.from(opts.source).select(`id,${opts.titleField}${opts.bodyField ? "," + opts.bodyField : ""}`);
  if (!src) return;
  const ids = src.map((r: any) => r.id);
  const { data: i18n } = await sb.from(opts.i18n).select("*").in(opts.fk, ids).in("language_code", TARGETS as any);
  const map = new Map<string, Record<Lang, any>>();
  (i18n || []).forEach((r: any) => {
    if (!map.has(r[opts.fk])) map.set(r[opts.fk], {} as any);
    map.get(r[opts.fk])![r.language_code as Lang] = r;
  });
  let processed = 0, failed = 0;
  for (const row of src as any[]) {
    const koTitle = row[opts.titleField] ?? "";
    const koBody = opts.bodyField ? (row[opts.bodyField] ?? "") : "";
    if (!koTitle.trim() && !koBody.trim()) continue;
    const perLang = map.get(row.id) || ({} as any);
    for (const lang of TARGETS) {
      const ex = perLang[lang];
      const tT = (ex?.[opts.i18nTitle] ?? "").trim();
      const tB = opts.i18nBody ? (ex?.[opts.i18nBody] ?? "").trim() : "";
      const titleBad = !tT || tT === koTitle.trim() || !looksLike(tT, lang);
      const bodyBad = opts.i18nBody && koBody.trim() && (!tB || tB === koBody.trim() || !looksLike(tB, lang));
      if (!titleBad && !bodyBad) continue;
      try {
        const inputs: string[] = [koTitle];
        if (opts.i18nBody) inputs.push(koBody);
        const out = await translate(inputs, lang);
        const payload: any = { [opts.fk]: row.id, language_code: lang, [opts.i18nTitle]: out[0]?.trim() || koTitle };
        if (opts.i18nBody) payload[opts.i18nBody] = out[1]?.trim() || koBody;
        const { error } = await sb.from(opts.i18n).upsert(payload, { onConflict: opts.onConflict });
        if (error) { failed++; console.error(`  ✗ ${row.id} ${lang}:`, error.message); }
        else { processed++; console.log(`  ✓ ${row.id} ${lang} :: ${(out[0] || "").slice(0, 40)}`); }
      } catch (e: any) {
        failed++; console.error(`  ✗ ${row.id} ${lang}:`, e.message);
      }
    }
  }
  console.log(`-- ${opts.label}: processed=${processed} failed=${failed}`);
}

async function main() {
  await processTable({
    label: "courses", source: "courses", i18n: "course_i18n", fk: "course_id",
    titleField: "title", bodyField: "description",
    i18nTitle: "title", i18nBody: "description",
    onConflict: "course_id,language_code",
  });
  await processTable({
    label: "course_contents", source: "course_contents", i18n: "course_content_i18n", fk: "content_id",
    titleField: "title", bodyField: "description",
    i18nTitle: "title", i18nBody: "description",
    onConflict: "content_id,language_code",
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
