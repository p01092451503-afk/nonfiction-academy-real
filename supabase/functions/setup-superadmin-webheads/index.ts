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
    let page = 1;
    while (page <= 20) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const found = data.users.find((u) => u.email?.toLowerCase() === TARGET_EMAIL);
      if (found) { userId = found.id; break; }
      if (data.users.length < 200) break;
      page++;
    }

    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: TARGET_EMAIL,
        password: TARGET_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Super Admin" },
      });
      if (error) throw error;
      userId = data.user!.id;
    } else {
      await admin.auth.admin.updateUserById(userId, {
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
