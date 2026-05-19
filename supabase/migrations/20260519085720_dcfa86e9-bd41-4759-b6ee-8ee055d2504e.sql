-- 레거시 course_content_i18n 데이터 정리
-- course_contents 행 자체가 언어별로 분리(language_code 컬럼)되어 있어
-- 별도 i18n 테이블에 저장된 placeholder/중복 데이터는 잘못된 fallback 의 원인이 되어 제거한다.
DELETE FROM public.course_content_i18n;