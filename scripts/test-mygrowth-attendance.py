"""초안 전용 참석 관리 검사입니다. 각 검사 자료는 함께 되돌립니다."""
import subprocess
import unittest
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path

spec = spec_from_file_location('training_rules', Path(__file__).with_name('test-mygrowth-training.py'))
training = module_from_spec(spec)
spec.loader.exec_module(training)
HQ, A, B, STAFF = training.HQ, training.A, training.B, training.STAFF
T = 'd0000000-0000-4000-8000-000000000001'

def save(ids=None, version=0):
    people = [A] if ids is None else ids
    array = 'ARRAY[' + ','.join(f"'{p}'::uuid" for p in people) + ']::uuid[]'
    return f"public.mygrowth_attendance_save('{T}',{array},{version})"

class AttendanceRules(unittest.TestCase):
    def sql(self, body):
        setup = f"UPDATE public.mygrowth_assignments SET active=true WHERE user_id IN ('{A}','{B}') AND role='trainer'; UPDATE public.mygrowth_trainings SET attendance_version=0 WHERE id='{T}'; UPDATE public.mygrowth_training_targets SET attendance_status='pending' WHERE training_id='{T}'; DELETE FROM public.mygrowth_training_attendance_audit WHERE training_id='{T}';"
        p = subprocess.run(['env','-u','PGSERVICE','-u','PGSERVICEFILE','psql','host=127.0.0.1 port=8004 user=supabase_admin dbname=postgres','-X','-Atq','-v','ON_ERROR_STOP=1'], input='BEGIN;'+setup+body+'ROLLBACK;', text=True, capture_output=True)
        self.assertEqual(p.returncode, 0, p.stderr)
        return p.stdout.strip().splitlines()
    def denied(self, call):
        return f"DO $$ BEGIN PERFORM {call}; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;"
    def test_selected_attendee_and_unselected_absentee(self):
        r = self.sql(training.session(HQ)+f"SELECT {save()}; SELECT user_id,attendance_status FROM public.mygrowth_training_targets WHERE training_id='{T}' ORDER BY user_id;")
        self.assertEqual(r,['1',f'{A}|attended',f'{STAFF}|absent'])
    def test_pending_before_confirmation(self):
        self.assertEqual(self.sql(training.session(HQ)+f"SELECT count(*) FROM public.mygrowth_training_attendees('{T}') WHERE status='pending';"),['2'])
    def test_zero_attendees_allowed(self):
        self.assertEqual(self.sql(training.session(HQ)+f"SELECT {save([])}; SELECT count(*) FROM public.mygrowth_training_attendees('{T}') WHERE status='absent';"),['1','2'])
    def test_all_attendees_allowed(self):
        self.assertEqual(self.sql(training.session(HQ)+f"SELECT {save([A,STAFF])}; SELECT count(*) FROM public.mygrowth_training_attendees('{T}') WHERE status='attended';"),['1','2'])
    def test_correction_and_audit(self):
        r=self.sql(training.session(HQ)+f"SELECT {save()}; SELECT {save([STAFF],1)}; SELECT version,changed_by,cardinality(before_attendees),cardinality(after_attendees) FROM public.mygrowth_training_attendance_audit WHERE training_id='{T}' ORDER BY version;")
        self.assertEqual(r,['1','2',f'1|{HQ}|0|1',f'2|{HQ}|1|1'])
    def test_duplicate_selection_normalized(self):
        self.assertEqual(self.sql(training.session(HQ)+f"SELECT {save([A,A])}; SELECT count(*) FROM public.mygrowth_training_attendees('{T}') WHERE status='attended';"),['1','1'])
    def test_same_outcome_no_extra_history(self):
        self.assertEqual(self.sql(training.session(HQ)+f"SELECT {save()}; SELECT {save(version=1)}; SELECT count(*) FROM public.mygrowth_training_attendance_audit WHERE training_id='{T}';"),['1','1','1'])
    def test_stale_version_cannot_overwrite(self):
        r=self.sql(training.session(HQ)+f"SELECT {save()}; DO $$ BEGIN PERFORM {save([STAFF])}; RAISE EXCEPTION '경합 차단 실패'; EXCEPTION WHEN serialization_failure THEN NULL; END $$; SELECT user_id FROM public.mygrowth_training_attendees('{T}') WHERE status='attended';")
        self.assertEqual(r,['1',A])
    def test_wrong_target_atomic_failure(self):
        r=self.sql(training.session(HQ)+self.denied(save([A,B]))+f"SELECT attendance_version FROM public.mygrowth_trainings WHERE id='{T}'; SELECT count(*) FROM public.mygrowth_training_attendees('{T}') WHERE status='pending';")
        self.assertEqual(r,['0','2'])
    def test_audit_failure_rolls_back_all_changes(self):
        setup="CREATE FUNCTION pg_temp.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '검수 저장 실패' USING ERRCODE='23514'; END $$; CREATE TRIGGER test_audit_failure BEFORE INSERT ON public.mygrowth_training_attendance_audit FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_audit();"
        r=self.sql(setup+training.session(HQ)+f"DO $$ BEGIN PERFORM {save()}; RAISE EXCEPTION '취소 실패'; EXCEPTION WHEN check_violation THEN NULL; END $$; SELECT attendance_version FROM public.mygrowth_trainings WHERE id='{T}'; SELECT count(*) FROM public.mygrowth_training_attendees('{T}') WHERE status='pending';")
        self.assertEqual(r,['0','2'])
    def test_own_branch_trainer_allowed_other_branch_blocked(self):
        self.assertEqual(self.sql(training.session(A)+f"SELECT {save()};"+training.session(B)+self.denied(save())+f"SELECT public.mygrowth_attendance_detail('{T}') IS NULL;"),['1','t'])
    def test_four_existing_roles_and_regular_staff_blocked(self):
        for uid in [STAFF,'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555']:
            self.assertEqual(self.sql(training.session(uid)+self.denied(save())+f"SELECT public.mygrowth_attendance_detail('{T}') IS NULL;"),['t'])
    def test_revoked_reviewer_blocked(self):
        self.sql(f"DELETE FROM public.mygrowth_reviewers WHERE user_id='{HQ}';"+training.session(HQ)+self.denied(save()))
    def test_revoked_trainer_blocked(self):
        self.sql(f"UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{A}';"+training.session(A)+self.denied(save()))
    def test_transferred_or_inactive_attendee_blocked(self):
        self.sql(f"UPDATE public.profiles SET department_id='b0000000-0000-4000-8000-000000000012' WHERE user_id='{STAFF}';"+training.session(HQ)+self.denied(save([STAFF])))
        self.sql(f"UPDATE public.mygrowth_staff_registry SET active=false WHERE user_id='{STAFF}';"+training.session(HQ)+self.denied(save([STAFF])))
    def test_direct_outcome_and_history_write_blocked(self):
        self.sql(training.session(HQ)+f"DO $$ BEGIN UPDATE public.mygrowth_training_targets SET attendance_status='attended' WHERE training_id='{T}'; RAISE EXCEPTION '직접 수정 차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$; DO $$ BEGIN DELETE FROM public.mygrowth_training_attendance_audit WHERE training_id='{T}'; RAISE EXCEPTION '이력 수정 차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")
    def test_learning_and_growth_records_unchanged(self):
        baseline="SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) FROM public.enrollments x; SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) FROM public.mygrowth_records x;"
        r=self.sql(baseline+training.session(HQ)+f"SELECT {save()}; RESET ROLE;"+baseline)
        self.assertEqual(r[:2],r[3:])

if __name__ == '__main__':
    subprocess.run(['bash','scripts/mygrowth-draft-isolation.sh','verify'],check=True,stdout=subprocess.DEVNULL)
    unittest.main()