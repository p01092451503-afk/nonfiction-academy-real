UPDATE auth.users
SET email = '34bus@webheads.co.kr',
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('email', '34bus@webheads.co.kr'),
    updated_at = now()
WHERE id = '7f69eead-26cf-4912-9a31-7c472be64613';

UPDATE auth.identities
SET identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object('email', '34bus@webheads.co.kr'),
    updated_at = now()
WHERE user_id = '7f69eead-26cf-4912-9a31-7c472be64613';

UPDATE public.profiles
SET email = '34bus@webheads.co.kr',
    updated_at = now()
WHERE user_id = '7f69eead-26cf-4912-9a31-7c472be64613';