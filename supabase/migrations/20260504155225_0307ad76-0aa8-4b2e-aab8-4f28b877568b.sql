UPDATE public.course_contents
SET content_type = 'media_package'
WHERE id IN (SELECT DISTINCT content_id FROM public.media_package_items)
  AND content_type <> 'media_package';