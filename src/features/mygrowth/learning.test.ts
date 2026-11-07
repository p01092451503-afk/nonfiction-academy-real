import { describe, expect, it } from 'vitest';
import { filterLearning, learningCategory, type LearningRow } from './learning';
const row = (key: string, type: string, status: string, date: string, title: string): LearningRow => ({ feed_key: key, record_type: type, status, occurred_on: date, title, detail: null, planned_minutes: null, actual_minutes: null, branch_name: null, progress: null, completion_count: null });
const rows = [row('1', 'offline_training', 'attended', '2026-11-07', '향수 교육'), row('2', 'field_coaching', 'done', '2026-11-06', '고객 코칭'), row('3', 'plan', 'in_progress', '2026-10-01', '성장 계획')];
const filters = { search: '', category: 'all' as const, status: 'all', from: '', to: '' };
describe('본인 학습 목록 분류와 조회', () => {
  it('교육과 코칭과 성장 활동을 나눕니다', () => { expect(learningCategory('offline_training')).toBe('education'); expect(learningCategory('field_coaching')).toBe('coaching'); expect(learningCategory('plan')).toBe('growth'); });
  it('선택한 교육만 표시합니다', () => { expect(filterLearning(rows, { ...filters, category: 'education' }).map(r => r.feed_key)).toEqual(['1']); });
  it('제목 검색으로 해당 기록만 표시합니다', () => { expect(filterLearning(rows, { ...filters, search: ' 고객 ' }).map(r => r.feed_key)).toEqual(['2']); });
  it('완료 조회에 참석 확인을 포함합니다', () => { expect(filterLearning(rows, { ...filters, status: 'done' }).map(r => r.feed_key)).toEqual(['1', '2']); });
  it('기간 시작과 끝을 포함하고 밖의 기록을 제외합니다', () => { expect(filterLearning(rows, { ...filters, from: '2026-11-06', to: '2026-11-07' }).map(r => r.feed_key)).toEqual(['1', '2']); });
});