import { AppShell } from "@/ui/shell/AppShell";
import { ctx, shellActions } from "./fixtures";
import { InventoryPage } from "@/modules/inventory/views/InventoryPage";
import { PurchasingPage } from "@/modules/inventory/views/PurchasingPage";
const row = (id: string, name: string, cat: string, unit: "g" | "ml" | "pcs", q: number, reorder: number, v: number) => ({ id, name, sku: null, category: cat, unit, supplierName: null, qtyMilli: q, valueMinor: v, reorderMilli: reorder, parMilli: reorder * 3, costPerUnit: null, isLow: reorder > 0 && q <= reorder });
const rows = [row("i1", "Maize flour", "Dry goods", "g", 18_000_000, 5_000_000, 180000), row("i2", "Cooking oil", "Dry goods", "ml", 1_200_000, 3_000_000, 36000), row("i3", "Tilapia", "Fish", "pcs", 0, 10_000, 0), row("i4", "Tomatoes", "Produce", "g", 6_500_000, 2_000_000, 65000)];
const S = (el: React.ReactNode) => () => <AppShell ctx={ctx} actions={shellActions}>{el}</AppShell>;
const po = { id: "p1", number: "PO-0003", branchId: "b1", supplierId: "s1", supplierName: "Unga Ltd", status: "ordered" as const, expectedOn: null, notes: "", totalMinor: 240000, createdAt: "2026-10-28T08:00:00Z", lines: [{ id: "l1", itemId: "i1", name: "Maize flour", unit: "g" as const, qtyMilli: 20_000_000, lineTotalMinor: 240000, receivedMilli: 0, receivedTotalMinor: 0 }] };
export const pages = {
  "inventory": { path: "/app/inventory", el: S(<InventoryPage rows={rows} tab="stock" branchId="b1" branchName="Nairobi CBD" currency="KES" suppliers={[]} products={[]} recipes={{}} can={{ manage: true, adjust: true }} />) },
  "purchasing": { path: "/app/purchasing", el: S(<PurchasingPage tab="orders" orders={[po, { ...po, id: "p2", number: "PO-0002", status: "received" }]} suppliers={[]} items={rows} branchId="b1" currency="KES" timezone="Africa/Nairobi" can={{ manage: true, receive: true }} />) },
};
