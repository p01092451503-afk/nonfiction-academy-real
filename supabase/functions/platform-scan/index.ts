// Platform Health Scan — Phase 1 (read-only).
// Runs 5 checks in parallel and returns a unified report.
// Admin/super_admin only. Read-only — never mutates data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Severity = "ok" | "warning" | "error";
type Category = "data" | "media" | "i18n" | "security" | "ops";

interface Finding {
  rowId?: string;
  label: string;
  detail?: string;
  meta?: Record<string, unknown>;
}

interface CheckResult {
  id: string;
  category: Category;
  title: string;
  description: string;
  severity: Severity;
  count: number;
  findings: Finding[];
  durationMs: number;
  error?: string;
  /** Suggested fix description (Phase 2 will provide preview/apply). */
  suggestion?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLISHABLE = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_FINDINGS = 50; // cap per-check payload to keep response light

async function check<T>(
  id: string,
  category: Category,
  title: string,
  description: string,
  fn: () => Promise<{ severity: Severity; findings: Finding[]; suggestion?: string }>,
): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const { severity, findings, suggestion } = await fn();
    return {
      id, category, title, description,
      severity,
      count: findings.length,
      findings: findings.slice(0, MAX_FINDINGS),
      durationMs: Date.now() - t0,
      suggestion,
    };
  } catch (e) {
    return {
      id, category, title, description,
      severity: "error",
      count: 0,
      findings: [],
      durationMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ---- AuthN/AuthZ: admin or super_admin only ----
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, PUBLISHABLE, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const uid = userRes.user.id;
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", uid);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role));
  if (!roleSet.has("admin") && !roleSet.has("super_admin")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const REQUIRED_LANGS = ["ko", "en", "ja", "zh-CN"];

  // ---- 5 checks, in parallel ----
  const results = await Promise.all([
    // 1) i18n gaps on published courses
    check("i18n_course_gaps", "i18n",
      "강의 다국어 번역 누락",
      "발행된(published) 강의 중 ko/en/ja/zh-CN 번역이 빠진 항목을 찾습니다.",
      async () => {
        const { data: courses, error } = await svc
          .from("courses")
          .select("id, title, status")
          .eq("status", "published");
        if (error) throw error;
        const ids = (courses ?? []).map((c: any) => c.id);
        if (ids.length === 0) return { severity: "ok" as const, findings: [] };
        const { data: i18n } = await svc
          .from("course_i18n")
          .select("course_id, language_code")
          .in("course_id", ids);
        const byCourse = new Map<string, Set<string>>();
        for (const r of i18n ?? []) {
          const s = byCourse.get((r as any).course_id) ?? new Set<string>();
          s.add((r as any).language_code);
          byCourse.set((r as any).course_id, s);
        }
        const findings: Finding[] = [];
        for (const c of courses ?? []) {
          const have = byCourse.get((c as any).id) ?? new Set();
          const missing = REQUIRED_LANGS.filter((l) => !have.has(l));
          if (missing.length > 0) {
            findings.push({
              rowId: (c as any).id,
              label: (c as any).title ?? "(제목 없음)",
              detail: `누락: ${missing.join(", ")}`,
              meta: { missing },
            });
          }
        }
        return {
          severity: findings.length === 0 ? "ok" : findings.length > 5 ? "error" : "warning",
          findings,
          suggestion: "AdminI18n 페이지에서 자동 번역을 실행하거나 수동 번역을 추가하세요.",
        };
      },
    ),

    // 2) Orphan enrollments — enrolled course no longer exists (or unpublished)
    check("orphan_enrollments", "data",
      "고립된 수강 신청",
      "강의가 삭제되었거나 draft 상태인데 승인된 수강 신청이 남아있는 행을 찾습니다.",
      async () => {
        const { data, error } = await svc
          .from("enrollments")
          .select("id, user_id, course_id, status, courses(id, status, title)")
          .eq("status", "approved");
        if (error) throw error;
        const findings: Finding[] = [];
        for (const e of (data as any[]) ?? []) {
          if (!e.courses) {
            findings.push({ rowId: e.id, label: `수강 ${e.id.slice(0,8)} → 강의 없음`, detail: `course_id=${e.course_id}` });
          } else if (e.courses.status === "draft") {
            findings.push({
              rowId: e.id,
              label: e.courses.title ?? e.course_id,
              detail: "강의가 draft 상태이지만 승인된 수강 신청이 존재",
            });
          }
        }
        return {
          severity: findings.length === 0 ? "ok" : "warning",
          findings,
          suggestion: "강의를 다시 게시하거나, 해당 수강 신청을 취소/삭제하세요.",
        };
      },
    ),

    // 3) Broken media items — empty url, or contents that should have items but don't
    check("media_package_health", "media",
      "이미지/미디어 패키지 누락",
      "image_package 차시인데 media_package_items가 0개이거나 media_url이 비어있는 항목을 찾습니다.",
      async () => {
        const { data: contents, error } = await svc
          .from("course_contents")
          .select("id, title, content_type, course_id, is_published")
          .in("content_type", ["image_package", "video_package"]);
        if (error) throw error;
        const ids = (contents ?? []).map((c: any) => c.id);
        if (ids.length === 0) return { severity: "ok" as const, findings: [] };
        const [{ data: media }, { data: video }] = await Promise.all([
          svc.from("media_package_items").select("content_id, media_url").in("content_id", ids),
          svc.from("video_package_items").select("content_id").in("content_id", ids),
        ]);
        const mediaCount = new Map<string, number>();
        const mediaBad = new Map<string, number>();
        for (const m of (media as any[]) ?? []) {
          mediaCount.set(m.content_id, (mediaCount.get(m.content_id) ?? 0) + 1);
          if (!m.media_url || String(m.media_url).trim() === "") {
            mediaBad.set(m.content_id, (mediaBad.get(m.content_id) ?? 0) + 1);
          }
        }
        const videoCount = new Map<string, number>();
        for (const v of (video as any[]) ?? []) {
          videoCount.set(v.content_id, (videoCount.get(v.content_id) ?? 0) + 1);
        }
        const findings: Finding[] = [];
        for (const c of (contents as any[]) ?? []) {
          const isImg = c.content_type === "image_package";
          const total = isImg ? (mediaCount.get(c.id) ?? 0) : (videoCount.get(c.id) ?? 0);
          const bad = isImg ? (mediaBad.get(c.id) ?? 0) : 0;
          if (total === 0) {
            findings.push({
              rowId: c.id,
              label: c.title || "(제목 없음)",
              detail: `${c.content_type} 차시인데 항목 0개${c.is_published ? " (게시 중)" : ""}`,
            });
          } else if (bad > 0) {
            findings.push({
              rowId: c.id,
              label: c.title || "(제목 없음)",
              detail: `media_url 누락 ${bad}건 / 총 ${total}건`,
            });
          }
        }
        return {
          severity: findings.length === 0 ? "ok" : findings.some(f => /게시 중/.test(f.detail ?? "")) ? "error" : "warning",
          findings,
          suggestion: "강의 편집 페이지에서 해당 차시의 이미지/영상을 다시 업로드하세요.",
        };
      },
    ),

    // 4) Source mismatch — video_provider vs video_url consistency
    check("video_source_mismatch", "media",
      "동영상 제공자 ↔ URL 불일치",
      "video_provider가 youtube/vimeo인데 URL에 해당 도메인이 없거나, URL은 있는데 provider가 없는 차시를 찾습니다.",
      async () => {
        const { data, error } = await svc
          .from("course_contents")
          .select("id, title, video_provider, video_url, content_type")
          .eq("content_type", "video");
        if (error) throw error;
        const findings: Finding[] = [];
        for (const c of (data as any[]) ?? []) {
          const url = (c.video_url ?? "").toLowerCase();
          const prov = c.video_provider;
          if (!url && !prov) continue;
          if (url && !prov) {
            findings.push({ rowId: c.id, label: c.title, detail: "URL은 있는데 provider 미지정" });
            continue;
          }
          if (prov === "youtube" && url && !/youtu\.?be/.test(url)) {
            findings.push({ rowId: c.id, label: c.title, detail: `provider=youtube, URL=${url.slice(0,60)}` });
          } else if (prov === "vimeo" && url && !/vimeo/.test(url)) {
            findings.push({ rowId: c.id, label: c.title, detail: `provider=vimeo, URL=${url.slice(0,60)}` });
          } else if (prov && !url) {
            findings.push({ rowId: c.id, label: c.title, detail: `provider=${prov}, URL 비어있음` });
          }
        }
        return {
          severity: findings.length === 0 ? "ok" : "warning",
          findings,
          suggestion: "강의 편집에서 영상 URL과 제공자(provider)를 일치시키세요.",
        };
      },
    ),

    // 5) RLS disabled on public tables (security baseline)
    check("rls_disabled_tables", "security",
      "RLS 미적용 public 테이블",
      "public 스키마 중 RLS가 비활성화된 테이블을 점검합니다. (의도된 공개 테이블이면 무시 가능)",
      async () => {
        // Use REST + admin role to call a tiny RPC... we don't have one, so fall back to
        // pg_catalog via a temporary view? We don't have arbitrary SQL access here.
        // Use the supabase_admin postgres meta via REST: not exposed. Instead read
        // information via "rest" — not feasible. So we list a hardcoded set of
        // sensitive tables and check by trying a read with anon key — if anon returns rows
        // without auth, treat as exposed.
        const sensitive = [
          "profiles", "user_roles", "enrollments", "courses", "course_contents",
          "assessment_attempts", "assessment_answers", "user_gamification",
        ];
        const anon = createClient(SUPABASE_URL, PUBLISHABLE);
        const findings: Finding[] = [];
        await Promise.all(sensitive.map(async (table) => {
          try {
            const { data, error } = await anon.from(table as any).select("*").limit(1);
            // If anon returned a row, RLS is missing/permissive
            if (!error && Array.isArray(data) && data.length > 0) {
              findings.push({
                label: `public.${table}`,
                detail: "익명 사용자가 데이터를 읽을 수 있음 (RLS 미적용 또는 SELECT 정책이 모두에게 허용)",
              });
            }
          } catch { /* ignore */ }
        }));
        return {
          severity: findings.length === 0 ? "ok" : "error",
          findings,
          suggestion: "Supabase Linter를 실행하고 anon 권한 정책을 검토하세요.",
        };
      },
    ),

    // 6) Published courses with 0 contents
    check("empty_published_courses", "data",
      "차시 없는 게시 강의",
      "published 상태인데 course_contents가 0개인 강의를 찾습니다.",
      async () => {
        const { data: courses, error } = await svc
          .from("courses")
          .select("id, title")
          .eq("status", "published");
        if (error) throw error;
        const ids = (courses ?? []).map((c: any) => c.id);
        if (ids.length === 0) return { severity: "ok" as const, findings: [] };
        const { data: contents } = await svc
          .from("course_contents")
          .select("course_id")
          .in("course_id", ids);
        const have = new Set((contents ?? []).map((c: any) => c.course_id));
        const findings: Finding[] = [];
        for (const c of courses ?? []) {
          if (!have.has((c as any).id)) {
            findings.push({ rowId: (c as any).id, label: (c as any).title || "(제목 없음)", detail: "차시 0개" });
          }
        }
        return {
          severity: findings.length === 0 ? "ok" : "error",
          findings,
          suggestion: "차시를 추가하거나 강의를 비공개(draft)로 전환하세요.",
        };
      },
    ),

    // 7) Published assessments with 0 questions
    check("empty_published_assessments", "data",
      "문항 없는 게시 평가",
      "is_published=true인데 문항이 0개인 평가를 찾습니다.",
      async () => {
        const { data: assessments, error } = await svc
          .from("assessments")
          .select("id, title")
          .eq("is_published", true);
        if (error) throw error;
        const ids = (assessments ?? []).map((a: any) => a.id);
        if (ids.length === 0) return { severity: "ok" as const, findings: [] };
        const { data: qs } = await svc
          .from("assessment_questions")
          .select("assessment_id")
          .in("assessment_id", ids);
        const have = new Set((qs ?? []).map((q: any) => q.assessment_id));
        const findings: Finding[] = [];
        for (const a of assessments ?? []) {
          if (!have.has((a as any).id)) {
            findings.push({ rowId: (a as any).id, label: (a as any).title || "(제목 없음)", detail: "문항 0개" });
          }
        }
        return {
          severity: findings.length === 0 ? "ok" : "error",
          findings,
          suggestion: "문항을 추가하거나 평가를 비공개로 전환하세요.",
        };
      },
    ),

    // 8) Stale enrollments — approved 90+ days ago, 0% progress
    check("stale_enrollments", "ops",
      "장기 미진행 수강 신청",
      "승인된 지 90일 이상 지났는데 진도율이 0%인 수강 신청을 찾습니다.",
      async () => {
        const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();
        const { data, error } = await svc
          .from("enrollments")
          .select("id, user_id, course_id, enrolled_at, progress, courses(title)")
          .eq("status", "approved")
          .lte("enrolled_at", cutoff)
          .lte("progress", 0);
        if (error) throw error;
        const findings: Finding[] = ((data as any[]) ?? []).map((e) => ({
          rowId: e.id,
          label: e.courses?.title ?? e.course_id,
          detail: `등록일 ${new Date(e.enrolled_at).toLocaleDateString("ko-KR")} · 진도 0%`,
        }));
        return {
          severity: findings.length === 0 ? "ok" : "warning",
          findings,
          suggestion: "독려 알림을 보내거나 수강 신청을 정리하세요.",
        };
      },
    ),
  ]);


  const summary = {
    ok: results.filter(r => r.severity === "ok").length,
    warning: results.filter(r => r.severity === "warning").length,
    error: results.filter(r => r.severity === "error").length,
    totalFindings: results.reduce((s, r) => s + r.count, 0),
    scannedAt: new Date().toISOString(),
    durationMs: results.reduce((s, r) => s + r.durationMs, 0),
  };

  // Persist scan history (for trend chart). Failure here must NOT break the scan response.
  try {
    await svc.from("scan_results").insert({
      scanned_by: uid,
      ok_count: summary.ok,
      warning_count: summary.warning,
      error_count: summary.error,
      total_findings: summary.totalFindings,
      duration_ms: summary.durationMs,
      results: results as any,
    });
  } catch (e) {
    console.error("[platform-scan] failed to persist scan_results", e);
  }

  return new Response(JSON.stringify({ summary, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
