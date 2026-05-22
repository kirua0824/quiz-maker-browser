create table if not exists public.quiz_decks (
  id text primary key,
  title text not null,
  badge text not null default '',
  description text not null default '',
  status text not null default 'pending',
  source_type text not null default 'supabase',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id text not null references public.quiz_decks(id) on delete cascade,
  genre text not null default '未分類',
  question text not null,
  answers jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.quiz_decks enable row level security;
alter table public.quiz_cards enable row level security;

create policy "read quiz decks"
  on public.quiz_decks
  for select
  using (true);

create policy "read quiz cards"
  on public.quiz_cards
  for select
  using (true);

create index if not exists quiz_cards_deck_sort_idx
  on public.quiz_cards (deck_id, sort_order);
