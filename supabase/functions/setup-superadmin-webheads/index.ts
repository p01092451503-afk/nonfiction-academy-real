// One-off setup: ensures 34nus@webheads.co.kr exists with super_admin + all roles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAIL = "34nus@webheads.co.kr";
const TARGET_PASSWORD = "qpqp1010!!";
const ROLES = ["super_admin", "admin", "teacher", "student"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Super Admin" },
    });
    if (created?.user) {
      userId = created.user.id;
    } else if (createErr) {
      // Likely already exists — look up via REST admin API with email filter
      const url = `${Deno.env.get("SUPABASE_URL")!}/auth/v1/admin/users?email=${encodeURIComponent(TARGET_EMAIL)}`;
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const resp = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const body = await resp.json();
      const users = body.users ?? (Array.isArray(body) ? body : []);
      const found = users.find((u: any) => u.email?.toLowerCase() === TARGET_EMAIL);
      if (!found) throw new Error(`createUser failed and user not found: ${createErr.message}`);
      userId = found.id;
      await admin.auth.admin.updateUserById(userId!, {
        password: TARGET_PASSWORD,
        email_confirm: true,
      });
    }

    await admin.from("profiles").upsert(
      { user_id: userId, email: TARGET_EMAIL, full_name: "Super Admin" },
      { onConflict: "user_id" },
    );

    await admin.from("user_roles").delete().eq("user_id", userId);
    const rows = ROLES.map((role) => ({ user_id: userId, role }));
    const { error: roleErr } = await admin.from("user_roles").insert(rows);
    if (roleErr) throw roleErr;

    return new Response(
      JSON.stringify({ ok: true, user_id: userId, email: TARGET_EMAIL, roles: ROLES }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("setup-superadmin-webheads error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
