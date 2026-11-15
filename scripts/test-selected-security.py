"""선택된 보안 규칙을 초안의 기존 예시 자료로 검사합니다."""
import subprocess
import unittest

class SelectedSecurity(unittest.TestCase):
    def sql(self, query):
        result = subprocess.run(['env', '-u', 'PGSERVICE', '-u', 'PGSERVICEFILE', 'psql',
                                'host=127.0.0.1 port=8004 user=supabase_admin dbname=postgres',
                                '-X', '-Atq', '-v', 'ON_ERROR_STOP=1'],
                                input=query, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip().splitlines()

    def test_four_function_paths_pinned(self):
        self.assertEqual(self.sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('move_to_dlq','read_email_batch','enqueue_email','delete_email') AND proconfig @> ARRAY['search_path=\"\"'];"), ['4'])

    def test_selected_policies_no_longer_unconditional(self):
        tables = ['comment_translations','migration_courses','learning_tracks_i18n',
                  'announcement_i18n','system_settings','certificate_templates',
                  'completion_criteria','board_post_i18n','track_stages_i18n',
                  'departments','course_target_departments','course_i18n']
        for table in tables:
            with self.subTest(table=table):
                self.assertEqual(self.sql(f"SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='{table}' AND (qual='true' OR with_check='true');"), ['0'])

    def test_thumbnail_requires_owner(self):
        self.assertEqual(self.sql("SELECT with_check LIKE '%owner_id%' AND with_check LIKE '%uid()%' FROM pg_policies WHERE schemaname='storage' AND policyname='Authenticated users can upload thumbnails';"), ['t'])

    def test_upload_owner_predicate(self):
        expression = self.sql("SELECT with_check FROM pg_policies WHERE schemaname='storage' AND policyname='Authenticated users can upload thumbnails';")[0]
        for owner, bucket, expected in [('b0000000-0000-4000-8000-000000000023','course-thumbnails','t'),
                                        ('b0000000-0000-4000-8000-000000000021','course-thumbnails','f'),
                                        ('b0000000-0000-4000-8000-000000000023','other-bucket','f')]:
            with self.subTest(owner=owner, bucket=bucket):
                self.assertEqual(self.sql(f"BEGIN; SET LOCAL request.jwt.claim.sub='b0000000-0000-4000-8000-000000000023'; SELECT {expression} FROM (SELECT '{owner}'::text AS owner_id, '{bucket}'::text AS bucket_id) objects; ROLLBACK;"), [expected])

    def test_settings_allowlist(self):
        expression = self.sql("SELECT qual FROM pg_policies WHERE tablename='system_settings' AND policyname='All authenticated users can read system settings';")[0]
        for key, expected in [('menu_visibility','t'),('teacher_role_enabled','t'),('private_setting','f')]:
            self.assertEqual(self.sql(f"BEGIN; SET LOCAL request.jwt.claim.sub='b0000000-0000-4000-8000-000000000023'; SELECT {expression} FROM (SELECT '{key}'::text AS key) settings; ROLLBACK;"), [expected])

    def test_unselected_policies_unchanged(self):
        self.assertEqual(self.sql("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('ui_translations','categories','badges') AND qual='true';"), ['3'])

    def test_student_parent_visibility_matches(self):
        pairs = [('course_i18n','course_id','courses'),
                 ('announcement_i18n','announcement_id','announcements'),
                 ('board_post_i18n','post_id','board_posts'),
                 ('learning_tracks_i18n','track_id','learning_tracks'),
                 ('track_stages_i18n','stage_id','track_stages')]
        for child, key, parent in pairs:
            with self.subTest(child=child):
                result=self.sql(f"BEGIN; SET LOCAL request.jwt.claim.sub='b0000000-0000-4000-8000-000000000023'; SET LOCAL ROLE authenticated; SELECT count(*) FROM public.{child} c WHERE NOT EXISTS (SELECT 1 FROM public.{parent} p WHERE p.id=c.{key}); ROLLBACK;")
                self.assertEqual(result, ['0'])

if __name__ == '__main__':
    unittest.main()