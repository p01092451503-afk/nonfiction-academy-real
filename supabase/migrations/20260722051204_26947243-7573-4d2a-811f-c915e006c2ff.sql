UPDATE public.notifications
SET message_i18n = jsonb_build_object(
  'ko', '[왼쪽 메뉴 탭 > 강의 탐색 > Best Practice 탭]에 접속하셔서 지금 바로 확인해 보세요!',
  'en', 'Go to [Left Menu > Browse Courses > Best Practice tab] and check it out now!',
  'ja', '[左メニュー > 講座を探す > Best Practice タブ] にアクセスして、今すぐご確認ください！',
  'zh-CN', '请前往[左侧菜单 > 浏览课程 > Best Practice 标签]立即查看！',
  'yue', '請前往[左邊選單 > 瀏覽課程 > Best Practice 分頁]立即查看！'
)
WHERE title = 'Scent Curation Tip 컨텐츠 NEW OPEN! 🎉'
  AND message = '[왼쪽 메뉴 탭 > 강의 탐색 > Best Practice 탭]에 접속하셔서 지금 바로 확인해 보세요!';

UPDATE public.notifications
SET title_i18n = title_i18n || jsonb_build_object(
  'yue', '香氛策展貼士內容全新登場！🎉'
)
WHERE title = 'Scent Curation Tip 컨텐츠 NEW OPEN! 🎉'
  AND (title_i18n->>'yue') IS NULL;