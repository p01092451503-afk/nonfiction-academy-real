// One-off setup function: ensures test@test.co.kr exists and has all 4 roles.
// SECURITY: This function is intentionally PUBLIC for initial setup. It only acts on a
// hardcoded test email. Delete or disable after running once.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAIL = "test@test.co.kr";
const TARGET_PASSWORD = "test1234";
const ROLES = ["super_admin", "admin", "teacher", "student"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Find existing user via listUsers (paginated)
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
        user_metadata: { full_name: "Test Admin" },
      });
      if (error) throw error;
      userId = data.user!.id;
    } else {
      // Reset password and confirm email just in case
      await admin.auth.admin.updateUserById(userId, {
        password: TARGET_PASSWORD,
        email_confirm: true,
      });
    }

    // Ensure profile exists
    await admin.from("profiles").upsert(
      { user_id: userId, email: TARGET_EMAIL, full_name: "Test Admin" },
      { onConflict: "user_id" },
    );

    // Wipe + assign all 4 roles
    await admin.from("user_roles").delete().eq("user_id", userId);
    const rows = ROLES.map((role) => ({ user_id: userId, role }));
    const { error: roleErr } = await admin.from("user_roles").insert(rows);
    if (roleErr) throw roleErr;

    return new Response(
      JSON.stringify({ ok: true, user_id: userId, email: TARGET_EMAIL, roles: ROLES }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("setup-test-admin error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
