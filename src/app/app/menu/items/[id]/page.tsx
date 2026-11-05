import { notFound } from "next/navigation";
import { PageHeader } from "@/ui/misc";
import { requirePage } from "@/platform/http/request";
import { getCatalog } from "@/modules/menu/service";
import { ProductForm } from "@/modules/menu/views/ProductForm";

export const metadata = { title: "Edit item" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePage({ permission: "menu.manage" });
  const catalog = await getCatalog(ctx, { includeInactive: true });
  const product = catalog.products.find((p) => p.id === id);
  if (!product) notFound();
  return (<><PageHeader title={product.name} back={{ href: "/app/menu", label: "Menu" }} /><ProductForm catalog={catalog} product={product} currency={ctx.org.currency} /></>);
}
