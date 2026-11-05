import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTenant } from "./helpers";
import * as menu from "@/modules/menu/service";
import { productSchema } from "@/modules/menu/schema";

async function seed(t: Awaited<ReturnType<typeof createTenant>>) {
  const cat = await menu.saveCategory(t.owner, { name: "Mains", color: "#ff0000", sortOrder: 0, isActive: true });
  const grp = await menu.saveModifierGroup(t.owner, { name: "Extras", minSelect: 0, maxSelect: 2, options: [{ name: "Cheese", priceMinor: 5000 }, { name: "Bacon", priceMinor: 8000 }] });
  return { cat, grp };
}

describe("menu", () => {
  it("creates items with variants and modifier groups, and reads them back for a branch", async () => {
    const t = await createTenant();
    const { cat, grp } = await seed(t);
    const input = productSchema.parse({ name: "Burger", categoryId: cat.id, basePriceMinor: "80000", variants: JSON.stringify([{ name: "Single", priceMinor: 80000 }, { name: "Double", priceMinor: 120000 }]), modifierGroupIds: [grp.id] });
    const { id } = await menu.saveProduct(t.owner, input);
    const p = await menu.getProduct(t.owner, id);
    assert.equal(p.variants.length, 2);
    assert.equal(p.variants.filter((v) => v.isDefault).length, 1);
    assert.deepEqual(p.modifierGroupIds, [grp.id]);
    assert.equal(menu.effectivePrice(p), 80000);
  });
  it("rejects duplicate SKUs and category names", async () => {
    const t = await createTenant();
    const { cat } = await seed(t);
    await menu.saveProduct(t.owner, productSchema.parse({ name: "A", categoryId: cat.id, basePriceMinor: 100, sku: "X1" }));
    await assert.rejects(menu.saveProduct(t.owner, productSchema.parse({ name: "B", categoryId: cat.id, basePriceMinor: 100, sku: "X1" })), /already used/);
    await assert.rejects(menu.saveCategory(t.owner, { name: "mains", color: "#000000", sortOrder: 0, isActive: true }), /already exists/);
  });
  it("branch availability and price override affect the catalogue only for that branch", async () => {
    const t = await createTenant();
    const { cat } = await seed(t);
    const { id } = await menu.saveProduct(t.owner, productSchema.parse({ name: "Soup", categoryId: cat.id, basePriceMinor: 50000 }));
    await menu.setAvailability(t.owner, t.branchId, id, false);
    await menu.setBranchPrice(t.owner, t.branchId, id, 55000);
    const p = (await menu.getCatalog(t.owner)).products.find((x) => x.id === id)!;
    assert.equal(p.isAvailable, false);
    assert.equal(menu.effectivePrice(p), 55000);
    const events = await t.db.col("events").find({ orgId: t.orgId });
    assert.equal(events.length, 1);
  });
  it("won't delete a category that still has items; archived items leave the active catalogue", async () => {
    const t = await createTenant();
    const { cat } = await seed(t);
    const { id } = await menu.saveProduct(t.owner, productSchema.parse({ name: "Tea", categoryId: cat.id, basePriceMinor: 10000 }));
    await assert.rejects(menu.deleteCategory(t.owner, cat.id), /still has items/);
    await menu.archiveProduct(t.owner, id, true);
    assert.equal((await menu.getCatalog(t.owner)).products.length, 0);
    assert.equal((await menu.getCatalog(t.owner, { includeInactive: true })).products.length, 1);
  });
  it("validates modifier group bounds", async () => {
    const t = await createTenant();
    await assert.rejects(menu.saveModifierGroup(t.owner, { name: "Sauce", minSelect: 3, maxSelect: 3, options: [{ name: "BBQ", priceMinor: 0 }] }), /exceed/);
  });
  it("cannot use another tenant's category", async () => {
    const a = await createTenant();
    const b = await createTenant(a.db);
    const { cat } = await seed(b);
    await assert.rejects(menu.saveProduct(a.owner, productSchema.parse({ name: "Leak", categoryId: cat.id, basePriceMinor: 1 })), /not found/i);
  });
  it("stores an https photo link and rejects unsafe schemes", async () => {
    const t = await createTenant();
    const cat = await menu.saveCategory(t.owner, { name: "Mains", color: "#ff0000", sortOrder: 0, isActive: true });
    const p = await menu.saveProduct(t.owner, productSchema.parse({ name: "Pic", categoryId: cat.id, basePriceMinor: 100, imageUrl: "https://cdn.example.com/a.jpg" }));
    const cat2 = await menu.getCatalog(t.owner);
    assert.equal(cat2.products.find((x) => x.id === p.id)?.imageUrl, "https://cdn.example.com/a.jpg");
    assert.equal(productSchema.safeParse({ name: "Bad", categoryId: cat.id, basePriceMinor: 100, imageUrl: "javascript:alert(1)" }).success, false);
    assert.equal(productSchema.parse({ name: "None", categoryId: cat.id, basePriceMinor: 100, imageUrl: "" }).imageUrl, undefined);
  });
});
