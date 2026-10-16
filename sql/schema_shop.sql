-- Run this in Supabase -> SQL Editor (after, or instead of, schema.sql)

-- ===== Profiles (one per auth user, holds the role) =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill users that already exist
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ===== Products (the software services you resell) =====
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  category text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD',
  billing_type text not null default 'one_time' check (billing_type in ('one_time','monthly','yearly')),
  fulfillment_type text not null default 'license_key' check (fulfillment_type in ('license_key','manual')),
  stock integer check (stock is null or stock >= 0),   -- null = unlimited
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ===== Orders =====
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','paid','fulfilled','cancelled','failed')),
  total_cents integer not null check (total_cents >= 0),
  currency text not null,
  payment_provider text,
  payment_reference text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  unit_price_cents integer not null,
  quantity integer not null check (quantity > 0)
);

-- ===== Licenses / delivered services =====
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id),
  license_key text,
  delivery_details text,        -- credentials / instructions you deliver manually
  status text not null default 'active' check (status in ('active','pending_delivery','revoked')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_idx on public.orders(user_id);
create index if not exists licenses_user_idx on public.licenses(user_id);
create index if not exists licenses_order_idx on public.licenses(order_id);

-- ===== Row Level Security (the server uses the service role for writes) =====
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.licenses enable row level security;

create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "active products are public" on public.products for select using (active = true);
create policy "own orders" on public.orders for select using (auth.uid() = user_id);
create policy "own order items" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "own licenses" on public.licenses for select using (auth.uid() = user_id);

-- ===== Make yourself admin (replace the email, run after you signed up) =====
-- update public.profiles set role = 'admin' where email = 'you@example.com';
