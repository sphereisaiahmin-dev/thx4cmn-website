create extension if not exists pgcrypto;

create table if not exists products (
  id text primary key,
  slug text unique not null,
  name text not null,
  description text,
  type text not null check (type in ('digital', 'physical')),
  price_cents integer not null,
  currency text not null default 'USD',
  stripe_price_id text,
  r2_key text,
  active boolean not null default true,
  created_at timestamp with time zone default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique not null,
  stripe_customer_email text,
  status text,
  amount_total_cents integer,
  currency text,
  created_at timestamp with time zone default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id text references products(id),
  quantity integer not null,
  unit_amount_cents integer not null
);

create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id text references products(id),
  download_count integer default 0,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now()
);
