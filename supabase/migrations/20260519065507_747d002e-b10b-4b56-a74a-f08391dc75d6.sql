DO $$
DECLARE v_user_id uuid; v_dept_id uuid;
BEGIN
-- Row 2: chanki.jeon@nonfiction.com
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'chanki.jeon@nonfiction.com') THEN
    v_user_id := extensions.uuid_generate_v4();
    SELECT id INTO v_dept_id FROM public.departments WHERE code='SW' LIMIT 1;
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (v_user_id, '00000000-0000-0000-0000-000000000000', 'chanki.jeon@nonfiction.com', crypt('nonfiction1', gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', '전찬기', 'department_id', v_dept_id::text),
      'authenticated', 'authenticated');
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    VALUES (v_user_id, v_user_id, 'chanki.jeon@nonfiction.com', 'email',
      jsonb_build_object('sub', v_user_id::text, 'email', 'chanki.jeon@nonfiction.com'), now(), now(), now());
    UPDATE public.profiles SET full_name='전찬기', department_id=v_dept_id, email='chanki.jeon@nonfiction.com' WHERE user_id=v_user_id;
  END IF;

  -- Row 3: dahwon.kim@nonfiction.com
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dahwon.kim@nonfiction.com') THEN
    v_user_id := extensions.uuid_generate_v4();
    SELECT id INTO v_dept_id FROM public.departments WHERE code='SS' LIMIT 1;
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (v_user_id, '00000000-0000-0000-0000-000000000000', 'dahwon.kim@nonfiction.com', crypt('nonfiction1', gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', '김다훤', 'department_id', v_dept_id::text),
      'authenticated', 'authenticated');
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    VALUES (v_user_id, v_user_id, 'dahwon.kim@nonfiction.com', 'email',
      jsonb_build_object('sub', v_user_id::text, 'email', 'dahwon.kim@nonfiction.com'), now(), now(), now());
    UPDATE public.profiles SET full_name='김다훤', department_id=v_dept_id, email='dahwon.kim@nonfiction.com' WHERE user_id=v_user_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'teacher') ON CONFLICT DO NOTHING;
  END IF;

END $$;