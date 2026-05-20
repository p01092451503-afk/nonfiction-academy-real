import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PLACEHOLDER_PATTERN = /placeholder_value_to_be_replaced/i;
const VIDEO_ID_PATTERN = /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
const isConfigured = (value: string | null | undefined) => Boolean(value?.trim() && !PLACEHOLDER_PATTERN.test(value));
const cleanHost = (value: string) => value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const extractCdnHost = (value: string, videoId: string) => {
  const match = value.match(new RegExp(`https://([^/"']+)/${escapeRegExp(videoId)}/(?:playlist\\.m3u8|thumbnail\\.jpg|original)`, "i"));
  return match?.[1] ? cleanHost(match[1]) : null;
};

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

async function sha256Base64Url(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(buf)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\n/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function signCdnDirectoryUrl(url: string, authKey: string, expires: number) {
  const parsed = new URL(url);
  const dirPath = parsed.pathname.slice(0, parsed.pathname.lastIndexOf("/") + 1);
  const params = new URLSearchParams(parsed.search);
  params.set("token_path", dirPath);
  const entries = Array.from(params.entries())
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  const parameterData = entries.map(([key, value]) => `${key}=${value}`).join("&");
  const parameterDataUrl = entries.map(([key, value]) => `&${key}=${encodeURIComponent(value)}`).join("");
  const token = await sha256Base64Url(authKey + dirPath + String(expires) + parameterData);
  return `${parsed.origin}/bcdn_token=${token}${parameterDataUrl}&expires=${expires}${parsed.pathname}`;
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
    let cdnHostname = isConfigured(configuredCdn) ? cleanHost(configuredCdn!) : null;
    if (!cdnHostname && typeof body.url === "string") cdnHostname = extractCdnHost(body.url, videoId);
    if (!cdnHostname && typeof body.thumbnailUrl === "string") cdnHostname = extractCdnHost(body.thumbnailUrl, videoId);

    // Sign embed URL if token auth key is available
    const tokenAuthKey = Deno.env.get("BUNNY_STREAM_TOKEN_AUTH_KEY")?.trim();
    const cdnTokenAuthKey = (Deno.env.get("BUNNY_STREAM_CDN_TOKEN_AUTH_KEY") || tokenAuthKey)?.trim();
    const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 6; // 6h
    const baseEmbed = `https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${videoId}`;
    let embedUrl = baseEmbed;
    if (isConfigured(tokenAuthKey)) {
      const token = await signBunnyToken(tokenAuthKey!, videoId, expires);
      embedUrl = `${baseEmbed}?token=${token}&expires=${expires}`;
    }

    if (!cdnHostname) {
      const embedResponse = await fetch(embedUrl).catch(() => null);
      const embedHtml = embedResponse?.ok ? await embedResponse.text() : "";
      cdnHostname = extractCdnHost(embedHtml, videoId);
    }

    if (!cdnHostname && isConfigured(Deno.env.get("BUNNY_STREAM_API_KEY"))) {
      const videoResponse = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${videoId}`, {
        headers: { AccessKey: Deno.env.get("BUNNY_STREAM_API_KEY")!.trim(), accept: "application/json" },
      }).catch(() => null);
      const videoJson = videoResponse?.ok ? await videoResponse.json().catch(() => null) : null;
      cdnHostname = videoJson ? extractCdnHost(JSON.stringify(videoJson), videoId) : null;
    }

    const rawPlaylistUrl = cdnHostname ? `https://${cdnHostname}/${videoId}/playlist.m3u8` : null;
    const playlistUrl = rawPlaylistUrl && isConfigured(cdnTokenAuthKey)
      ? await signCdnDirectoryUrl(rawPlaylistUrl, cdnTokenAuthKey!, expires)
      : rawPlaylistUrl;
    const thumbnailUrl = cdnHostname ? `https://${cdnHostname}/${videoId}/thumbnail.jpg` : null;

    return json({
      videoId,
      cdnHostname,
      // Prefer signed HLS when a CDN token key is configured because the iframe
      // does not append CDN directory tokens to the internal playlist/segments.
      playUrl: playlistUrl || embedUrl,
      embedUrl,
      playlistUrl,
      thumbnailUrl,
      signed: isConfigured(tokenAuthKey) || isConfigured(cdnTokenAuthKey),
      hlsSigned: Boolean(rawPlaylistUrl && isConfigured(cdnTokenAuthKey)),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
