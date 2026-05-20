import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PLACEHOLDER_PATTERN = /placeholder_value_to_be_replaced/i;
const VIDEO_ID_PATTERN = /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
const isConfigured = (value: string | null) => Boolean(value?.trim() && !PLACEHOLDER_PATTERN.test(value));
const cleanHost = (value: string) => value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LIBRARY_ID = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
    if (!isConfigured(LIBRARY_ID)) return json({ error: "Bunny Stream library is not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const videoId = typeof body.videoId === "string" && body.videoId.trim()
      ? body.videoId.trim()
      : typeof body.url === "string"
        ? body.url.match(VIDEO_ID_PATTERN)?.[1]
        : null;

    if (!videoId) return json({ error: "videoId required" }, 400);

    const configuredCdn = Deno.env.get("BUNNY_STREAM_CDN_HOSTNAME");
    const cdnHostname = isConfigured(configuredCdn) ? cleanHost(configuredCdn!) : null;
    const embedUrl = `https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${videoId}`;
    const playlistUrl = cdnHostname ? `https://${cdnHostname}/${videoId}/playlist.m3u8` : null;
    const thumbnailUrl = cdnHostname ? `https://${cdnHostname}/${videoId}/thumbnail.jpg` : null;

    return json({
      videoId,
      cdnHostname,
      playUrl: playlistUrl || embedUrl,
      embedUrl,
      playlistUrl,
      thumbnailUrl,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});