"""기능 03 공통 성장 기록의 초안 전용 실제 권한 검사입니다. 모든 변경은 검사 후 되돌립니다."""
import subprocess
import unittest

REVIEWER = '11111111-1111-4111-8111-111111111111'
STUDENT = '22222222-2222-4222-8222-222222222222'
ADMIN = '33333333-3333-4333-8333-333333333333'
SUPER = '44444444-4444-4444-8444-444444444444'
MANAGER = '55555555-5555-4555-8555-555555555555'
ENROLLMENT_DONE = 'c0000000-0000-4000-8000-000000000011'
RECORD_SOURCE = 'a0000000-0000-4000-8000-000000000001'


def session(user):
    return f"RESET ROLE; SET LOCAL request.jwt.claim.sub='{user}'; SET LOCAL ROLE authenticated;"


class GrowthRecordRules(unittest.TestCase):
    def run_sql(self, body):
        sql = 'BEGIN;' + body + 'ROLLBACK;'
        run = subprocess.run(['env', '-u', 'PGSERVICE', '-u', 'PGSERVICEFILE', 'psql',
            'host=127.0.0.1 port=8004 user=supabase_admin dbname=postgres',
            '-X', '-Atq', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        return run.stdout.strip().splitlines()

    def test_reviewer_reads_own_records(self):
        rows = self.run_sql(session(REVIEWER) + "SELECT count(*) FROM public.mygrowth_records;")
        self.assertEqual(rows, ['3'])

    def test_non_reviewers_read_nothing(self):
        for user in (STUDENT, ADMIN, SUPER, MANAGER):
            rows = self.run_sql(session(user) + "SELECT count(*) FROM public.mygrowth_records;")
            self.assertEqual(rows, ['0'], user)

    def test_non_reviewers_cannot_write(self):
        self.run_sql(session(ADMIN) + "DO $$ BEGIN INSERT INTO public.mygrowth_records(user_id,record_type,source_table,source_id,title) VALUES(auth.uid(),'field_coaching','x',gen_random_uuid(),'무단 기록'); RAISE EXCEPTION '차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")

    def test_same_source_not_duplicated(self):
        # 일반 계정의 쓰기는 먼저 차단되고, 서버 권한에서도 같은 원본은 중복 저장되지 않습니다.
        self.run_sql(session(REVIEWER) + "DO $$ BEGIN INSERT INTO public.mygrowth_records(user_id,record_type,source_table,source_id,title) VALUES(auth.uid(),'offline_training','mygrowth_events','" + RECORD_SOURCE + "','중복 시도'); RAISE EXCEPTION '쓰기 차단 실패'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;")
        self.run_sql("RESET ROLE; DO $$ BEGIN INSERT INTO public.mygrowth_records(user_id,record_type,source_table,source_id,title) VALUES('" + REVIEWER + "','offline_training','mygrowth_events','" + RECORD_SOURCE + "','중복 시도'); RAISE EXCEPTION '중복 차단 실패'; EXCEPTION WHEN unique_violation THEN NULL; END $$;")

    def test_feed_combines_records_and_elearning(self):
        rows = self.run_sql(session(REVIEWER) + "SELECT record_type, count(*) FROM public.mygrowth_record_feed() GROUP BY record_type ORDER BY record_type;")
        self.assertEqual(rows, ['elearning|2', 'field_coaching|1', 'manager_coaching|1', 'offline_training|1'])

    def test_feed_has_stable_elearning_key(self):
        rows = self.run_sql(session(REVIEWER) + f"SELECT feed_key FROM public.mygrowth_record_feed() WHERE feed_key='elearning:{ENROLLMENT_DONE}';")
        self.assertEqual(rows, [f'elearning:{ENROLLMENT_DONE}'])

    def test_feed_denied_for_non_reviewers(self):
        rows = self.run_sql(session(STUDENT) + "SELECT count(*) FROM public.mygrowth_record_feed();")
        self.assertEqual(rows, ['0'])

    def test_elearning_reference_is_read_only(self):
        body = session(REVIEWER) + (
            "SELECT progress, completion_count FROM public.enrollments WHERE id='" + ENROLLMENT_DONE + "';"
            "SELECT count(*) FROM public.mygrowth_record_feed();"
            "SELECT count(*) FROM public.mygrowth_elearning_reference();"
            "RESET ROLE; SELECT progress, completion_count FROM public.enrollments WHERE id='" + ENROLLMENT_DONE + "';"
        )
        rows = self.run_sql(body)
        self.assertEqual(rows[0], '100|1')
        self.assertEqual(rows[-1], '100|1')

    def test_feed_denied_after_reviewer_revoked(self):
        rows = self.run_sql(
            f"RESET ROLE; DELETE FROM public.mygrowth_reviewers WHERE user_id='{REVIEWER}';"
            + session(REVIEWER)
            + "SELECT count(*) FROM public.mygrowth_record_feed(), (SELECT count(*) FROM public.mygrowth_records) AS r;"
        )
        self.assertEqual(rows, ['0'])


if __name__ == '__main__':
    subprocess.run(['bash', 'scripts/mygrowth-draft-isolation.sh', 'verify'], check=True, stdout=subprocess.DEVNULL)
    unittest.main()
