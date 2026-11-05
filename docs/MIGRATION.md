# Migrating from the original MongoDB system

Both systems use MongoDB, but document shapes, ids and conventions differ, so there is no drop-in copy. There is no importer in this repository; write one as a script on the new store API (`getDb()` + `db.col(...)`). Suggested plan:

1. Provision the new database and run `npm run db:migrate`.
2. For each old `Organization` call `provisionOrganization()` (org, settings, trial subscription, first branch, roles, owner). Keep a map `oldId -> newId` for every entity (new ids are prefixed ULIDs; `_id` is stored as `id`).
3. Load in dependency order: branches, stations/categories, products (variants, modifier groups), tables, users (invite them or force a password reset unless you add a verifier for the old hash format), customers, inventory items, suppliers.
4. Orders: one order document with embedded `items` (and modifiers) and `payments`. Money must be integer minor units; rates basis points. Set `businessDate` from the branch timezone. Do not replay stock deductions: import current stock as `opening` ledger entries.
5. Compare per-day revenue and payment totals old vs new before cutover.

Rehearse on a copy; cut over per organisation.
