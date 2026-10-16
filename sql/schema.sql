-- Run this in Supabase -> SQL Editor

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.items enable row level security;

create policy "Users can read own items"
  on public.items for select using (auth.uid() = user_id);

create policy "Users can insert own items"
  on public.items for insert with check (auth.uid() = user_id);

create policy "Users can update own items"
  on public.items for update using (auth.uid() = user_id);

create policy "Users can delete own items"
  on public.items for delete using (auth.uid() = user_id);
