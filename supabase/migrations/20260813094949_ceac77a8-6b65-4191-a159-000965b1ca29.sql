UPDATE public.profiles p
SET full_name = COALESCE(
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      split_part(u.email, '@', 1)
    ),
    updated_at = now()
FROM auth.users u
WHERE u.id = p.user_id
  AND (p.full_name IS NULL OR btrim(p.full_name) = '' OR btrim(p.full_name) = '사용자')
  AND COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(u.raw_user_meta_data->>'name',''), split_part(u.email,'@',1)) <> '사용자';