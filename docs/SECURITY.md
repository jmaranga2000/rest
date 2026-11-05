# Security

"Military grade" is a marketing phrase, not a standard, and no software can honestly claim it. What follows is what this codebase actually does, what it relies on you to do, and what it does **not** cover. None of it replaces an independent penetration test before you take real payments.

## What the application does

**Identity & sessions**
* scrypt password hashing; opaque, revocable database sessions (only an HMAC of the token is stored); permissions loaded from the database on every request, so disabling a user or suspending a business takes effect immediately.
* `__Host-` cookies in production (HTTPS-only, origin-bound), `HttpOnly`, `SameSite=Lax`.
* Rate limits on login, PIN, registration and webhooks, stored in the database (correct across instances).
* **Two-factor sign-in (TOTP, RFC 6238) for super admins**, with single-use recovery codes. Codes cannot be replayed; enabling it signs out every device. Tested against the RFC test vector. Turn it on under Operator console → Security.
* Optional `PLATFORM_ALLOWED_IPS`: the operator console returns a plain 404 to every other address.
* Open-redirect-safe `next` parameter (rejects `//host` and `/\host`).

**Attack detection (honeypots)**
* Hidden form field + timing trap on login, registration, invite acceptance and operator login. Filled field → IP banned 1 h; instant submissions are logged and repeat offenders banned.
* **Trap URLs** nothing real lives at (`/.env`, `/.git/*`, `/wp-login.php`, `/phpmyadmin`, `/actuator/*`, `/backup.sql`, …). A hit logs the request, bans the IP for 24 h and tarpits the scanner.
* **Bait accounts**: sign-in attempts as `admin@…`, `root@…`, `test@…` and similar are logged and escalate to a ban.
* Auto-ban on floods of rate-limited requests, failed sign-ins and bad webhook signatures.
* Operator console → Security shows every event and active ban, and lets you ban or lift an IP by hand.
* Bans block **sign-in, registration and invites** from that address. They do not cut off an already-signed-in session or serve as a network firewall; for that, use your proxy/WAF.

**Browser hardening**
* Per-request **nonce-based Content-Security-Policy** (no inline-script allowance), `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`, HSTS with preload, `X-Frame-Options: DENY`, `nosniff`, strict Referrer/Permissions policies, COOP/CORP same-origin, `Cache-Control: no-store` on signed-in pages.
* Server Actions verify Origin against the host (configured from `APP_URL`).

**Data**
* A restaurant's Paystack secret key is encrypted at rest (AES-256-GCM) and never returned to any browser. Only super admins can set it.
* Stored documents and `$set` values reject `$`-prefixed or dotted keys (NoSQL operator/path injection). All input is validated with zod before it reaches a service; no raw JSON reaches a query.
* Every query is scoped by `orgId`; client-supplied ids are looked up with that filter.
* CSV exports neutralise spreadsheet formula injection.
* Production refuses to start with a placeholder `APP_SECRET`, a non-HTTPS `APP_URL`, or the in-memory database.

**Payments**
* Every Paystack confirmation is re-verified with Paystack's API; amount and currency must match what was requested; webhooks are HMAC-SHA512 verified on the raw body, size-capped and rate-limited; settlement is idempotent.

**Client IP**: taken from the right-hand side of `X-Forwarded-For` according to `TRUSTED_PROXY_HOPS`. The left side is attacker-controlled, so many apps' IP rate limits are trivially bypassed; this one's are not, provided the setting matches your real proxy count.

## What you must do (deployment checklist)
1. Serve only over HTTPS behind a reverse proxy or CDN with a WAF and **network-level** DDoS protection (Cloudflare, AWS Shield/WAF, etc.). The app cannot absorb a volumetric flood.
2. Set `APP_SECRET` (`openssl rand -base64 48`), `APP_URL=https://…`, and `TRUSTED_PROXY_HOPS` to your real proxy count. Treat `APP_SECRET` like a root key: rotating it invalidates stored Paystack keys and sessions.
3. MongoDB: enable authentication and TLS, bind to a private network only, allow-list the app's IPs (Atlas: IP access list), give the app a least-privilege user (readWrite on its own database), enable encryption at rest and encrypted, tested backups. The bundled `docker-compose.yml` is for **development only** (no auth).
4. Restrict `/platform` with `PLATFORM_ALLOWED_IPS` or put it behind a VPN, and make every operator enable two-factor.
5. Run the container as non-root (the Dockerfile already does), read-only filesystem if possible, and keep Node and dependencies patched (`npm audit`, Dependabot/Renovate).
6. Ship logs (including the security events) to a place an attacker who owns the app cannot erase, and alert on bans and `bad_signature` bursts.
7. In each Paystack dashboard, set the callback and webhook URLs shown in the operator console. Optionally restrict the webhook endpoint to Paystack's published IP addresses at your proxy.

## Not covered (be aware)
* No external penetration test or formal audit has been done. Treat this as a strong baseline, not a certification.
* No web application firewall, bot-management or volumetric DDoS protection (that is infrastructure).
* Two-factor is for operators only; restaurant owners/staff rely on passwords + rate limits + PINs. Extending TOTP to owners is the natural next step.
* The setup key for two-factor is shown as text (no QR code was generated, since no QR library could be installed here).
* The honeypots and rate limits make automated attacks expensive and visible; a determined, patient human attacker is stopped by the layers above (authz, validation, isolation), not by the honeypots.
* None of the MongoDB-specific protections have run against a real MongoDB server yet (see `STATUS.md`).

## Guest QR ordering (tables and rooms)

Guests are anonymous, so the controls are on the QR token and the service layer rather than on a login:

- **Unguessable tokens.** Each table and room has a 128-bit random token in its QR URL (`/o/{token}` tables, `/r/{token}` rooms). Unique-indexed; "New code" rotates it and kills anything printed.
- **Narrow identity.** Guest requests run through the normal order service with a context that can only `orders.create`, `orders.view`, `menu.view`, scoped to one branch. A leaked token can place orders for that table; it cannot read anything else.
- **Rooms need a stay code.** Room service only works while a booking is checked in, and the guest must type the 6-digit code issued at check-in. Attempts are rate limited (15 per 15 min per room, every attempt counted), compared in constant time, and the code is wiped at checkout.
- **Abuse limits.** Max 20 lines and 10 of an item per submission; per-guest, per-token and per-IP hourly limits; submissions are idempotent per `submitKey`; the existing IP ban/telemetry applies to the public actions. Guests only see their own items' status.
- **Kill switch.** Menu → QR codes → Ordering: turn guest ordering off, or require staff to confirm each order before it reaches the kitchen.
- Honest limit: someone physically at a table can order for it (that is the model), and staff should still glance at the kitchen display. Orders are bills, not payments; nothing is charged to a guest card.
