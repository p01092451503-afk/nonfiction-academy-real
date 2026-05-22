// Dynamic PWA manifest powered by pwa_settings table.
// Public (no JWT). Returns application/manifest+json.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const fallback = {
    name: "NONFICTION Academy",
    short_name: "NONFICTION Academy",
    description: "논픽션 사내 교육 시스템입니다.",
    theme_color: "#1a1a2e",
    background_color: "#ffffff",
  };

  let s = fallback;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data } = await supabase
      .from("pwa_settings")
      .select("app_name, short_name, description, theme_color, background_color")
      .limit(1)
      .maybeSingle();
    if (data) {
      s = {
        name: data.app_name || fallback.name,
        short_name: data.short_name || fallback.short_name,
        description: data.description || fallback.description,
        theme_color: data.theme_color || fallback.theme_color,
        background_color: data.background_color || fallback.background_color,
      };
    }
  } catch (_) {
    // fallthrough to fallback
  }

  const manifest = {
    name: s.name,
    short_name: s.short_name,
    description: s.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: s.background_color,
    theme_color: s.theme_color,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
