ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS name_ja text,
  ADD COLUMN IF NOT EXISTS name_zh_cn text,
  ADD COLUMN IF NOT EXISTS name_yue text;