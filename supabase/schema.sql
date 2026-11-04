-- Reachy: run once in the Supabase SQL editor.
create table if not exists public.games (
  id             text primary key,                       -- short slug used in /game/[id]
  created_at     timestamptz not null default now(),
  prompt         text not null default '',
  config         jsonb not null,                         -- validated GameConfig
  image_url      text not null,
  token_address  text unique,                            -- set after launch
  tx_hash        text,
  creator        text not null,                          -- wallet address or platform wallet
  status         text not null default 'pending' check (status in ('pending','live','failed')),
  error          text
);

create index if not exists games_feed_idx on public.games (status, created_at desc);

-- The app only talks to this table with the service-role key from server routes.
-- RLS on with no policies = the anon key can read/write nothing.
alter table public.games enable row level security;

-- Public bucket for 256x256 hero images (also the token logo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-images', 'game-images', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- v2 tables: see migrations/002_events.sql (run it after this file).
