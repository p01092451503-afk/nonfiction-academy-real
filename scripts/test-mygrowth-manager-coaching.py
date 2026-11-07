"""초안 전용 매니저 코칭 규칙 검수입니다. 각 자료는 함께 되돌립니다."""
import unittest, subprocess
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
spec=spec_from_file_location('training',Path(__file__).with_name('test-mygrowth-training.py'))
m=module_from_spec(spec);spec.loader.exec_module(m)
T=f"(SELECT id FROM public.mygrowth_trainings WHERE request_id='{m.KEY}')"
def create(targets=None,feedback='응대 순서를 적용합니다',manager=m.A):
    ids=[m.A,m.STAFF] if targets is None else targets
    arr='ARRAY['+','.join(f"'{u}'::uuid" for u in ids)+']::uuid[]'
    return f"public.mygrowth_create_manager_coaching('{m.KEY}','{m.BRANCH}','{manager}','검수 매니저 코칭','2026-11-07','성수',30,NULL,'응대 관찰','{feedback}','현장 적용','ko',{arr})"
class ManagerRules(unittest.TestCase):
    def sql(self,body):return m.TrainingRules().sql(body)
    def denied(self,call):return m.TrainingRules().denied(call)
    def test_atomic_records_and_targets(self):
        self.assertEqual(self.sql(m.session(m.A)+f"SELECT {create()}; SELECT count(*) FROM public.mygrowth_manager_coaching WHERE training_id={T}; SELECT count(*) FROM public.mygrowth_training_targets WHERE training_id={T};")[1:],['1','2'])
    def test_lists_separate(self):
        self.assertEqual(self.sql(m.session(m.A)+f"SELECT {create()}; SELECT count(*) FROM public.mygrowth_manager_coaching_list() WHERE id={T}; SELECT count(*) FROM public.mygrowth_field_coaching_list() WHERE id={T}; SELECT count(*) FROM public.mygrowth_training_list() WHERE id={T};")[1:],['1','0','0'])
    def test_retry_idempotent(self):self.assertEqual(self.sql(m.session(m.A)+f"SELECT {create()}={create()};"),['t'])
    def test_changed_payload_denied(self):self.sql(m.session(m.A)+f"SELECT {create()}; DO $$ BEGIN PERFORM {create(feedback='変更')}; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;")
    def test_only_store_manager_not_trainer_or_hq(self):
        self.sql(f"UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{m.A}' AND role='store_manager';"+m.session(m.A)+self.denied(create()))
        self.sql(m.session(m.HQ)+self.denied(create()))
    def test_manager_cannot_choose_other_author(self):self.sql(m.session(m.A)+self.denied(create(manager=m.B)))
    def test_cross_branch_target_atomic(self):self.assertEqual(self.sql(m.session(m.A)+self.denied(create([m.A,m.B]))+f"SELECT count(*) FROM public.mygrowth_trainings WHERE request_id='{m.KEY}';"),['0'])
    def test_extension_failure_rolls_back_all(self):
        trigger="CREATE FUNCTION pg_temp.fail_notes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '검수 실패' USING ERRCODE='23514'; END $$; CREATE TRIGGER fail_notes BEFORE INSERT ON public.mygrowth_manager_coaching FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_notes();"
        self.assertEqual(self.sql(trigger+m.session(m.A)+f"DO $$ BEGIN PERFORM {create()}; RAISE EXCEPTION '취소 실패'; EXCEPTION WHEN check_violation THEN NULL; END $$; SELECT count(*) FROM public.mygrowth_trainings WHERE request_id='{m.KEY}';"),['0'])
    def test_own_attendance_and_employee_learning(self):
        r=self.sql(m.session(m.A)+f"SELECT {create()}; SELECT public.mygrowth_attendance_save({T},ARRAY['{m.STAFF}'::uuid],0); SELECT count(*) FROM public.mygrowth_training_attendees({T}) WHERE status='absent';"+m.session(m.STAFF)+"SELECT record_type FROM public.mygrowth_learning_list() WHERE title='검수 매니저 코칭';"+m.session(m.A)+f"SELECT public.mygrowth_attendance_save({T},ARRAY[]::uuid[],1);"+m.session(m.STAFF)+"SELECT count(*) FROM public.mygrowth_learning_list() WHERE title='검수 매니저 코칭';")
        self.assertEqual(r[1:],['1','1','manager_coaching','2','0'])
    def test_cross_branch_and_hq_cannot_read_manager_notes(self):
        for uid in [m.B,m.HQ,m.STAFF]:
            r=self.sql(m.session(m.A)+f"SELECT {create()};"+m.session(uid)+"SELECT count(*) FROM public.mygrowth_manager_coaching; SELECT count(*) FROM public.mygrowth_trainings WHERE title='검수 매니저 코칭'; SELECT public.mygrowth_attendance_detail((SELECT id FROM public.mygrowth_trainings WHERE title='검수 매니저 코칭')) IS NULL;")
            self.assertEqual(r[1:],['0','0','t'])
    def test_manager_only_cannot_manage_education(self):
        r=self.sql(f"UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{m.A}' AND role='trainer';"+m.session(m.A)+"SELECT count(*) FROM public.mygrowth_training_directory(); SELECT count(*) FROM public.mygrowth_training_list();"+self.denied("public.mygrowth_attendance_save('d0000000-0000-4000-8000-000000000001',ARRAY[]::uuid[],0)"))
        self.assertEqual(r,['0','0'])
    def test_reviewers_revoked_and_transfers_fail_closed(self):
        for setup in [f"DELETE FROM public.mygrowth_reviewers WHERE user_id='{m.A}';",f"UPDATE public.profiles SET department_id='b0000000-0000-4000-8000-000000000012' WHERE user_id='{m.A}';",f"UPDATE public.mygrowth_staff_registry SET active=false WHERE user_id='{m.A}';"]:
            self.sql(setup+m.session(m.A)+self.denied(create()))
    def test_four_existing_roles_denied(self):
        for uid in ['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555']:
            self.assertEqual(self.sql(m.session(uid)+self.denied(create())+"SELECT count(*) FROM public.mygrowth_manager_directory(); SELECT count(*) FROM public.mygrowth_manager_coaching_list();"),['0','0'])
    def test_version_conflict_and_direct_write_blocked(self):
        self.sql(m.session(m.A)+f"SELECT {create()}; SELECT public.mygrowth_attendance_save({T},ARRAY[]::uuid[],0); DO $$ BEGIN PERFORM public.mygrowth_attendance_save({T},ARRAY['{m.STAFF}'::uuid],0); RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN serialization_failure THEN NULL; END $$; DO $$ BEGIN UPDATE public.mygrowth_manager_coaching SET feedback='수정'; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")
    def test_original_learning_unchanged(self):
        q="SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.enrollments x; SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.mygrowth_records x;"
        r=self.sql(q+m.session(m.A)+f"SELECT {create()}; SELECT public.mygrowth_attendance_save({T},ARRAY['{m.STAFF}'::uuid],0); RESET ROLE;"+q);self.assertEqual(r[:2],r[4:])
if __name__=='__main__':
    subprocess.run(['bash','scripts/mygrowth-draft-isolation.sh','verify'],check=True,stdout=subprocess.DEVNULL)
    unittest.main()