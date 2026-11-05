/**
 * Reporting definitions (single source of truth — every screen and export uses these):
 *
 *  SALES        orders with status 'closed' (fully paid), attributed to the order's `business_date`
 *               (calendar date in the branch timezone at the moment the order was opened).
 *  revenue      SUM(total_minor) of SALES (includes tax and service charge, after discounts).
 *  net sales    revenue − tax.  (Only returned to users holding reports.financial.)
 *  discounts    SUM(discount_minor) of SALES.
 *  AOV          revenue / number of SALES, integer-rounded in JS.
 *  refunds      payments with a negative amount_minor, attributed to the original order's business_date.
 *  net after refunds  revenue − refunds.
 *  voids        orders with status 'void' (count + value) and order_items with status 'void' (count + value).
 *  item sales   order_items of SALES where status <> 'void'. Line totals are BEFORE order-level discounts.
 *  payment mix  payments with a positive amount_minor, grouped by method.
 *  hourly       SALES grouped by `opened_hour` (hour the order was opened, branch timezone).
 *
 * Every query is scoped to the organisation and to the branches the user may access.
 */
import type { Ctx } from "@/platform/auth/context";
import type { Doc, Filter } from "@/platform/db";
import { byIds } from "@/platform/db";
import { addDays, businessDate, eachDay } from "@/platform/dates";
import { can } from "@/platform/rbac/guard";
import type { PaymentMethod } from "@/platform/tenancy/settings";
import type { DateRange } from "./range";

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------
export interface Scope {
  ids: string[];
  /** Set when a single branch is selected. */
  branchId: string | null;
  isAll: boolean;
  label: string;
  timezone: string;
  /** The user may pick between several branches. */
  canChoose: boolean;
  options: { id: string; name: string }[];
}

/**
 * Which branches a report covers. A single branch (explicit, or the active one) by default.
 * "All branches" needs more than one accessible branch AND reports.financial (cross-branch revenue).
 */
export function resolveScope(ctx: Ctx, branchParam?: string | null): Scope {
  const accessible = ctx.branches;
  const financial = can(ctx, "reports.financial");
  const canAll = accessible.length > 1 && financial;
  const options = accessible.map((b) => ({ id: b.id, name: b.name }));
  if (branchParam === "all" && canAll) {
    return { ids: accessible.map((b) => b.id), branchId: null, isAll: true, label: "All branches", timezone: ctx.org.timezone, canChoose: true, options };
  }
  const picked = accessible.find((b) => b.id === branchParam) ?? ctx.activeBranch ?? accessible[0] ?? null;
  return {
    ids: picked ? [picked.id] : [], branchId: picked?.id ?? null, isAll: false, label: picked?.name ?? "No branch",
    timezone: picked?.timezone || ctx.org.timezone, canChoose: accessible.length > 1, options,
  };
}

/**
 * Reports aggregate in the application: the indexed query below narrows to the tenant, branches and
 * date range, then totals are computed here. This keeps both database engines identical and is fast
 * for restaurant volumes; at very large scale, replace with $group pipelines or daily roll-up documents.
 */
type OrderDoc = Doc & {
  branchId: string; businessDate: string; status: "open" | "closed" | "void"; openedBy: string | null; openedHour: number;
  totalMinor: number; taxMinor: number; discountMinor: number; serviceChargeMinor: number;
};
const orderFilter = (ctx: Ctx, scope: Scope, range: DateRange, status?: string): Filter => ({
  orgId: ctx.org.id, branchId: { $in: scope.ids }, businessDate: { $gte: range.from, $lte: range.to }, ...(status ? { status } : {}),
});
const loadOrders = (ctx: Ctx, scope: Scope, range: DateRange, status?: string): Promise<OrderDoc[]> =>
  scope.ids.length ? ctx.db.col<OrderDoc>("orders").find(orderFilter(ctx, scope, range, status)) : Promise.resolve([]);

/** Fetch child documents for many orders without building enormous $in lists. */
async function childrenOf<T extends Doc>(ctx: Ctx, collection: string, orderIds: string[], extra: Filter = {}): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < orderIds.length; i += 500) out.push(...(await ctx.db.col<T>(collection).find({ orgId: ctx.org.id, orderId: { $in: orderIds.slice(i, i + 500) }, ...extra })));
  return out;
}
const sum = <T,>(rows: T[], f: (r: T) => number): number => rows.reduce((a, r) => a + f(r), 0);
const group = <T,>(rows: T[], key: (r: T) => string): Map<string, T[]> => { const m = new Map<string, T[]>(); for (const r of rows) (m.get(key(r)) ?? m.set(key(r), []).get(key(r))!).push(r); return m; };

const n = (v: unknown): number => Number(v ?? 0);

// ---------------------------------------------------------------------------
// Summary & daily series
// ---------------------------------------------------------------------------
export interface SalesSummary {
  orders: number; revenueMinor: number; aovMinor: number; discountMinor: number; serviceChargeMinor: number;
  /** null without reports.financial */ taxMinor: number | null; netSalesMinor: number | null;
  voidOrders: number; voidOrdersMinor: number; voidItems: number; voidItemsMinor: number;
  refundCount: number; refundsMinor: number; netAfterRefundsMinor: number;
}

export async function getSalesSummary(ctx: Ctx, scope: Scope, range: DateRange): Promise<SalesSummary> {
  const all = await loadOrders(ctx, scope, range);
  const closed = all.filter((o) => o.status === "closed");
  const voided = all.filter((o) => o.status === "void");
  const ids = all.map((o) => o.id);
  const voidItems = ids.length ? await childrenOf<Doc & { lineTotalMinor: number }>(ctx, "orderItems", ids, { status: "void" }) : [];
  const refunds = ids.length ? await childrenOf<Doc & { amountMinor: number }>(ctx, "payments", ids, { amountMinor: { $lt: 0 } }) : [];
  const orders = closed.length;
  const revenue = sum(closed, (o) => n(o.totalMinor));
  const tax = sum(closed, (o) => n(o.taxMinor));
  const refundsMinor = -sum(refunds, (r) => n(r.amountMinor));
  const financial = can(ctx, "reports.financial");
  return {
    orders, revenueMinor: revenue, aovMinor: orders ? Math.round(revenue / orders) : 0,
    discountMinor: sum(closed, (o) => n(o.discountMinor)), serviceChargeMinor: sum(closed, (o) => n(o.serviceChargeMinor)),
    taxMinor: financial ? tax : null, netSalesMinor: financial ? revenue - tax : null,
    voidOrders: voided.length, voidOrdersMinor: sum(voided, (o) => n(o.totalMinor)), voidItems: voidItems.length, voidItemsMinor: sum(voidItems, (i) => n(i.lineTotalMinor)),
    refundCount: refunds.length, refundsMinor, netAfterRefundsMinor: revenue - refundsMinor,
  };
}

export interface DailyRow { date: string; orders: number; revenueMinor: number; taxMinor: number; discountMinor: number; serviceChargeMinor: number; voids: number }

/** One row per calendar day in the range (zero-filled). */
export async function getDailySales(ctx: Ctx, scope: Scope, range: DateRange): Promise<DailyRow[]> {
  const all = await loadOrders(ctx, scope, range);
  const closedBy = group(all.filter((o) => o.status === "closed"), (o) => o.businessDate);
  const voidBy = group(all.filter((o) => o.status === "void"), (o) => o.businessDate);
  const financial = can(ctx, "reports.financial");
  return eachDay(range.from, range.to).map((date) => {
    const r = closedBy.get(date) ?? [];
    return { date, orders: r.length, revenueMinor: sum(r, (o) => n(o.totalMinor)), taxMinor: financial ? sum(r, (o) => n(o.taxMinor)) : 0, discountMinor: sum(r, (o) => n(o.discountMinor)), serviceChargeMinor: sum(r, (o) => n(o.serviceChargeMinor)), voids: (voidBy.get(date) ?? []).length };
  });
}

// ---------------------------------------------------------------------------
// Products & categories
// ---------------------------------------------------------------------------
export interface ProductRow { productId: string; name: string; categoryId: string; categoryName: string; qty: number; revenueMinor: number }
export interface CategoryShare { categoryId: string; name: string; qty: number; revenueMinor: number }

export async function getProductSales(ctx: Ctx, scope: Scope, range: DateRange): Promise<{ products: ProductRow[]; categories: CategoryShare[] }> {
  const closed = await loadOrders(ctx, scope, range, "closed");
  const items = closed.length ? await childrenOf<Doc & { productId: string; qty: number; lineTotalMinor: number }>(ctx, "orderItems", closed.map((o) => o.id), { status: { $ne: "void" } }) : [];
  const byProduct = group(items, (i) => i.productId);
  const prods = await byIds<Doc & { name: string; categoryId: string }>(ctx.db, "products", ctx.org.id, byProduct.keys());
  const cats = await byIds<Doc & { name: string }>(ctx.db, "menuCategories", ctx.org.id, [...prods.values()].map((p) => p.categoryId));
  const products: ProductRow[] = [...byProduct].flatMap(([productId, rows]) => {
    const p = prods.get(productId);
    const c = p ? cats.get(p.categoryId) : undefined;
    return p && c ? [{ productId, name: p.name, categoryId: c.id, categoryName: c.name, qty: sum(rows, (r) => n(r.qty)), revenueMinor: sum(rows, (r) => n(r.lineTotalMinor)) }] : [];
  }).sort((a, b) => b.revenueMinor - a.revenueMinor || a.name.localeCompare(b.name));
  const catMap = new Map<string, CategoryShare>();
  for (const p of products) {
    const c = catMap.get(p.categoryId) ?? { categoryId: p.categoryId, name: p.categoryName, qty: 0, revenueMinor: 0 };
    c.qty += p.qty; c.revenueMinor += p.revenueMinor; catMap.set(p.categoryId, c);
  }
  return { products, categories: [...catMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor || a.name.localeCompare(b.name)) };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export interface PaymentMixRow { method: PaymentMethod; count: number; amountMinor: number }
export interface PaymentsReport { mix: PaymentMixRow[]; receivedMinor: number; refunds: PaymentMixRow[]; refundedMinor: number; netMinor: number }

export async function getPaymentsReport(ctx: Ctx, scope: Scope, range: DateRange): Promise<PaymentsReport> {
  const all = await loadOrders(ctx, scope, range);
  const pays = all.length ? await childrenOf<Doc & { method: PaymentMethod; amountMinor: number }>(ctx, "payments", all.map((o) => o.id)) : [];
  const roll = (positive: boolean): PaymentMixRow[] => {
    const rows = pays.filter((p) => (positive ? n(p.amountMinor) > 0 : n(p.amountMinor) < 0));
    return [...group(rows, (p) => p.method)].map(([method, r]) => ({ method: method as PaymentMethod, count: r.length, amountMinor: Math.abs(sum(r, (p) => n(p.amountMinor))) }))
      .sort((a, b) => (positive ? b.amountMinor - a.amountMinor : b.amountMinor - a.amountMinor) || a.method.localeCompare(b.method));
  };
  const mix = roll(true);
  const refunds = roll(false);
  const receivedMinor = mix.reduce((a, r) => a + r.amountMinor, 0);
  const refundedMinor = refunds.reduce((a, r) => a + r.amountMinor, 0);
  return { mix, receivedMinor, refunds, refundedMinor, netMinor: receivedMinor - refundedMinor };
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
export interface StaffRow { userId: string; name: string; orders: number; revenueMinor: number; aovMinor: number; discountMinor: number; discountedOrders: number; voids: number }

export async function getStaffReport(ctx: Ctx, scope: Scope, range: DateRange): Promise<StaffRow[]> {
  const all = (await loadOrders(ctx, scope, range)).filter((o) => o.openedBy);
  const users = await byIds<Doc & { name: string }>(ctx.db, "users", ctx.org.id, all.map((o) => o.openedBy));
  const map = new Map<string, StaffRow>();
  for (const [userId, rows] of group(all.filter((o) => o.status === "closed"), (o) => o.openedBy!)) {
    const u = users.get(userId);
    if (!u) continue;
    const orders = rows.length, revenue = sum(rows, (o) => n(o.totalMinor));
    map.set(userId, { userId, name: u.name, orders, revenueMinor: revenue, aovMinor: orders ? Math.round(revenue / orders) : 0, discountMinor: sum(rows, (o) => n(o.discountMinor)), discountedOrders: rows.filter((o) => n(o.discountMinor) > 0).length, voids: 0 });
  }
  for (const [userId, rows] of group(all.filter((o) => o.status === "void"), (o) => o.openedBy!)) {
    const u = users.get(userId);
    if (!u) continue;
    const row = map.get(userId) ?? { userId, name: u.name, orders: 0, revenueMinor: 0, aovMinor: 0, discountMinor: 0, discountedOrders: 0, voids: 0 };
    row.voids = rows.length; map.set(userId, row);
  }
  return [...map.values()].sort((a, b) => b.revenueMinor - a.revenueMinor || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------
export interface HourBucket { orders: number; revenueMinor: number }
export interface HoursReport {
  /** 24 buckets, index = hour opened. */ hourly: HourBucket[];
  /** [weekday 0=Mon … 6=Sun][hour] */ matrix: HourBucket[][];
  peakHour: number | null;
}

/** Weekday (0 = Monday) of a 'YYYY-MM-DD' calendar date. */
export const weekdayIndex = (date: string): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const emptyBuckets = (): HourBucket[] => Array.from({ length: 24 }, () => ({ orders: 0, revenueMinor: 0 }));

export async function getHoursReport(ctx: Ctx, scope: Scope, range: DateRange): Promise<HoursReport> {
  const rows = await loadOrders(ctx, scope, range, "closed");
  const hourly = emptyBuckets();
  const matrix = Array.from({ length: 7 }, emptyBuckets);
  for (const r of rows) {
    const h = Math.min(23, Math.max(0, n(r.openedHour)));
    const d = weekdayIndex(r.businessDate);
    hourly[h]!.orders += 1; hourly[h]!.revenueMinor += n(r.totalMinor);
    matrix[d]![h]!.orders += 1; matrix[d]![h]!.revenueMinor += n(r.totalMinor);
  }
  let peak: number | null = null;
  hourly.forEach((b, i) => { if (b.orders > 0 && (peak === null || b.orders > hourly[peak]!.orders)) peak = i; });
  return { hourly, matrix, peakHour: peak };
}

// ---------------------------------------------------------------------------
// Branch comparison
// ---------------------------------------------------------------------------
export interface BranchRow { branchId: string; name: string; orders: number; revenueMinor: number; aovMinor: number; discountMinor: number; voids: number }

export async function getBranchComparison(ctx: Ctx, scope: Scope, range: DateRange): Promise<BranchRow[]> {
  const all = await loadOrders(ctx, scope, range);
  const names = new Map(ctx.branches.map((b) => [b.id, b.name]));
  const closed = group(all.filter((o) => o.status === "closed"), (o) => o.branchId);
  const voided = group(all.filter((o) => o.status === "void"), (o) => o.branchId);
  const rows: BranchRow[] = scope.ids.flatMap((id) => {
    const name = names.get(id);
    if (!name) return [];
    const c = closed.get(id) ?? [];
    const revenue = sum(c, (o) => n(o.totalMinor));
    return [{ branchId: id, name, orders: c.length, revenueMinor: revenue, aovMinor: c.length ? Math.round(revenue / c.length) : 0, discountMinor: sum(c, (o) => n(o.discountMinor)), voids: (voided.get(id) ?? []).length }];
  });
  return rows.sort((a, b) => b.revenueMinor - a.revenueMinor || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export interface DashboardData {
  scope: Scope; today: string; compareDate: string;
  now: SalesSummary; before: SalesSummary;
  series: DailyRow[]; topProducts: ProductRow[]; payments: PaymentMixRow[]; hourly: HourBucket[];
  openOrders: number; lowStock: number | null;
  checklist: { key: string; label: string; href: string; done: boolean }[] | null;
}

export async function getDashboard(ctx: Ctx, branchParam?: string | null, nowDate: Date = new Date()): Promise<DashboardData> {
  const scope = resolveScope(ctx, branchParam);
  const today = businessDate(nowDate, scope.timezone);
  const compareDate = addDays(today, -7);
  const r = (from: string, to: string): DateRange => ({ preset: "custom", from, to, days: eachDay(from, to).length, label: "" });
  const week = r(addDays(today, -6), today);

  const [now, before, series, prod, pay, hours, open, low, checklist] = await Promise.all([
    getSalesSummary(ctx, scope, r(today, today)),
    getSalesSummary(ctx, scope, r(compareDate, compareDate)),
    getDailySales(ctx, scope, r(addDays(today, -13), today)),
    getProductSales(ctx, scope, week),
    getPaymentsReport(ctx, scope, week),
    getHoursReport(ctx, scope, r(today, today)),
    ctx.db.col("orders").count({ orgId: ctx.org.id, branchId: { $in: scope.ids }, status: "open" }),
    ctx.features.has("inventory") && can(ctx, "inventory.view")
      ? ctx.db.col<Doc & { qtyMilli: number; reorderLevelMilli: number }>("stockLevels").find({ orgId: ctx.org.id, branchId: { $in: scope.ids }, reorderLevelMilli: { $gt: 0 } }).then((rows) => rows.filter((l) => n(l.qtyMilli) <= n(l.reorderLevelMilli)).length)
      : Promise.resolve(null),
    can(ctx, "settings.manage") ? getChecklist(ctx) : Promise.resolve(null),
  ]);
  return {
    scope, today, compareDate, now, before, series, topProducts: prod.products.slice(0, 5), payments: pay.mix, hourly: hours.hourly,
    openOrders: open, lowStock: low, checklist,
  };
}

async function getChecklist(ctx: Ctx): Promise<DashboardData["checklist"]> {
  const org = ctx.org.id;
  const [items, tables, staff, sales] = await Promise.all([
    ctx.db.col("products").count({ orgId: org, isActive: true }),
    ctx.db.col("diningTables").count({ orgId: org, isActive: true }),
    ctx.db.col("users").count({ orgId: org, status: "active" }),
    ctx.db.col("orders").count({ orgId: org, status: "closed" }),
  ]);
  const list_ = [
    { key: "menu", label: "Add your menu items", href: "/app/menu", done: items > 0 },
    { key: "tables", label: "Set up tables and floor areas", href: "/app/floor", done: tables > 0 },
    { key: "staff", label: "Invite your team", href: "/app/staff", done: staff > 1 },
    { key: "sale", label: "Ring up your first sale", href: "/pos", done: sales > 0 },
  ];
  return list_.every((i) => i.done) ? null : list_;
}

/** Percentage change vs a baseline; null when there is no baseline to compare with. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
