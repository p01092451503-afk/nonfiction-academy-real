import { z } from 'zod';
import { formatMinutes, levelLabel, reportRowSchema, type ReportLevel } from './timeReport';

export type ReportSelection = { from: string; to: string; level: ReportLevel };
export type ReportRow = z.infer<typeof reportRowSchema>;

export function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function reportCsv(selection: ReportSelection, rows: ReportRow[]) {
  if (!selection.from || !selection.to || selection.from > selection.to || !rows.length) {
    throw new Error('내려받을 기록이 없습니다. 기간과 조회 결과를 확인해 주십시오.');
  }
  const checked = z.array(reportRowSchema).parse(rows);
  const lines: (string | number)[][] = [
    ['시작일', '종료일', '보고 단위', levelLabel[selection.level], '인원', '온라인 학습시간', '오프라인 교육 참석시간', '현장 코칭 시간', '매니저 코칭 시간'],
    ...checked.map(r => [selection.from, selection.to, levelLabel[selection.level], r.scope_label, r.people,
      formatMinutes(r.online_minutes), formatMinutes(r.offline_minutes), formatMinutes(r.field_minutes),
      `${formatMinutes(r.manager_minutes)}${r.manager_hidden ? ' (일부 비공개)' : ''}`]),
  ];
  return '\uFEFF' + lines.map(line => line.map(csvCell).join(',')).join('\r\n');
}

export async function prepareReportExport(selection: ReportSelection, load: () => Promise<ReportRow[]>, isCurrent: () => boolean) {
  // Always request current server scope; never accept the screen's cached rows.
  const rows = await load();
  if (!isCurrent()) throw new Error('선택 내용이 바뀌었습니다. 다시 내려받아 주십시오.');
  return { rows, csv: reportCsv(selection, rows), filename: `교육·코칭_시간보고서_${levelLabel[selection.level]}_${selection.from}_${selection.to}.csv` };
}

export function downloadReport(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}