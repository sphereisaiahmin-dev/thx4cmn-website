# Supabase setup

1. Create a new Supabase project.
2. Apply migrations from `supabase/migrations`, or run the SQL in `schema.sql` in the SQL editor.
3. Confirm the `products` table includes the IDs from `src/data/products.ts`.

The API routes use the service role key for server-side writes (customers, orders, entitlements,
and fulfillment tracking). Keep it private.

For Supabase CLI migration deployment, set `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and
`SUPABASE_DB_PASSWORD` locally. These are deployment credentials, not browser/runtime values.
