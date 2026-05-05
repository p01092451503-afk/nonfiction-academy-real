import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") || "30");

    const STREAM_LIB = Deno.env.get("BUNNY_STREAM_LIBRARY_ID");
    const STREAM_KEY = Deno.env.get("BUNNY_STREAM_API_KEY");

    // ---------- Bunny Stream library info (real storage + traffic) ----------
    let streamLib: any = null;
    let streamStats: any = null;
    if (STREAM_LIB && STREAM_KEY) {
      const headers = { AccessKey: STREAM_KEY, accept: "application/json" };
      const [libRes, statsRes] = await Promise.all([
        fetch(`https://video.bunnycdn.com/library/${STREAM_LIB}`, { headers }).catch(() => null),
        (() => {
          const to = new Date();
          const from = new Date(to.getTime() - days * 86400_000);
          const fmt = (d: Date) => d.toISOString().slice(0, 10);
          return fetch(
            `https://video.bunnycdn.com/library/${STREAM_LIB}/statistics?dateFrom=${fmt(from)}&dateTo=${fmt(to)}`,
            { headers },
          ).catch(() => null);
        })(),
      ]);
      if (libRes?.ok) streamLib = await libRes.json().catch(() => null);
      if (statsRes?.ok) streamStats = await statsRes.json().catch(() => null);
    }

    // ---------- Supabase Storage real usage ----------
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Query storage.objects via service role
    let bucketUsage: Array<{ bucket: string; bytes: number; count: number }> = [];
    try {
      const { data } = await supabase.schema("storage").from("objects").select("bucket_id, metadata").limit(10000);
      if (Array.isArray(data)) {
        const map = new Map<string, { bytes: number; count: number }>();
        for (const o of data as any[]) {
          const b = o.bucket_id;
          const sz = Number(o.metadata?.size || 0);
          const cur = map.get(b) || { bytes: 0, count: 0 };
          cur.bytes += sz;
          cur.count += 1;
          map.set(b, cur);
        }
        bucketUsage = Array.from(map.entries()).map(([bucket, v]) => ({ bucket, ...v }));
      }
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({
        bunnyStream: streamLib
          ? {
              storageBytes: Number(streamLib.StorageUsage || 0),
              trafficBytes: Number(streamLib.TrafficUsage || 0),
              videoCount: Number(streamLib.VideoCount || 0),
            }
          : null,
        bunnyStreamRange: streamStats
          ? {
              viewsTotal: Number(streamStats.ViewsChart ? Object.values(streamStats.ViewsChart).reduce((a: number, b: any) => a + Number(b), 0) : 0),
              watchTimeTotalMin: Number(streamStats.WatchTimeChart ? Object.values(streamStats.WatchTimeChart).reduce((a: number, b: any) => a + Number(b), 0) : 0),
              days,
            }
          : null,
        supabaseStorage: {
          buckets: bucketUsage,
          totalBytes: bucketUsage.reduce((s, b) => s + b.bytes, 0),
          totalObjects: bucketUsage.reduce((s, b) => s + b.count, 0),
        },
        fetchedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
