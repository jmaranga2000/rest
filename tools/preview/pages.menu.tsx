import { AppShell } from "@/ui/shell/AppShell";
import { ctx, shellActions } from "./fixtures";
import { pic } from "./pic";
import { MenuPage } from "@/modules/menu/views/MenuPage";
import { ProductForm } from "@/modules/menu/views/ProductForm";
import type { Catalog } from "@/modules/menu/service";

const catalog: Catalog = {
  categories: [{ id: "c1", name: "Grill", color: "#ef4444", sortOrder: 1, isActive: true, productCount: 3 }, { id: "c2", name: "Drinks", color: "#3b82f6", sortOrder: 2, isActive: true, productCount: 2 }],
  stations: [{ id: "s1", name: "Grill", sortOrder: 1 }, { id: "s2", name: "Bar", sortOrder: 2 }],
  modifierGroups: [{ id: "g1", name: "Extras", minSelect: 0, maxSelect: 2, productCount: 2, options: [{ id: "o1", name: "Extra cheese", priceMinor: 5000 }, { id: "o2", name: "Bacon", priceMinor: 8000 }] }],
  products: [
    { id: "p1", categoryId: "c1", categoryName: "Grill", stationId: "s1", stationName: "Grill", name: "Nyama Choma Platter", description: "", sku: "NC-01", imageUrl: pic(1), basePriceMinor: 120000, isTaxExempt: false, prepMinutes: 20, isActive: true, sortOrder: 1, variants: [{ id: "v1", name: "Half kg", priceMinor: 120000, isDefault: true }, { id: "v2", name: "1 kg", priceMinor: 220000, isDefault: false }], modifierGroupIds: ["g1"], branchPriceMinor: null, isAvailable: true },
    { id: "p2", categoryId: "c1", categoryName: "Grill", stationId: "s1", stationName: "Grill", name: "Chicken Burger", description: "", sku: null, imageUrl: pic(2), basePriceMinor: 85000, isTaxExempt: false, prepMinutes: 12, isActive: true, sortOrder: 2, variants: [], modifierGroupIds: ["g1"], branchPriceMinor: 90000, isAvailable: false },
    { id: "p3", categoryId: "c2", categoryName: "Drinks", stationId: "s2", stationName: "Bar", name: "Fresh Passion Juice", description: "", sku: null, imageUrl: null, basePriceMinor: 35000, isTaxExempt: false, prepMinutes: 3, isActive: true, sortOrder: 1, variants: [], modifierGroupIds: [], branchPriceMinor: null, isAvailable: true },
  ],
};
const props = { catalog, currency: "KES", branchId: "b1", branchName: "Nairobi CBD", can: { manage: true, availability: true } };

export const pages = {
  "menu-items": { path: "/app/menu", el: () => <AppShell ctx={ctx} actions={shellActions}><MenuPage {...props} tab="items" /></AppShell> },
  "menu-modifiers": { path: "/app/menu", el: () => <AppShell ctx={ctx} actions={shellActions}><MenuPage {...props} tab="modifiers" /></AppShell> },
  "menu-form": { path: "/app/menu", el: () => <AppShell ctx={ctx} actions={shellActions}><ProductForm catalog={catalog} product={catalog.products[0]} currency="KES" /></AppShell> },
};
