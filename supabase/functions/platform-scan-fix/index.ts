// Platform Health Scan — Phase 2 fix engine.
// Provides "preview" and "apply" actions for safe, idempotent fixes.
// Admin/super_admin only. Every apply is recorded in scan_fix_audit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLISHABLE = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

type Mode = "preview" | "apply";

interface FixRequest {
  action: string;
  mode: Mode;
}

interface FixResponse {
  action: string;
  mode: Mode;
  affectedCount: number;
  preview: Array<{ id?: string; label: string; detail?: string }>;
  sqlPreview?: string;
  appliedAt?: string;
  message?: string;
}

/**
 * Registry of safe, idempotent fixes.
 * - Every fix has preview() that returns rows that *would* be changed.
 * - apply() must be idempotent: running it twice is harmless.
 * - DELETE / RLS changes are NEVER auto-executed here (Phase 3 territory).
 */
async function runFix(svc: any, action: string, mode: Mode): Promise<FixResponse> {
  switch (action) {
    // ──────────────────────────────────────────────────────────────────
    // 1) Clear video_provider when video_url is empty (mismatch tidy-up)
    case "video_clear_orphan_provider": {
      const sqlPreview = `UPDATE course_contents SET video_provider = NULL
WHERE content_type = 'video' AND video_provider IS NOT NULL
  AND (video_url IS NULL OR length(trim(video_url)) = 0);`;
      const { data: rows } = await svc
        .from("course_contents")
        .select("id, title, video_provider")
        .eq("content_type", "video")
        .not("video_provider", "is", null)
        .or("video_url.is.null,video_url.eq.");
      const preview = (rows ?? []).map((r: any) => ({
        id: r.id, label: r.title || "(제목 없음)", detail: `provider=${r.video_provider}, URL 없음`,
      }));
      if (mode === "preview") {
        return { action, mode, affectedCount: preview.length, preview: preview.slice(0, 100), sqlPreview };
      }
      if (preview.length === 0) {
        return { action, mode, affectedCount: 0, preview: [], sqlPreview, appliedAt: new Date().toISOString(), message: "변경할 행이 없습니다." };
      }
      const { error } = await svc
        .from("course_contents")
        .update({ video_provider: null })
        .in("id", preview.map((p) => p.id));
      if (error) throw error;
      return { action, mode, affectedCount: preview.length, preview: preview.slice(0, 100), sqlPreview, appliedAt: new Date().toISOString() };
    }

    // ──────────────────────────────────────────────────────────────────
    // 2) Unpublish published image_package / video_package contents with 0 items
    case "media_unpublish_empty_packages": {
      const sqlPreview = `UPDATE course_contents SET is_published = false
WHERE content_type IN ('image_package','video_package')
  AND is_published = true
  AND id NOT IN (SELECT content_id FROM media_package_items UNION SELECT content_id FROM video_package_items);`;
      const { data: contents } = await svc
        .from("course_contents")
        .select("id, title, content_type")
        .in("content_type", ["image_package", "video_package"])
        .eq("is_published", true);
      const ids = (contents ?? []).map((c: any) => c.id);
      if (ids.length === 0) {
        return { action, mode, affectedCount: 0, preview: [], sqlPreview, message: "대상 차시가 없습니다." };
      }
      const [{ data: media }, { data: video }] = await Promise.all([
        svc.from("media_package_items").select("content_id").in("content_id", ids),
        svc.from("video_package_items").select("content_id").in("content_id", ids),
      ]);
      const hasItem = new Set<string>([
        ...((media ?? []).map((x: any) => x.content_id)),
        ...((video ?? []).map((x: any) => x.content_id)),
      ]);
      const targets = (contents ?? []).filter((c: any) => !hasItem.has(c.id));
      const preview = targets.map((c: any) => ({
        id: c.id, label: c.title || "(제목 없음)", detail: `${c.content_type} · 항목 0개 → 게시 해제`,
      }));
      if (mode === "preview") {
        return { action, mode, affectedCount: preview.length, preview: preview.slice(0, 100), sqlPreview };
      }
      if (preview.length === 0) {
        return { action, mode, affectedCount: 0, preview: [], sqlPreview, appliedAt: new Date().toISOString(), message: "변경할 행이 없습니다." };
      }
      const { error } = await svc
        .from("course_contents")
        .update({ is_published: false })
        .in("id", preview.map((p) => p.id));
      if (error) throw error;
      return { action, mode, affectedCount: preview.length, preview: preview.slice(0, 100), sqlPreview, appliedAt: new Date().toISOString() };
    }

    // ──────────────────────────────────────────────────────────────────
    // 3) Unpublish published courses that have 0 contents
    case "course_unpublish_empty": {
      const sqlPreview = `UPDATE courses SET status = 'draft'
WHERE status = 'published'
  AND id NOT IN (SELECT course_id FROM course_contents);`;
      const { data: courses } = await svc.from("courses").select("id, title").eq("status", "published");
      const ids = (courses ?? []).map((c: any) => c.id);
      if (ids.length === 0) {
        return { action, mode, affectedCount: 0, preview: [], sqlPreview, message: "게시 강의가 없습니다." };
      }
      const { data: contents } = await svc.from("course_contents").select("course_id").in("course_id", ids);
      const have = new Set((contents ?? []).map((c: any) => c.course_id));
      const targets = (courses ?? []).filter((c: any) => !have.has(c.id));
      const preview = targets.map((c: any) => ({
        id: c.id, label: c.title || "(제목 없음)", detail: "차시 0개 → draft 전환",
      }));
      if (mode === "preview") {
        return { action, mode, affectedCount: preview.length, preview: preview.slice(0, 100), sqlPreview };
      }
      if (preview.length === 0) {
        return { action, mode, affectedCount: 0, preview: [], sqlPreview, appliedAt: new Date().toISOString(), message: "변경할 행이 없습니다." };
      }
      const { error } = await svc.from("courses").update({ status: "draft" }).in("id", preview.map((p) => p.id));
      if (error) throw error;
      return { action, mode, affectedCount: preview.length, preview: preview.slice(0, 100), sqlPreview, appliedAt: new Date().toISOString() };
    }

    // ──────────────────────────────────────────────────────────────────
    // 4) Unpublish published assessments with 0 questions
    case "assessment_unpublish_empty": {
      const sqlPreview = `UPDATE assessments SET is_published = false
WHERE is_published = true
  AND id NOT IN (SELECT assessment_id FROM assessment_questions);`;
      const { data: assessments } = await svc.from("assessments").select("id, title").eq("is_published", true);
      const ids = (assessments ?? []).map((a: any) => a.id);
      if (ids.length === 0) {
        return { action, mode, affectedCount: 0, preview: [], sqlPreview, message: "게시된 평가가 없습니다." };
      }
      const { data: qs } = await svc.from("assessment_questions").select("assessment_id").in("assessment_id", ids);
      const have = new Set((qs ?? []).map((q: any) => q.assessment_id));
      const targets = (assessments ?? []).filter((a: any) => !have.has(a.id));
      const preview = targets.map((a: any) => ({
        id: a.id, label: a.title || "(제목 없음)", detail: "문항 0개 → 비공개 전환",
      }));
      if (mode === "preview") {
        return { action, mode, affectedCount: preview.length, preview: preview.slice(0, 100), sqlPreview };
      }
      if (preview.length === 0) {
        return { action, mode, affectedCount: 0, preview: [], sqlPreview, appliedAt: new Date().toISOString(), message: "변경할 행이 없습니다." };
      }
      const { error } = await svc.from("assessments").update({ is_published: false }).in("id", preview.map((p) => p.id));
      if (error) throw error;
      return { action, mode, affectedCount: preview.length, preview: preview.slice(0, 100), sqlPreview, appliedAt: new Date().toISOString() };
    }

    default:
      throw new Error(`알 수 없는 fix action: ${action}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

  let body: FixRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "잘못된 요청 본문" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.action || !["preview", "apply"].includes(body.mode)) {
    return new Response(JSON.stringify({ error: "action / mode 필수" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const result = await runFix(svc, body.action, body.mode);
    if (body.mode === "apply") {
      try {
        await svc.from("scan_fix_audit").insert({
          applied_by: uid,
          check_id: body.action,
          fix_action: body.action,
          affected_count: result.affectedCount,
          request_payload: body as any,
          result_payload: { affectedCount: result.affectedCount, sqlPreview: result.sqlPreview } as any,
          success: true,
        });
      } catch (e) {
        console.error("[platform-scan-fix] audit log failed", e);
      }
    }
    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (body.mode === "apply") {
      try {
        await svc.from("scan_fix_audit").insert({
          applied_by: uid,
          check_id: body.action,
          fix_action: body.action,
          affected_count: 0,
          request_payload: body as any,
          success: false,
          error_message: msg,
        });
      } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
