"""초안 전용 교육 등록 규칙 검사입니다. 모든 검사 자료는 되돌립니다."""
import subprocess
import unittest

HQ='11111111-1111-4111-8111-111111111111'
A='b0000000-0000-4000-8000-000000000021'
B='b0000000-0000-4000-8000-000000000022'
STAFF='b0000000-0000-4000-8000-000000000023'
BRANCH='b0000000-0000-4000-8000-000000000011'
KEY='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
def session(uid):
    return f"RESET ROLE; SET LOCAL request.jwt.claim.sub='{uid}'; SET LOCAL ROLE authenticated;"
def create(targets=None,title='규칙 검수 교육'):
    people=targets or [A,STAFF]
    arr=','.join(f"'{p}'::uuid" for p in people)
    return f"public.mygrowth_create_training('{KEY}','{BRANCH}','{A}','{title}','서비스','2026-11-18','교육장',60,NULL,'정리',ARRAY[{arr}])"

class TrainingRules(unittest.TestCase):
    def sql(self,body):
        setup=f"UPDATE public.mygrowth_assignments SET active=true WHERE user_id IN ('{A}','{B}') AND role='trainer';"
        p=subprocess.run(['env','-u','PGSERVICE','-u','PGSERVICEFILE','psql','host=127.0.0.1 port=8004 user=supabase_admin dbname=postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],input='BEGIN;'+setup+body+'ROLLBACK;',text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stderr)
        return p.stdout.strip().splitlines()
    def denied(self,call):
        return f"DO $$ BEGIN PERFORM {call}; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;"
    def test_atomic_registration_and_readback(self):
        r=self.sql(session(HQ)+f"SELECT {create()}; SELECT count(*) FROM public.mygrowth_training_targets WHERE training_id=(SELECT id FROM public.mygrowth_trainings WHERE request_id='{KEY}'); SELECT actual_minutes IS NULL FROM public.mygrowth_trainings WHERE request_id='{KEY}';")
        self.assertEqual(r[1:],['2','t'])
    def test_same_request_returns_same_training(self):
        r=self.sql(session(HQ)+f"SELECT {create()}={create()}; SELECT count(*) FROM public.mygrowth_trainings WHERE request_id='{KEY}';")
        self.assertEqual(r,['t','1'])
    def test_changed_payload_rejected(self):
        self.sql(session(HQ)+f"SELECT {create()}; DO $$ BEGIN PERFORM {create(title='변경 교육')}; RAISE EXCEPTION '중복 실패'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;")
    def test_partial_failure_leaves_no_rows(self):
        r=self.sql(session(HQ)+self.denied(create([A,B]))+f"SELECT count(*) FROM public.mygrowth_trainings WHERE request_id='{KEY}';")
        self.assertEqual(r,['0'])
    def test_target_insert_failure_rolls_back_training(self):
        setup="CREATE FUNCTION pg_temp.fail_target() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '시험 저장 실패' USING ERRCODE='23514'; END $$; CREATE TRIGGER test_target_failure BEFORE INSERT ON public.mygrowth_training_targets FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_target();"
        r=self.sql(setup+session(HQ)+f"DO $$ BEGIN PERFORM {create()}; RAISE EXCEPTION '함께 취소 실패'; EXCEPTION WHEN check_violation THEN NULL; END $$; RESET ROLE; SELECT count(*) FROM public.mygrowth_trainings WHERE request_id='{KEY}';")
        self.assertEqual(r,['0'])
    def test_pending_targets_not_visible_to_employee(self):
        self.assertEqual(self.sql(session(STAFF)+"SELECT count(*) FROM public.mygrowth_training_targets;"),['0'])
    def test_trainer_own_branch_only(self):
        r=self.sql(session(A)+"SELECT count(*) FROM public.mygrowth_training_directory();"+self.denied(create([B])))
        self.assertEqual(r,['2'])
    def test_other_branch_denied(self):
        self.sql(session(B)+self.denied(create()))
    def test_four_existing_roles_blocked(self):
        for uid in ['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555']:
            self.assertEqual(self.sql(session(uid)+"SELECT count(*) FROM public.mygrowth_training_list(); SELECT count(*) FROM public.mygrowth_training_targets;"+self.denied(create())),['0','0'])
    def test_regular_staff_cannot_register(self):
        self.sql(session(STAFF)+self.denied(create()))
    def test_direct_write_denied(self):
        self.sql(session(HQ)+"DO $$ BEGIN UPDATE public.mygrowth_trainings SET title='무단 수정'; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")
    def test_revoked_trainer_denied(self):
        self.sql(f"UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{A}';"+session(HQ)+self.denied(create()))
    def test_revoked_reviewer_denied(self):
        r=self.sql(f"DELETE FROM public.mygrowth_reviewers WHERE user_id='{HQ}';"+session(HQ)+self.denied(create())+"SELECT count(*) FROM public.mygrowth_training_list();")
        self.assertEqual(r,['0'])
    def test_inactive_target_denied(self):
        self.sql(f"UPDATE public.mygrowth_staff_registry SET active=false WHERE user_id='{STAFF}';"+session(HQ)+self.denied(create()))
    def test_other_company_target_denied(self):
        self.sql(f"INSERT INTO public.tenants(id,name) VALUES('eeeeeeee-0000-4000-8000-000000000001','검수 타 회사'); UPDATE public.profiles SET tenant_id='eeeeeeee-0000-4000-8000-000000000001' WHERE user_id='{STAFF}';"+session(HQ)+self.denied(create()))
    def test_registration_does_not_complete_learning(self):
        r=self.sql(session(HQ)+f"SELECT progress,completion_count FROM public.enrollments WHERE id='c0000000-0000-4000-8000-000000000011'; SELECT {create()}; SELECT count(*) FROM public.mygrowth_records WHERE source_table='mygrowth_trainings'; SELECT progress,completion_count FROM public.enrollments WHERE id='c0000000-0000-4000-8000-000000000011';")
        self.assertEqual(r[0],'100|1');self.assertEqual(r[2:],[ '0','100|1'])

if __name__=='__main__':
    subprocess.run(['bash','scripts/mygrowth-draft-isolation.sh','verify'],check=True,stdout=subprocess.DEVNULL)
    unittest.main()