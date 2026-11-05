import { pic } from "./pic";
import { AppShell } from "@/ui/shell/AppShell";
import { ctx, shellActions } from "./fixtures";
import { CustomersPage } from "@/modules/customers/views/CustomersPage";
import { CustomerProfile } from "@/modules/customers/views/CustomerProfile";
import { LoyaltyPage } from "@/modules/customers/views/LoyaltyPage";
import { DisplayBoardView } from "@/app/display/[key]/DisplayBoardView";
import type { CustomerRow } from "@/modules/customers/service";

const mk = (i: number, name: string, phone: string, visits: number, spend: number, pts: number, last: string): CustomerRow => ({
  id: `cu${i}`, name, phone, email: null, notes: "", pointsBalance: pts, lifetimeSpendMinor: spend, visits, lastVisitAt: last, isActive: true, createdAt: "2026-06-01T08:00:00Z",
});
const rows = [
  mk(1, "Wanjiru Kamau", "+254 712 345 678", 18, 4_250_000, 425, "2026-10-30T09:00:00Z"),
  mk(2, "Brian Otieno", "+254 722 111 222", 9, 1_980_000, 198, "2026-10-28T12:10:00Z"),
  mk(3, "Amina Hassan", "+254 733 909 808", 4, 640_000, 64, "2026-10-21T18:40:00Z"),
  mk(4, "Peter Njoroge", "+254 701 555 010", 1, 120_000, 12, "2026-09-02T13:00:00Z"),
];
const rewards = [
  { id: "r1", name: "KES 200 off", pointsCost: 200, kind: "amount_off" as const, value: 20_000, isActive: true },
  { id: "r2", name: "10% off the bill", pointsCost: 350, kind: "percent_off" as const, value: 1000, isActive: true },
];

export const pages = {
  customers: { path: "/app/customers", el: () => <AppShell ctx={ctx} actions={shellActions}><CustomersPage data={{ rows, total: 4, page: 1, pageSize: 20, pageCount: 1 }} currency="KES" timezone="Africa/Nairobi" loyaltyEnabled canManage /></AppShell> },
  "customer-profile": { path: "/app/customers/cu1", el: () => (
    <AppShell ctx={ctx} actions={shellActions}><CustomerProfile customer={{ ...rows[0]!, notes: "Prefers window seat. Allergic to peanuts." }} currency="KES" timezone="Africa/Nairobi" loyaltyEnabled canManage canAdjust
      orders={[{ id: "o1", number: "1030-007", businessDate: "2026-10-30", status: "closed", type: "dine_in", totalMinor: 337_000 }, { id: "o2", number: "1022-014", businessDate: "2026-10-22", status: "closed", type: "takeaway", totalMinor: 145_000 }]}
      ledger={[{ id: "l1", type: "earn", points: 33, balanceAfter: 425, note: null, orderId: "o1", createdAt: "2026-10-30T10:00:00Z" }, { id: "l2", type: "redeem", points: -200, balanceAfter: 392, note: "KES 200 off", orderId: "o2", createdAt: "2026-10-22T14:00:00Z" }]} /></AppShell>) },
  loyalty: { path: "/app/loyalty", el: () => <AppShell ctx={ctx} actions={shellActions}><LoyaltyPage rewards={rewards} currency="KES" settings={{ enabled: true, earnPointsPer100: 1, pointValueMinor: 100 }} /></AppShell> },
  "display-board": { path: "/display/demo", width: 1440, el: () => {
    const it = (id: string, name: string, description: string, priceMinor: number, i: number) => ({ id, name, description, priceMinor, imageUrl: pic(i) });
    const o = (n: string, type: string, t: string, items: [string, number][]) => ({ number: `1030-${n}`, type, openedAt: `2026-10-30T${t}:00Z`, items: items.map(([name, qty]) => ({ name, qty })) });
    return <DisplayBoardView now="2026-10-30T19:49:00Z" board={{
      orgName: "Savanna Grill", branchName: "Nairobi CBD", city: "Good food · Great mood", logoUrl: null, currency: "KES", locale: "en-KE", timezone: "Africa/Nairobi",
      waiting: [o("0001", "dine_in", "17:10", [["House Latte (Regular)", 1]]), o("0002", "takeaway", "17:14", [["Westlands Beef Burger", 2], ["Seasoned Fries", 2]])],
      ready: [o("0003", "takeaway", "17:02", [["Maranga Breakfast Plate", 1]])],
      menu: [
        { name: "Breakfast", items: [it("a", "Maranga Breakfast Plate", "Two eggs, toast, grilled tomato, and fries.", 65000, 0), it("b", "Pancake Stack", "Maple syrup and banana.", 45000, 4)] },
        { name: "Sides", items: [it("c", "Seasoned Fries", "Crispy fries with house seasoning.", 30000, 1)] },
        { name: "Burgers", items: [it("d", "Westlands Beef Burger", "Beef patty, cheddar, lettuce, tomato and house sauce.", 85000, 2)] },
        { name: "Mains", items: [it("e", "Nyama Choma Platter", "Grilled goat with kachumbari and ugali.", 120000, 3)] },
      ],
      slides: [{ id: "s1", title: "Freshly made, always", body: "From our kitchen to your table, prepared with care.", accent: "#f97316", durationS: 8 }, { id: "s2", title: "Happy hour 4–6pm", body: "Two Tusker for the price of one", accent: "#4338ca", durationS: 8 }],
    }} />; } },
};
