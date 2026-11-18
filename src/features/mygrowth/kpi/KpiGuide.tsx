import { BookOpen, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KPI_ERROR_CODES, KPI_ROW_ERRORS, MEETING_ITEMS, MAX_RECORDS_PER_REQUEST, curlExample, kpiEndpoint, samplePartial, sampleRequest, sampleSuccess } from './guide';

const Code = ({ children }: { children: string }) => <pre className="min-w-0 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs">{children}</pre>;
const H2 = ({ n, children }: { n: number; children: string }) => <h2 className="mt-8 border-b-2 border-border/80 pb-2 text-lg font-semibold break-after-avoid">{n}. {children}</h2>;
const Table = ({ head, rows }: { head: string[]; rows: string[][] }) => <div className="min-w-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b-2 border-border/80 text-left text-muted-foreground">{head.map(h => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-b-2 border-border/80 break-inside-avoid">{r.map((c, j) => <td key={j} className={`py-2 pr-3 align-top break-words ${j === 0 ? 'font-mono text-xs' : ''}`}>{c}</td>)}</tr>)}</tbody></table></div>;

export default function KpiGuide() {
  const endpoint = kpiEndpoint(import.meta.env.VITE_SUPABASE_URL ?? '');
  return <article className="kpi-guide mx-auto min-w-0 max-w-4xl space-y-3 text-sm leading-relaxed">
    <header className="border-b-2 border-border/80 pb-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold"><BookOpen className="h-6 w-6"/>논픽션 LMS 직원 성과(KPI) API 연동 가이드</h1><p className="text-muted-foreground mt-1">외부 업체가 직원별 월 성과를 논픽션 LMS로 보내는 방법을 안내합니다. 이 문서는 업체에 그대로 전달할 수 있습니다.</p></div>
      <Button className="print:hidden" onClick={() => window.print()}><Download className="mr-1 h-4 w-4"/>PDF로 저장</Button></div>
      <p className="mt-2 text-xs text-muted-foreground print:hidden">버튼을 누른 뒤 인쇄 창에서 대상을 "PDF로 저장"으로 고르면 파일로 내려받을 수 있습니다.</p></header>

    <H2 n={1}>연동 개요</H2>
    <p>업체 서버가 직원의 월 성과를 JSON으로 보내면, 논픽션 LMS가 직원·지점·지표를 확인해 저장합니다. 저장된 성과는 본사 교육팀(전체), 지점 선임매니저(본인 지점), 직원 본인에게만 보입니다.</p>
    <Table head={['항목', '내용']} rows={[['주소', endpoint], ['방식', 'HTTPS POST'], ['형식', 'Content-Type: application/json (UTF-8)'], ['인증', 'x-api-key 헤더에 논픽션이 발급한 업체 전용 키'], ['한 번에 보낼 수 있는 양', `${MAX_RECORDS_PER_REQUEST}건, 2MB 이하`]]}/>

    <H2 n={2}>인증 방법</H2>
    <ul className="list-disc space-y-1 pl-5"><li>논픽션 본사 교육팀이 업체별로 <b>시험 키</b>(nfk_test_로 시작)와 <b>운영 키</b>(nfk_live_로 시작)를 발급합니다.</li><li>키는 발급할 때 한 번만 보여 드립니다. 논픽션은 원래 키를 보관하지 않고 암호화한 값만 저장하므로, 분실하면 새로 발급받아야 합니다.</li><li>키가 유출되거나 담당자가 바뀌면 논픽션이 즉시 폐기하고 새 키를 드립니다.</li><li>고정 IP를 알려 주시면 그 IP에서 온 요청만 받도록 제한합니다.</li><li>키는 서버에만 보관하고, 웹페이지·앱·메일 본문에 넣지 마십시오.</li></ul>
    <Code>{'x-api-key: nfk_test_발급받은키'}</Code>

    <H2 n={3}>보내는 자료 형식</H2>
    <Table head={['필드', '필수', '설명']} rows={[['employee_id', '둘 중 하나', '직원 사번. 있으면 이 값으로 찾습니다.'], ['email', '둘 중 하나', '사번이 없을 때 직원 회사 이메일'], ['branch_code', '필수', '논픽션 지점 코드 (논픽션이 코드표 제공)'], ['period', '필수', '성과 월, YYYY-MM (예: 2026-10)'], ['metric_code', '필수', '논픽션에 등록된 지표 코드 (예: SALES_AMOUNT)'], ['value', '필수', '숫자 (따옴표 없이)'], ['unit', '선택', '보내면 지표 단위와 같은지 확인합니다 (예: KRW)']]}/>
    <p className="font-medium">요청 예시</p><Code>{JSON.stringify(sampleRequest, null, 2)}</Code>

    <H2 n={4}>응답 예시</H2>
    <p><b>전체 성공 (200)</b></p><Code>{JSON.stringify(sampleSuccess, null, 2)}</Code>
    <p><b>일부 실패 (207)</b> — 성공한 행은 저장되고, 실패한 행만 순번(index, 0부터)과 오류 코드로 알려 드립니다. 실패한 행만 고쳐 다시 보내면 됩니다.</p><Code>{JSON.stringify(samplePartial, null, 2)}</Code>
    <p><b>요청 전체 오류</b></p><Code>{JSON.stringify({ error: { code: 'INVALID_API_KEY', message: 'API 키가 없거나 폐기되었습니다.' } }, null, 2)}</Code>

    <H2 n={5}>같은 자료를 다시 보내는 경우</H2>
    <p>같은 직원·같은 월·같은 지표를 다시 보내면 새 건이 생기지 않고 <b>최신 값으로 바뀝니다.</b> 그래서 응답을 못 받았거나 값을 고쳐야 할 때 같은 내용을 그대로 다시 보내셔도 안전합니다.</p>

    <H2 n={6}>오류 코드</H2>
    <p className="font-medium">요청 전체 오류</p><Table head={['코드', 'HTTP', '뜻', '조치']} rows={KPI_ERROR_CODES.map(e => [e.code, e.status, e.meaning, e.action])}/>
    <p className="font-medium mt-3">행별 오류 (207 응답의 errors)</p><Table head={['코드', '뜻']} rows={KPI_ROW_ERRORS.map(e => [e.code, e.meaning])}/>

    <H2 n={7}>전송 주기 권장</H2>
    <ul className="list-disc space-y-1 pl-5"><li>매일 새벽(한국시간 02:00~05:00) 1회, 당월 누계 값을 보냅니다.</li><li>매월 5일까지 전월 확정 값을 한 번 더 보냅니다. 같은 월·지표는 최신 값으로 바뀝니다.</li><li>1,000건이 넘으면 나눠 보내고, 실패(500) 시 5분 간격으로 최대 3회 다시 보냅니다.</li></ul>

    <H2 n={8}>테스트 방법</H2>
    <ol className="list-decimal space-y-1 pl-5"><li>논픽션에서 시험 키와 시험용 지점 코드·사번을 받습니다.</li><li>아래 명령으로 1~2건을 보내고 200 응답을 확인합니다.</li><li>일부러 틀린 사번을 넣어 207 응답과 오류 코드를 확인합니다.</li><li>같은 내용을 한 번 더 보내 중복 없이 값이 바뀌는지 확인합니다.</li><li>논픽션 담당자가 수신 기록과 화면 반영을 확인한 뒤 운영 키를 발급합니다.</li></ol>
    <Code>{curlExample(endpoint)}</Code>

    <H2 n={9}>미팅에서 함께 정할 항목</H2>
    <Table head={['항목', '확인할 질문', '논픽션 제안']} rows={MEETING_ITEMS.map(m => [m.topic, m.question, m.proposal])}/>
    <p className="text-xs text-muted-foreground mt-4">문의: 논픽션 본사 교육팀. 위 주소는 현재 운영 중인 논픽션 아카데미의 실제 수신 주소입니다.</p>
  </article>;
}
