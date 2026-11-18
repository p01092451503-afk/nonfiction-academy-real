// 외부 업체 직원 KPI 수신. 업체 API 키(해시 비교)로만 인증하며 저장은 서비스 전용 RPC가 원자적으로 처리한다.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const MAX_RECORDS = 1000;
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => reply(status, { error: { code, message } });
async function sha256Hex(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'POST 요청만 받습니다.');
  const base = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !service) return fail(500, 'SERVER_ERROR', '서버 설정을 확인하십시오.');
  const key = (req.headers.get('x-api-key') ?? '').trim();
  if (!/^nfk_(live|test)_[0-9a-f]{64}$/.test(key)) return fail(401, 'INVALID_API_KEY', 'API 키가 없거나 올바르지 않습니다.');
  if (Number(req.headers.get('content-length') ?? 0) > 2_000_000) return fail(413, 'PAYLOAD_TOO_LARGE', '요청 크기는 2MB 이하로 보내 주십시오.');
  let body: unknown;
  try { body = await req.json(); } catch { return fail(400, 'INVALID_JSON', 'JSON 형식이 올바르지 않습니다.'); }
  const records = (body as { records?: unknown })?.records;
  if (!Array.isArray(records) || records.length === 0) return fail(400, 'RECORDS_REQUIRED', 'records 배열에 1건 이상 넣어 주십시오.');
  if (records.length > MAX_RECORDS) return fail(400, 'TOO_MANY_RECORDS', `한 번에 ${MAX_RECORDS}건까지 보낼 수 있습니다.`);
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const r = await fetch(base + '/rest/v1/rpc/mygrowth_kpi_ingest', { method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' }, body: JSON.stringify({ _key_hash: await sha256Hex(key), _client_ip: ip, _records: records }) });
  if (!r.ok) return fail(500, 'SERVER_ERROR', '저장 중 문제가 생겼습니다. 같은 내용으로 다시 보내도 중복되지 않습니다.');
  const result = await r.json();
  if (result?.error === 'INVALID_API_KEY') return fail(401, 'INVALID_API_KEY', 'API 키가 없거나 폐기되었습니다.');
  if (result?.error === 'IP_NOT_ALLOWED') return fail(403, 'IP_NOT_ALLOWED', '허용되지 않은 IP 주소입니다.');
  return reply(result.failed > 0 ? 207 : 200, result);
});
