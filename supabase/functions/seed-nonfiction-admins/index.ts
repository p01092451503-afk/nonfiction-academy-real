// One-off seed: creates/updates 5 Nonfiction office admins (student + admin roles).
// SECURITY: PUBLIC, idempotent. Disable/delete after running.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Row = { email: string; full_name: string; department_code: string; region: string };

const PASSWORD = "nonfiction1";

const ROWS: Row[] = [
  { email: "meejeong.kim@nonfiction.com", full_name: "김미정", department_code: "OFC-KR", region: "KR" },
  { email: "sunghee.ahn@nonfiction.com", full_name: "안성희", department_code: "OFC-KR", region: "KR" },
  { email: "sunhee.lee@nonfiction.com", full_name: "이선희", department_code: "OFC-KR", region: "KR" },
  { email: "wonkyung.cho@nonfiction.com", full_name: "조원경", department_code: "OFC-KR", region: "KR" },
  { email: "heejin.park@nonfiction.com", full_name: "박희진", department_code: "OFC-KR", region: "KR" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: depts } = await admin.from("departments").select("id, code, country");
    const byCodeCountry = new Map<string, string>();
    const byCode = new Map<string, string[]>();
    for (const d of depts || []) {
      const code = (d.code || "").trim().toLowerCase();
      const country = ((d as any).country || "").trim().toUpperCase();
      if (!code) continue;
      if (country) byCodeCountry.set(`${code}|${country}`, d.id);
      const arr = byCode.get(code) || [];
      arr.push(d.id);
      byCode.set(code, arr);
    }

    const results: Array<{ email: string; status: string; message?: string }> = [];

    for (const r of ROWS) {
      const email = r.email.trim().toLowerCase();
      const code = r.department_code.trim().toLowerCase();
      const country = r.region.trim().toUpperCase();
      let departmentId = byCodeCountry.get(`${code}|${country}`) || null;
      if (!departmentId) {
        const arr = byCode.get(code);
        if (arr && arr.length === 1) departmentId = arr[0];
      }
      if (!departmentId) {
        results.push({ email, status: "error", message: `dept not found: ${r.department_code}/${country}` });
        continue;
      }

      try {
        let uid: string | undefined;
        const { data: created, error } = await admin.auth.admin.createUser({
          email, password: PASSWORD, email_confirm: true,
          user_metadata: { full_name: r.full_name, department_id: departmentId },
        });
        if (created?.user) uid = created.user.id;
        else if (error) {
          const msg = error.message || "";
          if (/already|registered/i.test(msg)) {
            const url = `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
            const resp = await fetch(url, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
            const body = await resp.json();
            const users = body.users ?? (Array.isArray(body) ? body : []);
            const found = users.find((u: any) => u.email?.toLowerCase() === email);
            if (!found) { results.push({ email, status: "error", message: msg }); continue; }
            uid = found.id;
            await admin.auth.admin.updateUserById(uid!, { password: PASSWORD, email_confirm: true });
          } else { results.push({ email, status: "error", message: msg }); continue; }
        }

        if (uid) {
          await admin.from("user_roles").delete().eq("user_id", uid);
          await admin.from("user_roles").insert([
            { user_id: uid, role: "student" },
            { user_id: uid, role: "admin" },
          ]);
          await admin.from("profiles").upsert(
            { user_id: uid, full_name: r.full_name, department_id: departmentId, email },
            { onConflict: "user_id" },
          );
          results.push({ email, status: created?.user ? "created" : "updated" });
        }
      } catch (e: any) {
        results.push({ email, status: "error", message: String(e?.message || e) });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      errors: results.filter((r) => r.status === "error").length,
    };
    return new Response(JSON.stringify({ summary, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
