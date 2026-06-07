alter table entitlement_download_tokens
  add column if not exists max_downloads integer not null default 10;

create index if not exists entitlement_download_tokens_expires_at_idx
  on entitlement_download_tokens(expires_at);
