# Architecture

## Shape

One Next.js app, one database, modular monolith. `src/platform` is the shared kernel; `src/modules/<name>` are vertical slices (schema → service → actions → views); `src/app` holds thin routes.

```
route (src/app)  →  view (modules/*/views)  →  action (modules/*/actions.ts)  →  service (modules/*/service.ts)  →  db
```

Modules: `menu`, `orders` (pricing, lifecycle, kitchen, payments, shifts), `inventory` (ledger, recipes, purchasing), `customers` (+loyalty), `reports`, `admin` (floor, staff, invitations, roles, branches, devices, settings, audit, displays, onboarding), `identity`, `organizations`, `billing`, `platform-admin`.

## Multi-tenancy

* Every tenant collection carries `orgId` and its indexes lead with it. MongoDB has no foreign keys, so isolation is enforced in code: every service query filters by `ctx.org.id`, and references supplied by a client (product, table, customer ids…) are looked up with the org filter, so a foreign id is simply NotFound.
Branch-scoped data is additionally guarded: branch-scoped data is additionally guarded by `requireBranch(ctx, id)` against the branches the user is assigned to.
* The operator console has its own users, sessions and cookie and never shares a code path with tenant `Ctx`.

## Request lifecycle

`getCtx()` loads, on every request, session → user → role → permissions → plan → subscription → branches. Nothing authorisation-related lives in a token, so role changes, disabling a user or suspending an organisation take effect immediately.

`defineAction({schema, permission, feature, handler})` wraps every mutation: authenticate → read-only billing check → permission → plan feature → zod validation → **one DB transaction** around the handler → typed `ActionResult` (never throws to the client). `requirePage()` does the same for pages.

## Data store

`src/platform/store` is a small document-store interface (`Db`, `Collection`: find/findOne/count/insert/update/findOneAndUpdate/delete, `tx()`). Two engines implement it: `mongo.ts` (Mongoose models, sessions for transactions, unique/partial indexes from `indexes.ts`) and `memory.ts` (dev/tests). Services never import Mongoose. Staff invitation mail is sent through the SMTP adapter in `platform/email.ts`; product photos are uploaded to Cloudflare R2 through `platform/storage/r2.ts`.

Documents are shaped for how they are read: an order embeds its items, modifiers and payments; a role embeds its permission keys; a user embeds its branch ids; settings embed arrays. Cross-aggregate data (customers, stock levels, the ledger) is referenced by id. Atomic counters (`nextCounter`) use `findOneAndUpdate` with upsert. The only multi-document invariants (one open order per table, unique order numbers, unique emails) are enforced by unique/partial indexes, not by checks. Reports run an indexed query and group in application code; move hot reports to aggregation pipelines or rollup collections when volume demands it.

## Data conventions

Money is integer minor units. Tax/service rates are basis points. Stock quantities are integer thousandths of g/ml/pcs and stock value is tracked in minor units with weighted-average cost. Timestamps are ISO strings; `businessDate` is the branch-local calendar day. Ids are prefixed ULIDs. No floating point is stored anywhere.

## Orders

`priceOrder()` (pure, tested) computes subtotal, discount allocation (largest-remainder), service charge and tax (inclusive or exclusive, per-item exemption). The server is the only authority on prices: the POS sends product/variant/option ids and the service re-prices from the catalog. Order numbers come from an atomic per-branch/day counter; `clientKey` makes order creation and payment retry-safe. Items move `held → sent → preparing → ready → served` (or `void`); sending deducts recipe ingredients; voiding before cooking returns them; refunds are negative payment rows and reverse loyalty.

## Realtime

Mutations write to a transactional **outbox** (`events` collection) in the same transaction. `/api/events` streams it over SSE per branch/topic (permission-filtered); `LiveRefresh` calls `router.refresh()`, falling back to polling. No broker to operate.

## Auth

Opaque, revocable DB sessions (HMAC-hashed token, sliding expiry). scrypt password hashing. Staff may be PIN-only on paired devices (6-digit pairing code, 15-minute TTL). DB-backed rate limits on login, PIN and registration.

## Plans & billing

Plans define limits (branches/users/devices) and features. Subscription states: trialing → active → past_due (7-day grace, then read-only) → suspended. Payments are recorded by the operator (M-Pesa/bank/cash); subscriptions can also be paid online with Paystack (below).

## Paystack

Two separate Paystack accounts are involved and never mix:

* **Subscriptions: the platform's account**, keys from `.env` (`PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`). The owner clicks *Renew / Pay & switch* on Billing, is redirected to Paystack Checkout, and the plan is activated when Paystack confirms. Webhook: `POST /api/webhooks/paystack`.
* **Customer payments: each restaurant's own account.** The **super admin** enters each restaurant's keys in the operator console (Organisations → the restaurant → Paystack). Owners cannot see or change them; their Settings page only shows whether Paystack is on. The secret key is encrypted at rest (AES-256-GCM, key derived from `APP_SECRET`), never sent back to the browser, and every change is written to the operator audit log. This adds a *Paystack* method at the POS: the cashier creates a payment link, the customer pays by card/M-Pesa/bank, and the order closes automatically. Webhook per restaurant: `POST /api/webhooks/paystack/{orgId}` (verified with that restaurant's secret key).

Rules that make it safe: the cashier cannot type a Paystack payment by hand; every settlement path (webhook, customer redirect page `/pay/paystack/return`, cashier polling) calls the same `settleByReference`, which re-verifies with Paystack's API, checks amount and currency match what was requested, and flips the charge `pending → success` exactly once (replays are no-ops). Mismatches or already-paid orders are parked as `review`. Code: `platform/paystack/client.ts`, `modules/payments/*`, `modules/billing/subscription.ts`.

## Adding a module

Copy the shape of `modules/menu`: `schema.ts` (zod), `service.ts` (use-cases taking `ctx`), `actions.ts` (`defineAction`), `views/*` (props-only components), a route in `src/app/app/<name>/page.tsx`, a nav entry in `ui/shell/nav.ts`, permissions in `platform/rbac/permissions.ts`, its indexes in `platform/store/indexes.ts` (and defaults in `defaults.ts` if needed), and tests against `createTenant()` in `tests/helpers.ts`.


## Guest ordering and rooms

`modules/guest` resolves a QR token to a table or room, builds a narrow `Ctx` (see `guestCtx`) and calls the ordinary `orders` service, so pricing, stock, kitchen routing and the one-open-order-per-table index all behave as for staff. `modules/rooms` owns room types, rooms and bookings; folio = room charges + `orders` carrying `bookingId` (type `room_service`, paid with method `room` when posted) minus embedded booking payments. Overlap safety: booking creation bumps `rooms.lockSeq` inside the transaction, so concurrent bookings of a room conflict.
