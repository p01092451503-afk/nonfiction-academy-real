import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PLACEHOLDER_PATTERN = /placeholder_value_to_be_replaced/i;
const VIDEO_ID_PATTERN = /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
const isConfigured = (value: string | null | undefined) => Boolean(value?.trim() && !PLACEHOLDER_PATTERN.test(value));
const cleanHost = (value: string) => value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Bunny Stream signed token: sha256(tokenAuthKey + videoId + expires) -> hex
async function signBunnyToken(authKey: string, videoId: string, expires: number) {
  const data = new TextEncoder().encode(authKey + videoId + String(expires));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

    // Sign embed URL if token auth key is available
    const tokenAuthKey = Deno.env.get("BUNNY_STREAM_TOKEN_AUTH_KEY")?.trim();
    const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 6; // 6h
    const baseEmbed = `https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${videoId}`;
    let embedUrl = baseEmbed;
    if (isConfigured(tokenAuthKey)) {
      const token = await signBunnyToken(tokenAuthKey!, videoId, expires);
      embedUrl = `${baseEmbed}?token=${token}&expires=${expires}`;
    }

    const playlistUrl = cdnHostname ? `https://${cdnHostname}/${videoId}/playlist.m3u8` : null;
    const thumbnailUrl = cdnHostname ? `https://${cdnHostname}/${videoId}/thumbnail.jpg` : null;

    return json({
      videoId,
      cdnHostname,
      // Prefer signed iframe embed (works with token auth on private videos).
      // Direct CDN playlist requires the same token query string and is not used here.
      playUrl: embedUrl,
      embedUrl,
      playlistUrl,
      thumbnailUrl,
      signed: isConfigured(tokenAuthKey),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
