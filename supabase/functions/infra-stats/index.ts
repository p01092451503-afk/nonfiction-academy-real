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
    let streamError: string | null = null;
    if (STREAM_LIB && STREAM_KEY) {
      const headers = { AccessKey: STREAM_KEY, accept: "application/json" };
      try {
        const libRes = await fetch(`https://video.bunnycdn.com/library/${STREAM_LIB}`, { headers });
        if (libRes.ok) streamLib = await libRes.json();
        else streamError = `lib ${libRes.status}`;
      } catch (e) { streamError = String(e?.message || e); }
      try {
        const to = new Date();
        const from = new Date(to.getTime() - days * 86400_000);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const sRes = await fetch(
          `https://video.bunnycdn.com/library/${STREAM_LIB}/statistics?dateFrom=${fmt(from)}&dateTo=${fmt(to)}`,
          { headers },
        );
        if (sRes.ok) streamStats = await sRes.json();
      } catch (_) { /* ignore */ }
    } else {
      streamError = "missing env";
    }

    // ---------- Supabase Storage real usage ----------
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Iterate Supabase storage buckets via Storage API
    let bucketUsage: Array<{ bucket: string; bytes: number; count: number }> = [];
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (Array.isArray(buckets)) {
        for (const b of buckets) {
          let bytes = 0, count = 0;
          const walk = async (prefix: string) => {
            const { data: items } = await supabase.storage.from(b.id).list(prefix, { limit: 1000 });
            if (!items) return;
            for (const it of items) {
              if (it.id) {
                count += 1;
                bytes += Number((it.metadata as any)?.size || 0);
              } else {
                await walk(prefix ? `${prefix}/${it.name}` : it.name);
              }
            }
          };
          await walk("");
          bucketUsage.push({ bucket: b.id, bytes, count });
        }
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
        bunnyStreamError: streamError,
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
