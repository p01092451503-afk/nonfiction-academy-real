import { describe, it, expect } from 'vitest';
import { kpiEndpoint, MEETING_ITEMS, MAX_RECORDS_PER_REQUEST } from './guide';
describe('KPI 연동 가이드', () => {
  it('수신 주소는 백엔드 주소 뒤에 수신 함수 경로를 붙인다', () => {
    expect(kpiEndpoint('https://x.supabase.co/')).toBe('https://x.supabase.co/functions/v1/mygrowth-kpi-ingest');
  });
  it('한 번에 1000건까지 받는다', () => { expect(MAX_RECORDS_PER_REQUEST).toBe(1000); });
  it('미팅 결정 항목에 직원 식별·지표·주기·방식·보안이 모두 있다', () => {
    const topics = MEETING_ITEMS.map(m => m.topic).join(' ');
    for (const t of ['직원 식별', '지표 목록', '전송 주기', '연동 방식', '보안']) expect(topics).toContain(t);
  });
});
