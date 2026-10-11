-- メールアドレスで作った既存のアカウントを、引き継ぎコード方式に切り替える（登録した服・写真はそのまま残る）。
-- Supabase の SQL Editor で、最後の行のメールアドレスを書き換えてから実行する。
-- 結果に表示される「引き継ぎコード」で、アプリの「前のデータを引き継ぐ」からログインできる。
with c as (
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(r.b, i) % 32 + 1, 1), '' order by i) as code
  from (select extensions.gen_random_bytes(16) as b) r, generate_series(0, 15) as i
  group by r.b
),
converted as (
  update auth.users u
  set email = 'fuku-user-' || lower(c.code) || '@example.com',
      encrypted_password = extensions.crypt(c.code, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(u.email_confirmed_at, now())
  from c
  where u.email = 'ここに今のメールアドレス'
  returning u.id, u.email, c.code
),
identities as (
  update auth.identities i
  set identity_data = i.identity_data || jsonb_build_object('email', converted.email)
  from converted
  where i.user_id = converted.id and i.provider = 'email'
)
select code as "引き継ぎコード" from converted;
