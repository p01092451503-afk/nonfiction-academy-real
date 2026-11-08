"""중간 회의 화면의 실제 권한·원본 연결 검사입니다. 검사 자료는 되돌립니다."""
import unittest,subprocess
from importlib.util import spec_from_file_location,module_from_spec
from pathlib import Path
spec=spec_from_file_location('followup',Path(__file__).with_name('test-mygrowth-10-followup.py'));f=module_from_spec(spec);spec.loader.exec_module(f)
m=f.m
class MeetingRules(unittest.TestCase):
 def sql(self,s):return m.TrainingRules().sql(s)
 def test_regular_employee_has_no_staff_capabilities(self):
  r=self.sql(m.session(m.STAFF)+"SELECT public.mygrowth_screen_capabilities()->>'can_educate'; SELECT public.mygrowth_screen_capabilities()->>'manager';")
  self.assertEqual(r,['false','false'])
 def test_designated_trainer_has_own_capability(self):
  self.assertEqual(self.sql(m.session(m.A)+"SELECT public.mygrowth_screen_capabilities()->>'trainer';"),['true'])
 def test_four_nonreviewer_roles_denied(self):
  for uid in ['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555']:
   self.sql(m.session(uid)+m.TrainingRules().denied('public.mygrowth_employee_feed()')+m.TrainingRules().denied('public.mygrowth_screen_capabilities()'))
 def test_no_other_employee_plan_in_feed(self):
  r=self.sql(f.setup()+m.session(m.B)+f"SELECT count(*) FROM jsonb_array_elements(public.mygrowth_employee_feed()) r WHERE r->>'plan_id'={f.P}::text;")
  self.assertEqual(r[-1],'0')
 def test_stale_completed_assessment_is_not_current_completion(self):
  r=self.sql(f.setup()+m.session(m.A)+f"SELECT {f.save()};"+m.session(m.STAFF)+"SELECT (r->>'followup_status')='completed' FROM jsonb_array_elements(public.mygrowth_employee_feed()) r WHERE r->>'plan_id'="+f.P+"::text; RESET ROLE; UPDATE public.mygrowth_action_plans SET updated_at=updated_at+interval '1 second' WHERE id="+f.P+";"+m.session(m.STAFF)+"SELECT r->>'followup_status' IS NULL FROM jsonb_array_elements(public.mygrowth_employee_feed()) r WHERE r->>'plan_id'="+f.P+"::text;")
  self.assertEqual(r[-2:],['t','t'])
 def test_attendance_cancel_removes_detail(self):
  r=self.sql(f.setup()+f"RESET ROLE; UPDATE public.mygrowth_training_targets SET attendance_status='absent' WHERE training_id=(SELECT training_id FROM public.mygrowth_action_plans WHERE id={f.P});"+m.session(m.STAFF)+f"SELECT count(*) FROM jsonb_array_elements(public.mygrowth_employee_feed()) r WHERE r->>'plan_id'={f.P}::text;")
  self.assertEqual(r[-1],'0')
if __name__=='__main__':unittest.main()
