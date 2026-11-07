"""초안의 본인 학습 목록을 검사하고 변경 자료를 되돌립니다."""
import unittest
import subprocess
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
spec=spec_from_file_location('attendance',Path(__file__).with_name('test-mygrowth-attendance.py'))
m=module_from_spec(spec); spec.loader.exec_module(m)
class LearningRules(unittest.TestCase):
    def sql(self,body): return m.AttendanceRules().sql(body)
    def test_unassigned_roles_see_zero(self):
        for uid in ['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555']:
            self.assertEqual(self.sql(m.training.session(uid)+'SELECT count(*) FROM public.mygrowth_learning_list();'),['0'])
    def test_owner_records_and_deduplicated_events(self):
        r=self.sql(m.training.session(m.HQ)+"SELECT count(*) FROM public.mygrowth_learning_list(); SELECT count(*) FROM public.mygrowth_learning_list() WHERE feed_key='event:a0000000-0000-4000-8000-000000000001'; SELECT count(*) FROM public.mygrowth_learning_list() WHERE record_type IN ('plan','followup');")
        self.assertEqual(r,['9','0','2'])
    def test_pending_absent_excluded_attended_included(self):
        r=self.sql(m.training.session(m.A)+"SELECT count(*) FROM public.mygrowth_learning_list() WHERE feed_key LIKE 'attendance:%';"+m.training.session(m.HQ)+f"SELECT {m.save()};"+m.training.session(m.A)+"SELECT count(*) FROM public.mygrowth_learning_list() WHERE feed_key LIKE 'attendance:%';"+m.training.session(m.STAFF)+"SELECT count(*) FROM public.mygrowth_learning_list() WHERE feed_key LIKE 'attendance:%';")
        self.assertEqual(r,['0','1','1','0'])
    def test_other_employee_cannot_see_attendance(self):
        self.assertEqual(self.sql(m.training.session(m.HQ)+f"SELECT {m.save()};"+m.training.session(m.B)+"SELECT count(*) FROM public.mygrowth_learning_list() WHERE feed_key LIKE 'attendance:%';"),['1','0'])
    def test_correction_removes_attendance_without_stale_link(self):
        setup=f"INSERT INTO public.mygrowth_records(user_id,record_type,source_table,source_id,title,status) VALUES('{m.A}','offline_training','mygrowth_trainings','{m.T}','이전 교육 연결','done');"
        r=self.sql(setup+m.training.session(m.HQ)+f"SELECT {m.save()}; SELECT {m.save([],1)};"+m.training.session(m.A)+"SELECT count(*) FROM public.mygrowth_learning_list();")
        self.assertEqual(r,['1','2','0'])
    def test_reviewer_revocation_hides_all(self):
        self.assertEqual(self.sql(f"DELETE FROM public.mygrowth_reviewers WHERE user_id='{m.HQ}';"+m.training.session(m.HQ)+'SELECT count(*) FROM public.mygrowth_learning_list();'),['0'])
    def test_read_does_not_change_source(self):
        before="SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.enrollments x; SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.mygrowth_records x;"
        r=self.sql(before+m.training.session(m.HQ)+'SELECT count(*) FROM public.mygrowth_learning_list(); RESET ROLE;'+before)
        self.assertEqual(r[:2],r[3:])
if __name__=='__main__':
    subprocess.run(['bash','scripts/mygrowth-draft-isolation.sh','verify'],check=True,stdout=subprocess.DEVNULL)
    unittest.main()