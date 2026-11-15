import { describe, it, expect } from 'vitest';
import { planLabel, teamTotals, type TeamRow } from './teamData';
const r = (o: Partial<TeamRow>): TeamRow => ({ user_id: 'u', full_name: 'a', branch_id: 'b', branch_name: 'b', is_senior: false, courses: 0, courses_completed: 0, avg_progress: 0, offline_targets: 0, offline_attended: 0, field_coaching: 0, manager_coaching: 0, plans_needed: 0, plans_written: 0, followup_needed: 0, can_open: false, ...o });
describe('팀 성장 요약', () => {
  it('실행 계획 대상이 없으면 대상 없음', () => expect(planLabel(r({}))).toBe('대상 없음'));
  it('작성 건수 표시', () => expect(planLabel(r({ plans_needed: 3, plans_written: 1 }))).toBe('1/3건 작성'));
  it('미작성 계획과 후속 확인 합계', () => expect(teamTotals([r({ plans_needed: 3, plans_written: 1, followup_needed: 2, field_coaching: 1 }), r({ plans_needed: 1, plans_written: 1, manager_coaching: 2 })])).toEqual({ people: 2, followup: 2, missingPlans: 2, coaching: 3 }));
});
