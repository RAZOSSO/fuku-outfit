-- 毎朝の通知のために、5分おきに suggest-outfit を呼ぶ（Supabase の SQL Editor で1回だけ実行）。
-- 実行前に2か所を書き換える:
--   <project-ref>   … Supabase の URL https://<ここ>.supabase.co の部分
--   <CRON_SECRET>   … Edge Functions → Secrets に登録した CRON_SECRET と同じ値
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'morning-outfit',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/suggest-outfit',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

-- 止めたいとき:  select cron.unschedule('morning-outfit');
