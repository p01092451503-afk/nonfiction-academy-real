import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PLACEHOLDER_PATTERN = /placeholder_value_to_be_replaced/i;
const FALLBACK_BUCKET = "course-thumbnails";
const BUNNY_STORAGE_HOSTS = [
  "storage.bunnycdn.com",
  "ny.storage.bunnycdn.com",
  "la.storage.bunnycdn.com",
  "sg.storage.bunnycdn.com",
  "syd.storage.bunnycdn.com",
  "uk.storage.bunnycdn.com",
  "se.storage.bunnycdn.com",
  "br.storage.bunnycdn.com",
  "jh.storage.bunnycdn.com",
];

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
    const form = await req.formData();
    const file = form.get("file");
    const folder = (form.get("folder") as string | null) || "media";
    if (!(file instanceof File)) {
      return json({ error: "file required" }, 400);
    }

    const STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE")?.trim();
    const STORAGE_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY")?.trim();
    const configuredStorageHost = isConfigured(Deno.env.get("BUNNY_STORAGE_HOSTNAME"))
      ? cleanHost(Deno.env.get("BUNNY_STORAGE_HOSTNAME")!)
      : "storage.bunnycdn.com";
    const CDN_HOST = isConfigured(Deno.env.get("BUNNY_STORAGE_CDN_HOSTNAME"))
      ? cleanHost(Deno.env.get("BUNNY_STORAGE_CDN_HOSTNAME")!)
      : null;

    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const safeName = `${crypto.randomUUID()}.${ext}`;
    const path = `${folder}/${safeName}`;
    const buf = await file.arrayBuffer();

    if (!isConfigured(STORAGE_ZONE) || !isConfigured(STORAGE_KEY) || !isConfigured(CDN_HOST)) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) return json({ error: "Storage env not configured" }, 500);

      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { error: uploadError } = await supabase.storage
        .from(FALLBACK_BUCKET)
        .upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });

      if (uploadError) return json({ error: uploadError.message }, 500);

      const { data } = supabase.storage.from(FALLBACK_BUCKET).getPublicUrl(path);
      return json({ url: data.publicUrl, path, size: buf.byteLength, contentType: file.type, provider: "lovable_storage" });
    }

    const candidateHosts = [
      configuredStorageHost,
      ...BUNNY_STORAGE_HOSTS.filter((host) => host !== configuredStorageHost),
    ];
    let lastFailure: { host: string; status: number; details: string } | null = null;

    for (const host of candidateHosts) {
      const url = `https://${host}/${STORAGE_ZONE}/${path}`;
      const put = await fetch(url, {
        method: "PUT",
        headers: {
          AccessKey: STORAGE_KEY,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: buf,
      });

      if (put.ok) {
        const cdnUrl = `https://${CDN_HOST}/${path}`;
        return json({ url: cdnUrl, path, size: buf.byteLength, contentType: file.type, provider: "bunny", storageHost: host });
      }

      const text = await put.text().catch(() => "");
      lastFailure = { host, status: put.status, details: text };

      if (put.status !== 401) break;
    }

    return json({
      error: "Bunny storage upload failed",
      status: lastFailure?.status,
      details: lastFailure?.details,
      message:
        "Bunny Storage 인증에 실패했습니다. Storage Zone의 Access 탭에 있는 Read/Write Password를 BUNNY_STORAGE_API_KEY로 다시 저장해 주세요.",
    }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});