import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PLACEHOLDER_PATTERN = /placeholder_value_to_be_replaced/i;
const isConfigured = (value: string | null) => Boolean(value?.trim() && !PLACEHOLDER_PATTERN.test(value));
const cleanHost = (value: string) => value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LIBRARY_ID = Deno.env.get("BUNNY_STREAM_LIBRARY_ID");
    const API_KEY = Deno.env.get("BUNNY_STREAM_API_KEY");
    if (!LIBRARY_ID || !API_KEY) {
      return new Response(JSON.stringify({ error: "Bunny Stream env not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled";

    const res = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}/videos`, {
      method: "POST",
      headers: {
        AccessKey: API_KEY,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ title }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Bunny create video failed", details: data }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload URL: PUT https://video.bunnycdn.com/library/{libId}/videos/{videoId}
    // Authenticated with AccessKey header (use API_KEY directly from browser via this token)
    const configuredCdn = Deno.env.get("BUNNY_STREAM_CDN_HOSTNAME");
    const cdnHostname = isConfigured(configuredCdn) ? cleanHost(configuredCdn!) : null;
    const playUrl = cdnHostname
      ? `https://${cdnHostname}/${data.guid}/playlist.m3u8`
      : `https://iframe.mediadelivery.net/play/${LIBRARY_ID}/${data.guid}`;
    const thumbnailUrl = cdnHostname ? `https://${cdnHostname}/${data.guid}/thumbnail.jpg` : null;

    return new Response(
      JSON.stringify({
        videoId: data.guid,
        libraryId: LIBRARY_ID,
        uploadUrl: `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${data.guid}`,
        accessKey: API_KEY,
        cdnHostname,
        playUrl,
        thumbnailUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});