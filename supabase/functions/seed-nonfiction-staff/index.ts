// One-off seed: creates all Nonfiction staff (~83 rows).
// SECURITY: PUBLIC, idempotent. Disable/delete after running.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Row = { email: string; full_name: string; role1: string; role2?: string; department_code: string; region: string };

const PASSWORD = "nonfiction1";

// 83 rows from staff_upload_template_nonfiction.xlsx
const ROWS: Row[] = [
  { email: "chanki.jeon@nonfiction.com", full_name: "전찬기", role1: "student", department_code: "SW", region: "KR" },
  { email: "dahwon.kim@nonfiction.com", full_name: "김다훤", role1: "student", role2: "Learning Leader", department_code: "SS", region: "KR" },
  { email: "gaeul.kim@nonfiction.com", full_name: "김가을", role1: "student", department_code: "SN", region: "KR" },
  { email: "jaeho.shin@nonfiction.com", full_name: "신재호", role1: "student", role2: "Learning Leader", department_code: "LTWM", region: "KR" },
  { email: "jeonghee.lee@nonfiction.com", full_name: "이정희", role1: "student", department_code: "SN", region: "KR" },
  { email: "jiheon.kim@nonfiction.com", full_name: "김지헌", role1: "student", role2: "Learning Leader", department_code: "LTWM", region: "KR" },
  { email: "jiwon.choi@nonfiction.com", full_name: "최지원", role1: "student", department_code: "HN", region: "KR" },
  { email: "jonghyeok.park@nonfiction.com", full_name: "박종혁", role1: "student", department_code: "SN", region: "KR" },
  { email: "soyeong.park@nonfiction.com", full_name: "박소영", role1: "student", role2: "Learning Leader", department_code: "SN", region: "KR" },
  { email: "yeji.kim@nonfiction.com", full_name: "김예지", role1: "student", department_code: "SW", region: "KR" },
  { email: "yena970723@gmail.com", full_name: "송예나", role1: "student", department_code: "SC", region: "KR" },
  { email: "haechan.han@nonfiction.com", full_name: "한해찬", role1: "student", department_code: "SS", region: "KR" },
  { email: "heeyeon.lee@nonfiction.com", full_name: "이희연", role1: "student", department_code: "SS", region: "KR" },
  { email: "kyeongyeon.kim@nonfiction.com", full_name: "김경연", role1: "student", department_code: "SS", region: "KR" },
  { email: "chaerin.lee@nonfiction.com", full_name: "이채린", role1: "student", role2: "Learning Leader", department_code: "SC", region: "KR" },
  { email: "jihyeon.yeon@nonfiction.com", full_name: "연지현", role1: "student", department_code: "SC", region: "KR" },
  { email: "jina.lim@nonfiction.com", full_name: "임진아", role1: "student", department_code: "SC", region: "KR" },
  { email: "juyeon.kim@nonfiction.com", full_name: "김주연", role1: "student", role2: "Learning Leader", department_code: "CT", region: "KR" },
  { email: "yeji.park@nonfiction.com", full_name: "박예지", role1: "student", department_code: "CT", region: "KR" },
  { email: "hwee.namkung@nonfiction.com", full_name: "남궁휘", role1: "student", department_code: "SS", region: "KR" },
  { email: "juhee.yoo@nonfiction.com", full_name: "유주희", role1: "student", department_code: "HN", region: "KR" },
  { email: "lan.cui@nonfiction.com", full_name: "CUILAN", role1: "student", department_code: "LTDF", region: "KR" },
  { email: "mihyang.kim@nonfiction.com", full_name: "김미향", role1: "student", role2: "Learning Leader", department_code: "LTDF", region: "KR" },
  { email: "miyeon.yim@nonfiction.com", full_name: "임미연", role1: "student", department_code: "LTDF", region: "KR" },
  { email: "jiyeaon.nam@nonfiction.com", full_name: "남지연", role1: "student", role2: "Learning Leader", department_code: "ICN T1", region: "KR" },
  { email: "seunghyeon.lee@nonfiction.com", full_name: "이승현", role1: "student", role2: "Learning Leader", department_code: "ICN T2", region: "KR" },
  { email: "suryeon.heo@nonfiction.com", full_name: "허수련", role1: "student", department_code: "ICN T1", region: "KR" },
  { email: "youkyung.kim@nonfiction.com", full_name: "김유경", role1: "student", department_code: "ICN T1", region: "KR" },
  { email: "eunji.lee@nonfiction.com", full_name: "이은지", role1: "student", department_code: "ICN T2", region: "KR" },
  { email: "minhee.yu@nonfiction.com", full_name: "유민희", role1: "student", department_code: "ICN T2", region: "KR" },
  { email: "xumei.yu@nonfiction.com", full_name: "유설매", role1: "student", department_code: "ICN T2", region: "KR" },
  { email: "yerin.woo@nonfiction.com", full_name: "우예린", role1: "student", department_code: "ICN T1", region: "KR" },
  { email: "hyewon.kang@nonfiction.com", full_name: "강혜원", role1: "student", department_code: "JJ", region: "KR" },
  { email: "jihee.hyun@nonfiction.com", full_name: "현지희", role1: "student", role2: "Learning Leader", department_code: "JJ", region: "KR" },
  { email: "jihyun.jeong@nonfiction.com", full_name: "정지현", role1: "student", department_code: "JJ", region: "KR" },
  { email: "juchan.kang@nonfiction.com", full_name: "강주찬", role1: "student", department_code: "HN", region: "KR" },
  { email: "yunju.jeong@nonfiction.com", full_name: "정윤주", role1: "student", department_code: "SS", region: "KR" },
  { email: "ama.ho@nonfiction.com", full_name: "Ama Ho", role1: "student", department_code: "HW", region: "HK" },
  { email: "chiho.wakai@nonfiction.com", full_name: "Chiho Yamashita", role1: "student", department_code: "DK", region: "JP" },
  { email: "hui_eunice@yahoo.com", full_name: "Eunice Hui", role1: "student", role2: "Learning Leader", department_code: "HW", region: "HK" },
  { email: "kimmysit@yahoo.com.hk", full_name: "Kimmy Sit", role1: "student", department_code: "HW", region: "HK" },
  { email: "kurumi.takahashi@nonfiction.com", full_name: "Kurumi Takahashi", role1: "student", department_code: "DK", region: "JP" },
  { email: "misuzu.mogi@nonfiction.com", full_name: "Mogi Misuzu", role1: "student", department_code: "OFC", region: "JP" },
  { email: "moe.yokota@nonfiction.com", full_name: "Moe Yokota", role1: "student", department_code: "DK", region: "JP" },
  { email: "urara.taguchi@nonfiction.com", full_name: "Urara Taguchi", role1: "student", role2: "Learning Leader", department_code: "DK", region: "JP" },
  { email: "rin.iwasawa@nonfiction.com", full_name: "Rin Iwasawa", role1: "student", department_code: "HK", region: "JP" },
  { email: "kanako.tsukai@nonfiction.com", full_name: "Kanako Tsukai", role1: "student", department_code: "HK", region: "JP" },
  { email: "nanami.kidosaki@nonfiction.com", full_name: "Nanami Kidosaki", role1: "student", role2: "Learning Leader", department_code: "HK", region: "JP" },
  { email: "karin.fukuda@nonfiction.com", full_name: "Karin Fukuda", role1: "student", department_code: "DK", region: "JP" },
  { email: "minji.kim@nonfiction.com", full_name: "김민지", role1: "student", department_code: "ICN T1", region: "KR" },
  { email: "heejeong.seo@nonfiction.com", full_name: "서희정", role1: "student", department_code: "CT", region: "KR" },
  { email: "ayako.horiguchi@nonfiction.com", full_name: "Ayako Horiguchi", role1: "student", department_code: "HK", region: "JP" },
  { email: "chaeyeon.park@nonfiction.com", full_name: "박채연", role1: "student", department_code: "LTWM", region: "KR" },
  { email: "chiaki.kuroda@nonfiction.com", full_name: "Chiaki Kuroda", role1: "student", department_code: "KB", region: "JP" },
  { email: "miyu.suzuki@nonfiction.com", full_name: "Miyu Suzuki", role1: "student", department_code: "DK", region: "JP" },
  { email: "takeo.yamamoto@nonfiction.com", full_name: "Takeo Yamamoto", role1: "student", department_code: "KB", region: "JP" },
  { email: "sojung.park@nonfiction.com", full_name: "박소정", role1: "student", department_code: "HN", region: "KR" },
  { email: "seungbyi2.kim@nonfiction.com", full_name: "김승비", role1: "student", department_code: "SC", region: "KR" },
  { email: "chiyun.lu@nonfiction.com", full_name: "여기운", role1: "student", department_code: "LTDF", region: "KR" },
  { email: "ryanghee.kim@nonfiction.com", full_name: "김량희", role1: "student", role2: "Learning Leader", department_code: "SW", region: "KR" },
  { email: "kakuko.kiyota@nonfiction.com", full_name: "Kakuko Kiyota", role1: "student", department_code: "KB", region: "JP" },
  { email: "kana.sawada@nonfiction.com", full_name: "Kana Sawada", role1: "student", department_code: "DK", region: "JP" },
  { email: "rui.nakashima@nonfiction.com", full_name: "Rui Nakashima", role1: "student", department_code: "DK", region: "JP" },
  { email: "saki.horiguchi@nonfiction.com", full_name: "Saki Horiguchi", role1: "student", role2: "Learning Leader", department_code: "KB", region: "JP" },
  { email: "gaeun.kim@nonfiction.com", full_name: "김가은", role1: "student", department_code: "SS", region: "KR" },
  { email: "gijun.nam@nonfiction.com", full_name: "남기준", role1: "student", department_code: "HN", region: "KR" },
  { email: "yaeri.kang@nonfiction.com", full_name: "강예리", role1: "student", department_code: "JJ", region: "KR" },
  { email: "cx@nonfiction.com", full_name: "CXTeam", role1: "student", department_code: "OFC-KR", region: "KR" },
  { email: "nayeon.kim@nonfiction.com", full_name: "김나연", role1: "student", department_code: "SN", region: "KR" },
  { email: "akane.ogino@nonfiction.com", full_name: "Akane Ogino", role1: "student", department_code: "KB", region: "JP" },
  { email: "rion.sakaguchi@nonfiction.com", full_name: "Rion Sakaguchi", role1: "student", department_code: "DK", region: "JP" },
  { email: "charles.harley@nonfiction.com", full_name: "Charles Harley", role1: "student", department_code: "NY", region: "US" },
  { email: "hollywoodroadhk@nonfiction.com", full_name: "HK Store", role1: "student", department_code: "HW", region: "HK" },
  { email: "mason.reed@nonfiction.com", full_name: "Mason Reed", role1: "student", department_code: "NY", region: "US" },
  { email: "matteo.diaz-miranda@nonfiction.com", full_name: "Matteo Diaz-Miranda", role1: "student", department_code: "NY", region: "US" },
  { email: "zachary.ceniceros@nonfiction.com", full_name: "Zachary Ceniceros", role1: "student", department_code: "NY", region: "US" },
  { email: "chenghuan.an@nonfiction.com", full_name: "안성환", role1: "student", department_code: "LTDF", region: "KR" },
  { email: "somi.kang@nonfiction.com", full_name: "강소미", role1: "student", department_code: "CT", region: "KR" },
  { email: "sunggon.lee@nonfiction.com", full_name: "이성곤", role1: "student", department_code: "HN", region: "KR" },
  { email: "mi.her@nonfiction.com", full_name: "허미", role1: "student", department_code: "HN", region: "KR" },
  { email: "yeongseong.lee@nonfiction.com", full_name: "이영성", role1: "student", department_code: "SW", region: "KR" },
  { email: "mina.jeong@nonfiction.com", full_name: "정미나", role1: "student", department_code: "LTWM", region: "KR" },
  { email: "kanako.otani@nonfiction.com", full_name: "Kanako Otani", role1: "student", department_code: "KB", region: "JP" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Build dept lookup (code|country -> id, code -> id when unique)
    const { data: depts } = await admin.from("departments").select("id, code, country");
    const byCodeCountry = new Map<string, string>();
    const byCode = new Map<string, string[]>();
    for (const d of depts || []) {
      const code = (d.code || "").trim().toLowerCase();
      const country = ((d as any).country || "").trim().toUpperCase();
      if (!code) continue;
      if (country) byCodeCountry.set(`${code}|${country}`, d.id);
      const arr = byCode.get(code) || [];
      arr.push(d.id);
      byCode.set(code, arr);
    }

    const results: Array<{ email: string; status: string; message?: string }> = [];

    for (const r of ROWS) {
      const email = r.email.trim().toLowerCase();
      const code = r.department_code.trim().toLowerCase();
      const country = r.region.trim().toUpperCase();
      let departmentId = byCodeCountry.get(`${code}|${country}`) || null;
      if (!departmentId) {
        const arr = byCode.get(code);
        if (arr && arr.length === 1) departmentId = arr[0];
      }
      if (!departmentId) {
        results.push({ email, status: "error", message: `dept not found: ${r.department_code}/${country}` });
        continue;
      }

      const roles = new Set<string>([r.role1]);
      if (r.role2 && /learning/i.test(r.role2)) roles.add("teacher");

      try {
        let uid: string | undefined;
        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: r.full_name, department_id: departmentId },
        });
        if (created?.user) {
          uid = created.user.id;
        } else if (error) {
          const msg = error.message || "";
          if (/already|registered/i.test(msg)) {
            const url = `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
            const resp = await fetch(url, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
            const body = await resp.json();
            const users = body.users ?? (Array.isArray(body) ? body : []);
            const found = users.find((u: any) => u.email?.toLowerCase() === email);
            if (!found) {
              results.push({ email, status: "error", message: msg });
              continue;
            }
            uid = found.id;
            await admin.auth.admin.updateUserById(uid!, { password: PASSWORD, email_confirm: true });
          } else {
            results.push({ email, status: "error", message: msg });
            continue;
          }
        }

        if (uid) {
          await admin.from("user_roles").delete().eq("user_id", uid);
          await admin.from("user_roles").insert(Array.from(roles).map((role) => ({ user_id: uid, role })));
          await admin.from("profiles").upsert(
            { user_id: uid, full_name: r.full_name, department_id: departmentId, email },
            { onConflict: "user_id" },
          );
          results.push({ email, status: created?.user ? "created" : "updated" });
        }
      } catch (e: any) {
        results.push({ email, status: "error", message: String(e?.message || e) });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      errors: results.filter((r) => r.status === "error").length,
    };
    return new Response(JSON.stringify({ summary, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
