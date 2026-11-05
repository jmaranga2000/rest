# Design system

* **Tokens** live in `src/app/globals.css` (`--bg --surface --surface-2 --line --fg --muted --primary --success --warning --danger --info`, chart colours `--c1…--c6`) and are exposed to Tailwind as `bg-surface`, `text-muted`, `border-line`, `bg-primary`, etc. Light/dark is `data-theme` on `<html>` set by a boot script (no flash); never hard-code colours in components.
* **Primary** is indigo `#4338ca`. Status colours always come in `*-soft` pairs for badges and alerts.
* **Type**: Inter; numbers use the `num` class (tabular figures).
* **Components** (`src/ui`): Button/IconButton, Badge/StatusBadge, Card, Dialog (native `<dialog>`), ActionForm/Field/FormDialog/ConfirmButton (the only way forms talk to server actions: pending state, field errors, toast, refresh), inputs, MoneyInput, RowsEditor, Table, Tabs, StatCard, EmptyState, Alert, charts (server-rendered SVG), LiveRefresh, Toast, ThemeToggle, and the app shell.
* **Rules**: touch targets ≥ 40px on POS/KDS; every table scrolls horizontally on mobile; every list has an empty state; destructive actions go through `ConfirmButton` with a reason where audit matters; errors show next to the field.
* **Previewing**: add fixtures in `tools/preview/pages.*.tsx`, run `npm run preview`, then `tsx tools/preview/shoot.ts <page>`; screenshots land in `.preview/shots`.
