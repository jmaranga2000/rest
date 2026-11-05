import { PosTerminal } from "@/modules/orders/views/PosTerminal";
import type { OrderView } from "@/modules/orders/types";
import { AppShell } from "@/ui/shell/AppShell";
import { ctx, shellActions } from "./fixtures";
import { pic } from "./pic";
import { OrdersPage } from "@/modules/orders/views/OrdersPage";
import { OrderDetail } from "@/modules/orders/views/OrderDetail";
import { KitchenBoard } from "@/modules/orders/views/KitchenBoard";
import { ShiftsPage } from "@/modules/orders/views/ShiftsPage";

const catalogProducts = ["Nyama Choma Platter:120000", "Chicken Burger:85000", "Beef Samosa:15000", "Fresh Passion Juice:35000", "Masala Chips:30000", "Tusker Lager:40000", "Dawa Tea:20000", "Ugali Fish:95000"].map((s, i) => {
  const [name, price] = s.split(":");
  return { id: `p${i}`, categoryId: i < 3 || i === 7 ? "c1" : "c2", categoryName: "", stationId: null, stationName: null, name: name!, description: "", sku: null, imageUrl: i % 4 === 3 ? null : pic(i), basePriceMinor: Number(price), isTaxExempt: false, prepMinutes: 5, isActive: true, sortOrder: i, variants: [], modifierGroupIds: [], branchPriceMinor: null, isAvailable: i !== 5 };
});
const catalog = { categories: [{ id: "c1", name: "Kitchen", color: "#ef4444", sortOrder: 1, isActive: true, productCount: 4 }, { id: "c2", name: "Drinks", color: "#3b82f6", sortOrder: 2, isActive: true, productCount: 4 }], stations: [], modifierGroups: [], products: catalogProducts };
const item = (id: string, name: string, qty: number, unit: number, status: OrderView["items"][number]["status"], note: string | null = null) => ({ id, productId: id, name, variantName: null, qty, unitPriceMinor: unit, modifiersMinor: 0, lineTotalMinor: unit * qty, note, status, round: status === "held" ? 0 : 1, stationId: null, modifiers: [], sentAt: null, readyAt: null, voidReason: null });
const order: OrderView = {
  id: "o1", branchId: "b1", number: "1030-007", seq: 7, businessDate: "2026-10-30", type: "dine_in", status: "open", tableId: "t4", tableLabel: "T4", customerId: "c1", customerName: "Wanjiru Kamau", guests: 3, notes: null, currency: "KES",
  subtotalMinor: 290000, discountMinor: 29000, discountKind: "percent", discountValue: 1000, discountReason: "Regular", rewardDiscountMinor: 0, rewardPoints: 0, serviceChargeMinor: 26100, taxMinor: 49880, totalMinor: 337000 - 14000, paidMinor: 0, tipMinor: 0, taxInclusive: false, taxRateBp: 1600,
  openedByName: "Olivia", openedAt: "2026-10-30T09:00:00Z", closedAt: null, voidedAt: null, voidReason: null, version: 4,
  items: [item("i1", "Nyama Choma Platter", 2, 120000, "preparing"), item("i2", "Fresh Passion Juice", 1, 35000, "ready"), item("i3", "Masala Chips", 1, 30000, "held", "extra spicy"), item("i4", "Dawa Tea", 1, 20000, "held")], payments: [],
};
const base = {
  branchId: "b1", branchName: "Nairobi CBD", currency: "KES", catalog, tables: [{ id: "t1", label: "T1", seats: 2, areaName: null, orderId: null, orderNumber: null, totalMinor: 0, openedAt: null }, { id: "t4", label: "T4", seats: 4, areaName: null, orderId: "o1", orderNumber: "1030-007", totalMinor: 323000, openedAt: null }],
  orders: [order, { ...order, id: "o2", number: "1030-008", tableLabel: null, type: "takeaway", totalMinor: 45000, items: [] }], orderTypes: ["dine_in", "takeaway"], paymentMethods: ["cash", "mpesa", "card"], hasOpenShift: true, requireShift: true, rewards: [],
  can: { create: true, discount: true, void: true, pay: true, customers: true }, userName: "Olivia Owner",
};
export const pages = {
  "pos-order": { path: "/pos", el: () => <PosTerminal {...base} activeOrderId="o1" /> },
  "pos-new": { path: "/pos", dark: true, el: () => <PosTerminal {...base} activeOrderId={null} /> },
  "orders-list": { path: "/app/orders", el: () => <AppShell ctx={ctx} actions={shellActions}><OrdersPage tab="all" currency="KES" timezone="Africa/Nairobi" orders={[order, { ...order, id: "o3", number: "1030-006", status: "closed", tableLabel: null, type: "takeaway", customerName: null }, { ...order, id: "o4", number: "1030-005", status: "void" }]} /></AppShell> },
  "order-detail": { path: "/app/orders", el: () => <AppShell ctx={ctx} actions={shellActions}><OrderDetail order={{ ...order, status: "closed", paidMinor: 323000, payments: [{ id: "p1", method: "cash", amountMinor: 323000, tenderedMinor: 350000, changeMinor: 27000, tipMinor: 0, reference: null, refundOfId: null, reason: null, createdAt: "2026-10-30T09:40:00Z", createdByName: "Olivia" }] }} orgName="Mama Rocks" branchName="Nairobi CBD" timezone="Africa/Nairobi" receiptHeader="Karen Rd, Nairobi" receiptFooter="Asante sana!" taxLabel="VAT" can={{ void: true, refund: true }} /></AppShell> },
  "kitchen": { path: "/kitchen", dark: true, el: () => <KitchenBoard branchId="b1" branchName="Nairobi CBD" stations={[{ id: "s1", name: "Grill" }]} station={null} lateMinutes={15} canOperate serverNow="2026-10-30T09:20:00Z" tickets={[
    { orderId: "o1", number: "1030-007", type: "dine_in", tableLabel: "T4", customerName: "Wanjiru", sentAt: "2026-10-30T09:02:00Z", notes: null, items: [{ id: "i1", name: "Nyama Choma Platter", variantName: "1 kg", qty: 2, note: "well done", status: "preparing", round: 1, modifiers: ["Extra cheese"] }, { id: "i2", name: "Fresh Passion Juice", variantName: null, qty: 1, note: null, status: "ready", round: 1, modifiers: [] }] },
    { orderId: "o2", number: "1030-008", type: "takeaway", tableLabel: null, customerName: null, sentAt: "2026-10-30T09:17:00Z", notes: null, items: [{ id: "i3", name: "Chicken Burger", variantName: null, qty: 1, note: null, status: "sent", round: 1, modifiers: [] }] }]} /> },
  "shifts": { path: "/app/shifts", el: () => <AppShell ctx={ctx} actions={shellActions}><ShiftsPage branchId="b1" currency="KES" timezone="Africa/Nairobi" showAll mine={{ id: "s1", branchId: "b1", userId: "u", userName: "Olivia", status: "open", openedAt: "2026-10-30T05:00:00Z", closedAt: null, openingFloatMinor: 500000, cashSalesMinor: 1845000, cashRefundsMinor: 0, payInMinor: 0, payOutMinor: 120000, expectedCashMinor: 2225000, countedCashMinor: null, varianceMinor: null, otherSalesMinor: 900000, orderCount: 21, note: null }}
    shifts={[{ id: "s0", branchId: "b1", userId: "u2", userName: "Brian", status: "closed", openedAt: "2026-10-29T05:00:00Z", closedAt: "2026-10-29T15:00:00Z", openingFloatMinor: 500000, cashSalesMinor: 2000000, cashRefundsMinor: 0, payInMinor: 0, payOutMinor: 0, expectedCashMinor: 2500000, countedCashMinor: 2490000, varianceMinor: -10000, otherSalesMinor: 0, orderCount: 30, note: null }]} /></AppShell> },
};
