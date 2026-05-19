import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Row = {
  email?: string;
  password?: string;
  full_name?: string;
  // New schema
  role1?: string;          // primary role: student | teacher | admin
  role2?: string;          // secondary role label (e.g. "Learning Leader" → teacher)
  region?: string;         // country code: KR | JP | HK | US ...
  department_code?: string;
  department_name?: string;
  // Backward compatible
  role?: string;
  position?: string;
};

const ROLE_SYNONYMS: Record<string, string> = {
  "learning leader": "teacher",
  "leader": "teacher",
  "러닝리더": "teacher",
  "러닝 리더": "teacher",
  "강사": "teacher",
  "teacher": "teacher",
  "admin": "admin",
  "administrator": "admin",
  "super_admin": "super_admin",
  "super admin": "super_admin",
  "student": "student",
  "학습자": "student",
};

function normalizeRole(v?: string): string | null {
  if (!v) return null;
  const k = String(v).trim().toLowerCase();
  if (!k) return null;
  return ROLE_SYNONYMS[k] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const isAdmin = callerRoles?.some((r) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { rows } = (await req.json()) as { rows: Row[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "rows required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (rows.length > 500) {
      return new Response(JSON.stringify({ error: "Maximum 500 rows per upload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build department lookups: (code, country) -> id, code -> ids[], (name, country) -> id
    const { data: depts } = await admin.from("departments").select("id, name, name_en, code, country");
    const byCodeCountry = new Map<string, string>();
    const byCode = new Map<string, string[]>();
    const byNameCountry = new Map<string, string>();
    const byName = new Map<string, string[]>();
    for (const d of depts || []) {
      const code = (d.code || "").trim().toLowerCase();
      const name = (d.name || "").trim().toLowerCase();
      const nameEn = ((d as any).name_en || "").trim().toLowerCase();
      const country = ((d as any).country || "").trim().toUpperCase();
      if (code) {
        if (country) byCodeCountry.set(`${code}|${country}`, d.id);
        const arr = byCode.get(code) || [];
        arr.push(d.id);
        byCode.set(code, arr);
      }
      for (const n of [name, nameEn]) {
        if (!n) continue;
        if (country) byNameCountry.set(`${n}|${country}`, d.id);
        const arr = byName.get(n) || [];
        arr.push(d.id);
        byName.set(n, arr);
      }
    }

    const results: Array<{ row: number; email: string; status: "created" | "skipped" | "error"; message?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const email = (r.email || "").trim().toLowerCase();
      const password = String(r.password || "").trim();
      const fullName = (r.full_name || "").trim();
      const position = (r.position || "").trim();

      const primary = normalizeRole(r.role1) ?? normalizeRole(r.role) ?? "student";
      const secondary = normalizeRole(r.role2);
      const validRoles = new Set(["student", "teacher", "admin", "super_admin"]);
      if (!validRoles.has(primary)) {
        results.push({ row: rowNum, email, status: "error", message: `invalid role1: ${r.role1 || r.role}` });
        continue;
      }
      // Build final roles list (dedup)
      const finalRoles = new Set<string>([primary]);
      if (secondary && validRoles.has(secondary)) finalRoles.add(secondary);

      if (!email || !password) {
        results.push({ row: rowNum, email, status: "error", message: "email/password required" });
        continue;
      }
      if (password.length < 6) {
        results.push({ row: rowNum, email, status: "error", message: "password must be >= 6 chars" });
        continue;
      }

      // Department resolution
      let departmentId: string | null = null;
      const code = (r.department_code || "").trim().toLowerCase();
      const name = (r.department_name || "").trim().toLowerCase();
      const country = (r.region || "").trim().toUpperCase();
      if (code && country) departmentId = byCodeCountry.get(`${code}|${country}`) || null;
      if (!departmentId && code) {
        const arr = byCode.get(code);
        if (arr && arr.length === 1) departmentId = arr[0];
      }
      if (!departmentId && name && country) departmentId = byNameCountry.get(`${name}|${country}`) || null;
      if (!departmentId && name) {
        const arr = byName.get(name);
        if (arr && arr.length === 1) departmentId = arr[0];
      }
      if ((code || name) && !departmentId) {
        results.push({ row: rowNum, email, status: "error", message: `department not found: ${r.department_code || r.department_name} (${country || "?"})` });
        continue;
      }

      try {
        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, department_id: departmentId },
        });

        let uid: string | undefined = created?.user?.id;

        if (error) {
          const msg = error.message || "create failed";
          if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
            // Find existing user and update password + roles + profile
            const url = `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
            const resp = await fetch(url, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
            const body = await resp.json();
            const users = body.users ?? (Array.isArray(body) ? body : []);
            const found = users.find((u: any) => u.email?.toLowerCase() === email);
            if (found) {
              uid = found.id;
              await admin.auth.admin.updateUserById(uid!, { password, email_confirm: true });
            } else {
              results.push({ row: rowNum, email, status: "error", message: msg });
              continue;
            }
          } else {
            results.push({ row: rowNum, email, status: "error", message: msg });
            continue;
          }
        }

        if (uid) {
          // Wipe existing roles and assign final set
          await admin.from("user_roles").delete().eq("user_id", uid);
          const roleRows = Array.from(finalRoles).map((role) => ({ user_id: uid, role }));
          await admin.from("user_roles").insert(roleRows);

          await admin
            .from("profiles")
            .upsert(
              {
                user_id: uid,
                full_name: fullName || null,
                department_id: departmentId,
                position: position || null,
                email,
              },
              { onConflict: "user_id" },
            );
        }

        results.push({ row: rowNum, email, status: "created" });
      } catch (e: any) {
        results.push({ row: rowNum, email, status: "error", message: String(e?.message || e) });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
    };

    return new Response(JSON.stringify({ summary, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
