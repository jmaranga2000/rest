# Engineering conventions

Read `src/modules/menu/**` and `src/app/app/menu/**` first — it is the reference implementation of every rule below.

## Layers (one direction only: app → views → actions → service → db)

| Layer | Where | Rules |
|---|---|---|
| Route | `src/app/**/page.tsx` | Thin. `requirePage({permission, feature})` → call a service → render a **view**. No queries, no business rules. |
| View | `src/modules/<m>/views/*.tsx` | Presentational. Props in, JSX out. Server components by default; `"use client"` only for interaction. Must render from plain fixture props (this is how `npm run preview` screenshots them). |
| Action | `src/modules/<m>/actions.ts` (`"use server"`) | One `defineAction({schema, permission, feature?, handler})` per mutation. Auth, entitlement, read-only billing mode, validation and the DB transaction come from the wrapper. |
| Service | `src/modules/<m>/service.ts` | Use-cases `(ctx: Ctx, input) => result`. All queries live here (or a `repo.ts` beside it). Always filter by `ctx.org.id`. Write `audit()` for every business mutation. Emit outbox events for anything a live screen shows. |
| Platform | `src/platform/**` | Shared kernel. Don't change it from a module; ask. |

## Database (MongoDB via the store layer)

* Use `db.col<T>("name")` from `@/platform/db`; never import Mongoose outside `platform/store`. Operators available: `$eq $ne $gt $gte $lt $lte $in $nin $exists $type $regex $and $or`; updates `$set $inc $unset $setOnInsert`. Build regexes with the escaped helper, never from raw user input.
* Documents use `id` (stored as `_id`). Timestamps are ISO strings. Money = integer minor units. Rates = integer basis points. Stock quantities = integer thousandths of the base unit. **No floats stored.**
* **Every** query is scoped by `orgId` (there are no foreign keys to save you). Look up client-supplied ids with the org filter (`byIds`). Branch-scoped data is also filtered by a branch the user may access (`requireBranch(ctx, id)`; `ctx.branches`).
* Invariants that must hold under concurrency belong in a unique or partial-unique index in `platform/store/indexes.ts`, not in a read-then-write check. Counters use `nextCounter()`.
* Run mutations inside the action's transaction (`defineAction` already does). Keep transactions short; do not call external services inside them.
* Defaults for omitted fields live in `platform/store/defaults.ts`. Sort every list explicitly.
* New collections or indexes: add to `indexes.ts`; `npm run db:migrate` applies them (idempotent).

## Permissions, plans, billing

* A new capability = a new key in `platform/rbac/permissions.ts` (+ system roles). Never check ad-hoc strings.
* Plan gating: `feature` on `defineAction`/`requirePage`; limits via `assertWithinLimit(ctx.limits, …)`.
* Mutations are refused automatically when the workspace is read-only (trial over / unpaid). Read-only reports and exports still work.

## UI

* Use `src/ui/*` components and the semantic tokens (`bg-surface`, `text-muted`, `border-line`, `text-primary` …). **No `dark:` variants, no hard-coded hex colours** (only data colours such as category swatches). Both themes come for free.
* Forms: `ActionForm` + `Field` + `SubmitButton` (field errors map by `name`). Dialog forms: `FormDialog`. Row buttons: `useRunAction` / `ConfirmButton`. Money inputs: `MoneyInput` (submits minor units). Lists: `Table`, `StatusBadge`, `EmptyState` (every list has an empty state), `PageHeader`.
* Touch targets ≥ 40px (≥ 48px on POS/KDS). Every icon-only button has an `aria-label`. Layouts must work at 390px wide.
* Numbers in tables right-aligned (`TD align="right"`), formatted with `formatMoney`.

## Tests

* `tests/<module>.test.ts` using `node:test` and `tests/helpers.ts` (`createTenant()` gives a migrated in-memory DB, an owner `Ctx`, and `ctxFor(userId)`).
* Test business rules and tenant isolation, not framework glue. Run: `node --import tsx --test tests/<file>.test.ts`.

## Visual checks

* Add `tools/preview/pages.<module>.tsx` (see `pages.menu.tsx`) exporting `pages`, register it in `pages.generated.tsx`, then `node --import tsx tools/preview/build.ts && node --import tsx tools/preview/shoot.ts <prefix>` and look at light + dark + a 390px screenshot.
