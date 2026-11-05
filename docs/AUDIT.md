# Audit of the original system and what changed

The original (`restaurant.zip`) is a Next.js 14 + MongoDB multi-tenant POS of about 11k lines, with 3 test files. An earlier draft of the redesign moved to PostgreSQL without being asked; that was a mistake and has been reverted to MongoDB. This was assessed by reading the code; it is a characterisation, not a penetration test or load test. It was in better shape than many systems of its kind (money already in minor units, org-scoped queries, a service layer). The redesign keeps those good ideas and fixes structural limits.

| Area | Original | Redesign | Why |
|---|---|---|---|
| Database | MongoDB; money/stock conventions partly ad hoc | MongoDB retained, behind a repository/store layer; explicit indexes (unique + partial) enforce invariants; integer money/basis-points/milli-quantities everywhere | MongoDB is the required database. The layer keeps services testable and the engine swappable |
| Sessions | Stateless signed JWT cookies (`jose`); role changes only bite via an extra check | Opaque DB sessions, revocable, permissions loaded per request | Instant revocation on disable/suspend/role change |
| Authorization | Permission lists, checked ad hoc | One permission registry (~40), 8 built-in roles synced from code, custom roles with no-escalation rule, `defineAction` enforces auth → permission → feature → validation | Cannot forget a check |
| Transactions | A handful of explicit transactions (15 references) | Every action runs in exactly one transaction | Order + stock + loyalty + outbox commit or roll back together |
| Realtime | Custom realtime helper | Transactional outbox + SSE + polling fallback | Events can't be lost or announce data that rolled back |
| Orders | 709-line service, embedded arrays | Pure pricing engine (tested), explicit item state machine, idempotency keys, server-side re-pricing, refunds as ledger rows | Auditability; correctness under retries |
| Stock | Moving average on movements | Append-only ledger + cached levels, weighted-average value in integers, recipes deduct on send and reverse on void, PO receiving | Valuation you can reconcile |
| Cash | Cashier sessions | Shifts with float, pay-ins/outs, expected vs counted, variance | Standard drawer reconciliation |
| Billing | Subscription requests | Plans with limits/features, grace/read-only/blocked states, operator console | Real SaaS lifecycle |
| UI | Ember/sky-blue theme with a 179-line CSS file of overrides | Tailwind v4 semantic tokens, light/dark, a component library, a POS built for touch, mobile layouts | Consistency, accessibility, theming |
| Tests | 3 files | 72 tests across pricing, orders, inventory, reports, admin, identity, platform | Behaviour is pinned |

**Deliberately not carried over:** Cloudinary image uploads (menu items have an `image_url` field; uploads need a storage decision), the original's UI code (rewritten), and the hotel/lodging scope (out of scope; see `STATUS.md`).
