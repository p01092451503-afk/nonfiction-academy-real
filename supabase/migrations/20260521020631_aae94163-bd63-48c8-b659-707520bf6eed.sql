-- Assign all "[데모]" prefixed courses to the demonstration category and publish them
UPDATE public.courses
SET category_id = '6ef965b9-d1e0-4f07-bf79-6d73511cc99d',
    status = 'published'
WHERE title LIKE '[데모]%'
  AND (category_id IS NULL OR category_id <> '6ef965b9-d1e0-4f07-bf79-6d73511cc99d' OR status <> 'published');