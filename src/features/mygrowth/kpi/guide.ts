// 외부 업체 전달용 KPI 연동 규격. 화면·PDF·테스트가 같은 값을 쓴다.
export const KPI_ENDPOINT_PATH = '/functions/v1/mygrowth-kpi-ingest';
export const kpiEndpoint = (base: string) => base.replace(/\/$/, '') + KPI_ENDPOINT_PATH;
export const MAX_RECORDS_PER_REQUEST = 1000;
export const KPI_ERROR_CODES: { code: string; status: string; meaning: string; action: string }[] = [
  { code: 'INVALID_API_KEY', status: '401', meaning: 'API 키가 없거나, 형식이 틀리거나, 폐기된 키입니다.', action: '발급받은 키를 x-api-key 헤더에 그대로 넣었는지 확인합니다.' },
  { code: 'IP_NOT_ALLOWED', status: '403', meaning: '허용 목록에 없는 IP에서 보냈습니다.', action: '보내는 서버의 고정 IP를 논픽션에 알려 등록합니다.' },
  { code: 'INVALID_JSON', status: '400', meaning: '본문이 JSON 형식이 아닙니다.', action: 'Content-Type과 JSON 문법을 확인합니다.' },
  { code: 'RECORDS_REQUIRED', status: '400', meaning: 'records 배열이 비어 있습니다.', action: '1건 이상 넣어 보냅니다.' },
  { code: 'TOO_MANY_RECORDS', status: '400', meaning: `한 번에 ${MAX_RECORDS_PER_REQUEST}건을 넘었습니다.`, action: '나눠서 보냅니다.' },
  { code: 'PAYLOAD_TOO_LARGE', status: '413', meaning: '요청이 2MB를 넘었습니다.', action: '나눠서 보냅니다.' },
  { code: 'SERVER_ERROR', status: '500', meaning: '일시적인 서버 문제입니다.', action: '잠시 뒤 같은 내용으로 다시 보냅니다. 중복 저장되지 않습니다.' },
];
export const KPI_ROW_ERRORS: { code: string; meaning: string }[] = [
  { code: 'INVALID_RECORD', meaning: '행이 객체 형식이 아닙니다.' },
  { code: 'EMPLOYEE_REQUIRED', meaning: 'employee_id(사번)와 email이 모두 비어 있습니다.' },
  { code: 'BRANCH_NOT_FOUND', meaning: 'branch_code에 해당하는 지점이 없습니다.' },
  { code: 'EMPLOYEE_NOT_FOUND', meaning: '해당 지점에 그 사번·이메일의 재직 직원이 없습니다.' },
  { code: 'INVALID_PERIOD', meaning: 'period가 YYYY-MM 형식이 아닙니다.' },
  { code: 'METRIC_NOT_FOUND', meaning: '등록되지 않았거나 사용 중지된 지표 코드입니다.' },
  { code: 'INVALID_VALUE', meaning: 'value가 숫자가 아닙니다(문자열 "2"도 오류).' },
  { code: 'UNIT_MISMATCH', meaning: 'unit이 지표에 정해진 단위와 다릅니다.' },
];
export const MEETING_ITEMS: { topic: string; question: string; proposal: string }[] = [
  { topic: '직원 식별 기준', question: '업체 시스템에 사번이 있습니까, 이메일만 있습니까?', proposal: '사번(employee_id)을 기본으로, 없으면 회사 이메일을 씁니다.' },
  { topic: '지점 식별', question: '업체가 쓰는 매장 코드와 논픽션 지점 코드를 어떻게 맞춥니까?', proposal: '논픽션이 지점 코드표를 드리고 업체가 그 코드로 보냅니다.' },
  { topic: '지표 목록', question: '어떤 성과를 보낼 수 있습니까? (매출, 판매 건수, 객단가 등)', proposal: '지표 코드·이름·단위를 이 회의에서 확정해 등록합니다.' },
  { topic: '집계 단위', question: '월 단위 확정값입니까, 일 단위 값을 월로 합칩니까?', proposal: '직원별 월 확정값 1건을 보냅니다.' },
  { topic: '전송 주기', question: '언제, 얼마나 자주 보낼 수 있습니까?', proposal: '매일 새벽 1회 당월 누계, 매월 5일까지 전월 확정값을 보냅니다.' },
  { topic: '연동 방식', question: '업체가 보내는 방식(푸시)과 논픽션이 가져오는 방식(풀) 중 무엇이 가능합니까?', proposal: '우선 업체가 보내는 방식을 권장합니다. 가져오는 방식은 업체 API 규격과 인증 정보가 필요합니다.' },
  { topic: '보안·IP 제한', question: '보내는 서버의 고정 IP가 있습니까? 키 보관과 교체는 누가 합니까?', proposal: '고정 IP 허용 목록 + 업체별 API 키, 연 1회 또는 담당자 변경 시 키를 교체합니다.' },
  { topic: '정정·삭제', question: '이미 보낸 값이 틀리면 어떻게 고칩니까?', proposal: '같은 직원·월·지표로 다시 보내면 최신 값으로 바뀝니다.' },
  { topic: '시험 일정', question: '시험 키로 언제부터 보내 볼 수 있습니까?', proposal: '시험 키를 먼저 드리고, 결과 확인 후 운영 키를 발급합니다.' },
];
export const sampleRequest = {
  records: [
    { employee_id: 'NF-1001', branch_code: 'GROWTH_TEST_A', period: '2026-10', metric_code: 'SALES_AMOUNT', value: 12500000, unit: 'KRW' },
    { email: 'growth-regular@draft.invalid', branch_code: 'GROWTH_TEST_A', period: '2026-10', metric_code: 'SALES_COUNT', value: 84, unit: '건' },
  ],
};
export const sampleSuccess = { total: 2, succeeded: 2, failed: 0, errors: [] };
export const samplePartial = { total: 2, succeeded: 1, failed: 1, errors: [{ index: 1, code: 'EMPLOYEE_NOT_FOUND' }] };
export const curlExample = (endpoint: string) => `curl -X POST "${endpoint}" \\\n  -H "x-api-key: nfk_test_발급받은키" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(sampleRequest)}'`;
