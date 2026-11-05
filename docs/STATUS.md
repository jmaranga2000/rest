# Status: verified, unverified, out of scope

## Verified
* 92 automated tests pass (`npm test`) on the in-memory store engine: pricing, order lifecycle, kitchen flow, payments/refunds, shifts, loyalty, inventory/recipes/purchasing, reports, admin (staff, roles, invitations, branches, devices), identity/PIN/rate limits, platform operator, and the store semantics themselves (operators, unique/partial indexes, transactions with rollback, counters).
* All `.ts/.tsx` logic type-checks under strict settings against a stubbed React/Next/mongodb typing layer.
* Core screens were rendered with fixture data in light and dark and reviewed visually (POS with photo cards, customers, public order board, kitchen, order detail, staff, billing, inventory).

* Paystack flows tested against a **fake** Paystack (11 tests): key encryption, link creation with the right account's key, settlement exactly once, wrong amount parked, bad/foreign webhook signatures refused, subscription activation and reactivation.

* Security layer tested (9 tests): proxy-safe client IP, console IP allow-list, honeypot verdicts, bans and auto-bans, TOTP against the RFC 6238 vector plus the full operator 2FA flow, injection guard, production config refusal, webhook size/signature handling. See `docs/SECURITY.md`.

## Not verified (do these first)
* **The CSP/nonce middleware, security headers, honeypot form fields and trap-URL rewrites have never run in a real Next.js build.** Load every page in a browser with the console open and fix any CSP violation it reports (most likely: a third-party image or font host).
* **Paystack has never been called for real.** Endpoints, field names and the webhook signature scheme follow Paystack's public docs, but run a test-mode transaction end to end (initialize, pay with a test card, webhook arrives, order closes) before going live. Check your currency is enabled on each Paystack account.
* **The MongoDB adapter has never run against a real mongod.** The package registry and a MongoDB server were unavailable where this was built. `store/mongo.ts` is written to the official driver's documented API, but transactions, partial/unique index creation, `findOneAndUpdate` return shape, duplicate-key mapping and write-conflict retries are untested. Run `docker compose up -d mongo` then `MONGODB_TEST_URI="mongodb://localhost:27017/?replicaSet=rs0&directConnection=true" npm test`. CI does this on every push.
* `next build` / `next dev` were never run; expect a few type or config fixes on first install against the real `@types/react` and `next`.
* The Docker image has not been built. Browser interactions and SSE live updates were not exercised.
* Query performance on large data sets: indexes are defined for the main access paths but not load-tested.

## Out of scope / extension points
* Hotel/lodging management.
* Direct M-Pesa (Daraja) integration (M-Pesa works through Paystack where Paystack supports it for your account). Paystack refunds are not automated: refund in the Paystack dashboard, then record the refund on the order. Recurring auto-charge (card tokens) is not implemented; owners renew with a click.
* Stock-count UI, plan-editing UI (the action exists), image upload (items take an https photo link), offline POS.
* Reports group in application code; use aggregation pipelines or rollups at scale.


## QR ordering and guest rooms (latest round)

Built and tested (in-memory engine): per-table QR codes (own encoder, verified with OpenCV), owner "QR codes" tab under Menu, print sheets (`/print/qr`, `/print/rooms`; 1/4/9 per page), public guest ordering (`/o/{token}`) that attaches to the table's open order, staff-confirm mode, regenerate; rooms module (room types, rooms, bookings with overlap protection, check-in/out, folio, payments, room-service orders by QR charged to the folio, receptionist role, `rooms` plan feature).

Not verified: scanning with real phone cameras (decoded with OpenCV only); the print layout on a real printer; the MongoDB concurrency path of the booking lock (the memory engine serialises writes); Next build/CSP for the new routes.

Not built: guest card payment at the table (guests pay staff as before), calling a waiter, room tax/city-levy rules (room rates are treated as final prices), housekeeping tasks beyond ready/cleaning/out-of-service, staff-entered room-service orders from the POS (room service is placed by the guest's QR and posted from the booking), editing a booking's dates after creation (cancel and rebook). Existing deployments must re-sync plans (`rooms` feature) and system roles (`receptionist`, new permissions) as for any permission change.
