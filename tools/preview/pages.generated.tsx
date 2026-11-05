import { pages as menu } from "./pages.menu";
import { pages as orders } from "./pages.orders";
import { pages as admin } from "./pages.admin";
import { pages as inventory } from "./pages.inventory";
import { pages as customers } from "./pages.customers";
import { pages as hotel } from "./pages.hotel";
type P = { path?: string; el: () => unknown; width?: number; dark?: boolean };
export const extraPages: Record<string, P> = { ...menu, ...orders, ...admin, ...inventory, ...customers, ...hotel };
