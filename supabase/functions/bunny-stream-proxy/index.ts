import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PLACEHOLDER_PATTERN = /placeholder_value_to_be_replaced/i;
const VIDEO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isConfigured = (value: string | null | undefined) => Boolean(value?.trim() && !PLACEHOLDER_PATTERN.test(value));
const cleanHost = (value: string) => value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
const SAFE_PATH_PATTERN = /^[0-9a-f-]+\/(?:playlist\.m3u8|\d+p\/video\.m3u8|audio\/audio\.m3u8|\d+p\/video\d+\.ts|\d+p\/audio\d+\.ts|\d+p\/segment-\d+\.ts|\d+p\/seg-\d+\.ts|audio\/audio\d+\.ts|preview\.webp|thumbnail\.jpg)$/i;

async function sha256Base64Url(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(buf)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\n/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function signBunnyToken(authKey: string, value: string, expires: number) {
  const data = new TextEncoder().encode(authKey + value + String(expires));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signCdnFileUrl(url: string, authKey: string, expires: number) {
  const parsed = new URL(url);
  const token = await sha256Base64Url(authKey + parsed.pathname + String(expires));
  return `${parsed.origin}${parsed.pathname}?token=${token}&expires=${expires}`;
}

const withCors = (headers: HeadersInit = {}) => ({ ...corsHeaders, ...headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authKey = (Deno.env.get("BUNNY_STREAM_CDN_TOKEN_AUTH_KEY") || Deno.env.get("BUNNY_STREAM_TOKEN_AUTH_KEY"))?.trim();
    if (!isConfigured(authKey)) return new Response("Not configured", { status: 500, headers: corsHeaders });

    const url = new URL(req.url);
    const parts = url.pathname.split("/bunny-stream-proxy/")[1]?.split("/").filter(Boolean) || [];
    const videoId = parts.shift() || "";
    const assetPath = parts.join("/") || "playlist.m3u8";
    const cdnHostname = cleanHost(url.searchParams.get("cdn") || Deno.env.get("BUNNY_STREAM_CDN_HOSTNAME") || "");
    const expires = Number(url.searchParams.get("expires") || 0);
    const token = url.searchParams.get("token") || "";

    if (!VIDEO_ID_PATTERN.test(videoId) || !isConfigured(cdnHostname) || !Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
    const expected = await signBunnyToken(authKey!, `${videoId}:${cdnHostname}`, expires);
    if (token !== expected) return new Response("Forbidden", { status: 403, headers: corsHeaders });

    const relativePath = `${videoId}/${assetPath}`;
    if (!SAFE_PATH_PATTERN.test(relativePath)) return new Response("Forbidden", { status: 403, headers: corsHeaders });

    const upstreamUrl = await signCdnFileUrl(`https://${cdnHostname}/${relativePath}`, authKey!, Math.min(expires, Math.floor(Date.now() / 1000) + 60 * 10));
    const upstream = await fetch(upstreamUrl, { headers: { "User-Agent": req.headers.get("User-Agent") || "Mozilla/5.0" } });
    if (!upstream.ok) return new Response(await upstream.text().catch(() => "Forbidden"), { status: upstream.status, headers: corsHeaders });

    const contentType = upstream.headers.get("Content-Type") || (assetPath.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t");
    if (!assetPath.endsWith(".m3u8")) {
      return new Response(upstream.body, {
        status: 200,
        headers: withCors({ "Content-Type": contentType, "Cache-Control": "private, max-age=300" }),
      });
    }

    const playlist = await upstream.text();
    const basePath = assetPath.includes("/") ? assetPath.slice(0, assetPath.lastIndexOf("/") + 1) : "";
    const rewritten = playlist.split("\n").map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || /^https?:\/\//i.test(trimmed)) return line;
      const proxiedAsset = `${basePath}${trimmed}`.replace(/^\/+/, "");
      return `/functions/v1/bunny-stream-proxy/${videoId}/${proxiedAsset}?token=${encodeURIComponent(token)}&expires=${expires}&cdn=${encodeURIComponent(cdnHostname)}`;
    }).join("\n");

    return new Response(rewritten, {
      status: 200,
      headers: withCors({ "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, max-age=60" }),
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "unknown", { status: 500, headers: corsHeaders });
  }
});
