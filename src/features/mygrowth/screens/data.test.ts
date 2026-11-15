import {describe,it,expect} from 'vitest';
import {screenStatus,yearRows,rowPath,type ScreenRow} from './data';
import {continuingLearning,learningDetailPath} from './IntegratedLearning';
const row:ScreenRow={feed_key:'attendance:1',record_type:'field_coaching',title:'코칭',detail:null,occurred_on:'2026-11-01',status:'attended',planned_minutes:30,actual_minutes:null,branch_name:null,progress:null,completion_count:null,training_id:'1',course_id:null,trainer_name:null,location:null,observation:null,feedback:null,next_action:null,plan_id:null,plan_body:null,plan_language:null,plan_updated_at:null,followup_status:null,followup_count:0};
describe('회의 화면 원본과 상태',()=>{
it('계획 미작성 코칭을 실행 계획 작성 대기로 구분합니다',()=>expect(screenStatus(row)).toBe('awaiting'));
it('현재 계획의 완료 판정만 이행 완료로 표시합니다',()=>expect(screenStatus({...row,plan_id:'p',followup_status:'completed'})).toBe('checked'));
it('계획 수정으로 판정이 유효하지 않으면 후속 필요입니다',()=>expect(screenStatus({...row,plan_id:'p',followup_status:null,followup_count:1})).toBe('followup'));
it('2026년 표시에는 2025년 활동과 실행 계획 자체를 합치지 않습니다',()=>expect(yearRows([row,{...row,occurred_on:'2025-12-31'},{...row,record_type:'plan'}],'2026')).toEqual([row]));
it('이러닝 원본 강의로 연결합니다',()=>expect(rowPath({...row,record_type:'elearning',course_id:'course'})).toBe('/student/courses/course'));
it('이어서 학습은 본인 조회 중 진행 중인 온라인 원본만 포함합니다',()=>{
 const online={...row,feed_key:'elearning:1',record_type:'elearning',course_id:'course',status:'in_progress',progress:35};
 expect(continuingLearning([row,online,{...online,feed_key:'elearning:2',status:'done'},{...online,course_id:null}])).toEqual([online]);
});
it('온라인과 오프라인 상세는 같은 검수 영역의 원본 식별자로 연결합니다',()=>{
 expect(learningDetailPath({...row,feed_key:'elearning:1'})).toBe('/my-growth/detail/elearning%3A1');
 expect(learningDetailPath(row)).toBe('/my-growth/detail/attendance%3A1');
});
});
