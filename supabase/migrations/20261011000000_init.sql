-- ユーザーごとの設定（地域・好み）
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  place_name text not null default '東京',
  latitude double precision not null default 35.6895,
  longitude double precision not null default 139.6917,
  style_notes text not null default '',
  updated_at timestamptz not null default now()
);

-- 手持ちの服
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  photo_path text,
  name text not null,
  category text not null check (category in ('tops', 'bottoms', 'outer', 'onepiece', 'shoes', 'accessory')),
  color text not null default '',
  material text not null default '',
  warmth smallint not null default 3 check (warmth between 1 and 5),
  rain_ok boolean not null default false,
  formality smallint not null default 3 check (formality between 1 and 5),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index items_user_idx on public.items (user_id);

-- 提案された服装（worn = 実際に着たもの）
create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  item_ids uuid[] not null,
  comment text not null default '',
  tips text not null default '',
  weather jsonb not null,
  worn boolean not null default false,
  rating smallint check (rating in (-1, 1)),
  created_at timestamptz not null default now()
);
create index outfits_user_date_idx on public.outfits (user_id, date desc);

-- 自分の行だけ読み書きできるようにする
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.outfits enable row level security;

create policy "own profile" on public.profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own items" on public.items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own outfits" on public.outfits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 服の写真（非公開バケット。パスは <user_id>/<ファイル名>）
insert into storage.buckets (id, name, public) values ('clothes', 'clothes', false);

create policy "own photos select" on storage.objects for select
  using (bucket_id = 'clothes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos insert" on storage.objects for insert
  with check (bucket_id = 'clothes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete
  using (bucket_id = 'clothes' and (storage.foldername(name))[1] = auth.uid()::text);
