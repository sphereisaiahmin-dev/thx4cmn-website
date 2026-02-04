# thx4cmn-website

Base architecture + starter site for thx4cmn using Next.js App Router, Supabase, Cloudflare R2, and Stripe.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env vars:
   ```bash
   cp .env.example .env.local
   ```
3. Fill in the env vars (see list below).
4. Run the dev server:
   ```bash
   npm run dev
   ```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_URL` | Supabase project URL (server client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key for server routes |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PRICE_SAMPLE_PACK` | Stripe price ID for the sample pack |
| `NEXT_PUBLIC_STRIPE_PRICE_MIDI_DEVICE` | Stripe price ID for the hardware device |
| `R2_ENDPOINT` | Cloudflare R2 S3 endpoint |
| `R2_ACCESS_KEY_ID` | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `R2_BUCKET` | R2 bucket name |

## Stripe webhook setup

1. Install Stripe CLI.
2. Run:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
3. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

## Supabase setup

See `supabase/README.md` for schema details and setup steps.

## R2 setup

1. Create an R2 bucket and access keys.
2. Set `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`.
3. Upload the sample pack zip to the key referenced in `src/data/products.ts`.
4. For the web audio player, upload `.mp3` files under the `music/` prefix and ensure the bucket
   allows GET/HEAD requests (including Range requests) from your site origin so the signed URLs can
   stream and seek in the browser.

## Deployment (Vercel)

- Add all env vars from `.env.example` in Vercel project settings.
- Ensure the webhook endpoint is registered in Stripe for production.
- Supabase service role key must remain server-only.

## How downloads work

`/api/download` verifies entitlements in Supabase and returns a signed R2 URL. The digital
product entitlement is created when Stripe sends `checkout.session.completed`.

## How the web audio player works

The web audio player loads its track list from `/api/music/list` and requests short-lived signed
URLs from `/api/music/signed-url` for playback. The server signs the URLs using the same R2
credentials listed in `.env.example`, so keep those secrets server-only.
