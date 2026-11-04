-- Reachy v2: persistent activity / proof / error log. Run once in the Supabase SQL editor.
create table if not exists public.events (
  id          text primary key,                 -- "<txHash>:<logIndex>" for chain events (dedupes), random for others
  created_at  timestamptz not null default now(),  -- block time for trades
  kind        text not null check (kind in ('launch','buy','sell','settle','error')),
  level       text not null default 'info' check (level in ('info','error')),
  game_id     text references public.games(id) on delete set null,
  token       text,
  tx_hash     text,
  actor       text,                             -- trader / creator address
  message     text not null default '',
  data        jsonb not null default '{}'::jsonb
);

create index if not exists events_game_time_idx on public.events (game_id, created_at);
create index if not exists events_time_idx on public.events (created_at desc);
create index if not exists events_kind_time_idx on public.events (kind, created_at desc);

-- Only the server (secret key) reads and writes; the anon/publishable key gets nothing.
alter table public.events enable row level security;
