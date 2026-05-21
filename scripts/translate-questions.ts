import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SRV, { auth: { persistSession: false } });

const TARGETS = ["en", "zh-CN", "ja"] as const;
type Lang = typeof TARGETS[number];
const HANGUL_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const hasHangul = (s: string) => HANGUL_RE.test(s || "");

async function translate(texts: string[], targetLang: Lang): Promise<string[]> {
  const filtered = texts.map((t) => (t ?? "").toString());
  if (filtered.every((t) => !t.trim())) return filtered.map(() => "");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/translate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SRV}`, apikey: SRV, "Content-Type": "application/json" },
    body: JSON.stringify({ texts: filtered, targetLang }),
  });
  if (!res.ok) throw new Error(`translate ${targetLang} ${res.status}`);
  const j = await res.json();
  return j.translations || filtered.map(() => "");
}

let processed = 0, failed = 0;

async function main() {
  const { data: qs, error } = await sb.from("assessment_questions").select("id,question_text,options,correct_answer,hint,explanation");
  if (error) throw error;
  const ids = (qs || []).map((q: any) => q.id);
  const { data: existing } = await sb.from("assessment_question_i18n").select("question_id,language_code").in("question_id", ids);
  const has = new Set((existing || []).map((r: any) => `${r.question_id}:${r.language_code}`));

  for (const q of (qs || []) as any[]) {
    const opts: string[] = Array.isArray(q.options) ? q.options : [];
    for (const lang of TARGETS) {
      if (has.has(`${q.id}:${lang}`)) continue;
      try {
        // Pack all texts in order: [question, ...options, correct_answer, hint, explanation]
        const inputs: string[] = [q.question_text || ""];
        const optStart = inputs.length;
        opts.forEach((o) => inputs.push(o || ""));
        const optEnd = inputs.length;
        inputs.push(q.correct_answer || "");
        inputs.push(q.hint || "");
        inputs.push(q.explanation || "");

        // Skip if no Hangul anywhere
        if (!inputs.some(hasHangul)) continue;

        const out = await translate(inputs, lang);
        const tQ = (out[0] || "").trim() || q.question_text;
        const tOpts = out.slice(optStart, optEnd).map((s, i) => (s || "").trim() || opts[i]);
        const tCorrect = (out[optEnd] || "").trim() || q.correct_answer;
        const tHint = (out[optEnd + 1] || "").trim() || q.hint;
        const tExp = (out[optEnd + 2] || "").trim() || q.explanation;

        const payload: any = {
          question_id: q.id,
          language_code: lang,
          question_text: tQ,
          options: tOpts.length ? tOpts : null,
          correct_answer: tCorrect,
          hint: tHint || null,
          explanation: tExp || null,
        };
        const { error: ue } = await sb.from("assessment_question_i18n").upsert(payload, { onConflict: "question_id,language_code" });
        if (ue) { failed++; console.error(`  ✗ ${q.id} ${lang}:`, ue.message); }
        else { processed++; console.log(`  ✓ ${q.id} ${lang}`); }
      } catch (e: any) {
        failed++; console.error(`  ✗ ${q.id} ${lang}:`, e.message);
      }
    }
  }
  console.log(`\nDONE processed=${processed} failed=${failed}`);
}
main();
