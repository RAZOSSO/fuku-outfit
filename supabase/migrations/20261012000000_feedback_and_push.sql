-- 何回実行しても大丈夫なように書いてある

-- 👎 のときの理由（「寒かった」など）
alter table public.outfits add column if not exists feedback text not null default '';

-- 毎朝の通知の登録先（端末ごと）
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  notify_time time not null default '07:00',
  timezone text not null default 'Asia/Tokyo',
  last_sent_date date,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
