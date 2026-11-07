"""초안 전용 필드 코칭 검수입니다. 모든 변경은 함께 되돌립니다."""
import unittest, subprocess
from pathlib import Path
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('training',Path(__file__).with_name('test-mygrowth-training.py'))
m=module_from_spec(spec);spec.loader.exec_module(m)
def create(targets=None,feedback='시향 순서를 안내합니다'):
    ids=targets if targets is not None else [m.A,m.STAFF]
    arr='ARRAY['+','.join(f"'{x}'::uuid" for x in ids)+']::uuid[]'
    return f"public.mygrowth_create_field_coaching('{m.KEY}','{m.BRANCH}','{m.A}','검수 필드 코칭','2026-11-07','성수',30,NULL,'고객 응대 관찰','{feedback}','다음 응대 적용',{arr})"
T=f"(SELECT id FROM public.mygrowth_trainings WHERE request_id='{m.KEY}')"
class CoachingRules(unittest.TestCase):
    def sql(self,s):return m.TrainingRules().sql(s)
    def denied(self,call):return m.TrainingRules().denied(call)
    def test_atomic_coaching_and_targets(self):
        self.assertEqual(self.sql(m.session(m.HQ)+f"SELECT {create()}; SELECT count(*) FROM public.mygrowth_field_coaching WHERE training_id={T}; SELECT count(*) FROM public.mygrowth_training_targets WHERE training_id={T};")[1:],['1','2'])
    def test_education_and_coaching_lists_separate(self):
        self.assertEqual(self.sql(m.session(m.HQ)+f"SELECT {create()}; SELECT count(*) FROM public.mygrowth_training_list() WHERE id={T}; SELECT count(*) FROM public.mygrowth_field_coaching_list() WHERE id={T};")[1:],['0','1'])
    def test_retry_no_duplicate(self):self.assertEqual(self.sql(m.session(m.HQ)+f"SELECT {create()}={create()};"),['t'])
    def test_changed_payload_rejected(self):self.sql(m.session(m.HQ)+f"SELECT {create()}; DO $$ BEGIN PERFORM {create(feedback='변경')}; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;")
    def test_cross_branch_target_rolls_back(self):
        self.assertEqual(self.sql(m.session(m.HQ)+self.denied(create([m.A,m.B]))+f"SELECT count(*) FROM public.mygrowth_trainings WHERE request_id='{m.KEY}';"),['0'])
    def test_extension_failure_rolls_back_session(self):
        setup="CREATE FUNCTION pg_temp.fail_coaching() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '검수 실패' USING ERRCODE='23514'; END $$; CREATE TRIGGER fail_coaching BEFORE INSERT ON public.mygrowth_field_coaching FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_coaching();"
        self.assertEqual(self.sql(setup+m.session(m.HQ)+f"DO $$ BEGIN PERFORM {create()}; RAISE EXCEPTION '취소 실패'; EXCEPTION WHEN check_violation THEN NULL; END $$; SELECT count(*) FROM public.mygrowth_trainings WHERE request_id='{m.KEY}';"),['0'])
    def test_own_branch_trainer_only(self):self.sql(m.session(m.B)+self.denied(create()));self.sql(m.session(m.A)+f"SELECT {create()};")
    def test_four_roles_and_regular_staff_denied(self):
        for uid in [m.STAFF,'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555']:
            self.assertEqual(self.sql(m.session(uid)+self.denied(create())+'SELECT count(*) FROM public.mygrowth_field_coaching_list();'),['0'])
    def test_revoked_trainer_or_reviewer_denied(self):
        self.sql(f"UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{m.A}';"+m.session(m.HQ)+self.denied(create()))
        self.sql(f"DELETE FROM public.mygrowth_reviewers WHERE user_id='{m.HQ}';"+m.session(m.HQ)+self.denied(create()))
    def test_shared_attendance_owner_feed_and_correction(self):
        r=self.sql(m.session(m.HQ)+f"SELECT {create()}; SELECT public.mygrowth_attendance_save({T},ARRAY['{m.STAFF}'::uuid],0);"+m.session(m.STAFF)+"SELECT record_type FROM public.mygrowth_learning_list() WHERE title='검수 필드 코칭';"+m.session(m.A)+"SELECT count(*) FROM public.mygrowth_learning_list() WHERE title='검수 필드 코칭';"+m.session(m.HQ)+f"SELECT public.mygrowth_attendance_save({T},ARRAY[]::uuid[],1);"+m.session(m.STAFF)+"SELECT count(*) FROM public.mygrowth_learning_list() WHERE title='검수 필드 코칭';")
        self.assertEqual(r[1:],['1','field_coaching','0','2','0'])
    def test_direct_notes_write_blocked(self):self.sql(m.session(m.HQ)+"DO $$ BEGIN UPDATE public.mygrowth_field_coaching SET feedback='무단 수정'; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")
    def test_learning_unchanged(self):
        q="SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.enrollments x; SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.mygrowth_records x;"
        r=self.sql(q+m.session(m.HQ)+f"SELECT {create()}; SELECT public.mygrowth_attendance_save({T},ARRAY['{m.STAFF}'::uuid],0); RESET ROLE;"+q);self.assertEqual(r[:2],r[4:])
if __name__=='__main__':
    subprocess.run(['bash','scripts/mygrowth-draft-isolation.sh','verify'],check=True,stdout=subprocess.DEVNULL)
    unittest.main()