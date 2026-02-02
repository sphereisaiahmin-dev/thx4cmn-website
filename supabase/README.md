# Supabase setup

1. Create a new Supabase project.
2. Run the SQL in `schema.sql` in the SQL editor.
3. Optionally seed the `products` table with the IDs from `src/data/products.ts`.

The API routes use the service role key for server-side writes (orders + entitlements). Keep it
private.
