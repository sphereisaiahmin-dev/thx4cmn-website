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

insert into products (
  id,
  slug,
  name,
  description,
  type,
  price_cents,
  currency,
  r2_key,
  active
)
values
  (
    'sample-pack',
    'sample-pack',
    'Community Vol. 1',
    'Downloadable sample pack with curated drum, texture, and instrument sounds from the lab.',
    'digital',
    0,
    'USD',
    'packs/Community Vol. 1.zip',
    true
  ),
  (
    'universe-vol-1',
    'universe-vol-1',
    'Universe Vol. 1',
    'Downloadable melody pack with spaced-out keys, cosmic textures, and celestial loops built for wide, atmospheric ideas.',
    'digital',
    3000,
    'USD',
    'packs/Universe Vol. 1.zip',
    true
  )
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  type = excluded.type,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  r2_key = coalesce(excluded.r2_key, products.r2_key),
  active = excluded.active;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null check (email = lower(email) and position('@' in email) > 1),
  stripe_customer_id text unique,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  stripe_session_id text unique not null,
  stripe_customer_id text,
  stripe_customer_email text,
  status text,
  amount_total_cents integer,
  currency text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table orders add column if not exists customer_id uuid references customers(id) on delete set null;
alter table orders add column if not exists stripe_customer_id text;
alter table orders add column if not exists updated_at timestamp with time zone default now();

create index if not exists orders_customer_id_idx on orders(customer_id);
create index if not exists orders_stripe_customer_email_idx on orders(stripe_customer_email);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id text references products(id),
  quantity integer not null,
  unit_amount_cents integer not null
);

create unique index if not exists order_items_order_product_key on order_items(order_id, product_id);

create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id text references products(id),
  download_count integer default 0,
  download_token_hash text,
  expires_at timestamp with time zone,
  last_downloaded_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table entitlements add column if not exists download_token_hash text;
alter table entitlements add column if not exists last_downloaded_at timestamp with time zone;
alter table entitlements add column if not exists updated_at timestamp with time zone default now();

create unique index if not exists entitlements_order_product_key on entitlements(order_id, product_id);
create unique index if not exists entitlements_download_token_hash_key
  on entitlements(download_token_hash)
  where download_token_hash is not null;

create table if not exists digital_fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id text references products(id),
  recipient_email text,
  delivery_method text not null default 'email',
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table digital_fulfillments alter column provider set default 'resend';
alter table digital_fulfillments add column if not exists provider_message_id text;

create unique index if not exists digital_fulfillments_order_product_key
  on digital_fulfillments(order_id, product_id);
create index if not exists digital_fulfillments_status_idx on digital_fulfillments(status);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_customers_updated_at on customers;
create trigger set_customers_updated_at
  before update on customers
  for each row
  execute function set_updated_at();

drop trigger if exists set_orders_updated_at on orders;
create trigger set_orders_updated_at
  before update on orders
  for each row
  execute function set_updated_at();

drop trigger if exists set_entitlements_updated_at on entitlements;
create trigger set_entitlements_updated_at
  before update on entitlements
  for each row
  execute function set_updated_at();

drop trigger if exists set_digital_fulfillments_updated_at on digital_fulfillments;
create trigger set_digital_fulfillments_updated_at
  before update on digital_fulfillments
  for each row
  execute function set_updated_at();
