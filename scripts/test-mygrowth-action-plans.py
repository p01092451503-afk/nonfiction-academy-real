"""초안 전용 직원 실행 계획 규칙 검사입니다. 모든 검사 자료는 되돌립니다."""
import unittest
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
spec=spec_from_file_location('training',Path(__file__).with_name('test-mygrowth-training.py'))
m=module_from_spec(spec);spec.loader.exec_module(m)
spec2=spec_from_file_location('manager',Path(__file__).with_name('test-mygrowth-manager-coaching.py'))
mc=module_from_spec(spec2);spec2.loader.exec_module(mc)
ADMIN='33333333-3333-4333-8333-333333333333'
T0=f"(SELECT id FROM public.mygrowth_trainings WHERE request_id='{m.KEY}')"
T="current_setting('t.id')::uuid"
PIN=f"RESET ROLE; SELECT set_config('t.id',{T0}::text,true) IS NOT NULL;"
ATT=lambda who: m.session(who)+f"SELECT public.mygrowth_attendance_save({T},ARRAY['{m.A}','{m.STAFF}']::uuid[],0);"
SAVE=lambda body='매장 응대 순서를 매일 적용합니다': f"public.mygrowth_save_action_plan({T},'{body}','ko')"
def edu():return m.session(m.HQ)+f"SELECT {m.create()};"+PIN+ATT(m.HQ)
def mgr():return m.session(m.A)+f"SELECT {mc.create()};"+PIN+ATT(m.A)
class PlanRules(unittest.TestCase):
    sql=lambda self,b:m.TrainingRules().sql(b)
    denied=lambda self,c:m.TrainingRules().denied(c)
    def test_save_and_readback(self):
        r=self.sql(edu()+m.session(m.STAFF)+f"SELECT {SAVE()} IS NOT NULL; SELECT {SAVE('수정본')} IS NOT NULL; SELECT body FROM public.mygrowth_my_action_plans() WHERE training_id={T};")
        self.assertEqual(r[-1],'수정본')
    def test_not_attended_denied(self):
        self.sql(m.session(m.HQ)+f"SELECT {m.create()};"+PIN+m.session(m.STAFF)+self.denied(SAVE()))
    def test_no_direct_table_access(self):
        self.sql(edu()+m.session(m.STAFF)+"DO $$ BEGIN PERFORM 1 FROM public.mygrowth_action_plans; RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")
    def test_unassigned_admin_denied(self):
        r=self.sql(edu()+m.session(m.STAFF)+f"SELECT {SAVE()} IS NOT NULL;"+m.session(ADMIN)+self.denied(SAVE())+"SELECT count(*) FROM public.mygrowth_scoped_action_plans(); SELECT count(*) FROM public.mygrowth_my_action_plans();")
        self.assertEqual(r[-2:],['0','0'])
    def test_other_employee_cannot_write_or_read(self):
        r=self.sql(edu()+m.session(m.STAFF)+f"SELECT {SAVE()} IS NOT NULL;"+m.session(m.B)+self.denied(SAVE())+f"SELECT count(*) FROM public.mygrowth_scoped_action_plans() WHERE training_id={T}; SELECT count(*) FROM public.mygrowth_my_action_plans() WHERE training_id={T};")
        self.assertEqual(r[-2:],['0','0'])
    def test_scoped_trainer_reads(self):
        r=self.sql(edu()+m.session(m.STAFF)+f"SELECT {SAVE()} IS NOT NULL;"+m.session(m.A)+f"SELECT count(*) FROM public.mygrowth_scoped_action_plans() WHERE training_id={T};")
        self.assertEqual(r[-1],'1')
    def test_manager_plan_hidden_from_education_team(self):
        r=self.sql(mgr()+m.session(m.STAFF)+f"SELECT {SAVE()} IS NOT NULL;"+m.session(m.HQ)+f"SELECT count(*) FROM public.mygrowth_scoped_action_plans() WHERE training_id={T};"+m.session(m.A)+f"SELECT count(*) FROM public.mygrowth_scoped_action_plans() WHERE training_id={T};")
        self.assertEqual(r[-2:],['0','1'])
    def test_learning_and_attendance_unchanged(self):
        r=self.sql(edu()+"RESET ROLE; SELECT (SELECT count(*) FROM public.content_progress)||'/'||(SELECT count(*) FROM public.mygrowth_training_attendance_audit);"+m.session(m.STAFF)+f"SELECT {SAVE()} IS NOT NULL; RESET ROLE; SELECT (SELECT count(*) FROM public.content_progress)||'/'||(SELECT count(*) FROM public.mygrowth_training_attendance_audit); SELECT string_agg(attendance_status,',') FROM public.mygrowth_training_targets WHERE training_id={T};")
        self.assertEqual(r[-4],r[-2]);self.assertEqual(r[-1],'attended,attended')
if __name__=='__main__':unittest.main()
