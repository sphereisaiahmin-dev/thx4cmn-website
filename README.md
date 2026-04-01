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
| `APP_ORIGIN` | Canonical site origin for production checkout redirects (e.g. `https://thx4cmn.com`) |
| `NEXT_PUBLIC_STRIPE_PRICE_SAMPLE_PACK` | Stripe price ID for the sample pack |
| `NEXT_PUBLIC_STRIPE_PRICE_MIDI_DEVICE` | Stripe price ID for the hardware device |
| `R2_ENDPOINT` | Cloudflare R2 S3 endpoint |
| `R2_ACCESS_KEY_ID` | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `R2_BUCKET` | R2 bucket name |

Security note:
If credentials were ever committed with real values, rotate them immediately in Stripe, Supabase, and R2 before deploying.

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

## Web player local verification

Run a single end-to-end verification command:

```bash
npm run verify:webplayer
```

This boots the app locally, uses Playwright in headless Chromium, and checks:
- play/pause
- reverse toggling while playing and paused
- next/prev after reverse interactions
- rpm slider range mapping
- no `Loading track...` status on reverse-only toggles

For local/dev environments without R2 credentials, the music API automatically falls back to the local fixture track at `audiowebplayer/Dreams Come True.mp3`.

## Device protocol v1 tests

Protocol spec: `docs/device-protocol-v1.md`

Run website serial-client tests:

```bash
npm run test:device-serial
```

Run firmware parser tests:

```bash
npm run test:device-firmware
```

Run both:

```bash
npm run test:device-protocol
```

## Device bootstrap provisioning

Use the bootstrap flow for blank Pico / Pico 2 boards that are only showing the UF2 bootloader drive:

```bash
npm run build:firmware-bootstrap
npm run deploy:firmware-bootstrap -- --drive E:
```

If the target is an RP2350 bootloader drive, pass the exact board so the script can install the
correct official CircuitPython runtime before provisioning hx01:

```bash
npm run deploy:firmware-bootstrap -- --drive E: --board pico2
npm run deploy:firmware-bootstrap -- --drive E: --board pico2_w
```

If a previously provisioned board immediately boots back into old CircuitPython code and never
remounts `CIRCUITPY`, the Windows deploy flow can erase the stale filesystem over the CDC console
and retry the mount automatically:

```bash
npm run deploy:firmware-bootstrap -- --drive E: --board pico2 --console-port COM7
```

This stages the full `thxcmididevicecode/` CircuitPython filesystem payload, including `lib/**/*`,
and copies only the managed hx01 files onto a mounted `CIRCUITPY` drive. The existing
`build:firmware-package` and website "Update Me" flow remain update-only for already-provisioned
devices.

Run bootstrap tooling tests:

```bash
npm run test:firmware-bootstrap
```
