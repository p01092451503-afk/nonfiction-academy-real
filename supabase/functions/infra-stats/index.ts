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
      // Aggregate real storage by listing videos
      try {
        let page = 1;
        let totalStorage = 0;
        let totalCount = 0;
        let totalLength = 0;
        for (;;) {
          const r = await fetch(
            `https://video.bunnycdn.com/library/${STREAM_LIB}/videos?page=${page}&itemsPerPage=100`,
            { headers },
          );
          if (!r.ok) { streamError = `videos ${r.status}`; break; }
          const j = await r.json();
          const items = j.items || [];
          totalCount = j.totalItems ?? totalCount;
          for (const v of items) {
            totalStorage += Number(v.storageSize || 0);
            totalLength += Number(v.length || 0);
          }
          if (items.length < 100) break;
          if (++page > 50) break;
        }
        streamLib = { storageBytes: totalStorage, videoCount: totalCount, totalLengthSec: totalLength };
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

    // ---------- Bunny Storage zone (b-cdn.net assets) ----------
    let bunnyStorage: any = null;
    const STORAGE_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY");
    const STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE");
    const STORAGE_HOST = Deno.env.get("BUNNY_STORAGE_HOSTNAME") || "storage.bunnycdn.com";
    if (STORAGE_KEY && STORAGE_ZONE) {
      try {
        const walk = async (path: string): Promise<{ bytes: number; count: number }> => {
          const r = await fetch(`https://${STORAGE_HOST}/${STORAGE_ZONE}/${path}`, {
            headers: { AccessKey: STORAGE_KEY, accept: "application/json" },
          });
          if (!r.ok) return { bytes: 0, count: 0 };
          const items = await r.json();
          let bytes = 0, count = 0;
          for (const it of items) {
            if (it.IsDirectory) {
              const sub = await walk(`${path}${it.ObjectName}/`);
              bytes += sub.bytes; count += sub.count;
            } else {
              bytes += Number(it.Length || 0); count += 1;
            }
          }
          return { bytes, count };
        };
        bunnyStorage = { ...(await walk("")), zone: STORAGE_ZONE };
      } catch (e) {
        bunnyStorage = { error: String(e?.message || e) };
      }
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
              storageBytes: Number(streamLib.storageBytes || 0),
              videoCount: Number(streamLib.videoCount || 0),
              totalLengthSec: Number(streamLib.totalLengthSec || 0),
            }
          : null,
        bunnyStreamError: streamError,
        bunnyStorage,
        bunnyStreamRange: streamStats
          ? {
              viewsTotal: streamStats.ViewsChart ? Object.values(streamStats.ViewsChart).reduce((a: number, b: any) => a + Number(b), 0) : 0,
              watchTimeTotalMin: streamStats.WatchTimeChart ? Object.values(streamStats.WatchTimeChart).reduce((a: number, b: any) => a + Number(b), 0) : 0,
              trafficBytes: streamStats.TrafficUsageChart ? Object.values(streamStats.TrafficUsageChart).reduce((a: number, b: any) => a + Number(b), 0) : 0,
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
