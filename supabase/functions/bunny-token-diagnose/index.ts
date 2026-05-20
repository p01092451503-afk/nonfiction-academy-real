import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const VIDEO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanHost = (value: string) => value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

async function digestBase64Url(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(buf)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\n/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function test(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null);
  if (!res) return { status: 0 };
  await res.text().catch(() => "");
  return { status: res.status, contentType: res.headers.get("content-type") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const videoId = String(body.videoId || "");
  const cdn = cleanHost(String(body.cdn || Deno.env.get("BUNNY_STREAM_CDN_HOSTNAME") || ""));
  const keyNames = ["BUNNY_STREAM_CDN_TOKEN_AUTH_KEY", "BUNNY_STREAM_TOKEN_AUTH_KEY", "BUNNY_STORAGE_API_KEY"];
  if (!VIDEO_ID_PATTERN.test(videoId) || !cdn) return new Response(JSON.stringify({ error: "bad input" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const path = `/${videoId}/playlist.m3u8`;
  const dir = `/${videoId}/`;
  const expires = Math.floor(Date.now() / 1000) + 600;
  const out: Record<string, unknown> = {};
  for (const keyName of keyNames) {
    const key = Deno.env.get(keyName)?.trim();
    if (!key) continue;
    const shaFile = await digestBase64Url(key + path + String(expires));
    const shaDir = await digestBase64Url(key + dir + String(expires) + `token_path=${dir}`);
    out[keyName] = {
      shaFile: await test(`https://${cdn}${path}?token=${shaFile}&expires=${expires}`),
      shaDirPath: await test(`https://${cdn}/bcdn_token=${shaDir}&token_path=${encodeURIComponent(dir)}&expires=${expires}${path}`),
      shaDirQuery: await test(`https://${cdn}${path}?token=${shaDir}&token_path=${encodeURIComponent(dir)}&expires=${expires}`),
    };
  }
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
