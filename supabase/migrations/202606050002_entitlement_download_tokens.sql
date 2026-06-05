create table if not exists entitlement_download_tokens (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references entitlements(id) on delete cascade,
  token_hash text unique not null,
  purpose text not null default 'email' check (purpose in ('email', 'checkout_return')),
  download_count integer not null default 0,
  expires_at timestamp with time zone,
  last_downloaded_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists entitlement_download_tokens_entitlement_id_idx
  on entitlement_download_tokens(entitlement_id);
create index if not exists entitlement_download_tokens_purpose_idx
  on entitlement_download_tokens(purpose);

drop trigger if exists set_entitlement_download_tokens_updated_at on entitlement_download_tokens;
create trigger set_entitlement_download_tokens_updated_at
  before update on entitlement_download_tokens
  for each row
  execute function set_updated_at();
