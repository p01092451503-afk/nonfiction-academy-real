"""초안 전용 후속 확인 규칙 검사입니다. 각 검사 자료는 함께 되돌립니다."""
import subprocess
import unittest
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

spec = spec_from_file_location('plans', Path(__file__).with_name('test-mygrowth-action-plans.py'))
plans = module_from_spec(spec)
spec.loader.exec_module(plans)
m = plans.m
P = "current_setting('test.plan')::uuid"
STAMP = "current_setting('test.stamp')::timestamptz"
KEY = 'f1111111-1111-4111-8111-111111111111'

def setup(manager=False):
    return (plans.mgr() if manager else plans.edu()) + m.session(m.STAFF) + f"SELECT set_config('test.plan',({plans.SAVE()})::text,true) IS NOT NULL; RESET ROLE; SELECT set_config('test.stamp',(SELECT updated_at::text FROM public.mygrowth_action_plans WHERE id={P}),true) IS NOT NULL;"

def save(status='completed', note='현장 적용을 확인했습니다', version=0, key=KEY):
    return f"public.mygrowth_save_followup({P},'{status}','{note}',{version},{STAMP},'{key}')"

def detail(): return f"public.mygrowth_followup_detail({P})"

class FollowupRules(unittest.TestCase):
    def sql(self, body): return m.TrainingRules().sql(body)
    def denied(self, call): return m.TrainingRules().denied(call)
    def error(self, call, kind):
        return f"DO $$ BEGIN PERFORM {call}; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN {kind} THEN NULL; END $$;"
    def test_three_concrete_outcomes(self):
        for status in ['completed','in_progress','not_completed']:
            r = self.sql(setup()+m.session(m.A)+f"SELECT {save(status)}; SELECT {detail()}->'history'->0->>'status';")
            self.assertEqual(r[-2:], ['1', status])
    def test_repeated_corrections_append_all_history(self):
        r = self.sql(setup()+m.session(m.A)+f"SELECT {save()}; SELECT {save('in_progress','추가 확인',1,'f2222222-2222-4222-8222-222222222222')}; SELECT {save('not_completed','정정 확인',2,'f3333333-3333-4333-8333-333333333333')}; SELECT jsonb_array_length({detail()}->'history'); SELECT {detail()}->'history'->2->>'status';")
        self.assertEqual(r[-5:], ['1','2','3','3','completed'])
    def test_owner_readback_but_cannot_assess(self):
        r = self.sql(setup()+m.session(m.A)+f"SELECT {save()};"+m.session(m.STAFF)+f"SELECT {detail()}->>'can_assess'; SELECT {detail()}->'history'->0->>'note';"+self.denied(save()))
        self.assertEqual(r[-2:], ['false','현장 적용을 확인했습니다'])
    def test_other_branch_cannot_read_or_save(self):
        self.sql(setup()+m.session(m.B)+self.denied(save())+self.denied(detail()))
    def test_four_nonreviewer_roles_blocked(self):
        for uid in ['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555']:
            self.sql(setup()+m.session(uid)+self.denied(save())+self.denied(detail()))
    def test_education_team_not_assessor(self):
        self.sql(setup()+m.session(m.HQ)+self.denied(save())+self.denied(detail()))
    def test_manager_only_cannot_assess_education(self):
        self.sql(setup()+f"RESET ROLE; UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{m.A}' AND role='trainer';"+m.session(m.A)+self.denied(save())+self.denied(detail()))
    def test_trainer_only_cannot_assess_manager(self):
        self.sql(setup(True)+f"RESET ROLE; UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{m.A}' AND role='store_manager';"+m.session(m.A)+self.denied(save())+self.denied(detail()))
    def test_manager_can_assess_own_session(self):
        r=self.sql(setup(True)+m.session(m.A)+f"SELECT {save()};"+m.session(m.HQ)+self.denied(detail()))
        self.assertEqual(r[-1],'1')
    def test_revoked_reviewer_fails_closed(self):
        self.sql(setup()+f"RESET ROLE; DELETE FROM public.mygrowth_reviewers WHERE user_id='{m.A}';"+m.session(m.A)+self.denied(save())+self.denied(detail()))
    def test_revoked_assignment_fails_closed(self):
        self.sql(setup()+f"RESET ROLE; UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{m.A}';"+m.session(m.A)+self.denied(save())+self.denied(detail()))
    def test_employee_transfer_blocks_staff(self):
        self.sql(setup()+f"RESET ROLE; UPDATE public.profiles SET department_id='b0000000-0000-4000-8000-000000000012' WHERE user_id='{m.STAFF}';"+m.session(m.A)+self.denied(save())+self.denied(detail()))
    def test_attendance_removed_blocks_new_assessment(self):
        self.sql(setup()+m.session(m.A)+f"SELECT public.mygrowth_attendance_save({plans.T},ARRAY[]::uuid[],1);"+self.denied(save()))
    def test_no_client_direct_select_insert_update_delete(self):
        for stmt in ["PERFORM 1 FROM public.mygrowth_followup_audit", "INSERT INTO public.mygrowth_followup_audit DEFAULT VALUES", "UPDATE public.mygrowth_followup_audit SET note='무단 변경'", "DELETE FROM public.mygrowth_followup_audit"]:
            self.sql(setup()+m.session(m.A)+f"DO $$ BEGIN {stmt}; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")
    def test_history_immutable_even_privileged(self):
        for stmt in ["UPDATE public.mygrowth_followup_audit SET note='수정'", "DELETE FROM public.mygrowth_followup_audit"]:
            self.sql(setup()+m.session(m.A)+f"SELECT {save()}; RESET ROLE; DO $$ BEGIN {stmt} WHERE plan_id={P}; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")
    def test_duplicate_request_only_once(self):
        r=self.sql(setup()+m.session(m.A)+f"SELECT {save()}; SELECT {save()}; SELECT jsonb_array_length({detail()}->'history');")
        self.assertEqual(r[-3:],['1','1','1'])
    def test_duplicate_request_different_payload_denied(self):
        self.sql(setup()+m.session(m.A)+f"SELECT {save()};"+self.error(save('in_progress'),'invalid_parameter_value'))
    def test_retry_after_lost_response_readback_only_one_record(self):
        r=self.sql(setup()+m.session(m.A)+f"SELECT {save()}; SELECT {detail()}->>'version'; SELECT {save()}; SELECT jsonb_array_length({detail()}->'history');")
        self.assertEqual(r[-4:],['1','1','1','1'])
    def test_version_conflict_rejected(self):
        self.sql(setup()+m.session(m.A)+f"SELECT {save()};"+self.error(save(key='f2222222-2222-4222-8222-222222222222'),'serialization_failure'))
    def test_plan_edit_conflict_and_snapshot_preserved(self):
        r=self.sql(setup()+m.session(m.A)+f"SELECT {save()};"+m.session(m.STAFF)+f"SELECT {plans.SAVE('변경된 실행 계획')}; RESET ROLE; UPDATE public.mygrowth_action_plans SET updated_at=updated_at+interval '1 second' WHERE id={P};"+m.session(m.A)+self.error(save(version=1,key='f2222222-2222-4222-8222-222222222222'),'serialization_failure')+f"SELECT {detail()}->'history'->0->>'plan_body';")
        self.assertEqual(r[-1],'매장 응대 순서를 매일 적용합니다')
    def test_invalid_status_rejected(self):
        self.sql(setup()+m.session(m.A)+self.error(save('wrong'),'invalid_parameter_value'))
    def test_learning_and_attendance_unchanged(self):
        q="SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) FROM public.enrollments x; SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) FROM public.mygrowth_training_attendance_audit x; SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) FROM public.content_progress x;"
        r=self.sql(setup()+q+m.session(m.A)+f"SELECT {save()}; RESET ROLE;"+q)
        self.assertEqual(r[-7:-4],r[-3:])

if __name__=='__main__':
    subprocess.run(['bash','scripts/mygrowth-draft-isolation.sh','verify'],check=True,stdout=subprocess.DEVNULL)
    unittest.main()