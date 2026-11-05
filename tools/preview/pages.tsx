import { AppShell } from "@/ui/shell/AppShell";
import { ctx, shellActions } from "./fixtures";
import { Button } from "@/ui/Button";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { Badge, StatusBadge } from "@/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { Alert, EmptyState, PageHeader, StatCard, Tabs, KeyValue } from "@/ui/misc";
import { BarChart, Donut, HBarList, LineChart } from "@/ui/charts";
import { Input, Select, Switch, Checkbox, Textarea } from "@/ui/inputs";
import { LuPlus, LuDownload, LuReceipt, LuPackage } from "react-icons/lu";
import { formatMoney } from "@/platform/money";
import { extraPages } from "./pages.generated";

const fmt = (n: number) => formatMoney(n, "KES", { hideZeroDecimals: true });
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ label, value: [182000, 214500, 198000, 241000, 312000, 398500, 276000][i]! * 100 }));

function Gallery() {
  return (
    <AppShell ctx={ctx} actions={shellActions}>
      <PageHeader title="Design system" description="Every shared component in one place." actions={<><Button variant="outline" icon={<LuDownload />}>Export</Button><Button icon={<LuPlus />}>New item</Button></>} />
      <Tabs items={[{ href: "#", label: "Overview", active: true }, { href: "#", label: "Items", active: false, count: 24 }, { href: "#", label: "Modifiers", active: false }]} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales today" value={fmt(41250000)} delta={{ pct: 12.4 }} hint="vs last Thursday" icon={<LuReceipt />} />
        <StatCard label="Orders" value="187" delta={{ pct: -3.1 }} hint="avg 6 min to serve" />
        <StatCard label="Average order" value={fmt(220600)} delta={{ pct: 4.2 }} />
        <StatCard label="Low stock items" value="5" hint="Needs reorder" icon={<LuPackage />} delta={{ pct: 25, goodWhenUp: false }} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title="Sales by day" description="Last 7 days" actions={<Badge tone="primary">Revenue</Badge>} /><CardBody><BarChart data={days} format={fmt} /></CardBody></Card>
        <Card><CardHeader title="Payment mix" /><CardBody><Donut segments={[{ label: "M-Pesa", value: 58 }, { label: "Cash", value: 27 }, { label: "Card", value: 15 }]} centerValue="187" centerLabel="payments" /></CardBody></Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Top products" /><CardBody><HBarList format={fmt} items={[{ label: "Nyama Choma Platter", value: 9800000, sub: "49 sold" }, { label: "Chicken Biryani", value: 7200000, sub: "36 sold" }, { label: "Masala Chips", value: 4100000, sub: "58 sold" }]} /></CardBody></Card>
        <Card><CardHeader title="Trend" /><CardBody><LineChart data={days} format={fmt} /></CardBody></Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Recent orders" actions={<Button size="sm" variant="ghost">View all</Button>} />
        <Table>
          <THead><TR><TH>Order</TH><TH>Table</TH><TH>Status</TH><TH align="right">Total</TH></TR></THead>
          <TBody>
            {[["#042", "T4", "open", 345000], ["#041", "T2", "closed", 1280000], ["#040", "Takeaway", "void", 90000]].map(([n, t, s, a]) => (
              <TR key={n as string}><TD className="font-medium">{n}</TD><TD>{t}</TD><TD><StatusBadge status={s as string} /></TD><TD align="right">{fmt(a as number)}</TD></TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Form controls" /><CardBody className="space-y-4">
          <div><label className="mb-1.5 block text-[13px] font-medium">Name</label><Input placeholder="Chicken burger" /></div>
          <div><label className="mb-1.5 block text-[13px] font-medium">Category</label><Select defaultValue="b"><option value="a">Starters</option><option value="b">Mains</option></Select></div>
          <div><label className="mb-1.5 block text-[13px] font-medium">Invalid</label><Input invalid defaultValue="oops" /><p className="mt-1 text-xs text-danger">This field is required.</p></div>
          <Textarea placeholder="Notes" />
          <Switch label="Available" hint="Visible on the POS" defaultChecked /><Checkbox label="Tax exempt" />
          <div className="flex flex-wrap gap-2"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="soft">Soft</Button><Button variant="danger">Danger</Button><Button disabled>Disabled</Button></div>
        </CardBody></Card>
        <div className="space-y-4">
          <Alert tone="info" title="Heads up">Tax is inclusive in menu prices.</Alert>
          <Alert tone="success" title="Saved">Menu updated.</Alert>
          <Alert tone="warning" title="Low stock">5 items below reorder level.</Alert>
          <Alert tone="danger" title="Failed">Payment could not be recorded.</Alert>
          <Card><EmptyState icon={<LuReceipt />} title="No orders yet" description="Orders appear here as soon as the first sale is rung up." action={<Button size="sm">Open POS</Button>} /></Card>
          <Card><CardBody><KeyValue items={[{ label: "Subtotal", value: fmt(300000) }, { label: "VAT (16%)", value: fmt(41379) }, { label: "Total", value: fmt(300000) }]} /></CardBody></Card>
        </div>
      </div>
    </AppShell>
  );
}

export const pages: Record<string, { path?: string; el: () => unknown; width?: number; dark?: boolean }> = {
  "00-gallery": { el: () => <Gallery /> },
  "00-gallery-mobile": { el: () => <Gallery />, width: 390 },
  ...extraPages,
};
