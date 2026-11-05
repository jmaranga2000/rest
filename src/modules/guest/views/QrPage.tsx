import Link from "next/link";
import { LuPrinter, LuQrCode, LuRefreshCw, LuExternalLink } from "react-icons/lu";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { ConfirmButton } from "@/ui/ActionForm";
import { EmptyState, PageHeader, Tabs } from "@/ui/misc";
import { regenerateTableQrAction } from "../actions";
import type { QrBoard } from "../qr-board";
import { QrCard } from "./QrCard";
import { QrSettingsForm } from "./QrSettingsForm";

export function QrPage({ board, orgName, logoUrl, can, counts }: { board: QrBoard; orgName: string; logoUrl: string | null; can: { manage: boolean; settings: boolean }; counts: { items: number } }) {
  const groups = [...new Set(board.tables.map((t) => t.area))];
  return (
    <>
      <PageHeader title="Menu" description={`QR codes for ${board.branchName}: guests scan, order, and the order lands on their table.`}
        actions={board.tables.length ? <Button href="/print/qr?layout=4" icon={<LuPrinter className="size-4" />}>Print all</Button> : null} />
      <Tabs items={[
        { href: "/app/menu", label: "Items", active: false, count: counts.items },
        { href: "/app/menu?tab=categories", label: "Categories", active: false },
        { href: "/app/menu?tab=modifiers", label: "Modifiers", active: false },
        { href: "/app/menu?tab=stations", label: "Stations", active: false },
        { href: "/app/menu/qr", label: "QR codes", active: true, count: board.tables.length },
      ]} />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {board.tables.length === 0 ? (
            <Card><EmptyState icon={<LuQrCode />} title="No tables yet" description="Add tables under Settings → Floor plan, and each one gets its own QR code here." /></Card>
          ) : groups.map((g) => (
            <section key={g}>
              <h2 className="mb-3 text-sm font-semibold text-muted">{g}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {board.tables.filter((t) => t.area === g).map((t) => (
                  <Card key={t.id} className="overflow-hidden">
                    <div className="flex justify-center bg-surface-2 p-3"><div className="h-[250px] w-[174px] overflow-hidden"><div className="w-[348px] origin-top-left scale-50"><QrCard kind="table" label={t.label} sub={t.seats ? `${t.seats} seats` : undefined} url={t.url} size="md" orgName={orgName} logoUrl={logoUrl} /></div></div></div>
                    <CardBody className="space-y-2 border-t border-line pt-3">
                      <div className="flex items-center justify-between"><span className="font-semibold">Table {t.label}</span>{t.hasOpenOrder ? <Badge tone="warning">Order open</Badge> : <Badge tone="neutral">Free</Badge>}</div>
                      <p className="truncate text-xs text-muted" title={t.url}>{t.url}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" href={`/print/qr?layout=1&table=${t.id}`} icon={<LuPrinter className="size-3.5" />}>Print</Button>
                        <Link href={t.url} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[13px] font-medium"><LuExternalLink className="size-3.5" />Preview</Link>
                        {can.manage ? <ConfirmButton action={regenerateTableQrAction} input={{ id: t.id }} title={`New QR code for table ${t.label}?`} description="The printed code stops working immediately. Print and replace it." confirmLabel="Regenerate" danger icon={<LuRefreshCw className="size-3.5" />} successMessage="New QR code created">New code</ConfirmButton> : null}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-4">
          <Card><CardHeader title="Ordering" description="Applies to every table in this business." /><CardBody><QrSettingsForm enabled={board.settings.qrOrderingEnabled} autoSend={board.settings.qrAutoSend} canEdit={can.settings} /></CardBody></Card>
          <Card><CardHeader title="How it works" /><CardBody className="space-y-2 text-sm text-muted">
            <p>1. Print the cards and place one on each table.</p>
            <p>2. Guests scan with their phone camera (no app, no sign-up) and pick from your live menu.</p>
            <p>3. The order is added to that table&apos;s bill and appears on the kitchen display. Several guests can order separately; staff see one bill.</p>
            <p>Codes are unguessable. If one is lost or abused, regenerate it.</p>
          </CardBody></Card>
        </aside>
      </div>
    </>
  );
}
