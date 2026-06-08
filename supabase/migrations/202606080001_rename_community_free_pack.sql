begin;

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
values (
  'community-vol-1-free-pack',
  'community-vol-1-free-pack',
  'Community Vol. 1',
  'The "Community" series is a thank you to all the producers, artists, and creators. A small free collection made to give back to the same space that helped shape our journey.',
  'digital',
  0,
  'USD',
  'packs/Community Vol. 1.zip',
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

delete from order_items legacy
using order_items canonical
where legacy.product_id = 'sample-pack'
  and canonical.product_id = 'community-vol-1-free-pack'
  and canonical.order_id = legacy.order_id;

update order_items
set product_id = 'community-vol-1-free-pack'
where product_id = 'sample-pack';

delete from entitlements legacy
using entitlements canonical
where legacy.product_id = 'sample-pack'
  and canonical.product_id = 'community-vol-1-free-pack'
  and canonical.order_id = legacy.order_id;

update entitlements
set product_id = 'community-vol-1-free-pack'
where product_id = 'sample-pack';

delete from digital_fulfillments legacy
using digital_fulfillments canonical
where legacy.product_id = 'sample-pack'
  and canonical.product_id = 'community-vol-1-free-pack'
  and canonical.order_id = legacy.order_id;

update digital_fulfillments
set product_id = 'community-vol-1-free-pack'
where product_id = 'sample-pack';

delete from products
where id = 'sample-pack';

commit;
