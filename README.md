# Restaurant OS

Multi-tenant restaurant management SaaS: touch POS, kitchen display, orders & receipts, cash shifts, menu, tables, inventory with recipes, purchasing, customers & loyalty, reports with CSV export, staff/roles/branches/devices, billing plans, a public customer order board, and an operator console for the platform owner.

**Stack:** Next.js 15 (App Router, Server Actions) · React 19 · TypeScript (strict) · Tailwind CSS v4 · MongoDB 6+ (Mongoose) · SMTP (Nodemailer) · Cloudflare R2 · zod.

## Quick start

Requires Node 20+ and MongoDB 6.0+ running as a **replica set** (transactions need it; a single-node set is fine).

```bash
npm install
docker compose up -d mongo      # single-node replica set "rs0" on localhost:27017
cp .env.example .env            # set MONGODB_URI, APP_SECRET
npm run db:migrate              # creates indexes, default plans, syncs built-in roles (idempotent)
npm run db:seed                 # demo restaurant + a day of orders
npm run platform:create-admin  # creates the platform admin using PLATFORM_ADMIN_* from .env
npm run dev                     # http://localhost:3000
```

No MongoDB handy? `MONGODB_URI=memory npm run dev` uses an in-process engine for a quick look. Data lives only in that process (so `db:seed` from another process won't be visible) and is lost on restart. Never use it in production.

Demo logins (printed by the seed): `demo@restaurant-os.test` (owner) and `manager@restaurant-os.test`, password `Savanna-Orchid-2026!`.
Set `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` in `.env`, then run `npm run platform:create-admin` once to create an operator for `/platform/login`. This command never resets an existing admin password.

## Production

1. Provision MongoDB 6+ as a replica set (Atlas works as is). Set `MONGODB_URI`, `MONGODB_DB`, a long random `APP_SECRET` (`openssl rand -base64 48`) and `APP_URL`. Set `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` and create the initial admin with `npm run platform:create-admin`.
2. `npm run db:migrate` on every deploy (ensures indexes, seeds default plans, re-syncs built-in roles). It is idempotent.
3. `docker build -t restaurant-os .` and run with `--env-file .env`. A `migrate` build target exists for the one-off job.
4. Put it behind HTTPS (cookies use the `__Host-` prefix in production). Health check: `GET /api/health`.

Configure `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` (plus optional SMTP auth) to email staff invitations. Configure all `R2_*` values to enable product image uploads to Cloudflare R2; use a public HTTPS URL for `R2_PUBLIC_URL`.

### Paystack

* **Subscriptions** (your platform account): set `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` in `.env`, and add `{APP_URL}/api/webhooks/paystack` as the webhook in your Paystack dashboard.
* **Restaurants' customer payments**: the super admin opens the restaurant in the operator console (`/platform` → Organisations → the restaurant → *Paystack*), pastes that restaurant's public and secret keys, and gives the restaurant the webhook URL shown there to set in their own Paystack dashboard. Owners never see or enter keys. No server config needed.

## Scripts

| | |
|---|---|
| `npm test` | Domain + integration tests on the in-memory engine; set `MONGODB_TEST_URI` to run the same suite against a real replica set (pricing, orders, inventory, reports, admin, auth, platform) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | Renders views with fixture data to `.preview/` and screenshots them (light/dark/mobile) |

## Documentation

* `docs/ARCHITECTURE.md` — layers, data model, auth, tenancy, realtime, how to add a module
* `docs/AUDIT.md` — what the original system did, and what changed and why
* `docs/MIGRATION.md` — moving data from the original MongoDB system
* `docs/DESIGN-SYSTEM.md` — tokens, components, UI rules
* `docs/CONVENTIONS.md` — coding rules (read before contributing)
* `docs/SECURITY.md` — what is protected, what you must configure, and what is *not* covered
* `docs/STATUS.md` — **what is verified, what is not, and what is deliberately out of scope**


## QR ordering & guest rooms

- **Menu → QR codes**: one printable card per table; guests scan, order from the live menu, and the order joins that table's bill (kitchen display shows it). Settings: on/off, auto-send vs staff-confirm.
- **Rooms** (Professional/Enterprise): room types and rates, rooms, bookings, check-in (issues a 6-digit room-service code), folio with room-service charges, payments, check-out. Each room has a QR code for room service at `/r/{token}`.
- Set `APP_URL` to your public https URL before printing: it is baked into every QR code.
