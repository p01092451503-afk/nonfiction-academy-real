"""현재 소속·세션별 열람 제한의 초안 전용 검사입니다."""
import unittest
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
spec = spec_from_file_location('training', Path(__file__).with_name('test-mygrowth-training.py'))
m = module_from_spec(spec); spec.loader.exec_module(m)
FIELD = 'f1000000-0000-4000-8000-000000000001'
MANAGER = 'f1000000-0000-4000-8000-000000000002'

class StaffJourneyRules(m.TrainingRules):
    def test_directory_only_existing_targets(self):
        self.assertEqual(self.sql(m.session(m.A)+"SELECT count(*) FROM public.mygrowth_staff_directory();"), ['2'])
    def test_attended_monthly_records(self):
        self.assertEqual(self.sql(m.session(m.A)+f"SELECT count(*) FROM jsonb_array_elements(public.mygrowth_staff_feed('{m.STAFF}')) r WHERE r->>'occurred_on'='2026-10-15' AND r->>'status'='attended';"), ['1'])
    def test_other_branch_direct_reads_denied(self):
        self.sql(m.session(m.B)+self.denied(f"public.mygrowth_staff_feed('{m.STAFF}')")+self.denied(f"public.mygrowth_staff_detail('{m.STAFF}','{FIELD}')"))
    def test_employee_cannot_read_staff_directory(self):
        self.sql(m.session(m.STAFF)+self.denied('public.mygrowth_staff_directory()'))
    def test_education_authority_is_not_staff_authority(self):
        self.sql(m.session(m.HQ)+self.denied('public.mygrowth_staff_directory()'))
    def test_other_manager_author_not_visible(self):
        self.sql(f"UPDATE public.mygrowth_trainings SET trainer_id='{m.B}' WHERE id='{MANAGER}';"+m.session(m.A)+self.denied(f"public.mygrowth_staff_detail('{m.STAFF}','{MANAGER}')"))
    def test_trainer_only_cannot_read_manager_notes(self):
        self.sql(f"UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{m.A}' AND role='store_manager';"+m.session(m.A)+self.denied(f"public.mygrowth_staff_detail('{m.STAFF}','{MANAGER}')"))
    def test_revoked_reviewer_blocks_all_reads(self):
        self.sql(f"DELETE FROM public.mygrowth_reviewers WHERE user_id='{m.A}';"+m.session(m.A)+self.denied('public.mygrowth_staff_directory()')+self.denied(f"public.mygrowth_staff_feed('{m.STAFF}')")+self.denied(f"public.mygrowth_staff_detail('{m.STAFF}','{FIELD}')"))
    def test_reassigned_employee_denied(self):
        self.sql(f"UPDATE public.profiles SET department_id='b0000000-0000-4000-8000-000000000012' WHERE user_id='{m.STAFF}';"+m.session(m.A)+self.denied(f"public.mygrowth_staff_feed('{m.STAFF}')"))
    def test_senior_qualification_removed_denied(self):
        self.sql(f"UPDATE public.mygrowth_staff_registry SET is_senior=false WHERE user_id='{m.A}';"+m.session(m.A)+self.denied('public.mygrowth_staff_directory()'))
    def test_all_appointments_revoked_denied(self):
        self.sql(f"UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{m.A}';"+m.session(m.A)+self.denied('public.mygrowth_staff_directory()')+self.denied(f"public.mygrowth_staff_detail('{m.STAFF}','{FIELD}')"))
    def test_actor_transfer_denied(self):
        self.sql(f"UPDATE public.profiles SET department_id='b0000000-0000-4000-8000-000000000012' WHERE user_id='{m.A}';"+m.session(m.A)+self.denied(f"public.mygrowth_staff_feed('{m.STAFF}')"))
    def test_inactive_employee_denied(self):
        self.sql(f"UPDATE public.mygrowth_staff_registry SET active=false WHERE user_id='{m.STAFF}';"+m.session(m.A)+self.denied(f"public.mygrowth_staff_feed('{m.STAFF}')"))
    def test_nonreviewer_roles_denied_new_rpc(self):
        for uid in ['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555']:
            self.sql(m.session(uid)+self.denied('public.mygrowth_staff_directory()')+self.denied(f"public.mygrowth_staff_feed('{m.STAFF}')"))
    def test_no_other_employee_lms_records(self):
        self.assertEqual(self.sql(m.session(m.A)+f"SELECT count(*) FROM jsonb_array_elements(public.mygrowth_staff_feed('{m.STAFF}')) r WHERE r->>'record_type'='elearning';"), ['0'])
    def test_absent_has_no_plan(self):
        self.assertEqual(self.sql("UPDATE public.mygrowth_training_targets SET attendance_status='absent' WHERE training_id='f0000000-0000-4000-8000-000000000001';"+m.session(m.A)+f"SELECT (r->>'plan_id') IS NULL FROM jsonb_array_elements(public.mygrowth_staff_feed('{m.STAFF}')) r WHERE r->>'training_id'='f0000000-0000-4000-8000-000000000001';"), ['t'])
    def test_non_target_detail_denied(self):
        self.sql(m.session(m.A)+self.denied(f"public.mygrowth_staff_detail('{m.A}','{FIELD}')"))

if __name__ == '__main__': unittest.main()