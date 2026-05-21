import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PLACEHOLDER_PATTERN = /placeholder_value_to_be_replaced/i;
const VIDEO_ID_PATTERN = /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;
const isConfigured = (value: string | null | undefined) => Boolean(value?.trim() && !PLACEHOLDER_PATTERN.test(value));
const cleanHost = (value: string) => value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const extractCdnHost = (value: string, videoId: string) => {
  const match = value.match(new RegExp(`https://([^/"']+)/${escapeRegExp(videoId)}/(?:playlist\\.m3u8|thumbnail\\.jpg|original)`, "i"));
  const host = match?.[1] ? cleanHost(match[1]) : null;
  return isConfigured(host) ? host : null;
};
const hostnameFromHeader = (value: string | null) => {
  if (!value) return null;
  try {
    return cleanHost(new URL(value).hostname);
  } catch {
    return null;
  }
};
const defaultAllowedReferrers = [
  "32613697-36d8-44de-a44f-4b31fe45576b.lovableproject.com",
  "id-preview--32613697-36d8-44de-a44f-4b31fe45576b.lovable.app",
  "nonfiction-academy.lovable.app",
  "nonfiction-academy.webheads.co.kr",
];

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

async function hmacSha256Base64Url(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\n/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

const getSortedParameterData = (params: URLSearchParams) =>
  Array.from(params.entries())
    .filter(([key, value]) => key !== "token" && key !== "expires" && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

async function signCdnFileUrl(url: string, authKey: string, expires: number) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const signingData = getSortedParameterData(params);
  const token = `HS256-${await hmacSha256Base64Url(authKey, parsed.pathname + String(expires) + signingData)}`;
  params.set("token", token);
  params.set("expires", String(expires));
  return `${parsed.origin}${parsed.pathname}?${params.toString()}`;
}

async function signCdnDirectoryUrl(url: string, authKey: string, expires: number) {
  const parsed = new URL(url);
  const dirPath = parsed.pathname.slice(0, parsed.pathname.lastIndexOf("/") + 1);
  const params = new URLSearchParams(parsed.search);
  params.set("token_path", dirPath);
  const entries = Array.from(params.entries())
    .filter(([key, value]) => key !== "token" && key !== "expires" && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  const parameterData = entries.map(([key, value]) => `${key}=${value}`).join("&");
  const parameterDataUrl = entries.map(([key, value]) => `&${key}=${encodeURIComponent(value)}`).join("");
  const token = `HS256-${await hmacSha256Base64Url(authKey, dirPath + String(expires) + parameterData)}`;
  return `${parsed.origin}/bcdn_token=${token}${parameterDataUrl}&expires=${expires}${parsed.pathname}`;
}

async function signProxyToken(authKey: string, videoId: string, cdnHostname: string, expires: number) {
  return await signBunnyToken(authKey, `${videoId}:${cdnHostname}`, expires);
}

async function ensureAllowedReferrers(libraryId: string, apiKey: string | undefined, hostnames: Array<string | null>) {
  if (!isConfigured(apiKey)) return;
  const uniqueHosts = [...new Set(hostnames.filter((host): host is string => isConfigured(host)))] ;
  await Promise.all(uniqueHosts.map(async (host) => {
    const res = await fetch(`https://api.bunny.net/videolibrary/${libraryId}/addAllowedReferrer`, {
      method: "POST",
      headers: { AccessKey: apiKey!, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ Hostname: host }),
    }).catch(() => null);
    if (res && !res.ok) console.error(`Failed to add Bunny allowed referrer: ${host} (${res.status})`);
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LIBRARY_ID = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
    if (!isConfigured(LIBRARY_ID)) return json({ error: "Bunny Stream library is not configured" }, 500);
    const API_KEY = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
    await ensureAllowedReferrers(LIBRARY_ID!, API_KEY, [
      hostnameFromHeader(req.headers.get("origin")),
      hostnameFromHeader(req.headers.get("referer")),
      ...defaultAllowedReferrers,
    ]);

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
    const basePlayer = `https://iframe.mediadelivery.net/play/${LIBRARY_ID}/${videoId}`;
    let embedUrl = basePlayer;
    if (isConfigured(tokenAuthKey)) {
      const token = await signBunnyToken(tokenAuthKey!, videoId, expires);
      embedUrl = `${basePlayer}?token=${token}&expires=${expires}`;
    }
    const playerUrl = embedUrl.replace("iframe.mediadelivery.net/play/", "iframe.mediadelivery.net/embed/");

    if (!cdnHostname) {
      const embedResponse = await fetch(embedUrl).catch(() => null);
      const embedHtml = embedResponse?.ok ? await embedResponse.text() : "";
      cdnHostname = extractCdnHost(embedHtml, videoId);
    }

    if (!cdnHostname && isConfigured(API_KEY)) {
      const videoResponse = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${videoId}`, {
        headers: { AccessKey: API_KEY!, accept: "application/json" },
      }).catch(() => null);
      const videoJson = videoResponse?.ok ? await videoResponse.json().catch(() => null) : null;
      cdnHostname = videoJson ? extractCdnHost(JSON.stringify(videoJson), videoId) : null;
    }

    const rawPlaylistUrl = cdnHostname ? `https://${cdnHostname}/${videoId}/playlist.m3u8` : null;
    let playlistUrl: string | null = null;
    if (rawPlaylistUrl) {
      const playlistCandidates = isConfigured(cdnTokenAuthKey)
        ? [
            await signCdnDirectoryUrl(rawPlaylistUrl, cdnTokenAuthKey!, expires),
            await signCdnFileUrl(rawPlaylistUrl, cdnTokenAuthKey!, expires),
            await signBasicCdnFileUrl(rawPlaylistUrl, cdnTokenAuthKey!, expires),
          ]
        : [rawPlaylistUrl];
      for (const candidate of playlistCandidates) {
        const playlistCheck = await fetch(candidate, { headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null);
        if (playlistCheck?.ok) {
          playlistUrl = candidate;
          break;
        }
      }
    }
    const thumbnailUrl = cdnHostname ? `https://${cdnHostname}/${videoId}/thumbnail.jpg` : null;
    const proxyToken = playlistUrl && cdnHostname && isConfigured(cdnTokenAuthKey)
      ? await signProxyToken(cdnTokenAuthKey!, videoId, cdnHostname, expires)
      : null;
    const proxyPlaylistUrl = proxyToken
      ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/bunny-stream-proxy/${videoId}/playlist.m3u8?token=${proxyToken}&expires=${expires}&cdn=${encodeURIComponent(cdnHostname!)}`
      : null;

    // Use Bunny's official iframe embed host. The player.mediadelivery.net alias
    // can return 403 for allowed-referrer protected libraries on preview domains.
    const playUrl = playerUrl;

    return json({
      videoId,
      cdnHostname,
      playUrl,
      embedUrl: playerUrl,
      playlistUrl,
      proxyPlaylistUrl,
      thumbnailUrl,
      signed: isConfigured(tokenAuthKey) || isConfigured(cdnTokenAuthKey),
      hlsSigned: Boolean(rawPlaylistUrl && isConfigured(cdnTokenAuthKey)),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
