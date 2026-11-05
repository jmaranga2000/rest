"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import { platformLogoutAction } from "@/modules/platform-admin/actions";
export function PlatformLogout() { const r = useRouter(); return <Button variant="ghost" size="sm" onClick={async () => { await platformLogoutAction(); r.push("/platform/login"); r.refresh(); }}>Sign out</Button>; }
