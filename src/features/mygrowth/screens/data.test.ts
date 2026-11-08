import {describe,it,expect} from 'vitest';
import {screenStatus,yearRows,rowPath,type ScreenRow} from './data';
const row:ScreenRow={feed_key:'attendance:1',record_type:'field_coaching',title:'코칭',detail:null,occurred_on:'2026-11-01',status:'attended',planned_minutes:30,actual_minutes:null,branch_name:null,progress:null,completion_count:null,training_id:'1',course_id:null,trainer_name:null,location:null,observation:null,feedback:null,next_action:null,plan_id:null,plan_body:null,plan_language:null,plan_updated_at:null,followup_status:null,followup_count:0};
describe('회의 화면 원본과 상태',()=>{
it('계획 미작성 코칭을 실행 계획 작성 대기로 구분합니다',()=>expect(screenStatus(row)).toBe('awaiting'));
it('현재 계획의 완료 판정만 이행 완료로 표시합니다',()=>expect(screenStatus({...row,plan_id:'p',followup_status:'completed'})).toBe('checked'));
it('계획 수정으로 판정이 유효하지 않으면 후속 필요입니다',()=>expect(screenStatus({...row,plan_id:'p',followup_status:null,followup_count:1})).toBe('followup'));
it('2026년 표시에는 2025년 활동과 실행 계획 자체를 합치지 않습니다',()=>expect(yearRows([row,{...row,occurred_on:'2025-12-31'},{...row,record_type:'plan'}],'2026')).toEqual([row]));
it('이러닝 원본 강의로 연결합니다',()=>expect(rowPath({...row,record_type:'elearning',course_id:'course'})).toBe('/student/courses/course'));
});
