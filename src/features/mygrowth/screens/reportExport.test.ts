import { describe, it, expect, vi } from 'vitest';
import { csvCell, reportCsv, prepareReportExport, type ReportRow } from './reportExport';
const selection = { from: '2026-11-01', to: '2026-11-16', level: 'person' as const };
const row: ReportRow = { scope_key: '직원', scope_label: '검수 직원', people: 1, online_minutes: 52, offline_minutes: 115, field_minutes: 25, manager_minutes: 30, manager_hidden: false };
describe('보고서 내려받기 규칙', () => {
  it('한국어 문자 표시를 위한 표식을 포함합니다', () => expect(reportCsv(selection, [row]).charCodeAt(0)).toBe(0xfeff));
  it('기간과 보고 단위 및 원본 시간을 그대로 담습니다', () => {
    const data = reportCsv(selection, [row]);
    expect(data).toContain('"2026-11-01","2026-11-16","개인","검수 직원",1'.replace(',1', ',"1"'));
    expect(data).toContain('"52분","1시간 55분","25분","30분"');
  });
  it('매니저 코칭 비공개 결과를 유지합니다', () => expect(reportCsv(selection, [{ ...row, manager_minutes: 0, manager_hidden: true }])).toContain('"0분 (일부 비공개)"'));
  it('쉼표·따옴표·줄바꿈을 보존합니다', () => expect(csvCell('이름,"별명"\n다음 줄')).toBe('"이름,""별명""\n다음 줄"'));
  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', ' \t=1', '\t이름', '\r이름', '\n이름'])('수식 실행 위험 값을 보호합니다: %s', value => expect(csvCell(value)).toBe(`"'${value}"`));
  it('빈 조회에서는 파일을 만들지 않습니다', () => expect(() => reportCsv(selection, [])).toThrow());
  it('잘못된 기간에서는 파일을 만들지 않습니다', () => expect(() => reportCsv({ ...selection, from: '2026-12-01' }, [row])).toThrow());
  it('내려받을 때 반드시 새 조회 결과를 사용합니다', async () => {
    const load = vi.fn().mockResolvedValue([{ ...row, online_minutes: 7 }]);
    const result = await prepareReportExport(selection, load, () => true);
    expect(load).toHaveBeenCalledOnce(); expect(result.csv).toContain('"7분"'); expect(result.csv).not.toContain('"52분"');
  });
  it('서버가 거부하면 파일을 만들지 않습니다', async () => expect(prepareReportExport(selection, async () => { throw new Error('권한 없음'); }, () => true)).rejects.toThrow());
  it('조회 중 선택이나 사용자가 바뀌면 파일을 만들지 않습니다', async () => expect(prepareReportExport(selection, async () => [row], () => false)).rejects.toThrow());
  it('권한 축소 후 현재 허용된 결과만 사용합니다', async () => {
    const result = await prepareReportExport(selection, async () => [{ ...row, scope_label: '본인만' }], () => true);
    expect(result.csv).toContain('본인만'); expect(result.csv).not.toContain('검수 직원');
  });
});