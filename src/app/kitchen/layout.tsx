import type { ReactNode } from "react";
import { ToastProvider } from "@/ui/Toast";
export const dynamic = "force-dynamic";
export default function KitchenLayout({ children }: { children: ReactNode }) { return <ToastProvider>{children}</ToastProvider>; }
