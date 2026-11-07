"""초안 전용 실제 권한 검사입니다. 모든 변경은 검사 후 되돌립니다."""
import subprocess
import unittest

HQ = '11111111-1111-4111-8111-111111111111'
SENIOR = 'b0000000-0000-4000-8000-000000000021'
REGULAR = 'b0000000-0000-4000-8000-000000000023'
BRANCH = 'b0000000-0000-4000-8000-000000000011'
OTHER = 'b0000000-0000-4000-8000-000000000012'

def session(user):
    return f"RESET ROLE; SET LOCAL request.jwt.claim.sub='{user}'; SET LOCAL ROLE authenticated;"

class AssignmentRules(unittest.TestCase):
    def run_sql(self, body):
        sql = 'BEGIN;' + body + 'ROLLBACK;'
        run = subprocess.run(['env','-u','PGSERVICE','-u','PGSERVICEFILE','psql',
            'host=127.0.0.1 port=8004 user=supabase_admin dbname=postgres',
            '-X','-Atq','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
        self.assertEqual(run.returncode,0,run.stderr)
        return run.stdout.strip().splitlines()

    def appoint(self):
        return session(HQ)+f"SELECT public.mygrowth_set_assignment('{SENIOR}','trainer',true);"

    def test_korean_hq_can_appoint(self):
        rows=self.run_sql(session(HQ)+"SELECT public.mygrowth_can_appoint();")
        self.assertEqual(rows,['t'])

    def test_existing_admin_has_no_authority(self):
        self.assertEqual(self.run_sql(session('44444444-4444-4444-8444-444444444444')+"SELECT public.mygrowth_can_appoint();"),['f'])

    def test_non_hq_appointment_denied(self):
        self.run_sql(session(SENIOR)+f"DO $$ BEGIN PERFORM public.mygrowth_set_assignment('{SENIOR}','trainer',true); RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")

    def test_regular_staff_denied(self):
        self.run_sql(session(HQ)+f"DO $$ BEGIN PERFORM public.mygrowth_set_assignment('{REGULAR}','trainer',true); RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")

    def test_own_branch_only(self):
        rows=self.run_sql(self.appoint()+session(SENIOR)+f"SELECT public.mygrowth_has_branch_role('{BRANCH}','trainer'),public.mygrowth_has_branch_role('{OTHER}','trainer');")
        self.assertEqual(rows[-1],'t|f')

    def test_two_roles_allowed_and_persisted(self):
        rows=self.run_sql(self.appoint()+f"SELECT public.mygrowth_set_assignment('{SENIOR}','store_manager',true);"+session(SENIOR)+"SELECT count(*) FROM public.mygrowth_assignment_directory();")
        self.assertEqual(rows[-1],'2')

    def test_revoke_denies_role(self):
        rows=self.run_sql(self.appoint()+f"SELECT public.mygrowth_set_assignment('{SENIOR}','trainer',false);"+session(SENIOR)+f"SELECT public.mygrowth_has_branch_role('{BRANCH}','trainer');")
        self.assertEqual(rows[-1],'f')

    def test_transfer_and_return_require_reappointment(self):
        rows=self.run_sql(self.appoint()+f"RESET ROLE; UPDATE public.profiles SET department_id='{OTHER}' WHERE user_id='{SENIOR}'; UPDATE public.profiles SET department_id='{BRANCH}' WHERE user_id='{SENIOR}';"+session(SENIOR)+f"SELECT public.mygrowth_has_branch_role('{BRANCH}','trainer');")
        self.assertEqual(rows[-1],'f')

    def test_senior_eligibility_revocation(self):
        rows=self.run_sql(self.appoint()+f"RESET ROLE; UPDATE public.mygrowth_staff_registry SET is_senior=false WHERE user_id='{SENIOR}';"+session(SENIOR)+f"SELECT public.mygrowth_has_branch_role('{BRANCH}','trainer');")
        self.assertEqual(rows[-1],'f')

    def test_client_cannot_change_authority(self):
        self.run_sql(session(SENIOR)+"DO $$ BEGIN INSERT INTO public.mygrowth_education_team(user_id,tenant_id) VALUES(auth.uid(),'b0000000-0000-4000-8000-000000000001'); RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")

    def test_reviewer_revocation_denies_records(self):
        rows=self.run_sql(self.appoint()+f"RESET ROLE; DELETE FROM public.mygrowth_reviewers WHERE user_id='{SENIOR}';"+session(SENIOR)+f"SELECT public.mygrowth_has_branch_role('{BRANCH}','trainer'),(SELECT count(*) FROM public.mygrowth_assignment_directory());")
        self.assertEqual(rows[-1],'f|0')

if __name__ == '__main__':
    subprocess.run(['bash','scripts/mygrowth-draft-isolation.sh','verify'],check=True,stdout=subprocess.DEVNULL)
    unittest.main()