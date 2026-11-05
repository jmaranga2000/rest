import { PageHeader } from "@/ui/misc";
import { Alert } from "@/ui/misc";
import { requirePage } from "@/platform/http/request";
import { getCatalog } from "@/modules/menu/service";
import { ProductForm } from "@/modules/menu/views/ProductForm";

export const metadata = { title: "New item" };
export default async function Page() {
  const ctx = await requirePage({ permission: "menu.manage" });
  const catalog = await getCatalog(ctx);
  return (
    <>
      <PageHeader title="New item" back={{ href: "/app/menu", label: "Menu" }} />
      {catalog.categories.length === 0 ? <Alert tone="warning" title="Create a category first">Items live inside categories. Add one under Menu → Categories.</Alert> : <ProductForm catalog={catalog} currency={ctx.org.currency} />}
    </>
  );
}
