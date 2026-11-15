"""이번 자료 보호와 원본 시간 연결 규칙을 초안에서 검사하고 되돌립니다."""
import unittest, subprocess
from importlib.util import spec_from_file_location,module_from_spec
from pathlib import Path
spec=spec_from_file_location('training',Path(__file__).with_name('test-mygrowth-training.py'));m=module_from_spec(spec);spec.loader.exec_module(m)
T='f1000000-0000-4000-8000-000000000003'
M='f3000000-0000-4000-8000-000000000001'; K='f3000000-0000-4000-8000-000000000002'
class MaterialRules(unittest.TestCase):
 def sql(self,s):return m.TrainingRules().sql(s)
 def denied(self,c):return m.TrainingRules().denied(c)
 def setup(self):return f"INSERT INTO public.mygrowth_materials(id,training_id,uploaded_by,filename,bytes,object_path,ready) VALUES('{M}','{T}','{m.A}','교육.pdf',12,'{T}/{M}',true); INSERT INTO public.mygrowth_material_tickets(id,material_id,user_id) VALUES('{K}','{M}','{m.STAFF}');"
 def test_attended_owner_and_scoped_trainer_read(self):
  self.assertEqual(self.sql(self.setup()+m.session(m.STAFF)+f"SELECT count(*) FROM jsonb_array_elements(public.mygrowth_material_list('{T}')) r WHERE r->>'id'='{M}'; SELECT public.mygrowth_material_redeem('{K}')->>'filename';"+m.session(m.A)+f"SELECT count(*) FROM jsonb_array_elements(public.mygrowth_material_list('{T}')) r WHERE r->>'id'='{M}';"),['1','교육.pdf','1'])
 def test_other_branch_denied(self):self.sql(self.setup()+m.session(m.B)+self.denied(f"public.mygrowth_material_list('{T}')")+self.denied(f"public.mygrowth_material_redeem('{K}')"))
 def test_employee_cannot_upload(self):self.sql(m.session(m.STAFF)+self.denied(f"public.mygrowth_material_reserve('{T}','교육.pdf',12)"))
 def test_pending_and_absent_denied(self):
  for status in ['pending','absent']:
   self.sql(self.setup()+f"UPDATE public.mygrowth_training_targets SET attendance_status='{status}' WHERE training_id='{T}';"+m.session(m.STAFF)+self.denied(f"public.mygrowth_material_redeem('{K}')"))
 def test_transfer_denies_unexpired_ticket(self):self.sql(self.setup()+f"UPDATE public.profiles SET department_id='b0000000-0000-4000-8000-000000000012' WHERE user_id='{m.STAFF}';"+m.session(m.STAFF)+self.denied(f"public.mygrowth_material_redeem('{K}')"))
 def test_reviewer_revocation_denies_unexpired_ticket(self):self.sql(self.setup()+f"DELETE FROM public.mygrowth_reviewers WHERE user_id='{m.STAFF}';"+m.session(m.STAFF)+self.denied(f"public.mygrowth_material_redeem('{K}')"))
 def test_trainer_revocation_and_transfer_denied(self):
  for change in [f"UPDATE public.mygrowth_assignments SET active=false WHERE user_id='{m.A}';",f"UPDATE public.profiles SET department_id='b0000000-0000-4000-8000-000000000012' WHERE user_id='{m.A}';"]:
   self.sql(self.setup()+change+m.session(m.A)+self.denied(f"public.mygrowth_material_list('{T}')"))
 def test_expiration_exactly_seven_days(self):self.assertEqual(self.sql(self.setup()+f"SELECT extract(epoch FROM expires_at-created_at)::int FROM public.mygrowth_material_tickets WHERE id='{K}';"),['604800'])
 def test_expired_ticket_denied(self):self.sql(self.setup()+f"UPDATE public.mygrowth_material_tickets SET expires_at=now()-interval '1 second' WHERE id='{K}';"+m.session(m.STAFF)+self.denied(f"public.mygrowth_material_redeem('{K}')"))
 def test_50mb_boundary(self):
  r=self.sql(m.session(m.A)+f"SELECT public.mygrowth_material_reserve('{T}','교육.pdf',52428800)->>'id' IS NOT NULL; DO $$ BEGIN PERFORM public.mygrowth_material_reserve('{T}','교육.pdf',52428801); RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;")
  self.assertEqual(r,['t'])
 def test_permanent_no_expiry_column(self):self.assertEqual(self.sql("SELECT count(*) FROM information_schema.columns WHERE table_name='mygrowth_materials' AND column_name IN ('expires_at','deleted_at');"),['0'])
 def test_no_direct_metadata_grants(self):self.assertEqual(self.sql("SELECT has_table_privilege('authenticated','public.mygrowth_materials','SELECT') OR has_table_privilege('authenticated','public.mygrowth_material_tickets','INSERT');"),['f'])
 def test_no_coaching_attachment(self):self.sql(m.session(m.A)+self.denied("public.mygrowth_material_reserve('f1000000-0000-4000-8000-000000000001','교육.pdf',12)"))
 def test_online_actual_time_and_cap(self):
  r=self.sql(m.session(m.STAFF)+"SELECT public.mygrowth_own_course_minutes('c0000000-0000-4000-8000-000000000001'); SELECT actual_minutes FROM public.mygrowth_learning_list() WHERE feed_key='elearning:f1000000-0000-4000-8000-000000000021';")
  self.assertEqual(r,['40','40'])
 def test_early_close_and_completion_values(self):self.assertEqual(self.sql(m.session(m.STAFF)+"SELECT actual_minutes,progress,completion_count FROM public.mygrowth_learning_list() WHERE feed_key='elearning:f2000000-0000-4000-8000-000000000001';"),['12|100|1'])
 def test_missing_time_not_replaced_by_minimum(self):self.assertEqual(self.sql(m.session(m.HQ)+"SELECT public.mygrowth_own_course_minutes('c0000000-0000-4000-8000-000000000001') IS NULL;"),['t'])
 def test_employee_transfer_removes_attended_source(self):self.assertEqual(self.sql(f"UPDATE public.profiles SET department_id='b0000000-0000-4000-8000-000000000012' WHERE user_id='{m.STAFF}';"+m.session(m.STAFF)+f"SELECT count(*) FROM public.mygrowth_learning_list() WHERE feed_key='attendance:{T}';"),['0'])
 def test_reads_leave_lms_unchanged(self):
  digest="SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.enrollments x; SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.course_learning_sessions x;"
  r=self.sql(digest+m.session(m.STAFF)+"SELECT public.mygrowth_employee_feed() IS NOT NULL; RESET ROLE;"+digest);self.assertEqual(r[:2],r[3:])
 def test_transferred_owner_cannot_read_or_write_plan(self):
  self.sql(f"UPDATE public.profiles SET department_id='b0000000-0000-4000-8000-000000000012' WHERE user_id='{m.STAFF}';"+m.session(m.STAFF)+self.denied("public.mygrowth_followup_detail('f0000000-0000-4000-8000-000000000003')")+self.denied("public.mygrowth_save_action_plan('f0000000-0000-4000-8000-000000000001','무단 계획','ko')"))
 def test_transfer_removes_scoped_plan_list(self):self.assertEqual(self.sql(f"UPDATE public.profiles SET department_id='b0000000-0000-4000-8000-000000000012' WHERE user_id='{m.STAFF}';"+m.session(m.A)+"SELECT count(*) FROM public.mygrowth_scoped_action_plans() WHERE plan_id='f0000000-0000-4000-8000-000000000003';"),['0'])
if __name__=='__main__':
 subprocess.run(['bash','scripts/mygrowth-draft-isolation.sh','verify'],check=True,stdout=subprocess.DEVNULL);unittest.main()