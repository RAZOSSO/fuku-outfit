-- 何回実行しても大丈夫なように書いてある

-- 洗濯中・クリーニング中の服（提案に使わない）
alter table public.items add column if not exists unavailable boolean not null default false;

-- 前の晩の通知（明日の服）。evening_time が空ならその端末には送らない
alter table public.push_subscriptions add column if not exists evening_time time;
alter table public.push_subscriptions add column if not exists last_evening_date date;
