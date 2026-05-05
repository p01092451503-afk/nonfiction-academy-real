import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Row = {
  email?: string;
  password?: string;
  full_name?: string;
  role?: string;
  department_code?: string;
  department_name?: string;
  position?: string;
};

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

    const { data: depts } = await admin.from("departments").select("id, name, name_en, code");
    const deptByCode = new Map<string, string>();
    const deptByName = new Map<string, string>();
    for (const d of depts || []) {
      if (d.code) deptByCode.set(String(d.code).trim().toLowerCase(), d.id);
      if (d.name) deptByName.set(String(d.name).trim().toLowerCase(), d.id);
      if ((d as any).name_en) deptByName.set(String((d as any).name_en).trim().toLowerCase(), d.id);
    }

    const validRoles = new Set(["student", "teacher", "admin"]);
    const results: Array<{ row: number; email: string; status: "created" | "skipped" | "error"; message?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // header is row 1
      const email = (r.email || "").trim().toLowerCase();
      const password = String(r.password || "").trim();
      const fullName = (r.full_name || "").trim();
      const role = (r.role || "student").trim().toLowerCase();
      const position = (r.position || "").trim();

      if (!email || !password) {
        results.push({ row: rowNum, email, status: "error", message: "email/password required" });
        continue;
      }
      if (password.length < 6) {
        results.push({ row: rowNum, email, status: "error", message: "password must be >= 6 chars" });
        continue;
      }
      if (!validRoles.has(role)) {
        results.push({ row: rowNum, email, status: "error", message: `invalid role: ${role}` });
        continue;
      }

      let departmentId: string | null = null;
      const code = (r.department_code || "").trim().toLowerCase();
      const name = (r.department_name || "").trim().toLowerCase();
      if (code) departmentId = deptByCode.get(code) || null;
      if (!departmentId && name) departmentId = deptByName.get(name) || null;
      if ((code || name) && !departmentId) {
        results.push({ row: rowNum, email, status: "error", message: `department not found: ${r.department_code || r.department_name}` });
        continue;
      }

      try {
        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, department_id: departmentId },
        });

        if (error) {
          const msg = error.message || "create failed";
          if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
            results.push({ row: rowNum, email, status: "skipped", message: "already exists" });
          } else {
            results.push({ row: rowNum, email, status: "error", message: msg });
          }
          continue;
        }

        const uid = created.user?.id;
        if (uid) {
          if (role !== "student") {
            await admin.from("user_roles").delete().eq("user_id", uid);
            await admin.from("user_roles").insert({ user_id: uid, role });
          }
          await admin
            .from("profiles")
            .update({
              full_name: fullName || null,
              department_id: departmentId,
              position: position || null,
              email,
            })
            .eq("user_id", uid);
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
