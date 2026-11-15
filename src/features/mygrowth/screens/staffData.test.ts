import { describe, it, expect } from 'vitest';
import { completedAttendance, attendanceLabel } from './staffData';
import { rowSchema } from './data';
const row = rowSchema.parse({ feed_key:'attendance:1',record_type:'offline_training',title:'교육',detail:null,occurred_on:'2026-11-01',status:'attended',planned_minutes:60,actual_minutes:30,branch_name:null,progress:null,completion_count:null,training_id:'1',course_id:null,trainer_name:null,location:null,observation:null,feedback:null,next_action:null,plan_id:null,plan_body:null,plan_language:null,plan_updated_at:null,followup_status:null,followup_count:0 });
describe('담당 직원 참석 집계', () => {
  it('미참석과 확인 전 기록을 완료 성장에 포함하지 않습니다', () => expect(completedAttendance([row,{...row,status:'absent'},{...row,status:'pending'}])).toEqual([row]));
  it('미참석을 참석 상태와 구분합니다', () => expect(attendanceLabel({...row,status:'absent'})).toBe('미참석'));
});